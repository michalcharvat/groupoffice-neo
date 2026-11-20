import {translator} from '../../../../views/neo/src/Translate.mjs';

/**
 * Translations of the legacy e-mail module (www/modules/email/language)
 */
export const t = translator('legacy', 'email');

/**
 * The ExtJS account permission levels (GO.email.permissionLevels): "delegated" may read,
 * mark as read and flag mail of a shared account, CREATE ("Use account") may change it
 */
export const LEVEL_DELEGATED = 15;

const ENTITIES = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#039;': "'", '&#39;': "'"};

/**
 * email/message/store escapes from, to and subject with htmlspecialchars(): undo it, the
 * grid escapes what it shows itself
 * @param {String} value
 * @returns {String}
 */
export function unescapeHtml(value) {
    return String(value ?? '').replace(/&(amp|lt|gt|quot|#0?39);/g, entity => ENTITIES[entity] ?? entity)
}

/**
 * Text for an IMAP SEARCH string: the legacy client builds the query itself (SearchDialog.js),
 * so quotes and backslashes are removed like ExtJS does with quotes
 * @param {String} value
 * @returns {String}
 */
export function imapText(value) {
    return String(value ?? '').replace(/["'\\\r\n]/g, '').trim()
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * IMAP SEARCH date (RFC 3501 date: 5-Nov-2026)
 * @param {String} ymd "Y-m-d"
 * @returns {String}
 */
export function imapDate(ymd) {
    const [y, m, d] = String(ymd).split('-').map(Number);
    return `${d}-${MONTHS[m - 1]}-${y}`
}

/**
 * Route path of a folder or message below "#email/"
 * @param {Number|String} accountId
 * @param {String} mailbox
 * @param {Number|String|null} [uid]
 * @returns {String}
 */
export function routePath(accountId, mailbox, uid=null) {
    return [accountId, encodeURIComponent(mailbox), uid].filter(part => part !== null && part !== undefined && part !== '').join('/')
}

/**
 * @param {String} path e.g. "4/INBOX/12"; the classic client's "#email/<account>/<mailbox>"
 *        has the mailbox unencoded and no uid, so "4/INBOX/Sub/Folder" is mailbox "INBOX/Sub/Folder"
 *        (a last part of digits stays a uid, as in neo's own routes)
 * @returns {{accountId: Number, mailbox: String|null, uid: Number|null}|null}
 */
export function parseRoutePath(path) {
    const parts   = String(path || '').replace(/\/$/, '').split('/'),
          account = parts[0];
    let mailbox, uid;

    if (parts.length > 3 || (parts.length === 3 && !/^\d+$/.test(parts[2]))) {
        // classic: raw mailbox with its delimiter
        mailbox = parts.slice(1).join('/')
    } else {
        [, mailbox, uid] = parts
    }

    if (!/^\d+$/.test(account || '')) {
        return null
    }

    let name = null;

    try {
        name = mailbox ? decodeURIComponent(mailbox) : null
    } catch (e) {
        name = mailbox
    }

    return {accountId: Number(account), mailbox: name, uid: /^\d+$/.test(uid || '') ? Number(uid) : null}
}
