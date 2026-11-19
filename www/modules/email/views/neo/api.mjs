import client from '../../../../views/neo/src/jmap/Client.mjs';

/**
 * The legacy e-mail controllers the neo client calls (GO\Email\Controller\*, route
 * "email/<controller>/<action>"). Every call goes through client.legacy(): a response with
 * success: false throws its feedback.
 *
 * Mailboxes are IMAP names (e.g. "INBOX", "Projects.Alpha"), uids IMAP uids of that mailbox.
 */

/**
 * The tree node id of email/account/tree: base64 of "account_<id>" or "f_<accountId>_<mailbox>"
 * @param {Number|String} accountId
 * @param {String|null} mailbox null for the account node
 * @returns {String}
 */
export function serverNodeId(accountId, mailbox=null) {
    const raw   = mailbox === null ? `account_${accountId}` : `f_${accountId}_${mailbox}`,
          bytes = new TextEncoder().encode(raw);

    // PHP base64_encode() of the UTF-8 bytes
    return btoa(String.fromCharCode(...bytes))
}

/**
 * email/account/tree: the accounts (node "root") or the folders of an account / folder.
 * Folder nodes have `mailbox`, `name` (display name), `text` (HTML with the unseen count),
 * `children` ([] = no subfolders, null = load them), `noselect`, `noinferiors`, `permission_level`,
 * INBOX also `usage` and `acl_supported`.
 * @param {String} node "root" or a serverNodeId()
 * @returns {Promise<Object[]>}
 */
export function tree(node) {
    return client.legacy('email/account/tree', {node})
}

/**
 * Unseen count of a folder node of email/account/tree (its `text` holds it as HTML)
 * @param {Object} node
 * @returns {Number}
 */
export function nodeUnseen(node) {
    const match = /em-folder-status[^>]*>(\d+)</.exec(node?.text || '');
    return match ? Number(match[1]) : 0
}

/**
 * email/account/checkUnseen: unseen counts of the folders each account checks
 * (account.check_mailboxes, INBOX by default)
 * @returns {Promise<{total_unseen: Number, unseen: {account_id, mailbox, unseen}[]}>}
 */
export async function checkUnseen() {
    return (await client.legacy('email/account/checkUnseen')).email_status
}

/**
 * email/account/saveTreeState: the expanded server node ids, used by email/account/tree
 * to send expanded folders with their parents
 * @param {String[]} expandedNodes serverNodeId()s
 */
export function saveTreeState(expandedNodes) {
    return client.legacy('email/account/saveTreeState', {expandedNodes: JSON.stringify(expandedNodes)})
}

/**
 * email/account/saveSort: the account order of this user (first = top)
 * @param {Number[]} accountIds
 */
export function saveSort(accountIds) {
    return client.legacy('email/account/saveSort', {sort_order: JSON.stringify(accountIds)})
}

/**
 * email/message/store: one page of a mailbox.
 *
 * Params: account_id, mailbox, start, limit, sort ('arrival' | 'date' | 'from' | 'subject' | 'size'),
 * dir ('ASC' | 'DESC'), query (IMAP SEARCH string), unread / flagged (1), searchIn ('current' | 'recursive' | 'all'),
 * action: 'move' + messages (JSON uids) + to_mailbox, delete_keys (JSON uids: to the trash, or deleted in it).
 *
 * Response: results, total, unseen ({mailbox: count}), permission_level, sent / drafts / trash
 * (the mailbox is that special folder), deleteConfirm, deleteSuccess / deleteFeedback, allUids (with a query),
 * multipleFolders (records have their own mailbox).
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export function messageStore(params) {
    return client.legacy('email/message/store', params)
}

/**
 * email/message/setFlag: set or clear a flag on messages of one mailbox.
 * "Seen" needs delegated permission, clearing it ("mark as unread") CREATE.
 * @param {Number} accountId
 * @param {String} mailbox
 * @param {Number[]} uids
 * @param {String} flag 'Seen', 'Flagged' or a label keyword like '$label1'
 * @param {Boolean} clear remove the flag
 * @returns {Promise<{success: Boolean, unseen: Number}>}
 */
export function setFlag(accountId, mailbox, uids, flag, clear=false) {
    return client.legacy('email/message/setFlag', {
        account_id: accountId,
        mailbox,
        messages  : JSON.stringify(uids),
        flag,
        clear     : clear ? 1 : 0
    })
}

/**
 * email/message/move: moves messages to a folder of another account, a batch per call;
 * the response's `messages` are the uids still to move (call again with them)
 * @param {Object} params from_account_id, to_account_id, from_mailbox, to_mailbox, messages (uids), total
 * @returns {Promise<{messages?: Number[], progress?: Number}>}
 */
export function moveToAccount(params) {
    return client.legacy('email/message/move', {...params, messages: JSON.stringify(params.messages)})
}

/**
 * email/message/moveToSpam: into the account's spam folder (created when missing)
 * @param {Number} accountId
 * @param {String} mailbox
 * @param {Number[]} uids
 */
export function moveToSpam(accountId, mailbox, uids) {
    return client.legacy('email/message/moveToSpam', {account_id: accountId, from_mailbox_name: mailbox, mail_uid: JSON.stringify(uids)})
}

/**
 * email/message/moveToInbox: "not spam", from the spam folder (config spam_folder, default "Spam") to INBOX.
 * One message per call.
 * @param {Number} accountId
 * @param {Number} uid
 */
export function moveToInbox(accountId, uid) {
    return client.legacy('email/message/moveToInbox', {account_id: accountId, mail_uid: uid})
}

/**
 * email/label/store: the labels of an account ({id, name, flag, color, default})
 * @param {Number} accountId
 * @returns {Promise<Object[]>}
 */
export async function labels(accountId) {
    return (await client.legacy('email/label/store', {account_id: accountId})).results || []
}

/**
 * email/folder/create
 * @param {Number} accountId
 * @param {String} parent mailbox, '' (or the account's mbroot) for the top level
 * @param {String} name
 */
export function createFolder(accountId, parent, name) {
    return client.legacy('email/folder/create', {account_id: accountId, parent, name})
}

/**
 * email/folder/rename
 * @param {Number} accountId
 * @param {String} mailbox
 * @param {String} name the new base name
 */
export function renameFolder(accountId, mailbox, name) {
    return client.legacy('email/folder/rename', {account_id: accountId, mailbox, name})
}

/**
 * email/folder/delete: moves the folder into the trash, or deletes it (inside the trash,
 * or with trashable 0 when the trash can't have subfolders)
 * @param {Number} accountId
 * @param {String} mailbox
 * @param {Boolean} trashable
 */
export function deleteFolder(accountId, mailbox, trashable=true) {
    return client.legacy('email/folder/delete', {account_id: accountId, mailbox, trashable: trashable ? 1 : 0})
}

/**
 * email/folder/truncate: "Empty folder" (messages to the trash; in the trash deleted)
 * @param {Number} accountId
 * @param {String} mailbox
 */
export function truncateFolder(accountId, mailbox) {
    return client.legacy('email/folder/truncate', {account_id: accountId, mailbox})
}

/**
 * email/folder/markAsRead
 * @param {Number} accountId
 * @param {String} mailbox
 */
export function markFolderRead(accountId, mailbox) {
    return client.legacy('email/folder/markAsRead', {account_id: accountId, mailbox})
}

/**
 * email/folder/move: a folder below another one of the same account
 * @param {Number} accountId
 * @param {String} sourceMailbox
 * @param {String} targetMailbox '' for the top level
 */
export function moveFolder(accountId, sourceMailbox, targetMailbox) {
    return client.legacy('email/folder/move', {account_id: accountId, sourceMailbox, targetMailbox})
}
