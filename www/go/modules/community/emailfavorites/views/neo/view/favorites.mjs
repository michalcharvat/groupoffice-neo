import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';
import ConfirmDialog from '../../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import * as api      from '../../../../../../../modules/email/views/neo/api.mjs';
import {renameFavorite} from './FavoritefolderDialog.mjs';

const t = translator('community', 'emailfavorites');

/**
 * The section id in the e-mail tree (node ids "s:favorites:<Favoritefolder id>")
 * @type {String}
 */
export const SECTION_ID = 'favorites';

/**
 * The user's Favoritefolder entities of the last load, for the folder menu
 * @type {Object[]}
 */
let list = [];

/**
 * Number of the last nodes() call: only the newest one publishes its `list`
 * @type {Number}
 */
let generation = 0;

/**
 * @param {Object} favorite Favoritefolder or tree node
 * @returns {String}
 */
const key = favorite => `${favorite.account_id ?? favorite.accountId}:${favorite.mailbox}`;

/**
 * The unread counts of folders the tree has not loaded, from email/account/tree of their
 * parent (the node that lists them with their count, as for the normal folders). The IMAP
 * delimiter is not known here: a name with "." or "/" tries those parents and the account
 * root (a root folder may contain the other character).
 * @param {Object[]} favorites Favoritefolder entities
 * @returns {Promise<Map<String, Number>>} key() → unread count
 */
async function fetchUnseen(favorites) {
    const parents = new Map(),
          counts  = new Map();

    favorites.forEach(favorite => {
        const candidates = ['.', '/'].map(d => favorite.mailbox.lastIndexOf(d)).filter(i => i > 0)
            .map(i => favorite.mailbox.substring(0, i));

        [...candidates, null].forEach(parent => {
            const nodeId = api.serverNodeId(favorite.account_id, parent);
            parents.has(nodeId) || parents.set(nodeId, favorite.account_id)
        })
    });

    await Promise.all([...parents.keys()].map(async nodeId => {
        const children = await api.tree(nodeId).catch(() => []);

        (children || []).forEach(child => counts.set(key(child), api.nodeUnseen(child)))
    }));

    return counts
}

/**
 * emailTreeSections nodes(): the favourites, sorted by name, with the unread count of their folder
 * @param {GO.email.AccountTree} tree
 * @returns {Promise<Object[]>}
 */
export async function nodes(tree) {
    // the star colour and the line below the list (no component of this module is on screen)
    Neo.currentWorker.insertThemeFiles(tree.windowId, null, 'GO.emailfavorites.Favorites');

    const userId    = client.user?.id,
          current   = ++generation,
          result    = await client.queryGet('Favoritefolder', {filter: {userId}, sort: [{property: 'name', isAscending: true}]}),
          favorites = result.list.filter(favorite => Number(favorite.userId) === Number(userId));

    current === generation && (list = favorites);

    // a loaded folder has the current count; the others are fetched (a favourite's own
    // node keeps a count only while folder loads and the unread checker update it)
    const known   = favorite => tree.getFolderNode(favorite.account_id, favorite.mailbox),
          missing = favorites.filter(favorite => !known(favorite)),
          counts  = missing.length ? await fetchUnseen(missing) : new Map();

    return favorites.map((favorite, i) => ({
        id       : favorite.id,
        text     : favorite.name,
        icon     : 'star',
        cls      : ['go-emailfavorites-node', ...(i === favorites.length - 1 ? ['go-emailfavorites-last'] : [])],
        accountId: favorite.account_id,
        mailbox  : favorite.mailbox,
        unseen   : known(favorite)?.unseen ?? counts.get(key(favorite)) ?? 0
    }))
}

/**
 * @param {Object} emailMain GO.email.EmailMain
 * @returns {Object|null} its AccountTree
 */
const treeOf = emailMain => !emailMain.isDestroyed && emailMain.getReference('tree') || null;

/**
 * Saves and reloads the section now; the Favoritefolder push reloads it as well, later
 * @param {Object} emailMain
 * @param {Object} args Favoritefolder/set arguments
 */
async function save(emailMain, args) {
    // AccountTree.reloadSection() appends a section without a header that had no nodes at
    // the end of the tree: the first favourite reloads the whole tree to get its place on top.
    // Decided before the save, as the push may reload the section before set() returns.
    const wasEmpty = !treeOf(emailMain)?.roots.some(node => node.sectionId === SECTION_ID);

    try {
        await client.set('Favoritefolder', args);

        const tree = treeOf(emailMain);

        tree && (wasEmpty ? tree.reload().catch(e => notifyError(emailMain, e)) : tree.reloadSection(SECTION_ID))
    } catch (e) {
        notifyError(emailMain, e)
    }
}

/**
 * @param {Object} emailMain
 * @param {String|Number} id
 * @param {Boolean} confirm ask first (ExtJS asked in the favourite's menu)
 */
async function remove(emailMain, id, confirm) {
    if (confirm && !await ConfirmDialog.ask({appName: emailMain.appName, windowId: emailMain.windowId, title: t('Delete'), message: t('Are you sure you want to delete this item?')})) {
        return
    }

    await save(emailMain, {destroy: [String(id)]})
}

/**
 * emailTreeSections rowMenu(): Rename and Delete of a favourite (ExtJS EmailClientOverride moreMenu)
 * @param {Object} node section node, nodeId = the Favoritefolder id
 * @param {Object} emailMain
 * @returns {Object[]}
 */
export function rowMenu(node, emailMain) {
    return [{
        text   : t('Rename'),
        icon   : 'edit',
        handler: async () => {
            const name = await renameFavorite({appName: emailMain.appName, windowId: emailMain.windowId, value: node.text});

            name && name !== node.text && save(emailMain, {update: {[node.nodeId]: {name}}})
        }
    }, {
        text   : t('Delete'),
        icon   : 'delete',
        handler: () => remove(emailMain, node.nodeId, true)
    }]
}

/**
 * emailTreeSections folderMenuItems(): "Add to favorites" or "Remove from favorites"
 * (ExtJS MailboxContextMenuOverride, which only added)
 * @param {Object} folderNode AccountTree folder node
 * @param {Object} emailMain
 * @returns {Object[]}
 */
export function folderMenuItems(folderNode, emailMain) {
    if (folderNode.data?.noselect) {
        return []
    }

    const favorite = list.find(f => key(f) === key(folderNode));

    if (favorite) {
        return [{
            text   : t('Remove from favorites'),
            icon   : 'star_border',
            handler: () => remove(emailMain, favorite.id, false)
        }]
    }

    return [{
        text   : t('Add to favorites'),
        icon   : 'star',
        handler: () => save(emailMain, {
            create: {
                fav: {
                    userId    : client.user?.id,
                    account_id: folderNode.accountId,
                    mailbox   : folderNode.mailbox,
                    name      : folderNode.data?.name || folderNode.text
                }
            }
        })
    }]
}
