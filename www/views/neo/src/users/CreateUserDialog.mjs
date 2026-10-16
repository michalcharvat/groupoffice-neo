import EmailField     from '../../node_modules/neo.mjs/src/form/field/Email.mjs';
import PasswordField  from '../../node_modules/neo.mjs/src/form/field/Password.mjs';
import TextField      from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Button         from '../button/Button.mjs';
import GroupCheckList from '../groups/GroupCheckList.mjs';
import client         from '../jmap/Client.mjs';
import {t}            from '../Translate.mjs';
import FormWindow     from '../view/FormWindow.mjs';

/** User::USERNAME_REGEX */
const USERNAME = /^[A-Za-z0-9_\-.@]*$/;

/** core group "Everyone": every user is a member */
const EVERYONE = '2';

/**
 * Fields stacked like a GO fieldset, without a legend
 * @param {Object[]} items
 * @returns {Object}
 */
function stack(items) {
    return {ntype: 'container', cls: ['go-fieldset'], layout: {ntype: 'vbox', align: 'stretch'}, flex: 'none', items}
}

/**
 * A random password of the given length (go.form.PasswordGeneratorField)
 * @param {Number} length
 * @returns {String}
 */
function generatePassword(length) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_+=?',
          bytes = crypto.getRandomValues(new Uint32Array(length));

    return Array.from(bytes, n => chars[n % chars.length]).join('')
}

/**
 * New user (go.users.CreateUserWizard): account, password and groups on three cards, one
 * User/set. The groups start with the default groups of the user defaults. Fires `save`
 * with the new id; the users card then opens the account dialog like the wizard did.
 */
class CreateUserDialog extends FormWindow {
    static config = {
        className   : 'GO.users.CreateUserDialog',
        cls         : ['go-form-window', 'go-createuser-dialog'],
        entityName  : 'User',
        properties  : ['id', 'username', 'displayName'],
        title       : t('Create user'),
        generalHeader: {text: t('Account')},
        wrapperStyle: {height: 'min(640px, 90vh)', left: 'max(0px, calc(50vw - 330px))', top: 'max(5vh, calc(50vh - 320px))', width: 'min(660px, 100vw)'}
    }

    /**
     * Minimum password length (core setting passwordMinLength)
     * @member {Number} minLength=6
     */
    minLength = 6

    /**
     * E-mail the recovery address last followed
     * @member {String} lastEmail=''
     */
    lastEmail = ''

    /**
     * The default groups are loaded: the groups list is the user's choice
     * @member {Boolean} groupsReady=false
     */
    groupsReady = false

    construct(config) {
        config.values ??= {groups: [EVERYONE]};
        super.construct(config)
    }

    createFormItems() {
        let me = this;

        return [stack([{
            module       : TextField,
            name         : 'username',
            labelText    : t('Username'),
            labelPosition: 'inline',
            required     : true,
            autoComplete : 'off',
            validator    : f => !f.value || USERNAME.test(f.value) || t('You have invalid characters in the username') + ' (a-z, 0-9, -, _, ., @).'
        }, {
            module       : TextField,
            name         : 'displayName',
            labelText    : t('Display name'),
            labelPosition: 'inline',
            required     : true
        }, {
            module       : EmailField,
            name         : 'email',
            labelText    : t('E-mail'),
            labelPosition: 'inline',
            required     : true,
            // the recovery address follows until it is typed in itself
            listeners    : {userChange: ({value}) => me.syncRecoveryEmail(value)}
        }, {
            module       : EmailField,
            name         : 'recoveryEmail',
            reference    : 'recoveryEmail',
            labelText    : t('Recovery e-mail'),
            labelPosition: 'inline',
            required     : true
        }, {
            ntype: 'component',
            cls  : ['go-field-hint'],
            text : t('The recovery e-mail is used to send a forgotten password request to.') + ' ' +
                t('Please use an email address that you can access from outside Group-Office.')
        }])]
    }

    async onConstructed() {
        let me      = this,
            promise = super.onConstructed();

        me.addCard({
            header: {text: t('Password')},
            items : [stack([{
                module       : PasswordField,
                name         : 'password',
                reference    : 'password',
                labelText    : t('Password'),
                labelPosition: 'inline',
                required     : true,
                autoComplete : 'new-password',
                validator    : f => me.checkPassword(f.value)
            }, {
                // no name: not sent
                module       : PasswordField,
                reference    : 'passwordConfirm',
                labelText    : t('Confirm password'),
                labelPosition: 'inline',
                required     : true,
                autoComplete : 'new-password',
                validator    : f => me.checkPassword(f.value)
            }, {
                module : Button,
                flex   : 'none',
                icon   : 'password',
                text   : t('Generate password'),
                handler: () => me.generate()
            }, {
                ntype    : 'component',
                reference: 'generated',
                cls      : ['go-field-hint', 'go-createuser-generated'],
                hidden   : true
            }])]
        });

        me.addCard({
            header: {text: t('Groups')},
            items : [{
                module    : GroupCheckList,
                reference : 'groups',
                flex      : 1,
                jmapFilter: {excludeEveryone: true, hideUsers: true},
                // until the default groups are in; only admins may set groups (User controller)
                readOnly  : true
            }]
        });

        // the default groups are not known yet (or failed): the server adds them itself
        me.form.on('beforesave', event => {
            me.groupsReady || delete event.data.groups
        });

        me.loadCoreSettings();

        return promise
    }

    /**
     * Default groups and password length of the user defaults (core module settings)
     * @protected
     */
    async loadCoreSettings() {
        let me = this;

        try {
            const {list} = await client.queryGet('Module', {filter: {package: 'core', name: 'core'}, properties: ['id', 'package', 'name', 'settings']}),
                  settings = list[0]?.settings || {};

            await me.readyPromise;

            if (me.isDestroyed) {
                return
            }

            settings.passwordMinLength && (me.minLength = settings.passwordMinLength);

            const groups = [...new Set([EVERYONE, ...(settings.defaultGroups || []).map(String)])],
                  field  = me.getReference('groups');

            field.value = groups;
            me.form.setOriginalValue('groups', groups);
            field.readOnly = !client.isAdmin;
            me.groupsReady = true
        } catch (e) {
            // a user manager may not read the core settings: the groups stay to the server
            console.warn('CreateUserDialog: no core settings', e)
        }
    }

    /**
     * @param {String} value
     * @returns {Boolean|String} true or the error
     * @protected
     */
    checkPassword(value) {
        const ref = name => this.getReference(name)?.value || '';

        if (value && value.length < this.minLength) {
            return t('Minimum length') + ': ' + this.minLength
        }

        return ref('password') === ref('passwordConfirm') || t("The passwords didn't match")
    }

    /**
     * Fills both password fields and shows the password once, to pass it on
     * @protected
     */
    generate() {
        let me       = this,
            password = generatePassword(Math.max(12, me.minLength)),
            shown    = me.getReference('generated');

        me.getReference('password').value        = password;
        me.getReference('passwordConfirm').value = password;

        shown.text   = t('Password') + ': ' + password;
        shown.hidden = false
    }

    /**
     * @param {String} email
     * @protected
     */
    syncRecoveryEmail(email) {
        const field = this.getReference('recoveryEmail');

        if (!field.value || field.value === this.lastEmail) {
            field.value = email
        }

        this.lastEmail = email
    }

    async submit() {
        let me = this;

        // never create a user with an unconfirmed password
        const result = me.checkPassword(me.getReference('password')?.value || '');

        if (result !== true) {
            me.cards.activeIndex = 1;
            me.showError(result);
            await me.form.validate();
            return false
        }

        return super.submit()
    }

    onFormSave(data) {
        let me = this;

        me.fire('save', {id: data.data.id, data: data.data, isNew: true});
        me.close()
    }
}

export default Neo.setupClass(CreateUserDialog);
