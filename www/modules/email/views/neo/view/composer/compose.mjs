import client                from '../../../../../../views/neo/src/jmap/Client.mjs';
import {notify, notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import {t}                   from '../../util.mjs';

/**
 * The user's emailSettings (JMAP User, EmailModule::onMap): read for every composer, the
 * user may have changed them in the settings meanwhile
 * @returns {Promise<Object>}
 */
export async function loadEmailSettings() {
    if (!client.user?.id) {
        return {}
    }

    try {
        const response = await client.call('User/get', {ids: [client.user.id], properties: ['id', 'emailSettings']});
        return response.list?.[0]?.emailSettings || {}
    } catch (e) {
        console.warn('emailSettings not loaded', e);
        return {}
    }
}

/**
 * Opens the e-mail composer (ExtJS GO.email.showComposer / go.showComposer).
 *
 *     compose({
 *         appName, windowId,               // the window to open it in (required)
 *         accountId,                       // sending account, default: the user's first one
 *         from,                            // or the alias with this e-mail address
 *         values  : {to, cc, bcc, subject, body},  // to/cc/bcc: address strings ("Name <a@b.c>, …"),
 *                                          // arrays of them or of {name, email}
 *         loadUrl, loadParams,             // legacy route that fills the composer, e.g.
 *                                          // 'email/message/reply' + {account_id, mailbox, uid, replyAll},
 *                                          // 'email/message/forward', 'email/message/openDraft'
 *         task, uid, mailbox,              // ExtJS style instead of loadUrl: task reply | reply_all |
 *                                          // forward | opendraft | template (default)
 *         template_id,                     // template to start with (default: the account's / user's)
 *         contact_id, company_id,          // fill template tags (entity: 'Contact' + entityId does too)
 *         addEmailAsAttachmentList,        // [{uid, mailbox}]: forward these messages as attachments
 *         includeAttachments,
 *         blobs   : [{blobId|id, name}],   // attachments that are blobs already
 *         links   : [{entity, entityId}],  // items to link the sent message to
 *         isHtml,                          // body is HTML (default: the user's setting)
 *         afterLoad: composer => {},       // called once the message is loaded
 *         afterSend: response => {}       // called after sending
 *     })
 *
 * @param {Object} cfg
 * @returns {Promise<GO.email.composer.ComposerWindow|null>} the composer, null without account
 */
export async function compose(cfg = {}) {
    const owner = {appName: cfg.appName, windowId: cfg.windowId};

    let aliases, templates, settings;

    try {
        const accountId = cfg.accountId || cfg.account_id;

        [aliases, templates, settings] = await Promise.all([
            client.legacy('email/alias/store', {limit: 0}).then(r => r.results || []),
            client.legacy('email/template/emailSelection', accountId ? {account_id: accountId} : {}).then(r => r.results || []).catch(e => {
                console.warn('email templates not loaded', e);
                return []
            }),
            loadEmailSettings()
        ]);
    } catch (e) {
        notifyError(owner, e);
        return null
    }

    if (!aliases.length) {
        notify(owner, t("You didn't configure an e-mail account yet. Go to Start menu -> E-mail -> Administration -> Accounts to setup your first e-mail account"),
            {title: t('No account'), closable: true});
        return null
    }

    const {default: ComposerWindow} = await import('./ComposerWindow.mjs');

    const composer = Neo.create(ComposerWindow, {
        appName  : cfg.appName,
        windowId : cfg.windowId,
        aliases,
        templates,
        settings,
        afterSend: cfg.afterSend || cfg.callback || null
    });

    // shown while it loads; errors of the load show in the window
    composer.start(cfg).catch(e => notifyError(composer, e));

    return composer
}

export default compose;
