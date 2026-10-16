import NumberField   from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Number.mjs';
import PasswordField from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Password.mjs';
import TextField     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox  from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import {fieldset}    from '../../../../../../../views/neo/src/form/fieldset.mjs';
import FormWindow    from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import {fmt}         from '../../../../../../../views/neo/src/Translate.mjs';
import {MB, moduleSettings, t} from './util.mjs';

/**
 * Create or edit a mailbox (GOUI MailboxDialog). The user name is entered without
 * the domain; the quota is in MB; "autoExpunge" ("0" or "<days>d") is a switch and a
 * number of days.
 *
 *     Neo.create(MailboxDialog, {appName, windowId, domain: 'example.com', values: {domainId, quota}})
 */
class MailboxDialog extends FormWindow {
    static config = {
        className : 'GO.maildomains.view.MailboxDialog',
        cls       : ['go-form-window', 'go-md-mailbox-dialog'],
        entityName: 'MailBox',
        properties: ['id', 'domainId', 'username', 'description', 'quota', 'active', 'domainOwner',
                     'smtpAllowed', 'fts', 'autoExpunge'],
        title     : t('Mailbox'),
        wrapperStyle: {height: '80vh', left: 'calc(50vw - 400px)', maxWidth: '100vw', top: '10vh', width: '800px'},
        /**
         * Domain name, shown after the user name and appended to a new one
         * @member {String} domain=''
         */
        domain: ''
    }

    /**
     * Core setting passwordMinLength (GO default 6)
     * @member {Number} minPasswordLength=6
     */
    minPasswordLength = 6

    onConstructed() {
        // references exist from here on; the form loads later (FormWindow.readyPromise)
        const result = super.onConstructed();

        let me = this;

        me.form.on({
            beforeload: ({data}) => me.toForm(data),
            beforesave: ({data, isNew}) => me.toEntity(data, isNew)
        });

        moduleSettings('core', 'core').then(settings => {
            settings.passwordMinLength && (me.minPasswordLength = settings.passwordMinLength)
        });

        return result
    }

    /**
     * Entity → form values
     * @param {Object} data
     */
    toForm(data) {
        if (typeof data.username === 'string' && data.username.includes('@')) {
            data.username = data.username.split('@')[0]
        }

        'quota' in data && (data.quota = Math.round((data.quota || 0) / MB));

        const expunge = String(data.autoExpunge ?? '30d');

        data.autoExpungeEnabled = expunge !== '0';
        data.autoExpungeDays    = parseInt(expunge) || 30
    }

    /**
     * Form values → entity (create: all values, update: the modified ones)
     * @param {Object} data
     * @param {Boolean} isNew
     */
    toEntity(data, isNew) {
        let me = this;

        if (isNew) {
            data.username = data.username + '@' + me.domain
        } else if (!data.password) {
            // empty: keep the password
            delete data.password
        }

        'quota' in data && (data.quota = (Number(data.quota) || 0) * MB);

        if ('autoExpungeEnabled' in data || 'autoExpungeDays' in data) {
            const enabled = 'autoExpungeEnabled' in data ? data.autoExpungeEnabled : me.form.entityData.autoExpungeEnabled,
                  days    = 'autoExpungeDays' in data ? data.autoExpungeDays : me.form.entityData.autoExpungeDays;

            data.autoExpunge = enabled ? (parseInt(days) || 30) + 'd' : '0'
        }

        delete data.autoExpungeEnabled;
        delete data.autoExpungeDays
    }

    onReady() {
        super.onReady();

        let me    = this,
            isNew = !me.form.currentId;

        // GOUI: the user name can't be changed; a new password is optional
        me.getReference('username').readOnly = !isNew;
        me.getReference('password').required = isNew;
        me.getReference('passwordConfirm').required = isNew;
        me.syncExpungeDays()
    }

    /**
     * @param {Neo.form.field.Base} field
     * @returns {Boolean|String}
     */
    validatePassword(field) {
        let me      = this,
            value   = field.value || '',
            other   = me.getReference(field.reference === 'password' ? 'passwordConfirm' : 'password')?.value || '';

        if (value && value.length < me.minPasswordLength) {
            return fmt(t('The minimum length for this field is {max}'), {max: me.minPasswordLength})
        }

        return value === other || t('The passwords do not match')
    }

    syncExpungeDays() {
        const days = this.getReference('autoExpungeDays');
        days && (days.disabled = !this.getReference('autoExpungeEnabled').checked)
    }

    createFormItems() {
        let me = this;

        const field = config => ({labelPosition: 'inline', flex: 'none', ...config});

        return [{
            ntype : 'container',
            cls   : ['go-md-form-scroll'],
            // its content height: the card scrolls (a flexed vbox child would be cut off)
            flex  : 'none',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                ntype : 'container',
                cls   : ['go-md-address'],
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'center'},
                items : [field({
                    module   : TextField,
                    name     : 'username',
                    reference: 'username',
                    labelText: t('Username'),
                    required : true,
                    flex     : 1
                }), {
                    ntype: 'component',
                    cls  : ['go-md-at-domain'],
                    flex : 'none',
                    text : '@' + me.domain
                }]
            }, {
                ntype : 'container',
                cls   : ['go-md-columns'],
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'start', wrap: 'wrap'},
                items : [{
                    ntype : 'container',
                    cls   : ['go-md-column'],
                    flex  : 1,
                    layout: {ntype: 'vbox', align: 'stretch'},
                    items : [
                        field({module: TextField, name: 'description', labelText: t('Description')}),
                        field({
                            module      : PasswordField,
                            name        : 'password',
                            reference   : 'password',
                            labelText   : t('Password'),
                            autoComplete: 'new-password',
                            validator   : f => me.validatePassword(f)
                        }),
                        field({
                            // no name: not sent
                            module      : PasswordField,
                            reference   : 'passwordConfirm',
                            labelText   : t('Confirm password'),
                            autoComplete: 'new-password',
                            validator   : f => me.validatePassword(f)
                        }),
                        field({module: NumberField, name: 'quota', labelText: t('Quota (MB)'), minValue: 0, maxValue: Number.MAX_SAFE_INTEGER, stepSize: 1})
                    ]
                }, {
                    ntype : 'container',
                    cls   : ['go-md-column'],
                    flex  : 1,
                    layout: {ntype: 'vbox', align: 'stretch'},
                    items : [
                        {module: BoolCheckBox, name: 'active', valueLabel: t('Active')},
                        {module: BoolCheckBox, name: 'domainOwner', valueLabel: t('Domain owner')},
                        {
                            ntype: 'component',
                            cls  : ['go-field-hint'],
                            text : t('When enabled this user can login to all mailboxes of the domain using user@example.com*thisuser@example.com')
                        },
                        {module: BoolCheckBox, name: 'smtpAllowed', valueLabel: t('Allow external SMTP usage')},
                        {module: BoolCheckBox, name: 'fts', valueLabel: t('Enable Full Text Search')},
                        fieldset(t('Auto expunge'), [{
                            module    : BoolCheckBox,
                            name      : 'autoExpungeEnabled',
                            reference : 'autoExpungeEnabled',
                            valueLabel: t('Auto expunge'),
                            listeners : {change: () => me.syncExpungeDays()}
                        }, {
                            ntype: 'component',
                            cls  : ['go-field-hint'],
                            text : t('Automatically delete mail from the Trash and Spam folder after a period of time.')
                        }, field({
                            module   : NumberField,
                            name     : 'autoExpungeDays',
                            reference: 'autoExpungeDays',
                            labelText: t('Expunge after days'),
                            minValue : 1,
                            maxValue : Number.MAX_SAFE_INTEGER,
                            stepSize : 1
                        })])
                    ]
                }]
            }]
        }]
    }
}

export default Neo.setupClass(MailboxDialog);
