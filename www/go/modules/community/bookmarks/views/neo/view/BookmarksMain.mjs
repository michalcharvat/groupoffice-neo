import Container    from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar      from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_DELETE, LEVEL_MANAGE, LEVEL_READ, LEVEL_WRITE} from '../../../../../../../views/neo/src/Acl.mjs';
import Button       from '../../../../../../../views/neo/src/button/Button.mjs';
import SearchButton from '../../../../../../../views/neo/src/button/SearchButton.mjs';
import JmapStore    from '../../../../../../../views/neo/src/data/JmapStore.mjs';
import JmapComboBox from '../../../../../../../views/neo/src/form/field/JmapComboBox.mjs';
import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import MenuList     from '../../../../../../../views/neo/src/menu/List.mjs';
import ModuleRegistry from '../../../../../../../views/neo/src/ModuleRegistry.mjs';
import {escapeHtml}   from '../../../../../../../views/neo/src/Format.mjs';
import {notifyError}  from '../../../../../../../views/neo/src/Notify.mjs';
import {getState, setState} from '../../../../../../../views/neo/src/State.mjs';
import {fmt}          from '../../../../../../../views/neo/src/Translate.mjs';
import ConfirmDialog  from '../../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import {moduleRights, t} from '../util.mjs';
import BookmarkFrame  from './BookmarkFrame.mjs';
import BookmarksView  from './BookmarksView.mjs';

const STATE_ID = 'bookmarks-main';

/**
 * Bookmarks module (GOUI Main.ts): toolbar with add, toggle view, manage categories,
 * a category filter and search; below it the bookmarks per category. A bookmark
 * that doesn't open in a new tab is shown here in an iframe (ExtJS: a GO tab).
 */
class BookmarksMain extends Container {
    static config = {
        className: 'GO.bookmarks.BookmarksMain',
        baseCls  : ['go-bookmarks', 'neo-container'],
        layout   : {ntype: 'card', activeIndex: 0, removeInactiveCards: false},
        /**
         * Set by the shell (GO.view.MainView)
         * @member {String|null} moduleName=null
         */
        moduleName: null
    }

    /**
     * Open dialogs: closing the module closes them too
     * @member {Set<GO.view.Dialog>} dialogs
     */
    dialogs = new Set()

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype : 'container',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Toolbar,
                cls   : ['go-bg-mid', 'go-border-bottom', 'go-bookmarks-toolbar'],
                flex  : 'none',
                items : [{
                    module   : Button,
                    icon     : 'add',
                    text     : t('Add'),
                    reference: 'addButton',
                    disabled : true,
                    handler  : () => me.openBookmarkDialog(null)
                }, {
                    module   : Button,
                    icon     : 'view_module',
                    text     : t('Toggle view'),
                    reference: 'toggleButton',
                    handler  : () => me.toggleView()
                }, {
                    module   : Button,
                    icon     : 'settings',
                    text     : t('Administrate categories'),
                    reference: 'categoriesButton',
                    hidden   : true,
                    handler  : () => me.openCategories()
                }, {
                    ntype: 'component',
                    tag  : 'h5',
                    cls  : ['go-bookmarks-filter-label'],
                    text : t('Category')
                }, {
                    module      : JmapComboBox,
                    reference   : 'categoryFilter',
                    cls         : ['go-bookmarks-filter'],
                    entity      : 'BookmarksCategory',
                    displayField: 'name',
                    valueField  : 'id',
                    jmapSort    : [{property: 'name', isAscending: true}],
                    hideLabel   : true,
                    placeholderText: t('Show all'),
                    width       : 200,
                    listeners   : {change: ({value}) => me.onCategoryFilter(value)}
                }, '->', {
                    module   : SearchButton,
                    listeners: {search: ({text}) => me.onSearch(text)}
                }]
            }, {
                ntype: 'container',
                cls  : ['go-bookmarks-scroll'],
                flex : 1,
                items: [{
                    module   : BookmarksView,
                    reference: 'view',
                    listeners: {
                        open       : ({bookmark}) => me.openBookmark(bookmark),
                        contextMenu: data => me.showContextMenu(data)
                    }
                }]
            }]
        }, {
            module   : BookmarkFrame,
            reference: 'frame',
            showBack : true,
            listeners: {back: () => me.layout.activeIndex = 0}
        }];

        me.categoryStore = Neo.create({
            module    : JmapStore,
            entity    : 'BookmarksCategory',
            model     : {fields: [{name: 'id'}, {name: 'name', type: 'String'}, {name: 'permissionLevel', type: 'Int'}]},
            jmapSort  : [{property: 'name', isAscending: true}],
            properties: ['id', 'name', 'permissionLevel']
        });

        me.bookmarkStore = Neo.create({
            module    : JmapStore,
            entity    : 'Bookmark',
            // a renamed or deleted category changes the headings and the bookmarks
            watch     : ['Bookmark', 'BookmarksCategory'],
            model     : {fields: [
                {name: 'id'}, {name: 'categoryId'}, {name: 'name', type: 'String'},
                {name: 'content', type: 'String'}, {name: 'description', type: 'String'},
                {name: 'logo'}, {name: 'openExtern', type: 'Boolean'},
                {name: 'behaveAsModule', type: 'Boolean'}, {name: 'permissionLevel', type: 'Int'}
            ]},
            jmapFilter: {permissionLevel: LEVEL_READ},
            jmapSort  : [{property: 'category', isAscending: true}, {property: 'name', isAscending: true}],
            properties: ['id', 'categoryId', 'name', 'content', 'description', 'logo', 'openExtern',
                         'behaveAsModule', 'permissionLevel']
        })
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.categoryStore.on('load', me.onCategoriesLoad, me);
        me.bookmarkStore.on('load', me.refreshView, me);
        me.categoryStore.on('loadError', ({error}) => me.showError(error));
        me.bookmarkStore.on('loadError', ({error}) => me.showError(error));

        me.initialLoad = me.loadInitial()
    }

    destroy(...args) {
        let me = this;

        // close(), not destroy(): it removes the modal mask and the dialog's DOM
        me.dialogs.forEach(dialog => dialog.isDestroyed || dialog.close());
        me.categoryStore?.destroy();
        me.bookmarkStore?.destroy();
        super.destroy(...args)
    }

    async loadInitial() {
        let me    = this,
            state = await getState(STATE_ID, me.windowId);

        if (me.isDestroyed) {
            return
        }

        me.getReference('view').mode = state.mode === 'columns' ? 'columns' : 'grid';

        // headings need the category names: categories first
        await me.categoryStore.load().catch(() => {});
        me.isDestroyed || await me.bookmarkStore.load().catch(() => {})
    }

    onCategoriesLoad() {
        let me         = this,
            categories = [...me.categoryStore.items];

        me.getReference('addButton').disabled = !categories.some(c => c.permissionLevel >= LEVEL_WRITE);
        me.getReference('categoriesButton').hidden = !moduleRights().mayManage && !categories.some(c => c.permissionLevel >= LEVEL_MANAGE);

        me.refreshView()
    }

    refreshView() {
        let me = this;

        if (me.isDestroyed || !me.bookmarkStore.isLoaded) {
            return
        }

        const names = new Map([...me.categoryStore.items].map(c => [String(c.id), c.name]));

        me.getReference('view').setBookmarks([...me.bookmarkStore.items], names)
    }

    toggleView() {
        let me   = this,
            view = me.getReference('view');

        view.mode = view.mode === 'grid' ? 'columns' : 'grid';
        setState(STATE_ID, {mode: view.mode}, me.windowId)
    }

    onCategoryFilter(category) {
        this.bookmarkStore.setFilter({categoryId: category?.id ?? undefined}).catch(() => {})
    }

    onSearch(text) {
        this.bookmarkStore.setFilter({text: text || undefined}).catch(() => {})
    }

    /**
     * A bookmark that opens inside GO: its own module tab when it behaves as a module,
     * otherwise the iframe card here
     * @param {Object} bookmark
     */
    openBookmark(bookmark) {
        let me     = this,
            module = bookmark.behaveAsModule && ModuleRegistry.get('bookmarks-' + bookmark.id);

        if (module) {
            Neo.Main.setRoute({value: module.name, windowId: me.windowId});
            return
        }

        me.getReference('frame').setBookmark(bookmark);
        me.layout.activeIndex = 1
    }

    showContextMenu({bookmark, targetId}) {
        let me = this;

        MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : targetId,
            align   : {edgeAlign: 't0-b0'},
            items   : [{
                text    : t('Edit'),
                icon    : 'edit',
                disabled: bookmark.permissionLevel < LEVEL_WRITE,
                handler : () => me.openBookmarkDialog(bookmark)
            }, {
                text    : t('Delete'),
                icon    : 'delete',
                disabled: bookmark.permissionLevel < LEVEL_DELETE,
                handler : () => me.deleteBookmark(bookmark)
            }]
        })
    }

    async deleteBookmark(bookmark) {
        let me = this;

        const confirmed = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            // the message is HTML
            message : fmt(t("Are you sure you want to delete '{item}'?"), {item: escapeHtml(bookmark.name)})
        });

        if (!confirmed) {
            return
        }

        try {
            await client.set('Bookmark', {destroy: [bookmark.id]})
            // the list reloads by itself (push)
        } catch (e) {
            me.showError(e)
        }
    }

    /**
     * @param {GO.view.Dialog} dialog
     * @returns {GO.view.Dialog}
     */
    trackDialog(dialog) {
        this.dialogs.forEach(d => d.isDestroyed && this.dialogs.delete(d));
        this.dialogs.add(dialog);
        return dialog
    }

    /**
     * @param {Object|null} bookmark null for a new one
     */
    async openBookmarkDialog(bookmark) {
        let me = this;

        try {
            const {default: BookmarkDialog} = await import('./BookmarkDialog.mjs');

            if (me.isDestroyed) {
                return
            }

            const filter = me.getReference('categoryFilter').value?.id,
                  writable = [...me.categoryStore.items].filter(c => c.permissionLevel >= LEVEL_WRITE),
                  categoryId = writable.find(c => String(c.id) === String(filter))?.id || writable[0]?.id || null;

            me.trackDialog(Neo.create(BookmarkDialog, {
                appName : me.appName,
                windowId: me.windowId,
                entityId: bookmark?.id || null,
                values  : {categoryId, openExtern: true, behaveAsModule: false}
            }))
        } catch (e) {
            me.showError(e)
        }
    }

    async openCategories() {
        let me = this;

        try {
            const {default: CategoriesDialog} = await import('./CategoriesDialog.mjs');

            me.isDestroyed || me.trackDialog(Neo.create(CategoriesDialog, {appName: me.appName, windowId: me.windowId}))
        } catch (e) {
            me.showError(e)
        }
    }

    /**
     * Header "+" menu (GO.view.MainView)
     */
    async onQuickAdd() {
        await this.initialLoad;
        this.isDestroyed || this.openBookmarkDialog(null)
    }

    showError(error) {
        notifyError(this, error)
    }
}

export default Neo.setupClass(BookmarksMain);
