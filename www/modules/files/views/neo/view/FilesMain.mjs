import Toolbar      from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button       from '../../../../../views/neo/src/button/Button.mjs';
import SearchButton from '../../../../../views/neo/src/button/SearchButton.mjs';
import TableTitle   from '../../../../../views/neo/src/component/TableTitle.mjs';
import Grid         from '../../../../../views/neo/src/grid/Grid.mjs';
import {selectRow}  from '../../../../../views/neo/src/grid/selectRow.mjs';
import client       from '../../../../../views/neo/src/jmap/Client.mjs';
import {escapeHtml, fileSize} from '../../../../../views/neo/src/Format.mjs';
import {notifyError} from '../../../../../views/neo/src/Notify.mjs';
import Tree         from '../../../../../views/neo/src/tree/Tree.mjs';
import MainThreeColumnPanel from '../../../../../views/neo/src/view/MainThreeColumnPanel.mjs';
import {fmt, translator} from '../../../../../views/neo/src/Translate.mjs';
import FolderStore  from '../data/FolderStore.mjs';
import {decodeEntities, fileIcon, isFolder, treeIcon} from '../util.mjs';
import FileDetail   from './FileDetail.mjs';

const t = translator('legacy', 'files');

/** ExtJS GO.permissionLevels */
export const LEVEL_READ = 10, LEVEL_CREATE = 20, LEVEL_WRITE = 30, LEVEL_DELETE = 40, LEVEL_MANAGE = 50;

const dateRenderer = ({value}) => escapeHtml(value || '');

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
                module      : Tree,
                reference   : 'tree',
                cls         : ['go-files-tree'],
                flex        : 1,
                defaultIcon : 'folder',
                nodeProvider: node => this.loadTreeNodes(node)
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
        tree.on('load', () => me.syncTreeSelection());

        grid.view.selectionModel.on('selectionChange', me.onSelectionChange, me);
        grid.on('rowDoubleClick', ({record}) => record && me.onOpenRecord(record));
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

        // the home folder, like ExtJS (folder_id '' lists it)
        me.initialLoad = me.openFolder('', {})
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

        return (Array.isArray(nodes) ? nodes : []).map(n => me.toTreeNode(n))
    }

    /**
     * @param {Object} n ExtJS tree node
     * @returns {Object} GO.tree.Tree node
     */
    toTreeNode(n) {
        const children = Array.isArray(n.children) ? n.children.map(c => this.toTreeNode(c)) : undefined;

        return {
            id       : String(n.id),
            text     : decodeEntities(n.text),
            icon     : treeIcon(n.iconCls),
            children,
            expanded : !!n.expanded && !!children?.length,
            path     : n.path,
            parentId : n.parent_id,
            readonly : !!n.readonly,
            allowDrop: n.allowDrop !== false,
            draggable: !!n.draggable
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
     * @returns {Promise<void>}
     */
    async openFolder(folderId, {fromTree=false, select=null}={}) {
        let me    = this,
            grid  = me.getReference('grid'),
            store = grid.store;

        me.pendingTypeId = select;
        me.folderId      = String(folderId);
        me.getReference('searchButton').reset?.();
        grid.view.selectionModel.clear?.();
        me.getReference('detail').setRecord(null);

        try {
            await store.loadFolder(me.folderId)
        } catch (e) {
            return // loadError shows it
        }

        if (me.isDestroyed) {
            return
        }

        // home folder ('') answers with its id
        !fromTree && me.syncTreeSelection();
        fromTree || me.activatePanel('center');

        me.moduleName && /^\d+$/.test(me.folderId) && !select &&
            Neo.Main.setRoute({value: `${me.moduleName}/folder/${me.folderId}`, windowId: me.windowId})
    }

    /**
     * Folder data of a list response: title, up button, quota
     * @param {Object} meta
     */
    onFolderMeta({meta}) {
        let me    = this,
            store = me.getReference('grid').store,
            path  = decodeEntities(meta.path || ''),
            name  = me.folderId === 'shared' ? t('Shared') : me.folderId === 'trash' ? t('Trash') : (path.split('/').pop() || t('Files')),
            node  = me.getReference('tree').getNode(me.folderId);

        // the home folder was asked for as ''
        if (me.folderId === '' && meta.parent_id !== undefined) {
            const home = me.getReference('tree').roots[0];
            home && (me.folderId = home.id)
        }

        me.getReference('tableTitle').set({
            title   : store.query ? fmt(t('Search results in {folder}'), {folder: node?.text || name}) : (node?.text || name),
            subtitle: store.query ? '' : path
        });

        // ExtJS: no "up" at the top of the tree or above a share
        const topLevel = me.getReference('tree').roots.some(r => r.id === String(me.folderId));
        me.getReference('upButton').disabled = !meta.parent_id || topLevel || !/^\d+$/.test(String(me.folderId)) || !!store.query;

        me.updateQuota(meta)
    }

    onFolderLoad() {
        let me    = this,
            grid  = me.getReference('grid'),
            store = grid.store,
            id    = me.pendingTypeId;

        if (me.isDestroyed) {
            return
        }

        const total = store.totalCount || 0;
        me.getReference('tableTitle').subtitle = (store.query ? '' : decodeEntities(store.meta.path || '') + ' · ') + fmt(t('{count} items'), {count: total});

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
     * Opens a file in the browser (inline download); section 4 adds the file handlers
     * @param {Object} record
     */
    openFile(record) {
        Neo.Main.windowOpen({
            url       : client.legacyUrl('files/file/download', {id: record.id, inline: 1}),
            windowName: '_blank',
            windowId  : this.windowId
        })
    }

    downloadFile(record) {
        Neo.Main.windowOpen({
            url       : client.legacyUrl('files/file/download', {id: record.id, inline: 0}),
            windowName: '_blank',
            windowId  : this.windowId
        })
    }

    onDetailAction({action, record}) {
        let me = this;

        switch (action) {
            case 'open':
                me.openFile(record);
                break
            case 'download':
                me.downloadFile(record);
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
            const {data} = await client.legacy('files/file/display', {id: match[2]});

            if (!me.isDestroyed && data?.folder_id) {
                me.revealFolder(String(data.folder_id));
                await me.openFolder(data.folder_id, {select: typeId})
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
