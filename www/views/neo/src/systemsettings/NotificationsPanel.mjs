import EmailField    from '../../node_modules/neo.mjs/src/form/field/Email.mjs';
import PasswordField from '../../node_modules/neo.mjs/src/form/field/Password.mjs';
import Button        from '../button/Button.mjs';
import {fieldset}    from '../form/fieldset.mjs';
import client        from '../jmap/Client.mjs';
import {notify, notifyError} from '../Notify.mjs';
import {fmt, t}      from '../Translate.mjs';
import SettingsPanel from './SettingsPanel.mjs';
import {checkField, numberField, selectField, textField} from './fields.mjs';

/**
 * "Notifications" card of System settings (go.systemsettings.NotificationsPanel): the
 * SMTP server for system mail, "Send test message" sends with the values on screen.
 */
class NotificationsPanel extends SettingsPanel {
    static config = {
        className: 'GO.systemsettings.NotificationsPanel'
    }

    createFields() {
        let me = this;

        return [fieldset(t('Outgoing E-mail (SMTP)'), [
            textField('systemEmail', t('System e-mail'), {module: EmailField, required: true}),
            textField('smtpHost', t('Hostname'), {required: true}),
            numberField('smtpPort', t('Port'), {minValue: 1, maxValue: 65535}),
            textField('smtpUsername', t('Username'), {autoComplete: 'off'}),
            // GO sends the password as it is: a changed one only
            textField('smtpPassword', t('Password'), {module: PasswordField, autoComplete: 'new-password'}),
            selectField('smtpEncryption', t('Encryption'), [['tls', 'TLS'], ['ssl', 'SSL'], ['', t('None')]], {
                listeners: {change: () => me.syncEncryption()}
            }),
            checkField('smtpEncryptionVerifyCertificate', t('Verify SSL certificate'), {reference: 'verifyCertificate'}),
            numberField('smtpTimeout', t('Timeout (s)'), {minValue: 0}),
            {
                module   : Button,
                reference: 'testButton',
                cls      : ['go-systemsettings-action'],
                ui       : 'secondary',
                text     : t('Send test message'),
                handler  : () => me.sendTestMessage()
            }
        ])]
    }

    async onSettingsLoad(module) {
        await super.onSettingsLoad(module);
        this.syncEncryption()
    }

    /**
     * Without encryption there is no certificate to verify
     * @protected
     */
    async syncEncryption() {
        let me    = this,
            field = me.getReference('verifyCertificate');

        if (field && !(me.entityData.settings?.readOnlyKeys || []).includes('smtpEncryptionVerifyCertificate')) {
            field.disabled = !await me.getSetting('smtpEncryption')
        }
    }

    /**
     * core/Settings/sendTestMessage with the changed values: a message to the system e-mail
     * @protected
     */
    async sendTestMessage() {
        let me     = this,
            button = me.getReference('testButton'),
            email  = await me.getSetting('systemEmail');

        if (!await me.validate()) {
            return
        }

        button.disabled = true;

        try {
            const params = (await me.getModified()).settings || {};

            // "None" is null like the ExtJS combo
            'smtpEncryption' in params && !params.smtpEncryption && (params.smtpEncryption = null);

            await client.call('core/Settings/sendTestMessage', params);
            notify(me, fmt(t('A message was sent successfully to {email}'), {email}), {title: t('Success')})
        } catch (e) {
            notifyError(me, new Error(fmt(t('Failed to send message to {email}'), {email}) + ': ' + (e.message || e)))
        } finally {
            me.isDestroyed || (button.disabled = false)
        }
    }

    construct(config) {
        super.construct(config);
        // "None" is stored as null (the ExtJS combo value), the combo's option is ''
        this.on({
            beforeload: ({data}) => data.settings && (data.settings.smtpEncryption ??= ''),
            beforesave: this.onBeforeSave,
            scope     : this
        })
    }

    /**
     * @param {Object} event {data}
     * @protected
     */
    onBeforeSave({data}) {
        if (data.settings && 'smtpEncryption' in data.settings && !data.settings.smtpEncryption) {
            data.settings.smtpEncryption = null
        }
    }
}

export default Neo.setupClass(NotificationsPanel);
