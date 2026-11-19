import client from '../../../../../../views/neo/src/jmap/Client.mjs';
import {unescapeHtml} from '../../util.mjs';

/**
 * Legacy routes of the message view (email/message/*), see docs/neo-email-module.md "Card 2".
 * A message is identified by {accountId, mailbox, uid}; a message attached to another one
 * (a .eml, LinkedMessagePanel) by the server's temporary `path` instead.
 */

/**
 * email/message/view
 * @param {Object} params {accountId, mailbox, uid} plus the route's options (unblock, filterXSS,
 *                        no_max_body_size, plaintext, password, …)
 * @returns {Promise<Object>}
 */
export function view({accountId, mailbox, uid, ...options}) {
    return client.legacy('email/message/view', {account_id: accountId, mailbox, uid, ...flags(options)})
}

/**
 * email/message/messageAttachment: a message attached to another one (.eml)
 * @param {Object} message the parent {accountId, mailbox, uid}
 * @param {Object} attachment {number, encoding}
 * @param {Object} [options] e.g. {filterXSS: 1}
 * @returns {Promise<Object>} SavedMessage output plus `path` and `is_tmp_file`
 */
export function messageAttachment({accountId, mailbox, uid}, attachment, options={}) {
    return client.legacy('email/message/messageAttachment', {
        account_id: accountId, mailbox, uid, number: attachment.number, encoding: attachment.encoding, ...flags(options)
    })
}

/**
 * Booleans as the legacy controllers expect them ("1"), false and empty values left out
 * @param {Object} options
 * @returns {Object}
 */
function flags(options) {
    const params = {};

    Object.entries(options).forEach(([key, value]) => {
        if (value === true) {
            params[key] = 1
        } else if (value !== false && value !== null && value !== undefined && value !== '') {
            params[key] = value
        }
    });

    return params
}

/**
 * Raw message (email/message/source)
 * @param {Object} message {accountId, mailbox, uid}
 * @param {Boolean} [download] as .eml file instead of text
 * @returns {String}
 */
export function sourceUrl({accountId, mailbox, uid}, download=false) {
    return client.legacyUrl('email/message/source', {account_id: accountId, mailbox, uid, ...(download ? {download: 1} : {})})
}

/**
 * URL of an attachment as the server gives it (email/message/attachment, a temporary file
 * or a blob), with "inline" for viewing or downloading
 * @param {Object} attachment
 * @param {Boolean} inline
 * @returns {String}
 */
export function attachmentUrl(attachment, inline) {
    const url = new URL(String(attachment.url || '').replace(/&amp;/g, '&'), 'http://go.invalid' + client.baseUrl);

    // the URL may be relative to the web root (index.php?r=…) or to the host (/index.php?r=…)
    url.searchParams.set('inline', inline ? '1' : '0');

    return url.host === 'go.invalid' ? url.pathname + url.search : url.href
}

/**
 * email/message/zipAllAttachments
 * @param {Object} message {accountId, mailbox, uid}
 * @returns {String}
 */
export function zipUrl({accountId, mailbox, uid}) {
    return client.legacyUrl('email/message/zipAllAttachments', {account_id: accountId, mailbox, uid})
}

/**
 * Removes the attachments from the message: the server appends a copy without them and
 * deletes the original
 * @param {Object} message {accountId, mailbox, uid}
 * @returns {Promise<Number>} uid of the new message
 */
export async function deleteAllAttachments({accountId, mailbox, uid}) {
    return Number((await client.legacy('email/message/deleteAllAttachments', {account_id: accountId, mailbox, uid})).uid)
}

/**
 * Saves an attachment in a files folder (email/message/saveAttachment)
 * @param {Object} message {accountId, mailbox, uid} plus `sender` and `path` of the view response
 * @param {Object} attachment
 * @param {Number} folderId
 * @param {String} [filename]
 * @returns {Promise<Object>}
 */
export function saveAttachment(message, attachment, folderId, filename=null) {
    return client.legacy('email/message/saveAttachment', {
        account_id          : message.accountId,
        mailbox             : message.mailbox,
        uid                 : message.uid,
        number              : attachment.number,
        encoding            : attachment.encoding,
        type                : attachment.type || '',
        subtype             : attachment.subtype || '',
        uuencoded_partnumber: attachment.uuencoded_partnumber || '',
        folder_id           : folderId,
        filename            : filename || attachment.name,
        tmp_file            : attachment.tmp_file || 0,
        charset             : attachment.charset || '',
        sender              : message.sender || '',
        filepath            : message.path || ''
    })
}

/**
 * Saves all attachments in a files folder (email/message/saveAllAttachments)
 * @param {Object} message {accountId, mailbox, uid, path}
 * @param {Number} folderId
 * @returns {Promise<Object>}
 */
export function saveAllAttachments(message, folderId) {
    return client.legacy('email/message/saveAllAttachments', {
        account_id: message.accountId,
        mailbox   : message.mailbox,
        uid       : message.uid,
        folder_id : folderId,
        filepath  : message.path || ''
    })
}

/**
 * The files folder of an item, created when missing (files/folder/checkModelFolder)
 * @param {String} entity e.g. "Contact"
 * @param {Number|String} entityId
 * @returns {Promise<Number>} folder id
 */
export async function itemFolderId(entity, entityId) {
    return Number((await client.legacy('files/folder/checkModelFolder', {mustExist: 1, model: entity, id: entityId})).files_folder_id)
}

/**
 * Sends the read notification the sender asked for (email/message/notification)
 * @param {Object} data the email/message/view response
 * @returns {Promise<Object>}
 */
export function sendNotification(data) {
    return client.legacy('email/message/notification', {
        account_id     : data.account_id,
        message_to     : data.to_string || '',
        notification_to: data.notification,
        // the view response escapes the subject
        subject        : unescapeHtml(data.subject)
    })
}

