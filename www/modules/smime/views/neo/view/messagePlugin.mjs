import {notify, notifyError} from '../../../../../views/neo/src/Notify.mjs';
import PasswordPrompt from '../../../../../views/neo/src/view/PasswordPrompt.mjs';
import * as api       from '../api.mjs';
import {t}            from '../api.mjs';
import SmimeBar       from './SmimeBar.mjs';

/**
 * S/MIME in the e-mail message view (ExtJS smime PluginMessagePanel,
 * AttachmentContextMenuOverride and the password part of GO.email.MessagePanel), an
 * `emailMessagePanelPlugins` config:
 * - an encrypted message: email/message/view answers `askPassword` until the PHP session has the
 *   certificate password; the password goes with the next view request, which stores it.
 *   "This message is encrypted." above a decrypted one.
 * - a signed message: "digitally signed" bar; Verify calls smime/publicCertificate/verify, shows
 *   the result in the bar and the certificate in a window, and imports the sender's certificate
 *   when it is valid.
 * - attachment menu: "Add to SMIME certificates" for a PEM certificate (.cer, .pem, .crt).
 */

/** File types the server imports as a public certificate (PEM) */
const CERT_EXTENSIONS = ['cer', 'pem', 'crt'];

/**
 * Password to send with the next view of a message, per panel: {key, password, sent}
 * @type {WeakMap<Object, Object>}
 */
const pending = new WeakMap();

const messageKey = data => [data.accountId ?? data.account_id, data.mailbox, data.uid].join(':');

/**
 * Asks the password of the certificate and views the message again with it
 * @param {GO.email.message.MessagePanel} panel
 * @param {Object} data the email/message/view response
 * @param {Boolean} wrong the last password was wrong
 */
async function decrypt(panel, data, wrong) {
    const key      = messageKey(data),
          password = await PasswordPrompt.ask({
              appName : panel.appName,
              windowId: panel.windowId,
              title   : 'SMIME ' + t('Password'),
              message : wrong
                  ? t('The SMIME password was incorrect.') + ' ' + t('Please enter the password of your SMIME certificate.')
                  : t('Please enter the password of your SMIME certificate.')
          });

    // cancelled, or another message is shown meanwhile
    if (password === null || panel.isDestroyed || !panel.message || messageKey(panel.message) !== key) {
        return
    }

    pending.set(panel, {key, password, sent: false});
    panel.reload()
}

/**
 * @param {GO.email.message.MessagePanel} panel
 * @param {Object} data
 * @param {GO.smime.SmimeBar} bar
 */
async function verify(panel, data, bar) {
    const button = bar.getReference('button');

    button && (button.disabled = true);

    try {
        const cert   = await api.verify({email: data.sender, message: panel.message}),
              result = api.checkCert(data.sender, cert);

        if (bar.isDestroyed) {
            return
        }

        bar.setState(result);

        const {default: CertificateDetailWindow} = await import('./CertificateDetailWindow.mjs');
        Neo.create(CertificateDetailWindow, {appName: panel.appName, windowId: panel.windowId, certificate: cert, result})
    } catch (e) {
        bar.isDestroyed || bar.setState({state: 'invalid', icon: 'close', text: t('The certificate is invalid!')});
        notifyError(panel, e)
    } finally {
        button && !button.isDestroyed && (button.disabled = false)
    }
}

export default {
    id: 'smime',

    beforeLoad(params, panel) {
        const entry = pending.get(panel);

        if (!entry || entry.key !== messageKey(params)) {
            pending.delete(panel);
            return {}
        }

        entry.sent = true;
        return {password: entry.password}
    },

    onLoad(data, panel) {
        const entry  = pending.get(panel),
              sent   = !!entry?.sent && entry.key === messageKey(data),
              parts  = [],
              saved  = !panel.message?.attachment;

        sent && pending.delete(panel);

        if (data.askPassword) {
            // the server keeps a wrong password in the session too: ask again
            parts.push({
                module    : SmimeBar,
                cls       : ['go-smime-bar', 'go-smime-encrypted'],
                iconName  : 'lock',
                message   : t('This message is encrypted.'),
                buttonText: t('Decrypt'),
                onButton  : () => decrypt(panel, data, false)
            });

            decrypt(panel, data, sent);
            return {parts}
        }

        // no api.setPassword() here: an old certificate may have decrypted this message, the
        // composer still has to check the password of the newest one for signing

        data.smime_encrypted && parts.push({
            module  : SmimeBar,
            cls     : ['go-smime-bar', 'go-smime-encrypted'],
            iconName: 'lock',
            message : t('This message is encrypted.')
        });

        data.smime_signed && saved && parts.push({
            module    : SmimeBar,
            iconName  : 'security',
            message   : t('This message is digitally signed. Click here to verify the signature and import the certificate.'),
            buttonText: t('Verify'),
            onButton  : bar => verify(panel, data, bar)
        });

        return {parts}
    },

    attachmentMenuItems(attachment, data, panel) {
        const extension = String(attachment.extension || attachment.name?.split('.').pop() || '').toLowerCase();

        if (!CERT_EXTENSIONS.includes(extension) || !panel.message?.uid || panel.message.attachment || !data?.sender) {
            return []
        }

        return [{
            text   : t('Add to SMIME certificates'),
            icon   : 'verified_user',
            handler: async () => {
                try {
                    await api.importAttachment(panel.message, attachment, data.sender);
                    notify(panel, t('SMIME certificate was added for') + ' ' + data.sender, {title: t('Certificate added')})
                } catch (e) {
                    notifyError(panel, e)
                }
            }
        }]
    }
};
