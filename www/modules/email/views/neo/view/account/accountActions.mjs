import {notify} from '../../../../../../views/neo/src/Notify.mjs';
import {t}      from '../../util.mjs';

/**
 * Entry points of the account dialogs (card 4). The tree's context menus call them.
 *
 * STUB of card 1: card 4 replaces this file and keeps the API. Every function takes the
 * component that opens the dialog first (for appName / windowId) and resolves when the
 * dialog closes with `true` when something was saved (the caller then reloads the tree).
 */

const notAvailable = owner => {
    notify(owner, t('This dialog is not available yet'));
    return Promise.resolve(false)
};

/**
 * Account properties (ExtJS AccountDialog), or a new account without accountId
 * @param {Neo.component.Base} owner
 * @param {Number|null} [accountId]
 * @returns {Promise<Boolean>}
 */
export function openAccountDialog(owner, accountId=null) {
    return notAvailable(owner)
}

/**
 * The accounts list (ExtJS AccountsDialog: add, edit, delete accounts)
 * @param {Neo.component.Base} owner
 * @returns {Promise<Boolean>}
 */
export function openAccountsDialog(owner) {
    return notAvailable(owner)
}

/**
 * Folder subscriptions of an account (ExtJS FoldersDialog: subscribe / unsubscribe)
 * @param {Neo.component.Base} owner
 * @param {Number} accountId
 * @returns {Promise<Boolean>}
 */
export function openFoldersDialog(owner, accountId) {
    return notAvailable(owner)
}

/**
 * IMAP ACL of a folder, "Share" (ExtJS ImapAclDialog); only when the INBOX node says acl_supported
 * @param {Neo.component.Base} owner
 * @param {Number} accountId
 * @param {String} mailbox
 * @returns {Promise<Boolean>}
 */
export function openImapAclDialog(owner, accountId, mailbox) {
    return notAvailable(owner)
}

/**
 * Folder properties (ExtJS FolderDialog: name and parent)
 * @param {Neo.component.Base} owner
 * @param {Number} accountId
 * @param {String} mailbox
 * @returns {Promise<Boolean>}
 */
export function openFolderDialog(owner, accountId, mailbox) {
    return notAvailable(owner)
}

/**
 * "Move old mails" of a folder (ExtJS MoveOldMailDialog, email/message/moveOld)
 * @param {Neo.component.Base} owner
 * @param {Number} accountId
 * @param {String} mailbox
 * @returns {Promise<Boolean>}
 */
export function openMoveOldMailDialog(owner, accountId, mailbox) {
    return notAvailable(owner)
}
