import Container     from '../../node_modules/neo.mjs/src/container/Base.mjs';
import EmailField    from '../../node_modules/neo.mjs/src/form/field/Email.mjs';
import NumberField   from '../../node_modules/neo.mjs/src/form/field/Number.mjs';
import PasswordField from '../../node_modules/neo.mjs/src/form/field/Password.mjs';
import TextField     from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Button        from '../button/Button.mjs';
import BoolCheckBox  from '../form/field/BoolCheckBox.mjs';
import ImageField    from '../form/field/ImageField.mjs';
import {fieldset}    from '../form/fieldset.mjs';
import AppPasswordsPanel      from './AppPasswordsPanel.mjs';
import AuthorizedClientsField from './AuthorizedClientsField.mjs';
import client        from '../jmap/Client.mjs';
import {t}           from '../Translate.mjs';
import {generatePassword, loadCoreSettings} from '../users/password.mjs';

/** User::USERNAME_REGEX */
const USERNAME = /^[A-Za-z0-9_\-.@]*$/;

/**
 * "Account" card of My account (go.usersettings.AccountSettingsPanel): avatar, user
 * name, e-mail addresses, password with a generator, and for user managers login
 * enabled, forced password change, the disk quota and the space used. Users that log
 * in through another authenticator (IMAP, LDAP) have no password here; a user manager
 * converts them to a local user. Security: app passwords (AppPasswordsPanel, saved
 * right away) and the authorized clients with "Logout all" (saved with the user).
 */
class AccountPanel extends Container {
    static config = {
        className: 'GO.usersettings.AccountPanel',
        baseCls  : ['go-usersettings-account', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * Minimum password length (core setting passwordMinLength)
     * @member {Number} minLength=6
     */
    minLength = 6

    construct(config) {
        super.construct(config);

        let me      = this,
            manager = client.mayChangeUsers;

        const userFields = [{
            module   : TextField,
            name     : 'username',
            reference: 'username',
            labelText: t('Username'),
            labelPosition: 'inline',
            required : true,
            autoComplete: 'off',
            validator: f => !f.value || USERNAME.test(f.value) || t('You have invalid characters in the username') + ' (a-z, 0-9, -, _, ., @).'
        },
        // with the address book, the display name comes from the user's contact
        ...client.hasCapability('go:community:addressbook') ? [] : [{
            module   : TextField,
            name     : 'displayName',
            labelText: t('Display name'),
            labelPosition: 'inline',
            required : true
        }], {
            module   : EmailField,
            name     : 'email',
            reference: 'email',
            labelText: t('E-mail'),
            labelPosition: 'inline',
            required : true
        }, {
            module   : EmailField,
            name     : 'recoveryEmail',
            reference: 'recoveryEmail',
            labelText: t('Recovery e-mail'),
            labelPosition: 'inline',
            required : true
        }, {
            ntype: 'component',
            cls  : ['go-field-hint'],
            text : t('The recovery e-mail is used to send a forgotten password request to.') + ' ' +
                t('Please use an email address that you can access from outside Group-Office.')
        }];

        me.items = [
            fieldset(t('User'), [{
                ntype : 'container',
                cls   : ['go-usersettings-user'],
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'start'},
                items : [{
                    module   : ImageField,
                    name     : 'avatarId',
                    flex     : 'none'
                }, {
                    ntype : 'container',
                    cls   : ['go-usersettings-userfields'],
                    flex  : 1,
                    layout: {ntype: 'vbox', align: 'stretch'},
                    items : userFields
                }]
            }]),

            ...manager ? [fieldset(t('Disk space'), [{
                module   : NumberField,
                name     : 'disk_quota',
                labelText: t('Disk quota') + ' (MB)',
                labelPosition: 'inline',
                minValue : 0,
                // neo's default maxValue is 100 (null would clamp to 0)
                maxValue : Number.MAX_SAFE_INTEGER,
                stepSize : 1
            }, {
                ntype: 'component',
                cls  : ['go-field-hint'],
                text : t("Setting '0' will disable uploads for this user. Leave this field empty to allow unlimited space.")
            }, {
                // disk_usage: bytes, only for user managers
                ntype    : 'component',
                reference: 'diskUsage',
                cls      : ['go-usersettings-usage']
            }])] : [],

            fieldset(t('Password'), [
                ...manager ? [{
                    module    : BoolCheckBox,
                    name      : 'enabled',
                    valueLabel: t('Login enabled')
                }, {
                    module    : BoolCheckBox,
                    name      : 'forcePasswordChange',
                    valueLabel: t('Force password change')
                }] : [], {
                    module      : PasswordField,
                    name        : 'password',
                    reference   : 'password',
                    labelText   : t('Password'),
                    labelPosition: 'inline',
                    autoComplete: 'new-password',
                    // neo skips the validator of an empty field: the filled one checks the match
                    validator   : f => me.checkPassword(f.value),
                    listeners   : {userChange: () => me.hideGenerated()}
                }, {
                    // no name: not sent
                    module      : PasswordField,
                    reference   : 'passwordConfirm',
                    labelText   : t('Confirm password'),
                    labelPosition: 'inline',
                    autoComplete: 'new-password',
                    validator   : f => me.checkPassword(f.value),
                    listeners   : {userChange: () => me.hideGenerated()}
                }, {
                    module : Button,
                    flex   : 'none',
                    cls    : ['go-usersettings-generate'],
                    icon   : 'password',
                    text   : t('Generate password'),
                    handler: () => me.generate()
                }, {
                    // the generated password, shown once to pass it on
                    ntype    : 'component',
                    reference: 'generated',
                    cls      : ['go-field-hint', 'go-usersettings-generated'],
                    hidden   : true
                }
            ], {reference: 'passwordSet'}),

            fieldset(t('Password'), [{
                ntype: 'component',
                tag  : 'p',
                text : manager
                    ? t("This user doesn't have a local password because it's authenticated using an external provider. Click the button below to set a password and convert it to a local user. The domain will be stripped off the username")
                    : t("This user doesn't have a local password because it's authenticated using an external provider.")
            },
            ...manager ? [{
                module : Button,
                flex   : 'none',
                cls    : ['go-usersettings-convert'],
                text   : t('Convert to local user'),
                handler: () => me.convertToLocal()
            }] : []
            ], {reference: 'externalSet', hidden: true}),

            fieldset(t('App passwords'), [{
                module   : AppPasswordsPanel,
                reference: 'appPasswords',
                flex     : 'none'
            }], {reference: 'appPasswordsSet', hidden: true}),

            fieldset(t('Authorized clients'), [{
                ntype : 'container',
                cls   : ['go-authorizedclients-header'],
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'center'},
                items : [
                    {ntype: 'component', flex: 1, text: t('Client')},
                    {ntype: 'component', flex: 'none', cls: ['go-authorizedclients-status'], text: t('Status')}
                ]
            }, {
                module   : AuthorizedClientsField,
                name     : 'clients',
                reference: 'clients',
                flex     : 'none'
            }, {
                module : Button,
                flex   : 'none',
                cls    : ['go-usersettings-logoutall'],
                icon   : 'logout',
                text   : t('Logout all'),
                handler: () => me.getReference('clients').logoutAll()
            }])
        ]
    }

    /**
     * Resolves when minLength is known (or could not be loaded)
     * @member {Promise<void>|null} minLengthPromise=null
     */
    minLengthPromise = null

    onConstructed() {
        super.onConstructed();
        this.minLengthPromise = this.loadMinLength()
    }

    /**
     * passwordMinLength of the core settings
     * @protected
     */
    async loadMinLength() {
        try {
            const settings = await loadCoreSettings();
            settings.passwordMinLength && !this.isDestroyed && (this.minLength = settings.passwordMinLength)
        } catch (e) {
            // the server checks the length on save as well
            console.warn('AccountPanel: no core settings', e)
        }
    }

    /**
     * @param {String} value
     * @returns {Boolean|String} true or the error
     * @protected
     */
    checkPassword(value) {
        if (value && value.length < this.minLength) {
            return t('Minimum length') + ': ' + this.minLength
        }

        return this.passwordsMatch() || t("The passwords didn't match")
    }

    /**
     * Fills both password fields and shows the password once (go.form.PasswordGeneratorField)
     * @protected
     */
    async generate() {
        let me = this;

        await me.minLengthPromise;

        if (me.isDestroyed) {
            return
        }

        const password = generatePassword(Math.max(12, me.minLength)),
              shown    = me.getReference('generated');

        me.getReference('password').value        = password;
        me.getReference('passwordConfirm').value = password;

        shown.text   = t('Password') + ': ' + password;
        shown.hidden = false
    }

    /**
     * A typed password replaces the generated one: it is no longer shown
     * @protected
     */
    hideGenerated() {
        const shown = this.getReference('generated');

        if (!shown.hidden) {
            shown.text   = '';
            shown.hidden = true
        }
    }

    /**
     * A user manager gives an externally authenticated user (IMAP, LDAP) a password:
     * the fields open, the domain goes off the user name. Saving the password makes it
     * a local user, so the password is required until the next load.
     * @protected
     */
    convertToLocal() {
        let me       = this,
            username = me.getReference('username');

        ['username', 'email', 'recoveryEmail', 'password', 'passwordConfirm'].forEach(ref => {
            me.getReference(ref).disabled = false
        });

        me.getReference('password').required        = true;
        me.getReference('passwordConfirm').required = true;

        username.value = String(username.value || '').split('@')[0];

        me.getReference('passwordSet').hidden = false;
        me.getReference('externalSet').hidden = true;

        username.focus()
    }

    /**
     * @returns {Boolean} password and confirmation are equal (both empty: no change)
     */
    passwordsMatch() {
        const value = ref => this.getReference(ref)?.value || '';

        return value('password') === value('passwordConfirm')
    }

    /**
     * Called by the dialog after loading the user
     * @param {Object} user
     */
    onLoad(user) {
        let me = this,
            // no authenticator at all: a password can be set
            local = !user.authenticators?.length || user.authenticators.includes('password');

        ['username', 'email', 'recoveryEmail', 'password', 'passwordConfirm'].forEach(ref => {
            me.getReference(ref).disabled = !local
        });

        // required after "Convert to local user" only
        me.getReference('password').required        = false;
        me.getReference('passwordConfirm').required = false;

        me.getReference('passwordSet').hidden = !local;
        me.getReference('externalSet').hidden = local;
        me.getReference('passwordConfirm').reset(null);
        me.hideGenerated();

        const appPasswords = me.getReference('appPasswords');
        appPasswords.onLoad(user);
        // the panel decides who may see the app passwords
        me.getReference('appPasswordsSet').hidden = appPasswords.hidden;

        const usage = me.getReference('diskUsage');
        // in MB like the quota (ExtJS AccountSettingsPanel)
        usage && (usage.text = t('Space used') + ': ' + Math.round((Number(user.disk_usage) || 0) / 1024 / 1024 * 100) / 100 + ' MB')
    }
}

export default Neo.setupClass(AccountPanel);
