import {notify} from '../../../../../../views/neo/src/Notify.mjs';
import {t}      from '../../util.mjs';

/**
 * Opens the e-mail composer (ExtJS GO.email.showComposer / go.showComposer).
 *
 * STUB of card 1: card 3 (composer) replaces this file and keeps the API.
 *
 *     compose({
 *         appName, windowId,               // the window to open it in (required)
 *         accountId,                       // sending account, default: the user's first one
 *         values  : {to, cc, bcc, subject, body},  // to/cc/bcc: address strings ("Name <a@b.c>, …")
 *         loadUrl, loadParams,             // legacy route that fills the composer, e.g.
 *                                          // 'email/message/reply' + {account_id, mailbox, uid, replyAll}
 *         links   : [{entity, entityId}],  // items to link the sent message to
 *         isHtml                           // body is HTML (default: the user's setting)
 *     })
 *
 * @param {Object} cfg
 * @returns {Promise<Object|null>} the composer window (null in the stub)
 */
export async function compose(cfg = {}) {
    cfg.appName && notify(cfg, t('The e-mail composer is not available yet'));
    return null
}

export default compose;
