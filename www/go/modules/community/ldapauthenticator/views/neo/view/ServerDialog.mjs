import TextArea     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import BoolCheckBox from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import {fieldset}   from '../../../../../../../views/neo/src/form/fieldset.mjs';
import FormWindow   from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import {check, domains, encryption, encryptionToServer, field, groups, hint, number, password, text} from '../../../../../../../views/neo/src/systemsettings/authServerFields.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';

const t     = translator('community', 'ldapauthenticator'),
      tImap = translator('community', 'imapauthenticator');

/**
 * LDAP server profile (ldapauthenticator ServerForm): the LDAP server and how users and
 * groups are found, optional mail accounts (IMAP / SMTP) for new users, the groups they
 * join and the synchronisation of users and groups.
 *
 * Two switches are not entity properties (ExtJS submit: false): "Use authentication"
 * (from a username) and "Create e-mail account for users" (from an IMAP host name).
 */
class ServerDialog extends FormWindow {
    static config = {
        className   : 'GO.ldapauthenticator.view.ServerDialog',
        entityName  : 'LdapAuthServer',
        title       : t('Server profile'),
        wrapperStyle: {height: '85vh', left: 'calc(50vw - 300px)', top: '7vh', width: 'min(600px, 100vw)'},
        values      : {
            port: 389, encryption: 'tls', ldapVerifyCertificate: true, followReferrals: true,
            usernameAttribute: 'uid', syncUsersQuery: '(objectClass=InetOrgPerson)',
            peopleDN: 'ou=people,dc=example,dc=com', groupsDN: 'ou=people,dc=example,dc=com',
            imapPort: 143, imapEncryption: 'tls', imapValidateCertificate: true,
            smtpPort: 587, smtpEncryption: 'tls', smtpValidateCertificate: true,
            syncUsersMaxDeletePercentage: 5, syncGroupsMaxDeletePercentage: 5,
            syncGroupsQuery: '(objectClass=Group)', domains: [], groups: []
        }
    }

    createFormItems() {
        let me     = this,
            sync   = () => me.syncVisibility(),
            toggle = (reference, valueLabel) => ({module: BoolCheckBox, reference, valueLabel, listeners: {change: sync}}),
            ref    = (config, reference) => ({...config, reference}),
            area   = (name, label) => field(TextArea, name, label, {height: 80});

        return [
            fieldset('LDAP Server', [
                domains(),
                hint(t('Enter the domains this ldap server should be used to authenticate. Users must login with their e-mail address and if the domain matches this profile it will be used.')),
                text('hostname', t('Hostname'), {required: true}),
                number('port', t('Port'), {required: true}),
                encryption('encryption'),
                check('ldapVerifyCertificate', t('Verify SSL certicate')),
                toggle('useAuthentication', tImap('Use authentication')),
                hint(t('Enable this if the LDAP server requires autentication to lookup users or groups')),
                ref(text('username', t('Username'), {autoComplete: 'new-password', placeholderText: 'cn=Administrator,dc=com'}), 'username'),
                ref(password('password', t('Password')), 'password'),
                check('followReferrals', t('Follow referrals')),
                hint(t('For older Microsoft ActiveDirectory installation this has to be disabled'))
            ]),
            fieldset(t('Users'), [
                text('usernameAttribute', t('Username attribute'), {required: true}),
                hint(t("Use 'samaccountname' for Microsoft ActiveDirectory.")),
                check('loginWithEmail', t('Login with e-mail address')),
                area('syncUsersQuery', t('User query')),
                hint(t("For Microsoft ActiveDirectory use '(objectCategory=InetOrgPerson)'")),
                text('peopleDN', 'peopleDN', {required: true}),
                hint(t("For Microsoft ActiveDirectory it's typically 'cn=Users,dc=example,dc=com'.")),
                text('groupsDN', 'groupsDN'),
                hint(t("For Microsoft ActiveDirectory it's typically 'cn=Groups,dc=example,dc=com'.")),
                toggle('createEmail', t('Create e-mail account for users'))
            ]),
            {...fieldset('IMAP Server', [
                check('imapUseEmailForUsername', t('Use e-mail instead of LDAP username as IMAP username')),
                text('imapHostname', tImap('Hostname')),
                number('imapPort', tImap('Port')),
                encryption('imapEncryption'),
                check('imapValidateCertificate', t('Validate certificate'))
            ]), reference: 'imapFieldset'},
            {...fieldset('SMTP Server', [
                text('smtpHostname', t('Hostname')),
                number('smtpPort', t('Port')),
                {...check('smtpUseUserCredentials', tImap('Use user credentials')), reference: 'smtpUseUserCredentials', listeners: {change: sync}},
                hint(tImap('Enable this if the SMTP server credentials are identical to the IMAP server.')),
                ref(text('smtpUsername', t('Username'), {autoComplete: 'new-password'}), 'smtpUsername'),
                ref(password('smtpPassword', t('Password')), 'smtpPassword'),
                encryption('smtpEncryption'),
                check('smtpValidateCertificate', t('Validate certificate'))
            ]), reference: 'smtpFieldset'},
            fieldset(t('User options'), [
                groups(),
                hint(t('Users will automatically be added to these groups'))
            ]),
            fieldset(t('Synchronization'), [
                {...check('syncUsers', t('Synchronize users')), reference: 'syncUsers', listeners: {change: sync}},
                {...check('syncUsersDelete', t('Delete users')), reference: 'syncUsersDelete', listeners: {change: sync}},
                ref(number('syncUsersMaxDeletePercentage', t('Max delete percentage'), {maxValue: 100}), 'syncUsersMax'),
                {...check('syncGroups', t('Synchronize groups')), reference: 'syncGroups', listeners: {change: sync}},
                {...check('syncGroupsDelete', t('Delete groups')), reference: 'syncGroupsDelete', listeners: {change: sync}},
                ref(number('syncGroupsMaxDeletePercentage', t('Max delete percentage'), {maxValue: 100}), 'syncGroupsMax'),
                area('syncGroupsQuery', t('Group query')),
                hint(t("For Microsoft ActiveDirectory use '(objectCategory=group)'"))
            ])
        ]
    }

    addCustomFields() {
        // LdapAuthServer has no custom fields
    }

    onConstructed() {
        const result = super.onConstructed();

        let me = this;

        me.form.on({
            // ExtJS onLoad: the switches follow the loaded profile
            load      : ({data}) => {
                me.loadedImapHostname = data.imapHostname || '';
                me.getReference('useAuthentication').value = !!data.username;
                me.getReference('createEmail').value       = !!data.imapHostname;
                me.syncVisibility()
            },
            beforesave: ({data, isNew}) => {
                // ExtJS beforesubmit
                if (!me.getReference('useAuthentication').value) {
                    data.username = '';
                    data.password = ''
                }

                if (!me.getReference('createEmail').value && (isNew || me.loadedImapHostname)) {
                    data.imapHostname = ''
                }

                encryptionToServer(data, ['encryption', 'imapEncryption', 'smtpEncryption'])
            }
        });

        return result
    }

    /**
     * Shows / enables the fields that depend on a switch
     */
    syncVisibility() {
        let me    = this,
            ref   = name => me.getReference(name),
            on    = name => !!ref(name)?.value,
            auth  = on('useAuthentication'),
            email = on('createEmail'),
            smtp  = on('smtpUseUserCredentials');

        if (!ref('username')) {
            return
        }

        ref('username').disabled = !auth;
        ref('password').disabled = !auth;
        ref('imapFieldset').hidden = !email;
        ref('smtpFieldset').hidden = !email;
        ref('smtpUsername').disabled = smtp;
        ref('smtpPassword').disabled = smtp;
        ref('syncUsersDelete').hidden  = !on('syncUsers');
        ref('syncUsersMax').hidden     = !on('syncUsers') || !on('syncUsersDelete');
        ref('syncGroupsDelete').hidden = !on('syncGroups');
        ref('syncGroupsMax').hidden    = !on('syncGroups') || !on('syncGroupsDelete')
    }
}

export default Neo.setupClass(ServerDialog);
