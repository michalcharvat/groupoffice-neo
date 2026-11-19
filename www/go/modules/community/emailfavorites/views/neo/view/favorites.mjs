import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';
import * as api      from '../../../../../../../modules/email/views/neo/api.mjs';

const t = translator('community', 'emailfavorites');

/**
 * The section id in the e-mail tree (node ids "s:favorites:<Favoritefolder id>")
 * @type {String}
 */
export const SECTION_ID = 'favorites';

/**
 * The user's Favoritefolder entities of the last load
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
