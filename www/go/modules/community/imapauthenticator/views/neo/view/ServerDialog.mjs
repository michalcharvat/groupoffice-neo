import {fieldset}   from '../../../../../../../views/neo/src/form/fieldset.mjs';
import FormWindow   from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import {check, domains, encryption, encryptionToServer, groups, hint, number, password, text} from '../../../../../../../views/neo/src/systemsettings/authServerFields.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'imapauthenticator');

/**
 * IMAP server profile (imapauthenticator ServerForm): the domains it authenticates, the
 * IMAP and SMTP servers of the users' mail accounts and the groups new users join
 */
class ServerDialog extends FormWindow {
    static config = {
        className   : 'GO.imapauthenticator.view.ServerDialog',
        entityName  : 'ImapAuthServer',
        title       : t('Server profile'),
        wrapperStyle: {height: '80vh', left: 'calc(50vw - 260px)', top: '10vh', width: 'min(520px, 100vw)'},
        values      : {imapPort: 143, imapEncryption: 'tls', imapValidateCertificate: true, smtpPort: 587,
                       smtpEncryption: 'tls', smtpValidateCertificate: true, domains: [], groups: []}
    }

    createFormItems() {
        return [
            fieldset('IMAP Server', [
                domains(),
                hint(t('Enter the domains this imap server should be used to authenticate. Users must login with their e-mail address and if the domain matches this profile it will be used.') +
                    ' ' + t("Use a '*' to match all domains.")),
                text('imapHostname', t('Hostname'), {required: true}),
                number('imapPort', t('Port'), {required: true}),
                encryption('imapEncryption'),
                check('imapValidateCertificate', t('Validate certificate')),
                check('removeDomainFromUsername', t('Remove domain from username')),
                hint(t('Users must login with their full e-mail adress. Enable this option if the IMAP expects. the username without domain.'))
            ]),
            fieldset('SMTP Server', [
                text('smtpHostname', t('Hostname')),
                number('smtpPort', t('Port')),
                check('smtpUseUserCredentials', t('Use IMAP credentials'), {reference: 'smtpUseUserCredentials'}),
                hint(t('Enable this if the SMTP server credentials are identical to the IMAP server.')),
                text('smtpUsername', t('Username'), {reference: 'smtpUsername', autoComplete: 'new-password'}),
                password('smtpPassword', t('Password'), {reference: 'smtpPassword'}),
                encryption('smtpEncryption'),
                check('smtpValidateCertificate', t('Validate certificate'))
            ]),
            fieldset(t('User options'), [
                groups(),
                hint(t('Users will automatically be added to these groups'))
            ])
        ]
    }

    addCustomFields() {
        // ImapAuthServer has no custom fields
    }

    onConstructed() {
        const result = super.onConstructed();

        let me = this;

        me.form.on({
            load       : () => me.syncSmtpCredentials(),
            fieldChange: ({component}) => component?.name === 'smtpUseUserCredentials' && me.syncSmtpCredentials(),
            beforesave : ({data}) => {
                // ExtJS: the IMAP login is used, no SMTP login of its own
                if (me.getReference('smtpUseUserCredentials').value) {
                    data.smtpUsername = null;
                    data.smtpPassword = null
                }

                encryptionToServer(data, ['imapEncryption', 'smtpEncryption'])
            }
        });

        return result
    }

    syncSmtpCredentials() {
        let me       = this,
            disabled = !!me.getReference('smtpUseUserCredentials').value;

        me.getReference('smtpUsername').disabled = disabled;
        me.getReference('smtpPassword').disabled = disabled
    }
}

export default Neo.setupClass(ServerDialog);
