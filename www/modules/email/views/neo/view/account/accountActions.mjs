import {notifyError} from '../../../../../../views/neo/src/Notify.mjs';

/**
 * Entry points of the account dialogs (card 4). The tree's context menus and the e-mail ⋮ menu
 * call them. Every function takes the component that opens the dialog first (for appName /
 * windowId) and resolves when the dialog closes, with `true` when something was saved (the
 * caller then reloads the tree). The dialogs load on first use.
 */

/**
 * appName / windowId of the opener
 * @param {Neo.component.Base} owner
 * @returns {Object}
 */
function target(owner) {
    return {appName: owner.appName, windowId: owner.windowId}
}

/**
 * Opens a dialog and resolves on close: true when it fired `save` (or `changed`)
 * @param {Neo.component.Base} owner
 * @param {Function} create async () => dialog
 * @returns {Promise<Boolean>}
 */
async function untilClosed(owner, create) {
    let dialog;

    try {
        dialog = await create()
    } catch (e) {
        notifyError(owner, e);
        return false
    }

    if (!dialog) {
        return false
    }

    return new Promise(resolve => {
        let saved = false;

        dialog.on({
            save   : () => saved = true,
            changed: () => saved = true,
            close  : () => resolve(saved)
        })
    })
}

/**
 * Account properties (ExtJS AccountDialog), or a new account without accountId
 * @param {Neo.component.Base} owner
 * @param {Number|null} [accountId]
 * @returns {Promise<Boolean>}
 */
export function openAccountDialog(owner, accountId=null) {
    return untilClosed(owner, async () => {
        const {default: AccountDialog} = await import('./AccountDialog.mjs');
        return AccountDialog.open({...target(owner), accountId})
    })
}

/**
 * The accounts list (ExtJS AccountsDialog: add, edit, delete accounts)
 * @param {Neo.component.Base} owner
 * @returns {Promise<Boolean>}
 */
export function openAccountsDialog(owner) {
    return untilClosed(owner, async () => {
        const {default: AccountsDialog} = await import('./AccountsDialog.mjs');
        return Neo.create(AccountsDialog, target(owner))
    })
}

/**
 * Folder subscriptions of an account (ExtJS FoldersDialog: subscribe / unsubscribe, add,
 * rename, delete folders)
 * @param {Neo.component.Base} owner
 * @param {Number} accountId
 * @returns {Promise<Boolean>}
 */
export function openFoldersDialog(owner, accountId) {
    return untilClosed(owner, async () => {
        const {default: FoldersDialog} = await import('./FoldersDialog.mjs');
        return Neo.create(FoldersDialog, {...target(owner), accountId})
    })
}

/**
 * IMAP ACL of a folder, "Share" (ExtJS ImapAclDialog); only when the INBOX node says acl_supported
 * @param {Neo.component.Base} owner
 * @param {Number} accountId
 * @param {String} mailbox
 * @returns {Promise<Boolean>}
 */
export function openImapAclDialog(owner, accountId, mailbox) {
    return untilClosed(owner, async () => {
        const {default: ImapAclDialog} = await import('./ImapAclDialog.mjs');
        return Neo.create(ImapAclDialog, {...target(owner), accountId, mailbox})
    })
}

/**
 * Folder properties (ExtJS FolderDialog: "Automatically check this folder for new messages")
 * @param {Neo.component.Base} owner
 * @param {Number} accountId
 * @param {String} mailbox
 * @returns {Promise<Boolean>}
 */
export function openFolderDialog(owner, accountId, mailbox) {
    return untilClosed(owner, async () => {
        const {default: FolderDialog} = await import('./FolderDialog.mjs');
        return FolderDialog.open({...target(owner), accountId, mailbox})
    })
}

/**
 * "Move old mails" of a folder (ExtJS MoveOldMailDialog, email/message/moveOld)
 * @param {Neo.component.Base} owner
 * @param {Number} accountId
 * @param {String} mailbox
 * @returns {Promise<Boolean>}
 */
export function openMoveOldMailDialog(owner, accountId, mailbox) {
    return untilClosed(owner, async () => {
        const {default: MoveOldMailDialog} = await import('./MoveOldMailDialog.mjs');
        return MoveOldMailDialog.open({...target(owner), accountId, mailbox})
    })
}

/**
 * Copies or moves messages to a folder of any account the user may use (ExtJS
 * CopyMailToDialog, email/account/copyMailTo; ExtJS opens it for "Move all" of a search result
 * with the store's allUids)
 * @param {Neo.component.Base} owner
 * @param {Object[]} messages [{accountId, mailbox, uid, seen}]
 * @param {Object} [options] {move: false}
 * @returns {Promise<Boolean>} true when copied / moved
 */
export async function openCopyMailToDialog(owner, messages, {move=false}={}) {
    const [{default: FolderPickerDialog}, accountApi, {t}] = await Promise.all([
        import('../FolderPickerDialog.mjs'),
        import('./accountApi.mjs'),
        import('../../util.mjs')
    ]);

    if (!messages?.length) {
        return false
    }

    // the accounts the user may use ("Use account"), with their folders
    const picked = await FolderPickerDialog.ask({...target(owner), title: t('Select a folder to copy the email to')});

    if (!picked?.mailbox) {
        return false
    }

    try {
        await accountApi.copyMailTo(messages.map(m => ({
            accountId  : m.accountId,
            mailboxPath: m.mailbox,
            mailUid    : m.uid,
            seen       : m.seen ?? null
        })), picked.accountId, picked.mailbox, move);

        return true
    } catch (e) {
        notifyError(owner, e);
        return false
    }
}

/**
 * The IMAP login of an account failed: asks for the password and saves it (ExtJS
 * AccountsTree imapLoginFailedDialog, email/account/savePassword). The tree calls it when
 * loading an account's folders fails with isImapAuthError().
 * @param {Neo.component.Base} owner
 * @param {Number} accountId
 * @param {String} [username] shown in the question
 * @returns {Promise<Boolean>} true when a new password was saved (reload the account)
 */
export async function promptImapPassword(owner, accountId, username='') {
    const [{default: PasswordPrompt}, accountApi, {t}, {fmt}] = await Promise.all([
        import('../../../../../../views/neo/src/view/PasswordPrompt.mjs'),
        import('./accountApi.mjs'),
        import('../../util.mjs'),
        import('../../../../../../views/neo/src/Translate.mjs')
    ]);

    let message = t('Authentication failed for user "%username".').replace('%username', username) + ' ' +
        t('Please enter try with a different IMAP password.');

    // the saved password is tested by the server (Account::beforeSave): ask again when it fails
    for (;;) {
        const password = await PasswordPrompt.ask({...target(owner), title: t('mailbox'), message});

        if (!password) {
            return false
        }

        try {
            await accountApi.savePassword(accountId, password);
            return true
        } catch (e) {
            message = fmt('{error}', {error: e.message || String(e)})
        }
    }
}

/**
 * An error of a legacy e-mail route is a failed IMAP login (GO\Base\Mail\Exception\ImapAuthenticationFailedException)
 * @param {Error} error
 * @returns {Boolean}
 */
export function isImapAuthError(error) {
    return /^Authentication failed for user /.test(error?.message || '')
}
