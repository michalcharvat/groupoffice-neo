import Container     from '../../node_modules/neo.mjs/src/container/Base.mjs';
import EmailField    from '../../node_modules/neo.mjs/src/form/field/Email.mjs';
import NumberField   from '../../node_modules/neo.mjs/src/form/field/Number.mjs';
import PasswordField from '../../node_modules/neo.mjs/src/form/field/Password.mjs';
import TextField     from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox  from '../form/field/BoolCheckBox.mjs';
import {fieldset}    from '../form/fieldset.mjs';
import client        from '../jmap/Client.mjs';
import {t}           from '../Translate.mjs';

/** User::USERNAME_REGEX */
const USERNAME = /^[A-Za-z0-9_\-.@]*$/;

/**
 * "Account" card of My account (go.usersettings.AccountSettingsPanel): user name,
 * e-mail addresses, password, and for user managers login enabled, forced password
 * change and the disk quota. Users that log in through another authenticator
 * (IMAP, LDAP) have no password here.
 *
 * Not yet: avatar upload, authorized clients ("Logout all").
 */
class AccountPanel extends Container {
    static config = {
        className: 'GO.usersettings.AccountPanel',
        baseCls  : ['go-usersettings-account', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);

        let me      = this,
            manager = client.mayChangeUsers;

        me.items = [
            fieldset(t('User'), [{
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
                    validator   : () => me.passwordsMatch() || t("The passwords didn't match")
                }, {
                    // no name: not sent
                    module      : PasswordField,
                    reference   : 'passwordConfirm',
                    labelText   : t('Confirm password'),
                    labelPosition: 'inline',
                    autoComplete: 'new-password',
                    validator   : () => me.passwordsMatch() || t("The passwords didn't match")
                }
            ], {reference: 'passwordSet'}),

            fieldset(t('Password'), [{
                ntype: 'component',
                tag  : 'p',
                text : t("This user doesn't have a local password because it's authenticated using an external provider.")
            }], {reference: 'externalSet', hidden: true})
        ]
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

        me.getReference('passwordSet').hidden = !local;
        me.getReference('externalSet').hidden = local;
        me.getReference('passwordConfirm').reset(null)
    }
}

export default Neo.setupClass(AccountPanel);
