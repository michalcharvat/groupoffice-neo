import Toolbar      from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button       from '../../../../../views/neo/src/button/Button.mjs';
import SearchButton from '../../../../../views/neo/src/button/SearchButton.mjs';
import TableTitle   from '../../../../../views/neo/src/component/TableTitle.mjs';
import Grid         from '../../../../../views/neo/src/grid/Grid.mjs';
import {selectRow}  from '../../../../../views/neo/src/grid/selectRow.mjs';
import client       from '../../../../../views/neo/src/jmap/Client.mjs';
import {escapeHtml, fileSize, formatUserDateTime, smartDateTime} from '../../../../../views/neo/src/Format.mjs';
import {notifyError} from '../../../../../views/neo/src/Notify.mjs';
import Tree         from '../../../../../views/neo/src/tree/Tree.mjs';
import UploadButton from '../../../../../views/neo/src/component/UploadButton.mjs';
import {enableDragDrop} from '../../../../../views/neo/src/component/dragDrop.mjs';
import uploader     from '../../../../../views/neo/src/jmap/Uploader.mjs';
import MenuList     from '../../../../../views/neo/src/menu/List.mjs';
import ConfirmDialog from '../../../../../views/neo/src/view/ConfirmDialog.mjs';
import TextPrompt   from '../../../../../views/neo/src/view/TextPrompt.mjs';
import MainThreeColumnPanel from '../../../../../views/neo/src/view/MainThreeColumnPanel.mjs';
import {fmt, translator} from '../../../../../views/neo/src/Translate.mjs';
import FolderStore  from '../data/FolderStore.mjs';
import {decodeEntities, fileIcon, isFolder, isValidName, splitFileName, toTreeNode} from '../util.mjs';
import FileDetail   from './FileDetail.mjs';
import OverwriteDialog from './OverwriteDialog.mjs';
import {downloadUrl, getHandlers, openFile, openUrl, runHandler, submitFile} from '../fileHandlers.mjs';
import FilePropertiesDialog   from './FilePropertiesDialog.mjs';
import FolderPropertiesDialog from './FolderPropertiesDialog.mjs';
import TextList     from '../../../../../views/neo/src/list/TextList.mjs';
import Store        from '../../../../../views/neo/node_modules/neo.mjs/src/data/Store.mjs';
import {showComposer} from '../../../../../views/neo/src/Mail.mjs';
import ModuleRegistry from '../../../../../views/neo/src/ModuleRegistry.mjs';
import DownloadLinkDialog from './DownloadLinkDialog.mjs';
import SelectFilesDialog  from './SelectFilesDialog.mjs';

const t = translator('legacy', 'files');

/** ExtJS GO.permissionLevels */
/**
 * "<count> items" of the table title; a key per form, languages like Czech need another word
 * order
 * @param {Number} count
 * @returns {String}
 */
const itemCount = count => count === 1 ? t('1 item') : fmt(t('{count} items'), {count});

export const LEVEL_READ = 10, LEVEL_CREATE = 20, LEVEL_WRITE = 30, LEVEL_DELETE = 40, LEVEL_MANAGE = 50;

/** files/folder/paste calls one after the other (pasteInto()) */
let pasteQueue = Promise.resolve();

const dateRenderer = ({value}) => escapeHtml(value || '');

/**
 * Cut or copied items, shared by all file browsers of the App worker (ExtJS
 * GO.files.pasteSelections): {mode: 'cut'|'copy', typeIds: ['d:1', 'f:2']}
 */
const clipboard = {mode: null, typeIds: []};

/**
 * Files main panel (ExtJS GO.files.FileBrowser): folder tree | folder contents | detail.
 *
 * Talks to the legacy files controllers (files/folder/tree, files/folder/list, …); records
 * of the grid are keyed by type_id ("d:<id>" folder, "f:<id>" file).
 *
 * Routes: "#files/folder/<id>", "#files/file/<id>" (the file's folder, file selected).
 */
class FilesMain extends MainThreeColumnPanel {
    static config = {
        className: 'GO.files.view.FilesMain',
        cls      : ['go-files'],
        stateName: 'files',
        /**
         * Route prefix, set by the shell (GO.view.MainView)
         * @member {String|null} moduleName=null
         */
        moduleName: null
    }

    /**
     * Shown folder: a folder id, "shared" or "trash"
     * @member {String|null} folderId=null
     */
    folderId = null
    /**
     * Folder whose ancestors the tree expands on its next reload (deep link)
     * @member {String|null} expandFolderId=null
     */
    expandFolderId = null
    /**
     * Record to select once the folder has loaded (type_id)
     * @member {String|null} pendingTypeId=null
     */
    pendingTypeId = null
    /**
     * Counts folder changes: a route answered late does not undo a newer navigation
     * @member {Number} navigation=0
     */
    navigation = 0
    /**
     * Open dialogs: closing the module closes them too
     * @member {Set<GO.view.Dialog>} dialogs
     */
    dialogs = new Set()

    createWest() {
        return {
            ntype : 'container',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Toolbar,
                flex  : 'none',
                items : [{
                    ntype: 'component',
                    tag  : 'h4',
                    cls  : ['go-toolbar-heading'],
                    text : t('Files')
                }, '->', this.hideWestButton()]
            }, {
                ntype : 'container',
                cls   : ['go-scroll'],
                flex  : 1,
                layout: {ntype: 'vbox', align: 'stretch'},
                items : [{
                    module      : Tree,
                    reference   : 'tree',
                    cls         : ['go-files-tree'],
                    flex        : 'none',
                    defaultIcon : 'folder',
                    nodeProvider: node => this.loadTreeNodes(node)
                }, {
                    // ExtJS GO.files.BookmarksGrid
                    module   : Toolbar,
                    flex     : 'none',
                    reference: 'favoritesHeader',
                    hidden   : true,
                    items    : [{
                        ntype: 'component',
                        tag  : 'h4',
                        cls  : ['go-toolbar-heading'],
                        text : t('Favorites')
                    }]
                }, {
                    module      : TextList,
                    reference   : 'favorites',
                    cls         : ['go-files-favorites'],
                    flex        : 'none',
                    displayField: 'name',
                    store       : {
                        module     : Store,
                        keyProperty: 'folder_id',
                        model      : {fields: [{name: 'folder_id', type: 'String'}, {name: 'name', type: 'String'}]}
                    }
                }]
            }, {
                ntype    : 'component',
                reference: 'quota',
                cls      : ['go-files-quota'],
                flex     : 'none',
                hidden   : true,
                html     : ''
            }]
        }
    }

    createCenter() {
        return {
            ntype : 'container',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                ntype : 'container',
                flex  : 'none',
                cls   : ['go-mstb-host'],
                reference: 'toolbarHost',
                items : [{
                    module   : Toolbar,
                    reference: 'centerToolbar',
                    cls      : ['go-bg-mid', 'go-border-bottom'],
                    items    : [this.showWestButton(), {
                        module   : Button,
                        icon     : 'arrow_upward',
                        reference: 'upButton',
                        tooltip  : t('Up'),
                        disabled : true,
                        handler  : 'up.onUp'
                    }, {
                        module   : TableTitle,
                        reference: 'tableTitle',
                        title    : t('Files')
                    }, '->', {
                        module   : SearchButton,
                        reference: 'searchButton',
                        listeners: {search: ({text}) => this.onSearch(text)}
                    }, {
                        module    : UploadButton,
                        reference : 'uploadButton',
                        buttonText: t('Upload'),
                        listeners : {files: ({files}) => this.upload(files, this.folderId)}
                    }, {
                        module   : Button,
                        icon     : 'restore_from_trash',
                        reference: 'restoreButton',
                        tooltip  : t('Restore'),
                        hidden   : true,
                        handler  : 'up.onRestore'
                    }, {
                        module   : Button,
                        icon     : 'delete_forever',
                        reference: 'deleteForeverButton',
                        tooltip  : t('Delete permanently'),
                        hidden   : true,
                        handler  : 'up.onDeleteFromTrash'
                    }, {
                        module   : Button,
                        icon     : 'create_new_folder',
                        ui       : 'primary',
                        reference: 'newFolderButton',
                        tooltip  : t('New folder'),
                        handler  : 'up.onNewFolder'
                    }, {
                        module   : Button,
                        icon     : 'more_vert',
                        reference: 'moreButton',
                        tooltip  : t('More'),
                        handler  : 'up.onMoreButton'
                    }]
                }]
            }, {
                module     : Grid,
                reference  : 'grid',
                cls        : ['go-files-grid'],
                flex       : 1,
                multiSelect: true,
                store      : {module: FolderStore},
                stateId    : 'files-grid',
                columns    : [{
                    dataField: 'name',
                    text     : t('Name'),
                    flex     : 1,
                    hideable : false,
                    renderer : ({record}) => this.nameRenderer(record)
                }, {
                    dataField: 'path',
                    text     : t('Location'),
                    width    : 240,
                    hidden   : true,
                    renderer : ({value}) => escapeHtml(decodeEntities(value))
                }, {
                    dataField: 'type',
                    text     : t('Type'),
                    width    : 160,
                    hidden   : true
                }, {
                    dataField: 'size',
                    text     : t('Size'),
                    width    : 100,
                    cellAlign: 'right',
                    renderer : ({record, value}) => isFolder(record) || value === '-' ? '' : escapeHtml(fileSize(+value || 0))
                }, {
                    dataField: 'username',
                    text     : t('Created by'),
                    width    : 160,
                    hidden   : true,
                    renderer : ({value}) => escapeHtml(value || '')
                }, {
                    dataField: 'musername',
                    text     : t('Modified by'),
                    width    : 160,
                    hidden   : true,
                    renderer : ({value}) => escapeHtml(value || '')
                }, {
                    dataField: 'ctime',
                    text     : t('Created at'),
                    width    : 150,
                    cellAlign: 'right',
                    hidden   : true,
                    renderer : dateRenderer
                }, {
                    dataField: 'mtime',
                    text     : t('Modified at'),
                    width    : 150,
                    cellAlign: 'right',
                    renderer : dateRenderer
                }, {
                    dataField: 'id',
                    text     : t('ID'),
                    width    : 80,
                    hidden   : true
                }]
            }, {
                // ExtJS GO.files.TrashGrid (folder "trash")
                module     : Grid,
                reference  : 'trashGrid',
                cls        : ['go-files-grid'],
                flex       : 1,
                hidden     : true,
                multiSelect: true,
                store      : {module: FolderStore, keyProperty: 'id', defaultSort: {property: 'deletedAt', direction: 'DESC'}},
                stateId    : 'files-trash-grid',
                columns    : [{
                    // fixed widths: the grid is created hidden, a flex column would get none
                    dataField: 'name',
                    text     : t('Name'),
                    width    : 280,
                    hideable : false,
                    renderer : ({record}) => `<i class="go-icon go-files-icon">${record.entity === 'd' ? 'folder' : fileIcon({extension: String(record.name).split('.').pop()})}</i><span class="go-files-name">${escapeHtml(decodeEntities(record.name))}</span>`
                }, {
                    dataField: 'fullPath',
                    text     : t('Location'),
                    width    : 240,
                    renderer : ({value}) => escapeHtml(decodeEntities(value))
                }, {
                    dataField: 'deletedByUser',
                    text     : t('Deleted by'),
                    width    : 160,
                    renderer : ({value}) => escapeHtml(value || '')
                }, {
                    dataField: 'deletedAt',
                    text     : t('Deleted at'),
                    width    : 150,
                    cellAlign: 'right',
                    renderer : ({value}) => value ? `<span title="${escapeHtml(formatUserDateTime(value))}">${escapeHtml(smartDateTime(value))}</span>` : ''
                }]
            }]
        }
    }

    createEast() {
        return {
            module   : FileDetail,
            reference: 'detail'
        }
    }

    destroy(...args) {
        this.dialogs.forEach(dialog => dialog.isDestroyed || dialog.close());
        super.destroy(...args)
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

    onConstructed() {
        super.onConstructed();

        let me     = this,
            tree   = me.getReference('tree'),
            grid   = me.getReference('grid'),
            store  = grid.store,
            detail = me.getReference('detail');

        tree.on('itemClick', ({record}) => record && me.openFolder(record.id, {fromTree: true}));
        tree.on('load', () => {
            me.resolveHomeFolder();
            me.syncTreeSelection()
        });

        grid.view.selectionModel.on('selectionChange', me.onSelectionChange, me);
        grid.on('rowDoubleClick', ({record}) => record && me.onOpenRecord(record));
        // ExtJS FilesGrid: Delete moves the selection to the trash, ctrl + Delete deletes it
        grid.on('deleteKey', ({records, ctrlKey}) => me.mayDelete(records) && (ctrlKey ? me.deleteRecords(records) : me.moveToTrash(records)));
        // a click on the selected row shows it again (phone, after "close")
        grid.on('rowClick', ({record}) => {
            const sm = grid.view.selectionModel;
            record && sm.selectedRows.length === 1 && sm.isSelectedRow(record.type_id) && me.activatePanel('east')
        });
        grid.body.on('scrollEdge', () => store.loadMore().catch(() => {}));

        store.on('meta', me.onFolderMeta, me);
        store.on('load', me.onFolderLoad, me);
        store.on('loadError', ({error}) => me.showError(error));

        detail.getReference('toolbar').insert(0, me.showCenterButton());
        detail.on('action', event => me.onDetailAction(event));

        const trashGrid = me.getReference('trashGrid');
        trashGrid.store.on('load', () => me.onTrashLoad());
        trashGrid.store.on('loadError', ({error}) => me.showError(error));
        trashGrid.body.on('scrollEdge', () => trashGrid.store.loadMore().catch(() => {}));
        trashGrid.view.selectionModel.on('selectionChange', () => me.updateButtons());
        // ExtJS TrashGrid (GO.grid.GridPanel): Delete deletes the selection permanently
        trashGrid.on('deleteKey', ({records}) => me.deleteFromTrash(records));

        me.initContextMenus();
        me.initDragDrop();
        me.initFavorites();

        // the home folder, like ExtJS (folder_id '' lists it)
        // no route: a deep link (route()) waits for it and must not be replaced by the home folder
        me.initialLoad = me.openFolder('', {setRoute: false})
    }

    /**
     * Tree nodes of the legacy tree controller
     * @param {Object|null} node
     * @returns {Promise<Object[]>}
     */
    async loadTreeNodes(node) {
        let me     = this,
            params = {node: node ? node.id : 'root'};

        if (!node && me.expandFolderId) {
            params.expand_folder_id = me.expandFolderId
        }

        const nodes = await client.legacy('files/folder/tree', params);

        return (Array.isArray(nodes) ? nodes : []).map(toTreeNode)
    }

    /**
     * The home folder is listed as folder_id '': its id is the tree's first root (whichever
     * of the list and the tree answers last sets it)
     */
    resolveHomeFolder() {
        let me   = this,
            home = me.getReference('tree').roots[0];

        if (me.folderId === '' && home && /^\d+$/.test(home.id) && me.getReference('grid').store.isLoaded) {
            me.folderId = home.id;
            me.getReference('grid').store.folderId = home.id;
            me.updateButtons()
        }
    }

    /**
     * Selects the shown folder in the tree when it is a node there
     */
    syncTreeSelection() {
        let me   = this,
            tree = me.getReference('tree'),
            record = me.folderId !== null && tree.store.get(String(me.folderId));

        if (record) {
            tree.selectionModel.select(record)
        } else {
            tree.selectionModel.deselectAll?.()
        }
    }

    /**
     * Shows a folder
     * @param {String|Number} folderId folder id, "shared", "trash" or '' (home folder)
     * @param {Object} [opts]
     * @param {Boolean} [opts.fromTree] clicked in the tree
     * @param {String} [opts.select] type_id to select once loaded
     * @param {Boolean} [opts.setRoute=true] put the folder in the URL
     * @returns {Promise<void>}
     */
    async openFolder(folderId, {fromTree=false, select=null, setRoute=true}={}) {
        let me    = this,
            grid  = me.getReference('grid'),
            store = grid.store,
            trash = String(folderId) === 'trash';

        me.navigation++;
        me.pendingTypeId = select;
        me.folderId      = String(folderId);
        me.getReference('searchButton').reset?.();
        grid.view.selectionModel.clear?.();
        me.getReference('detail').setRecord(null);

        // ExtJS: the trash is a grid of its own (card 2) with Restore / Delete permanently
        grid.hidden = trash;
        me.getReference('trashGrid').hidden = !trash;
        me.updateButtons();

        try {
            trash
                ? await me.getReference('trashGrid').store.loadFolder('trash')
                : await store.loadFolder(me.folderId)
        } catch (e) {
            return // loadError shows it
        }

        if (me.isDestroyed) {
            return
        }

        // home folder ('') answers with its id
        !fromTree && me.syncTreeSelection();
        me.activatePanel('center');

        setRoute && me.moduleName && /^\d+$/.test(me.folderId) && !select &&
            Neo.Main.setRoute({value: `${me.moduleName}/folder/${me.folderId}`, windowId: me.windowId})
    }

    /**
     * Folder data of a list response: title, up button, quota
     * @param {Object} meta
     */
    onFolderMeta({meta}) {
        if (this.folderId === 'trash') {
            return // a folder answered after the trash was opened
        }

        let me    = this,
            store = me.getReference('grid').store,
            path  = decodeEntities(meta.path || ''),
            name  = me.folderId === 'shared' ? t('Shared') : me.folderId === 'trash' ? t('Trash') : (path.split('/').pop() || t('Files')),
            node  = me.getReference('tree').getNode(me.folderId);

        me.resolveHomeFolder();

        me.getReference('tableTitle').set({
            title   : store.query ? fmt(t('Search results in {folder}'), {folder: node?.text || name}) : (node?.text || name),
            subtitle: store.query ? '' : path
        });

        // ExtJS: no "up" at the top of the tree or above a share
        const topLevel = me.getReference('tree').roots.some(r => r.id === String(me.folderId));
        me.getReference('upButton').disabled = !meta.parent_id || topLevel || !/^\d+$/.test(String(me.folderId)) || !!store.query;

        me.updateQuota(meta);
        me.updateButtons()
    }

    onFolderLoad() {
        let me    = this,
            grid  = me.getReference('grid'),
            store = grid.store,
            id    = me.pendingTypeId;

        if (me.isDestroyed || me.folderId === 'trash') {
            return
        }

        const total = store.totalCount || 0;
        me.getReference('tableTitle').subtitle = (store.query ? '' : decodeEntities(store.meta.path || '') + ' · ') + itemCount(total);

        me.pendingTypeId = null;

        const shown = me.getReference('detail').fileRecord?.type_id,
              record = (id || shown) && store.get(id || shown);

        if (record) {
            selectRow(grid, record.type_id);
            me.getReference('detail').setRecord(record);
            id && me.activatePanel('east')
        } else if (shown) {
            me.getReference('detail').setRecord(null)
        }
    }

    /**
     * Quota bar below the tree (ExtJS FileBrowser quota ProgressBar), MB
     * @param {Object} meta
     */
    updateQuota({disk_usage: usage, disk_quota: quota}) {
        let me    = this,
            el    = me.getReference('quota');

        if (!quota || usage === undefined) {
            el.hidden = true;
            return
        }

        const ratio = Math.min(1, usage / quota),
              state = ratio > .99 ? 'go-error' : ratio > .75 ? 'go-warning' : '';

        el.hidden = false;
        el.html = `<div class="go-files-quota-text">${escapeHtml(fmt(t('{usage} of {quota} used'), {
            usage: fileSize(usage * 1024 * 1024), quota: fileSize(quota * 1024 * 1024)}))}</div>
            <div class="go-files-quota-bar ${state}"><span style="width:${Math.round(ratio * 100)}%"></span></div>`
    }

    onSelectionChange({records}) {
        if (records.length > 1) {
            return
        }

        let me     = this,
            record = records[0] || null;

        me.getReference('detail').setRecord(record);
        record && me.activatePanel('east');

        record && me.moduleName && !isFolder(record) &&
            Neo.Main.setRoute({value: `${me.moduleName}/file/${record.id}`, windowId: me.windowId})
    }

    /**
     * Double click: a folder opens, a file opens with its handler
     * @param {Object} record
     */
    onOpenRecord(record) {
        if (isFolder(record)) {
            this.openFolder(record.id)
        } else {
            this.openFile(record)
        }
    }

    /**
     * Opens a file with the user's default handler (inline, image viewer, WOPI, …)
     * @param {Object} record
     */
    openFile(record) {
        openFile({id: record.id, name: decodeEntities(record.name)}, this)
    }

    downloadFile(record) {
        openUrl(this, downloadUrl(record, false))
    }

    /**
     * ExtJS "Open with": all handlers of the file
     * @param {Object} record
     * @param {String} target DOM id
     */
    async openWith(record, target) {
        let me = this;

        try {
            const handlers = await getHandlers(record, true),
                  file     = {id: record.id, name: decodeEntities(record.name)};

            me.isDestroyed || MenuList.showAt({
                appName : me.appName,
                windowId: me.windowId,
                target,
                items   : handlers.map(handler => ({
                    text   : handler.name,
                    icon   : 'open_in_new',
                    handler: () => runHandler(handler, file, me)
                }))
            })
        } catch (e) {
            me.showError(e)
        }
    }

    onDetailAction({action, record, target}) {
        let me = this;

        switch (action) {
            case 'open':
                me.openFile(record);
                break
            case 'download':
                me.downloadFile(record);
                break
            case 'properties':
                me.openProperties(record);
                break
            case 'more':
                me.showItemMenu([record], target);
                break
        }
    }

    onUp() {
        const parentId = this.getReference('grid').store.meta.parent_id;
        parentId && this.openFolder(parentId)
    }

    onSearch(text) {
        let me    = this,
            store = me.getReference('grid').store;

        // ExtJS: search the files below the shown folder
        store.query = text || '';
        store.load().catch(() => {})
    }

    /**
     * Called by the shell for "#files/<path>"
     * @param {String} path
     */
    async route(path) {
        let me    = this,
            match = path.match(/^(folder|file)\/(\d+)$/);

        if (!match) {
            return
        }

        await me.initialLoad;

        if (me.isDestroyed) {
            return
        }

        if (match[1] === 'folder') {
            if (me.folderId !== match[2]) {
                me.revealFolder(match[2]);
                await me.openFolder(match[2])
            }
            return
        }

        const typeId = 'f:' + match[2],
              store  = me.getReference('grid').store;

        if (store.get(typeId)) {
            selectRow(me.getReference('grid'), typeId);
            me.getReference('detail').setRecord(store.get(typeId));
            me.activatePanel('east');
            return
        }

        try {
            const navigation = me.navigation,
                  {data}     = await client.legacy('files/file/display', {id: match[2]});

            if (!me.isDestroyed && data?.folder_id && navigation === me.navigation) {
                me.revealFolder(String(data.folder_id));
                await me.openFolder(data.folder_id, {select: typeId});

                // not on the first page of its folder: show it anyway
                if (!me.isDestroyed && !store.get(typeId) && String(me.folderId) === String(data.folder_id)) {
                    me.getReference('detail').setRecord({...data, id: match[2], type_id: typeId});
                    me.activatePanel('east')
                }
            }
        } catch (e) {
            me.showError(e)
        }
    }

    /**
     * Reloads the tree with the folder's ancestors expanded (server side expand_folder_id)
     * @param {String} folderId
     */
    revealFolder(folderId) {
        let me   = this,
            tree = me.getReference('tree');

        if (tree.getNode(folderId)) {
            return
        }

        me.expandFolderId = folderId;
        tree.reload().catch(e => me.showError(e)).finally(() => {me.expandFolderId = null})
    }


    /**
     * Permission level of the shown folder (0 while searching, like ExtJS setWritePermission())
     * @returns {Number}
     */
    folderLevel() {
        const store = this.getReference('grid').store;
        return store.query ? 0 : (+store.meta.permission_level || 0)
    }

    /**
     * Enables the toolbar for the shown folder and selection (ExtJS setWritePermission())
     */
    updateButtons() {
        let me    = this,
            trash = me.folderId === 'trash',
            level = me.folderLevel(),
            real  = /^\d+$/.test(String(me.folderId));

        me.getReference('uploadButton').hidden       = trash;
        me.getReference('uploadButton').disabled     = !real || level < LEVEL_CREATE;
        me.getReference('newFolderButton').hidden    = trash;
        me.getReference('newFolderButton').disabled  = !real || level < LEVEL_CREATE;
        me.getReference('moreButton').hidden         = trash;
        me.getReference('searchButton').hidden       = trash;
        me.getReference('restoreButton').hidden      = !trash;
        me.getReference('deleteForeverButton').hidden = !trash;

        if (trash) {
            const none = !me.getReference('trashGrid').getSelectedRecords().length;
            me.getReference('restoreButton').disabled       = none;
            me.getReference('deleteForeverButton').disabled = none
        }
    }

    onTrashLoad() {
        let me    = this,
            store = me.getReference('trashGrid').store;

        if (me.isDestroyed || me.folderId !== 'trash') {
            return
        }

        me.getReference('tableTitle').set({
            title   : t('Trash'),
            subtitle: itemCount(store.totalCount || 0)
        });
        me.getReference('upButton').disabled = true;
        me.updateButtons()
    }

    /**
     * @returns {Object[]} selected grid records
     */
    getSelected() {
        return this.getReference('grid').getSelectedRecords()
    }

    /**
     * Right click on a row or a tree node: the ExtJS GO.files.FilesContextMenu
     */
    initContextMenus() {
        let me   = this,
            grid = me.getReference('grid'),
            tree = me.getReference('tree');

        Neo.main.DomEvents.registerPreventDefaultTargets({name: 'contextmenu', cls: ['go-files-grid'], windowId: me.windowId});
        Neo.main.DomEvents.registerPreventDefaultTargets({name: 'contextmenu', cls: ['go-files-tree'], windowId: me.windowId});

        grid.addDomListeners({contextmenu: data => me.onGridContextMenu(data), scope: me});
        tree.addDomListeners({contextmenu: data => me.onTreeContextMenu(data), scope: me});
        // the trash grid has the class go-files-grid too
        me.getReference('trashGrid').addDomListeners({contextmenu: data => me.onTrashContextMenu(data), scope: me})
    }

    /**
     * Right click on a trash row: Restore / Delete permanently of the selection or that row
     * @param {Object} data neo DOM event
     */
    onTrashContextMenu(data) {
        let me     = this,
            grid   = me.getReference('trashGrid'),
            row    = data.path.find(node => node.cls?.includes('neo-grid-row') && node.data?.recordId),
            record = row && grid.store.get(row.data.recordId);

        if (!record) {
            return
        }

        const selected = grid.getSelectedRecords(),
              records  = selected.includes(record) ? selected : [record];

        selected.includes(record) || selectRow(grid, record.id);

        MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : data.path[0]?.id || row.id,
            items   : [{
                text   : t('Restore'),
                icon   : 'restore_from_trash',
                handler: () => me.restoreRecords(records)
            }, {
                text   : t('Delete permanently'),
                icon   : 'delete_forever',
                handler: () => me.deleteFromTrash(records)
            }]
        })
    }

    onGridContextMenu(data) {
        let me     = this,
            grid   = me.getReference('grid'),
            row    = data.path.find(node => node.cls?.includes('neo-grid-row') && node.data?.recordId),
            record = row && grid.store.get(row.data.recordId);

        if (!record) {
            return
        }

        const selected = me.getSelected(),
              records  = selected.includes(record) ? selected : [record];

        if (!selected.includes(record)) {
            selectRow(grid, record.type_id);
            me.getReference('detail').setRecord(record)
        }

        me.showItemMenu(records, data.path[0]?.id || row.id)
    }

    onTreeContextMenu(data) {
        let me   = this,
            tree = me.getReference('tree'),
            item = data.path.find(node => node.cls?.includes('neo-list-item')),
            id   = item && tree.getItemRecordId(item.id),
            node = id !== undefined && id !== null && tree.getNode(id);

        if (!node || !/^\d+$/.test(node.id)) {
            return
        }

        const record = {type_id: 'd:' + node.id, id: node.id, name: node.text, extension: 'folder', readonly: node.readonly};

        MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : data.path[0]?.id || item.id,
            items   : [{
                text   : t('New folder'),
                icon   : 'create_new_folder',
                handler: () => me.newFolder(node.id)
            }, {
                text    : t('Paste'),
                icon    : 'content_paste',
                disabled: !clipboard.typeIds.length,
                handler : () => me.paste(node.id)
            }, {
                text   : t('Add to favorites'),
                icon   : 'star',
                handler: () => me.addFavorite(node.id)
            }, {
                text   : t('Properties'),
                icon   : 'info',
                handler: () => me.openProperties(record)
            }, {separator: true}, ...me.editItems([record], {tree: true})]
        })
    }

    /**
     * The level on the rows of the grid: the shown folder's (ExtJS setWritePermission()); a
     * search result: unknown, the server checks
     * @returns {Number}
     */
    rowLevel() {
        return this.getReference('grid').store.query ? LEVEL_MANAGE : this.folderLevel()
    }

    /**
     * May the rows be trashed or deleted (the menu's "Move to Trash" / "Delete permanently")
     * @param {Object[]} records rows of the grid
     * @returns {Boolean}
     */
    mayDelete(records) {
        return records.length > 0 && this.rowLevel() >= LEVEL_DELETE && !records.some(r => isFolder(r) && +r.readonly)
    }

    /**
     * Rename, cut, copy, trash, delete of items
     * @param {Object[]} records
     * @param {Object} [opts]
     * @param {Boolean} [opts.tree] a tree node (no cut / copy)
     * @returns {Object[]} menu items
     */
    editItems(records, {tree=false}={}) {
        let me     = this,
            single = records.length === 1 ? records[0] : null,
            system = records.some(r => isFolder(r) && +r.readonly),
            // rows of the shown folder: its level (ExtJS setWritePermission()); a tree node or a
            // search result: unknown, the server checks
            level  = tree ? LEVEL_MANAGE : me.rowLevel(),
            write  = level >= LEVEL_WRITE,
            del    = level >= LEVEL_DELETE;

        return [{
            text    : t('Rename'),
            icon    : 'drive_file_rename_outline',
            disabled: !single || system || !write,
            handler : () => me.rename(single)
        }, ...(tree ? [] : [{
            text    : t('Cut'),
            icon    : 'content_cut',
            disabled: !del,
            handler : () => me.setClipboard('cut', records)
        }, {
            text   : t('Copy'),
            icon   : 'content_copy',
            handler: () => me.setClipboard('copy', records)
        }]), {separator: true}, {
            text    : t('Move to Trash'),
            icon    : 'delete',
            disabled: system || !del,
            handler : () => me.moveToTrash(records)
        }, {
            text    : t('Delete permanently'),
            icon    : 'delete_forever',
            disabled: system || !del,
            handler : () => me.deleteRecords(records)
        }]
    }

    /**
     * @param {Object[]} records
     * @param {String} target DOM id to align the menu to
     */
    showItemMenu(records, target) {
        let me     = this,
            single = records.length === 1 ? records[0] : null,
            folder = single && isFolder(single),
            items  = [];

        if (single && !folder) {
            const lockedByOther = single.locked_user_id > 0;

            items.push({text: t('Open'), icon: 'open_in_new', handler: () => me.openFile(single)},
                       {text: t('Open with'), icon: 'apps', handler: () => me.openWith(single, target)},
                       {text: t('Download'), icon: 'download', handler: () => me.downloadFile(single)},
                       {separator: true},
                       lockedByOther
                           ? {text: t('Unlock'), icon: 'lock_open', disabled: !single.unlock_allowed, handler: () => me.setLocked(single, false)}
                           : {text: t('Lock'), icon: 'lock', handler: () => me.setLocked(single, true)});
        } else if (folder) {
            items.push({text: t('Open'), icon: 'folder_open', handler: () => me.openFolder(single.id)},
                       {text: t('Add to favorites'), icon: 'star', handler: () => me.addFavorite(single.id)});

            clipboard.typeIds.length && items.push({text: t('Paste'), icon: 'content_paste', handler: () => me.paste(single.id)})
        }

        single && items.push({text: t('Properties'), icon: 'info', handler: () => me.openProperties(single)});

        const email = me.emailItems(records);
        email.length && items.push({separator: true}, ...email);

        items.length && items.push({separator: true});
        items.push(...me.editItems(records));

        MenuList.showAt({appName: me.appName, windowId: me.windowId, target, items})
    }

    /**
     * "Email files" and "Email download link" (ExtJS ContextMenu share menu) when the user has
     * the e-mail composer. Trash rows are no files of a folder.
     * @param {Object[]} records
     * @returns {Object[]} menu items
     */
    emailItems(records) {
        let me    = this,
            files = records.filter(r => !isFolder(r));

        if (!records.length || me.folderId === 'trash' || !ModuleRegistry.getConfigs('showComposer').length) {
            return []
        }

        return [{
            text   : t('Email files'),
            icon   : 'attach_email',
            handler: () => me.emailFiles(records)
        }, {
            // links exist for files only (ExtJS hides it for folders)
            text    : t('Email download link'),
            icon    : 'link',
            disabled: files.length !== records.length,
            handler : () => me.emailDownloadLink(files)
        }]
    }

    /**
     * Opens the composer with the files attached (ExtJS FileBrowser.emailFiles(),
     * GO.email.emailFiles()). For a folder the user picks its files first (ExtJS
     * GO.email.openFolderTree()). The composer sends them as attachments "from file storage":
     * email/message/send reads them again and checks read permission.
     * @param {Object[]} records list records
     * @returns {Promise<void>}
     */
    async emailFiles(records) {
        let me    = this,
            open  = ModuleRegistry.getConfigs('showComposer')[0],
            owner = {appName: me.appName, windowId: me.windowId},
            files = [];

        if (!open) {
            return
        }

        for (const record of records) {
            if (isFolder(record)) {
                const picked = await SelectFilesDialog.ask({...owner, folderId: record.id});

                if (picked === null || me.isDestroyed) {
                    return
                }

                // raw tree paths: email/message/send decodes tmp_file (html_entity_decode)
                files.push(...picked.map(f => ({...f, path: escapeHtml(f.path)})))
            } else {
                // list paths come HTML encoded and are sent as they are, like ExtJS; a search
                // result's name has the path below the searched folder
                files.push({name: decodeEntities(record.path || record.name || '').split('/').pop(), path: record.path || '', size: record.size})
            }
        }

        if (!files.length) {
            return
        }

        try {
            await open({
                ...owner,
                afterLoad: composer => {
                    const field = composer.getReference('attachmentsField');

                    field.value = [...field.value || [], ...files.map(f => ({
                        name             : f.name,
                        tmp_file         : f.path,
                        size             : f.size,
                        from_file_storage: true,
                        attachment       : true
                    }))]
                }
            })
        } catch (e) {
            me.showError(e)
        }
    }

    /**
     * Asks when the links expire and opens the composer with them (ExtJS ExpireDateDialog with
     * emailDownloadLink: files/file/emailDownloadLink, which needs read permission per file)
     * @param {Object[]} files list records of files
     * @returns {Promise<void>}
     */
    async emailDownloadLink(files) {
        let me    = this,
            owner = {appName: me.appName, windowId: me.windowId};

        if (!files.length) {
            return
        }

        const link = await DownloadLinkDialog.ask(owner);

        if (!link || me.isDestroyed) {
            return
        }

        await showComposer({
            ...owner,
            loadUrl   : 'files/file/emailDownloadLink',
            loadParams: {ids: JSON.stringify(files.map(f => Number(f.id))), ...link}
        })
    }

    /**
     * The toolbar's ⋮: cut / copy / paste / trash of the selection, refresh
     * @param {Object} data button event
     */
    onMoreButton(data) {
        let me       = this,
            records  = me.getSelected(),
            level    = me.folderLevel(),
            none     = !records.length;

        MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : data.component.id,
            items   : [{
                text    : t('Cut'),
                icon    : 'content_cut',
                disabled: none || level < LEVEL_DELETE,
                handler : () => me.setClipboard('cut', records)
            }, {
                text    : t('Copy'),
                icon    : 'content_copy',
                disabled: none,
                handler : () => me.setClipboard('copy', records)
            }, {
                text    : t('Paste'),
                icon    : 'content_paste',
                disabled: !clipboard.typeIds.length || level < LEVEL_WRITE,
                handler : () => me.paste(me.folderId)
            }, {separator: true}, {
                text    : t('Move to Trash'),
                icon    : 'delete',
                disabled: none || level < LEVEL_DELETE,
                handler : () => me.moveToTrash(records)
            }, {separator: true}, {
                // ExtJS refresh(true): sync the folder with the file system
                text   : t('Refresh'),
                icon   : 'refresh',
                handler: () => me.refresh(true)
            }]
        })
    }

    /**
     * Drag and drop (ExtJS ddGroup "FilesDD"): rows onto folder rows or tree nodes move them,
     * ctrl / alt copies; desktop files onto the grid or a folder upload there
     */
    initDragDrop() {
        let me   = this,
            grid = me.getReference('grid'),
            tree = me.getReference('tree');

        // folder rows are drop targets
        const getRowClass = grid.body.getRowClass.bind(grid.body);
        grid.body.getRowClass = (record, rowIndex) => {
            const cls = getRowClass(record, rowIndex);
            return isFolder(record) ? [...cls, 'go-drop-folder'] : cls
        };

        enableDragDrop(grid, {
            drag  : '.neo-grid-row',
            drop  : '.go-drop-folder',
            group : 'files',
            files : true,
            onDrop: event => me.onDrop(event, () => {
                const record = event.targetRecordId && grid.store.get(event.targetRecordId);
                return record && isFolder(record) ? String(record.id) : me.folderId
            })
        }).catch(e => console.error('Files drag and drop', e));

        enableDragDrop(tree, {
            drag  : '.neo-list-item',
            drop  : '.neo-list-item',
            group : 'files',
            files : true,
            onDrop: event => me.onDrop(event, () => {
                const id = tree.getItemRecordId(event.targetId);
                return id === undefined || id === null ? null : String(id)
            })
        }).catch(e => console.error('Files drag and drop', e))
    }

    /**
     * @param {Object} event goDrop of WS/DragDrop
     * @param {Function} destination () => folder id, "trash" or null
     */
    async onDrop(event, destination) {
        let me     = this,
            destId = destination();

        if (!destId || destId === 'shared') {
            return
        }

        if (event.files?.length) {
            destId === 'trash' || me.upload(event.files, destId);
            return
        }

        const typeIds = me.draggedTypeIds(event.source);

        if (!typeIds.length || typeIds.includes('d:' + destId)) {
            return
        }

        if (destId === 'trash') {
            me.moveToTrash(typeIds.map(typeId => ({type_id: typeId, name: ''})));
            return
        }

        // go.User.confirmOnMove
        if (!event.copy && client.user?.confirmOnMove) {
            const ok = await ConfirmDialog.ask({appName: me.appName, windowId: me.windowId,
                message: fmt(t('Are you sure you want to move {count} items?'), {count: typeIds.length})});

            if (!ok) {
                return
            }
        }

        me.pasteInto(destId, typeIds, event.copy ? 'copy' : 'cut')
    }

    /**
     * @param {Object} source {rootId, itemId, recordId} of WS/DragDrop
     * @returns {String[]} type ids: the selection when a selected row was dragged
     */
    draggedTypeIds(source) {
        let me   = this,
            grid = me.getReference('grid'),
            tree = me.getReference('tree');

        if (!source) {
            return []
        }

        if (source.rootId === tree.id) {
            const id = tree.getItemRecordId(source.itemId);
            return /^\d+$/.test(String(id)) && tree.getNode(id)?.draggable ? ['d:' + id] : []
        }

        const record   = source.recordId && grid.store.get(source.recordId),
              selected = me.getSelected();

        if (!record) {
            return []
        }

        return (selected.includes(record) ? selected : [record]).map(r => r.type_id)
    }

    /**
     * Reloads the folder (and the tree: folders may have been added, renamed or moved)
     * @param {Boolean} [sync=false] sync the folder with the file system first
     */
    async refresh(sync=false) {
        let me   = this,
            grid = me.folderId === 'trash' ? me.getReference('trashGrid') : me.getReference('grid');

        try {
            await Promise.all([
                grid.store.load({keepCount: true, params: sync ? {} : {skip_fs_sync: 1}}),
                me.getReference('tree').reload()
            ])
        } catch (e) {
            // loadError shows a store error
            e && !grid.store.isLoading && me.showError(e)
        }
    }


    /**
     * File or folder properties
     * @param {Object} record
     */
    async openProperties(record) {
        let me = this;

        try {
            const dialog = await (isFolder(record)
                ? FolderPropertiesDialog.open({appName: me.appName, windowId: me.windowId, folderId: record.id})
                : FilePropertiesDialog.open({appName: me.appName, windowId: me.windowId, fileId: record.id}));

            if (me.isDestroyed) {
                dialog.close();
                return
            }

            me.trackDialog(dialog);
            dialog.on('save', () => {
                if (!me.isDestroyed) {
                    me.refresh();
                    me.getReference('detail').refresh()
                }
            })
        } catch (e) {
            me.showError(e)
        }
    }

    /**
     * Lock / unlock a file (files/file/submit locked_user_id, ExtJS ContextMenu)
     * @param {Object} record
     * @param {Boolean} locked
     */
    async setLocked(record, locked) {
        let me = this;

        try {
            await submitFile({id: record.id, locked_user_id: locked ? client.user.id : 0});
            await me.refresh();
            me.getReference('detail').refresh()
        } catch (e) {
            me.showError(e)
        }
    }

    /**
     * Favorites below the tree (files/bookmark/store): a click opens the folder, a right
     * click removes it
     */
    initFavorites() {
        let me   = this,
            list = me.getReference('favorites');

        list.on('itemClick', ({record}) => record && me.openFolder(record.folder_id));

        Neo.main.DomEvents.registerPreventDefaultTargets({name: 'contextmenu', cls: ['go-files-favorites'], windowId: me.windowId});
        list.addDomListeners({contextmenu: data => {
            const item   = data.path.find(node => node.cls?.includes('neo-list-item')),
                  id     = item && list.getItemRecordId(item.id),
                  record = id !== undefined && id !== null && list.store.get(String(id));

            record && MenuList.showAt({
                appName : me.appName,
                windowId: me.windowId,
                target  : data.path[0]?.id || item.id,
                items   : [{text: t('Remove favorite'), icon: 'star_border', handler: () => me.removeFavorite(record.folder_id)}]
            })
        }, scope: me});

        me.loadFavorites()
    }

    async loadFavorites() {
        let me = this;

        try {
            const {results = []} = await client.legacy('files/bookmark/store', {limit: 0});

            if (me.isDestroyed) {
                return
            }

            me.getReference('favorites').store.data = results.map(r => ({folder_id: String(r.folder_id), name: decodeEntities(r.name)}));
            me.getReference('favoritesHeader').hidden = !results.length
        } catch (e) {
            me.showError(e)
        }
    }

    /**
     * @param {String} folderId
     */
    async addFavorite(folderId) {
        try {
            await client.legacy('files/bookmark/submit', {folder_id: folderId});
            await this.loadFavorites()
        } catch (e) {
            this.showError(e)
        }
    }

    /**
     * @param {String} folderId
     */
    async removeFavorite(folderId) {
        try {
            await client.legacy('files/bookmark/delete', {folder_id: folderId});
            await this.loadFavorites()
        } catch (e) {
            this.showError(e)
        }
    }

    /**
     * Header "+" menu
     */
    async onQuickAdd() {
        await this.initialLoad;
        this.isDestroyed || this.onNewFolder()
    }

    onNewFolder() {
        /^\d+$/.test(String(this.folderId)) && this.newFolder(this.folderId)
    }

    /**
     * ExtJS NewFolderDialog
     * @param {String} parentId
     */
    async newFolder(parentId) {
        let me   = this;

        const name = await TextPrompt.ask({
            appName  : me.appName,
            windowId : me.windowId,
            title    : t('New folder'),
            label    : t('Name'),
            value    : t('New folder'),
            validator: value => isValidName(value) ? null : t('Invalid file or folder name')
        });

        if (!name || me.isDestroyed) {
            return
        }

        try {
            const response = await client.legacy('files/folder/submit', {parent_id: parentId, name});

            await me.refresh();

            // the new folder is selected when it is in the shown folder
            response.id && String(parentId) === String(me.folderId) && selectRow(me.getReference('grid'), 'd:' + response.id)
        } catch (e) {
            me.showError(e)
        }
    }

    /**
     * @param {Object} record list record or tree folder
     */
    async rename(record) {
        let me     = this,
            folder = isFolder(record),
            old    = decodeEntities(record.name);

        const name = await TextPrompt.ask({
            appName  : me.appName,
            windowId : me.windowId,
            title    : t('Rename'),
            label    : t('Name'),
            value    : old,
            select   : folder ? 'all' : 'name',
            validator: value => isValidName(value) ? null : t('Invalid file or folder name')
        });

        if (!name || name === old || me.isDestroyed) {
            return
        }

        try {
            if (folder) {
                await client.legacy('files/folder/submit', {id: record.id, name})
            } else {
                // file/submit joins name and extension
                await submitFile({id: record.id, ...splitFileName(name)})
            }

            await me.refresh();
            me.getReference('detail').refresh()
        } catch (e) {
            me.showError(e)
        }
    }

    /**
     * @param {String} mode 'cut' or 'copy'
     * @param {Object[]} records
     */
    setClipboard(mode, records) {
        clipboard.mode    = mode;
        clipboard.typeIds = records.map(r => r.type_id)
    }

    /**
     * Pastes the clipboard into a folder
     * @param {String} destId
     */
    async paste(destId) {
        if (!clipboard.typeIds.length) {
            return
        }

        const {mode, typeIds} = clipboard;

        // cut items move once
        mode === 'cut' && (clipboard.typeIds = []);

        await this.pasteInto(destId, typeIds, mode)
    }

    /**
     * files/folder/paste with the overwrite question (the server keeps the queue in the session)
     * @param {String} destId
     * @param {String[]} typeIds
     * @param {String} mode 'cut' or 'copy'
     */
    pasteInto(destId, typeIds, mode) {
        // one paste at a time in all windows: the server's overwrite queue is per session
        const run = pasteQueue.then(() => this.runPaste(destId, typeIds, mode));
        pasteQueue = run.catch(() => {});
        return run
    }

    async runPaste(destId, typeIds, mode) {
        let me        = this,
            overwrite = 'ask';

        if (me.isDestroyed) {
            return
        }

        try {
            for (;;) {
                const response = await client.legacy('files/folder/paste', {
                    ids                  : JSON.stringify(typeIds),
                    destination_folder_id: destId,
                    paste_mode           : mode,
                    id                   : me.folderId,
                    overwrite
                });

                if (!response.fileExists) {
                    break
                }

                overwrite = await OverwriteDialog.ask({appName: me.appName, windowId: me.windowId, file: decodeEntities(response.fileExists)});

                if (!overwrite || me.isDestroyed) {
                    break
                }
            }
        } catch (e) {
            me.showError(e)
        }

        me.isDestroyed || me.refresh()
    }

    /**
     * Moves items to the trash (ExtJS: list reload with trash_keys)
     * @param {Object[]} records
     */
    async moveToTrash(records) {
        await this.deleteWith('trash_keys', records, t('Are you sure you want to move the selected items to the trash?'))
    }

    /**
     * Deletes items permanently (ExtJS ctrl + Delete: delete_keys)
     * @param {Object[]} records
     */
    async deleteRecords(records) {
        await this.deleteWith('delete_keys', records, t('Are you sure you want to permanently delete the selected items?'))
    }

    /**
     * @param {String} key 'trash_keys' or 'delete_keys'
     * @param {Object[]} records
     * @param {String} question
     */
    async deleteWith(key, records, question) {
        let me    = this,
            store = me.getReference('grid').store;

        if (!records.length) {
            return
        }

        const confirmed = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : records.length === 1 && records[0].name
                ? fmt(t("Are you sure you want to delete '{item}'?"), {item: decodeEntities(records[0].name)})
                : question
        });

        if (!confirmed || me.isDestroyed) {
            return
        }

        try {
            await store.load({keepCount: true, params: {[key]: JSON.stringify(records.map(r => r.type_id)), skip_fs_sync: 1}});

            store.meta.deleteSuccess === false && me.showError(new Error(store.meta.deleteFeedback || t('Delete failed')));

            me.getReference('grid').view.selectionModel.clear?.();
            me.getReference('detail').setRecord(null);
            // deleted folders leave the tree
            records.some(isFolder) && me.getReference('tree').reload().catch(e => me.showError(e))
        } catch (e) {
            // loadError shows it
        }
    }

    onRestore() {
        return this.restoreRecords(this.getReference('trashGrid').getSelectedRecords())
    }

    onDeleteFromTrash() {
        return this.deleteFromTrash(this.getReference('trashGrid').getSelectedRecords())
    }

    /**
     * Puts trash items back in their folders
     * @param {Object[]} records rows of the trash grid
     */
    async restoreRecords(records) {
        let me   = this,
            grid = me.getReference('trashGrid');

        if (!records.length) {
            return
        }

        try {
            await client.legacy('files/folder/restore', {ids: records.map(r => r.id).join(',')});
            grid.view.selectionModel.clear?.();
            await me.refresh()
        } catch (e) {
            me.showError(e)
        }
    }

    /**
     * Deletes trash items permanently, after a confirmation
     * @param {Object[]} records rows of the trash grid
     */
    async deleteFromTrash(records) {
        let me   = this,
            grid = me.getReference('trashGrid');

        if (!records.length) {
            return
        }

        const confirmed = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : t('Are you sure you want to permanently delete the selected items?')
        });

        if (!confirmed || me.isDestroyed) {
            return
        }

        try {
            await client.legacy('files/folder/deleteFromTrash', {ids: records.map(r => r.id).join(',')});
            grid.view.selectionModel.clear?.();
            await grid.store.load({keepCount: true})
        } catch (e) {
            me.showError(e)
        }
    }

    /**
     * Uploads files into a folder: JMAP blobs (progress in the UploadPanel), then
     * files/folder/processUploadQueue one blob at a time, so an overwrite answer applies to
     * that file only ("Yes to all" / "No to all" to the rest)
     * @param {File[]} files
     * @param {String} destId
     */
    async upload(files, destId) {
        let me = this;

        if (!files?.length || !/^\d+$/.test(String(destId))) {
            return
        }

        const blobs = await uploader.uploadMany(files, {component: me});

        if (!blobs.length || me.isDestroyed) {
            return
        }

        let all = null; // 'yestoall' / 'notoall'

        try {
            for (const blob of blobs) {
                let overwrite = all || 'ask';

                for (;;) {
                    const response = await client.legacy('files/folder/processUploadQueue', {
                        upload               : 1,
                        destination_folder_id: destId,
                        overwrite,
                        blobs                : JSON.stringify([{id: blob.id || blob.blobId, name: blob.name}])
                    });

                    if (!response.fileExists || overwrite !== 'ask') {
                        break
                    }

                    const answer = await OverwriteDialog.ask({appName: me.appName, windowId: me.windowId, file: decodeEntities(response.fileExists)});

                    if (!answer || me.isDestroyed) {
                        // cancelled: the rest is not stored
                        return
                    }

                    overwrite = answer;
                    answer.endsWith('toall') && (all = answer);

                    if (answer === 'no' || answer === 'notoall') {
                        break
                    }
                }
            }
        } catch (e) {
            me.showError(e)
        } finally {
            me.isDestroyed || me.refresh()
        }
    }

    /**
     * @param {Object} record
     * @returns {String} HTML of the name column
     */
    nameRenderer(record) {
        const locked = record.locked_user_id > 0 ? `<i class="go-icon go-files-locked" title="${escapeHtml(t('Locked'))}">lock</i>` : '';

        return `<i class="go-icon go-files-icon">${fileIcon(record)}</i><span class="go-files-name">${escapeHtml(decodeEntities(record.name))}</span>${locked}`
    }

    showError(error) {
        notifyError(this, error)
    }
}

export default Neo.setupClass(FilesMain);
