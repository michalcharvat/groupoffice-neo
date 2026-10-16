import NumberField   from '../../node_modules/neo.mjs/src/form/field/Number.mjs';
import PasswordField from '../../node_modules/neo.mjs/src/form/field/Password.mjs';
import TextField     from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Button        from '../button/Button.mjs';
import BoolCheckBox  from '../form/field/BoolCheckBox.mjs';
import LocalCombo    from '../form/field/LocalCombo.mjs';
import client        from '../jmap/Client.mjs';
import TextList      from '../list/TextList.mjs';
import {notify, notifyError} from '../Notify.mjs';
import SharePanel    from '../permissions/SharePanel.mjs';
import {fmt, t}      from '../Translate.mjs';
import FormWindow    from '../view/FormWindow.mjs';

/**
 * SMTP server profile of a module (go.smtp.AccountDialog): sender, server, encryption,
 * rate limit, permissions; "Send test message" (SmtpAccount/test) with the values on screen.
 *
 *     Neo.create(SmtpAccountDialog, {appName, windowId, values: {module: {package: 'community', name: 'newsletters'}}})
 *     Neo.create(SmtpAccountDialog, {appName, windowId, entityId: 3})
 */
class SmtpAccountDialog extends FormWindow {
    static config = {
        className   : 'GO.smtp.SmtpAccountDialog',
        entityName  : 'SmtpAccount',
        title       : t('Server profile', 'legacy', 'imapauth'),
        wrapperStyle: {
            height   : 'min(720px, 90vh)',
            left     : 'max(0px, calc(50vw - 300px))',
            maxHeight: '90vh',
            top      : '5vh',
            width    : 'min(600px, 100vw)'
        }
    }

    onConstructed() {
        const result = super.onConstructed();
        this.addSharePanel();
        return result
    }

    addCustomFields() {
        // SmtpAccount has no custom fields
    }

    /**
     * "Permissions" tab: who may send with this account
     */
    addSharePanel() {
        let me = this;

        me.addCard({
            header: {text: t('Permissions')},
            items : [{module: SharePanel, reference: 'sharePanel', flex: 1}]
        });

        me.on('formReady', async ({currentId}) => {
            const panel = me.getReference('sharePanel');

            await panel?.setEntity('SmtpAccount', currentId || null).catch(e => console.error('SharePanel', e));
            !currentId && panel && !me.isDestroyed && me.form.setOriginalValue('acl', panel.getSubmitValue())
        })
    }

    createFormItems() {
        let me    = this,
            field = (module, name, labelText, config = {}) => ({module, name, labelText, labelPosition: 'inline', ...config});

        return [
            field(TextField, 'fromName',  t('From name'),   {required: true}),
            field(TextField, 'fromEmail', t('From e-mail'), {required: true}),
            field(TextField, 'hostname',  t('Hostname'),    {required: true}),
            field(NumberField, 'port', t('Port'), {required: true, minValue: 1, maxValue: 65535, stepSize: 1}),
            field(TextField, 'username', t('Username'), {autoComplete: 'off'}),
            field(PasswordField, 'password', t('Password'), {autoComplete: 'new-password'}),
            field(LocalCombo, 'encryption', t('Encryption'), {
                width       : null,
                displayField: 'name',
                valueField  : 'id',
                editable    : false,
                listConfig  : {module: TextList},
                store       : {keyProperty: 'id', data: [{id: 'tls', name: 'TLS'}, {id: 'ssl', name: 'SSL'}, {id: '', name: t('None')}]},
                listeners   : {change: () => me.syncEncryption()}
            }),
            {module: BoolCheckBox, name: 'verifyCertificate', reference: 'verifyCertificate', valueLabel: t('Verify certificate')},
            field(NumberField, 'maxMessagesPerMinute', t('Max messages per minute'), {required: true, minValue: 0, maxValue: Number.MAX_SAFE_INTEGER, stepSize: 1}),
            {
                ntype: 'component',
                cls  : ['go-field-hint'],
                flex : 'none',
                text : t('Set a maximum number of messages per minute. Entering a zero value will disable this value.')
            }, {
                module   : Button,
                reference: 'testButton',
                cls      : ['go-smtp-test'],
                ui       : 'secondary',
                text     : t('Send test message'),
                handler  : () => me.sendTestMessage()
            }
        ]
    }

    construct(config) {
        // a new account: the ExtJS defaults
        config.entityId || (config.values = {port: 587, encryption: 'tls', verifyCertificate: true, maxMessagesPerMinute: 0, ...config.values});

        super.construct(config);

        let me = this;

        // "None" is null in the API, '' in the combo
        me.form.on({
            beforeload: ({data}) => data.encryption ??= '',
            beforesave: ({data}) => 'encryption' in data && !data.encryption && (data.encryption = null),
            load      : () => me.syncEncryption()
        })
    }

    /**
     * Without encryption there is no certificate to verify
     * @protected
     */
    async syncEncryption() {
        let me       = this,
            combo    = await me.form.getField('encryption'),
            checkbox = me.getReference('verifyCertificate');

        checkbox && combo && (checkbox.disabled = !combo.getSubmitValue())
    }

    /**
     * SmtpAccount/test: a message to the sender address, with the values on screen
     * @protected
     */
    async sendTestMessage() {
        let me     = this,
            button = me.getReference('testButton');

        if (!await me.form.validate()) {
            return
        }

        const params = await me.form.getEntityValues(),
              email  = params.fromEmail;

        delete params.acl;
        params.encryption ||= null;
        me.form.currentId && (params.id = me.form.currentId);

        button.disabled = true;

        try {
            await client.call('SmtpAccount/test', params);
            notify(me, fmt(t('A message was sent successfully to {email}'), {email}), {title: t('Success')})
        } catch (e) {
            notifyError(me, new Error(fmt(t('Failed to send message to {email}'), {email}) + ': ' + (e.description || e.message || e)))
        } finally {
            me.isDestroyed || (button.disabled = false)
        }
    }
}

export default Neo.setupClass(SmtpAccountDialog);
