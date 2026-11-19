import client from '../../../../../../views/neo/src/jmap/Client.mjs';

/**
 * The legacy routes of the account dialogs (GO\Email\Controller\Account|Alias|Filter|Label|Folder,
 * email/message/moveOld). Every call goes through client.legacy(): success: false throws its feedback.
 *
 * Permissions (account ACL, see docs/neo-email-module.md "Common: permission model"): loading needs
 * READ, saving an account, alias, filter or label WRITE, deleting DELETE, folder and subscription
 * changes CREATE ("Use account"), IMAP ACL MANAGE. Creating an account needs write permission on
 * the e-mail module (clientSettings().module_write).
 */

let settingsPromise = null;

/**
 * email/account/clientSettings, loaded once: {default_smtp_host, disable_aliases, enable_labels, module_write}
 * @returns {Promise<Object>}
 */
export function clientSettings() {
    settingsPromise ??= client.legacy('email/account/clientSettings').then(r => r.data || {}).catch(e => {
        settingsPromise = null;
        throw e
    });

    return settingsPromise
}

/**
 * email/account/store: the accounts with at least `permissionLevel`
 * @param {Object} params {permissionLevel, query, sort, dir, start, limit}
 * @returns {Promise<{results: Object[], total: Number}>}
 */
export function accountStore(params) {
    return client.legacy('email/account/store', params)
}

/**
 * email/account/load: the account with the default alias's name, email and signature, passwords blanked
 * @param {Number} id
 * @returns {Promise<Object>} {data, remoteComboTexts}
 */
export function loadAccount(id) {
    return client.legacy('email/account/load', {id})
}

/**
 * email/account/submit
 * @param {Object} params the form values, `id` for an existing account
 * @returns {Promise<Object>} {id, needs_refresh_token?}
 */
export function submitAccount(params) {
    return client.legacy('email/account/submit', params)
}

/**
 * @param {Number} id
 */
export function deleteAccount(id) {
    return client.legacy('email/account/delete', {id})
}

/**
 * email/account/savePassword: a new IMAP password after a failed login
 * @param {Number} id
 * @param {String} password
 */
export function savePassword(id, password) {
    return client.legacy('email/account/savePassword', {id, password})
}

/**
 * email/folder/store: every folder name of the account (folder combos)
 * @param {Number} accountId
 * @returns {Promise<String[]>}
 */
export async function folderNames(accountId) {
    const {results = []} = await client.legacy('email/folder/store', {account_id: accountId});
    return results.map(r => r.name)
}

/**
 * email/template/accountTemplatesStore: the e-mail templates for "Default e-mail template"
 * @returns {Promise<Object[]>} [{id, name}]
 */
export async function accountTemplates() {
    const {results = []} = await client.legacy('email/template/accountTemplatesStore', {type: 0, limit: 0});
    return results
}

/**
 * The records of a standard legacy store (email/alias, email/filter, email/label)
 * @param {String} controller 'alias' | 'filter' | 'label'
 * @param {Number} accountId
 * @returns {Promise<Object[]>}
 */
export async function store(controller, accountId) {
    const {results = []} = await client.legacy(`email/${controller}/store`, {account_id: accountId, limit: 0});
    return results
}

/**
 * email/<controller>/load
 * @param {String} controller
 * @param {Number} id
 * @returns {Promise<Object>} data
 */
export async function load(controller, id) {
    return (await client.legacy(`email/${controller}/load`, {id})).data || {}
}

/**
 * email/<controller>/submit
 * @param {String} controller
 * @param {Object} params with `id` for an existing record, `account_id` for a new one
 * @returns {Promise<Object>}
 */
export function submit(controller, params) {
    return client.legacy(`email/${controller}/submit`, params)
}

/**
 * email/<controller>/delete
 * @param {String} controller
 * @param {Number} id
 */
export function remove(controller, id) {
    return client.legacy(`email/${controller}/delete`, {id})
}

/**
 * email/filter/saveSort: the filters' priorities in the given order
 * @param {Number[]} ids
 */
export function saveFilterSort(ids) {
    const filters = {};
    ids.forEach((id, i) => filters[id] = i);
    return client.legacy('email/filter/saveSort', {filters: JSON.stringify(filters)})
}

/**
 * email/account/subscribtionsTree: all folders of a level with `checked` (subscribed)
 * @param {Number} accountId
 * @param {String} node 'root' or a node id of this tree
 * @returns {Promise<Object[]>}
 */
export function subscriptionsTree(accountId, node) {
    return client.legacy('email/account/subscribtionsTree', {account_id: accountId, node})
}

/**
 * email/folder/subscribe | unsubscribe
 * @param {Number} accountId
 * @param {String[]} mailboxes
 * @param {Boolean} subscribe
 */
export function setSubscribed(accountId, mailboxes, subscribe) {
    return client.legacy(subscribe ? 'email/folder/subscribe' : 'email/folder/unsubscribe', {
        account_id: accountId,
        mailboxs  : JSON.stringify(mailboxes)
    })
}

/**
 * email/folder/load: {checkUnseen}
 * @param {Number} accountId
 * @param {String} mailbox
 * @returns {Promise<Object>}
 */
export async function loadFolder(accountId, mailbox) {
    return (await client.legacy('email/folder/load', {accountId, mailboxPath: mailbox})).data || {}
}

/**
 * email/folder/submit: "Automatically check this folder for new messages" (account.check_mailboxes)
 * @param {Number} accountId
 * @param {String} mailbox
 * @param {Boolean} checkUnseen
 */
export function submitFolder(accountId, mailbox, checkUnseen) {
    return client.legacy('email/folder/submit', {accountId, mailboxPath: mailbox, ...checkUnseen ? {checkUnseen: 1} : {}})
}

/**
 * email/folder/aclStore: the IMAP ACL of a mailbox; `deleteIdentifiers` removes those first
 * @param {Number} accountId
 * @param {String} mailbox
 * @param {String[]} [deleteIdentifiers]
 * @returns {Promise<Object[]>} [{identifier, permissions, read, write, delete, createmailbox, deletemailbox, admin}]
 */
export async function imapAcl(accountId, mailbox, deleteIdentifiers=null) {
    const response = await client.legacy('email/folder/aclStore', {
        account_id: accountId,
        mailbox,
        ...deleteIdentifiers ? {delete_keys: JSON.stringify(deleteIdentifiers)} : {}
    });

    if (response.deleteSuccess === false) {
        throw new Error(response.deleteFeedback || 'Delete failed')
    }

    return response.results || []
}

/**
 * email/folder/setAcl: the rights of one identifier; a right is sent only when granted
 * @param {Number} accountId
 * @param {String} mailbox
 * @param {String} identifier IMAP user name
 * @param {Object} rights {read, write, delete, createmailbox, deletemailbox, admin}
 */
export function setImapAcl(accountId, mailbox, identifier, rights) {
    const params = {account_id: accountId, mailbox, identifier};
    IMAP_RIGHTS.forEach(right => rights[right] && (params[right] = 1));
    return client.legacy('email/folder/setAcl', params)
}

/**
 * The rights of email/folder/setAcl, in the ExtJS order
 * @type {String[]}
 */
export const IMAP_RIGHTS = ['read', 'write', 'delete', 'createmailbox', 'deletemailbox', 'admin'];

/**
 * email/account/usernames: the IMAP user names of all accounts (ImapAclUserDialog combo)
 * @returns {Promise<String[]>}
 */
export async function imapUsernames() {
    const {results = []} = await client.legacy('email/account/usernames', {limit: 0});
    return [...new Set(results.map(r => r.username).filter(Boolean))]
}

/**
 * email/message/moveOld: moves the mail that arrived before the date
 * @param {Object} params {account_id, mailbox, target_mailbox, until_date (user date format)}
 * @returns {Promise<Object>} {total}
 */
export function moveOldMail(params) {
    return client.legacy('email/message/moveOld', params)
}

/**
 * email/account/copyMailTo: copies (or moves) messages to a folder of any account
 * @param {Object[]} messages [{accountId, mailboxPath, mailUid, seen}]
 * @param {Number} targetAccountId
 * @param {String} targetMailboxPath
 * @param {Boolean} move
 */
export function copyMailTo(messages, targetAccountId, targetMailboxPath, move=false) {
    return client.legacy('email/account/copyMailTo', {
        move             : move ? 1 : 0,
        srcMessages      : JSON.stringify(messages),
        targetAccountId,
        targetMailboxPath
    })
}

/**
 * core/aclGroup/selectedStore: a legacy ACL as {groupId: level} and whether the user manages it
 * @param {Number} aclId
 * @returns {Promise<{value: Object, manage: Boolean}>}
 */
export async function loadAcl(aclId) {
    const {results = [], manage_permission} = await client.legacy('core/aclGroup/selectedStore', {model_id: aclId, limit: 0}),
          value = {};

    results.forEach(r => value[r.id] = +r.level);
    return {value, manage: !!manage_permission}
}

/**
 * Saves the changes of a SharePanel value to a legacy ACL (ExtJS GO.grid.PermissionsPanel over
 * core/aclGroup): added groups per level, changed levels, removed groups.
 * Same as modules/files/views/neo/view/acl.mjs (a module must not import another module's code).
 * @param {Number} aclId
 * @param {Object} oldValue {groupId: level} as loaded
 * @param {Object} newValue {groupId: level|null} of the SharePanel
 * @returns {Promise<void>}
 */
export async function saveAcl(aclId, oldValue, newValue) {
    const added   = {},
          removed = [],
          changed = [];

    Object.entries(newValue || {}).forEach(([groupId, level]) => {
        const old = oldValue[groupId];

        if (!level) {
            old && removed.push(+groupId)
        } else if (!old) {
            (added[level] ??= []).push(+groupId)
        } else if (+old !== +level) {
            changed.push({id: +groupId, level: +level})
        }
    });

    for (const [level, ids] of Object.entries(added)) {
        await client.legacy('core/aclGroup/selectedStore', {model_id: aclId, add: JSON.stringify(ids), addAttributes: JSON.stringify({level: +level}), limit: 1})
    }

    for (const record of changed) {
        await client.legacy('core/aclGroup/updateRecord', {model_id: aclId, record: JSON.stringify(record)})
    }

    if (removed.length) {
        const response = await client.legacy('core/aclGroup/selectedStore', {model_id: aclId, delete_keys: JSON.stringify(removed), limit: 1});

        if (response.deleteSuccess === false) {
            throw new Error(response.deleteFeedback || 'Delete failed')
        }
    }
}
