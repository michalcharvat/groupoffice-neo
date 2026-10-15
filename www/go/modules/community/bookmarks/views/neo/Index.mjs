import client         from '../../../../../../views/neo/src/jmap/Client.mjs';
import {escapeHtml}   from '../../../../../../views/neo/src/Format.mjs';
import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {t}            from './util.mjs';

const CAPABILITY = 'go:community:bookmarks';

/**
 * Names of the bookmarks registered as modules for the logged-in user
 * @type {String[]}
 */
let bookmarkModules = [];

/**
 * Counts registerBookmarkModules() calls: only the last one registers
 * @type {Number}
 */
let generation = 0;

ModuleRegistry.register({
    package   : 'community',
    name      : 'bookmarks',
    title     : t('Bookmarks'),
    iconCls   : 'fa fa-bookmark',
    capability: CAPABILITY,
    // Material icon in the header's main menu
    icon      : 'bookmarks',
    quickAdd  : {text: t('Bookmark'), icon: 'bookmark_add'},
    mainView  : () => import('./view/BookmarksMain.mjs'),
    // ExtJS Module.js initModule(): a bookmark that "behaves as a module" gets its own
    // module tab with the page in an iframe
    onLogin   : registerBookmarkModules
});

async function registerBookmarkModules() {
    const current = ++generation,
          userId  = client.user?.id;

    // another user may have logged in
    bookmarkModules.forEach(name => ModuleRegistry.unregister(name));
    bookmarkModules = [];

    if (!client.hasCapability(CAPABILITY)) {
        return
    }

    const {list} = await client.queryGet('Bookmark', {
        filter    : {behaveAsModule: true},
        sort      : [{property: 'name', isAscending: true}],
        properties: ['id', 'name']
    });

    // a newer login (maybe of another user) started meanwhile
    if (current !== generation || client.user?.id !== userId) {
        return
    }

    list.forEach(bookmark => {
        const name = 'bookmarks-' + bookmark.id;

        bookmarkModules.push(name);

        ModuleRegistry.register({
            package   : 'community',
            name,
            // the shell renders module titles as HTML; bookmarks are written by other users
            title     : escapeHtml(bookmark.name),
            iconCls   : 'fa fa-bookmark',
            capability: CAPABILITY,
            icon      : 'bookmark',
            // loads the bookmark of its moduleName
            mainView  : () => import('./view/BookmarkFrame.mjs')
        })
    })
}
