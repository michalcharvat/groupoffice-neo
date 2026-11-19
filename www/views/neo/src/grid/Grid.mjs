import GridContainer from '../../node_modules/neo.mjs/src/grid/Container.mjs';
import HeaderButton  from './HeaderButton.mjs';
import MenuList      from '../menu/List.mjs';
import RowSelectionModel from './RowSelectionModel.mjs';
import {dpSize, getState, setState} from '../State.mjs';
import {dpPixels, onThemeChange} from '../Preferences.mjs';
import client        from '../jmap/Client.mjs';
import {t}           from '../Translate.mjs';

/**
 * GO grid: neo's grid with the GOUI table metrics (goui/style/_table.scss) —
 * td padding dp(8) around a dp(24) line = dp(40) rows, no vertical cell lines, dp(16) padding
 * at the outer columns.
 *
 * Row height: neo's buffered grid needs it in px, so it follows the density of the theme
 * (html font-size = dp(10)): one-line rows dp(40) = 35px Paper / 29px Compact, two-line rows
 * (`rowLines: 2`: avatar, name + second line) dp(56) = 48px / 40px. A grid starts with the
 * density of client.user.theme, then measures its window (the mobile density) and measures again
 * after Preferences.applyTheme() (Look & feel, live preview).
 *
 * Column chooser (GO 6.8 header menu "Columns", GOUI Table.getVisibleColumnMenu()):
 *
 *     columns: [
 *         {dataField: 'name', text: t('Name'), hideable: false},
 *         {dataField: 'createdAt', text: t('Created at'), hidden: true},     // offered in the menu
 *         {dataField: 'createdBy', stateKey: 'creator/name', hidden: true}  // state key = GOUI column id
 *     ]
 *
 * The ⋮ in the last column header (GO.grid.HeaderButton) lists the hideable columns; a right
 * click on any header adds sorting (GO 6.8 header menu). showColumnMenu(targetId) from a button. neo's grid cannot hide a column, so the grid keeps the full list and
 * renders the visible ones. With a `stateId`, hidden columns and widths are stored like
 * GOUI's Table state: "state-<stateId>" → {columns: {<stateKey>: {hidden, width (dp)}}}.
 *
 * Keyboard (ExtJS GridTrait, GOUI Table "delete"): with selected rows, Delete or ctrl/⌘+Backspace
 * fires `deleteKey` and Enter fires `enterKey`, both {records}; the module decides what they do.
 */
class Grid extends GridContainer {
    static config = {
        className: 'GO.grid.Grid',
        baseCls  : ['go-grid', 'neo-grid-container'],
        rowHeight: 35,
        /**
         * 1: one text line; 2: two lines or an avatar (GOUI avatar rows). Sets the rowHeight.
         * @member {Number} rowLines_=1
         */
        rowLines_: 1,
        /**
         * GOUI multiSelect: ctrl/shift + click select more rows (GO.grid.RowSelectionModel),
         * GO.grid.MultiSelectToolbar shows actions for them
         * @member {Boolean} multiSelect=false
         */
        multiSelect: false,
        /**
         * GOUI compatible state key ("state-<stateId>"): hidden columns, widths
         * @member {String|null} stateId=null
         */
        stateId: null
    }

    /**
     * All columns, visible or not: {…column config, hidden, hideable}
     * @member {Object[]} allColumns=[]
     */
    allColumns = []

    /**
     * Columns the user changed (hide/show, resize): a pending state restore keeps them
     * @member {Set<String>} touchedColumns
     */
    touchedColumns = new Set()

    /**
     * Row height in dp per rowLines
     * @member {Object} ROW_DP
     */
    static ROW_DP = {1: 40, 2: 56}

    /**
     * px of dp(1) per theme on a desktop (--density / 10, Global.scss)
     * @member {Object} THEME_DP
     */
    static THEME_DP = {Paper: .864, Compact: .7125}

    /**
     * px of dp(1) of the last measurement, the start value of new grids
     * @member {Number|null} measuredDp
     */
    static measuredDp = null

    /**
     * px of dp(1) the rowHeight is based on
     * @member {Number} dp
     */
    dp = 0

    /**
     * @param {Number} rowLines
     * @param {Number} dp px of dp(1)
     * @returns {Number} px
     */
    static rowHeightFor(rowLines, dp) {
        return Math.round((Grid.ROW_DP[rowLines] || Grid.ROW_DP[1]) * dp)
    }

    construct(config) {
        const all = (config.columns || []).map(column => ({hideable: true, hidden: false, ...column})),
              dp  = Grid.measuredDp || Grid.THEME_DP[client.user?.theme] || Grid.THEME_DP.Paper;

        super.construct({
            rowHeight: Grid.rowHeightFor(config.rowLines || 1, dp),
            ...config,
            ...(config.multiSelect ? {viewConfig: {...config.viewConfig, selectionModel: {module: RowSelectionModel}}} : {}),
            columns      : Grid.visibleColumns(all),
            headerToolbar: {...config.headerToolbar, itemDefaults: {module: HeaderButton, ntype: 'go-grid-header-button'}}
        });

        this.allColumns     = all;
        // the configured columns, for switchState()
        this.defaultColumns = all.map(column => ({...column}));
        this.dp             = dp;
        this.removeThemeListener = onThemeChange(windowIds => windowIds.includes(this.windowId) && this.measureRowHeight())
    }

    destroy(...args) {
        this.removeThemeListener?.();
        super.destroy(...args)
    }

    /**
     * Triggered after the rowLines config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRowLines(value, oldValue) {
        oldValue !== undefined && this.dp && this.setRowHeight(Grid.rowHeightFor(value, this.dp))
    }

    /**
     * Measures the density of the window and fits the row height to it
     * @returns {Promise<void>}
     */
    async measureRowHeight() {
        let me = this;

        if (!me.windowId) {
            return
        }

        const dp = await dpPixels(me.windowId);

        if (dp > 0 && !me.isDestroyed) {
            Grid.measuredDp = dp;
            me.dp           = dp;
            me.setRowHeight(Grid.rowHeightFor(me.rowLines, dp))
        }
    }

    /**
     * Changes the row height of a rendered grid: neo's bodies keep their row count and rows
     * otherwise
     * @param {Number} height px
     * @protected
     */
    setRowHeight(height) {
        let me = this;

        if (!(height > 0) || height === me.rowHeight) {
            return
        }

        me.rowHeight = height;

        // neo's afterSetRowHeight() leaves the scrollbar out: its range would stay at the old height
        me.verticalScrollbar && (me.verticalScrollbar.rowHeight = height);

        [me.body, me.bodyStart, me.bodyEnd].forEach(body => {
            if (body) {
                body.skipCreateViewData = true;
                body.availableHeight > 0 && (body.availableRows = Math.ceil(body.availableHeight / height) - 1);
                // the rows of the current scroll position: neo only recalculates it on scroll
                body.startIndex         = Math.floor((body.scrollTop || 0) / height);
                body.skipCreateViewData = false;
                body.createViewData(false, true)
            }
        })
    }

    /**
     * @returns {Object[]} selected records
     */
    getSelectedRecords() {
        const sm = this.view?.selectionModel;
        return (sm?.selectedRows || []).map(id => this.store.get(id)).filter(Boolean)
    }

    /**
     * Column configs for neo: copies (neo's createColumns() changes them) without our keys
     * @param {Object[]} columns
     * @returns {Object[]}
     */
    static visibleColumns(columns) {
        return columns.filter(column => !column.hidden).map(({hidden, hideable, resized, stateKey, ...column}) => ({...column}))
    }

    /**
     * @param {Object} column
     * @returns {String}
     */
    static columnKey(column) {
        return column.stateKey || column.dataField
    }

    async onConstructed() {
        super.onConstructed();

        let me = this;

        // no browser menu on the header: the column menu replaces it
        Neo.main.DomEvents.registerPreventDefaultTargets({
            name    : 'contextmenu',
            cls     : ['go-grid-header'],
            windowId: me.windowId
        });

        me.headerToolbar?.addCls('go-grid-header');
        me.headerToolbar?.addDomListeners({contextmenu: me.onHeaderContextMenu, scope: me});
        me.addDomListeners({keydown: me.onGridKeyDown, scope: me});

        me.decorateHeader();

        me.measureRowHeight();

        me.stateId && await me.restoreColumnState()
    }

    /**
     * Delete / ctrl+Backspace → `deleteKey`, Enter → `enterKey` (not while typing in a field)
     * @param {Object} data neo DOM event
     * @protected
     */
    onGridKeyDown(data) {
        // DomEvents serialises tag names in lower case; any editable node on the path counts
        const editable = (data.path || [data.target]).some(node =>
            ['input', 'textarea', 'select'].includes(node?.tagName) || node?.isContentEditable);

        if (editable) {
            return
        }

        const isDelete = data.key === 'Delete' || (data.key === 'Backspace' && (data.ctrlKey || data.metaKey)),
              name     = isDelete ? 'deleteKey' : (data.key === 'Enter' ? 'enterKey' : null),
              records  = name ? this.getSelectedRecords() : [];

        records.length && this.fire(name, {records})
    }

    /**
     * Header buttons are created again whenever the columns change
     * @protected
     */
    decorateHeader() {
        let me = this;

        me.headerToolbar?.items.forEach(button => {
            // GOUI aligns a column's header like its cells; neo's header buttons get no class for it
            button.cellAlign && button.cellAlign !== 'left' && button.addCls('go-align-' + button.cellAlign);

            // a drag on the header's resize handle ends in button.width = …
            if (!button.goWidthHooked) {
                const afterSetWidth = button.afterSetWidth;

                button.goWidthHooked = true;
                button.afterSetWidth = function(value, oldValue) {
                    afterSetWidth.call(this, value, oldValue);
                    me.onColumnResize(this, value)
                }
            }
        })
    }

    /**
     * Shows the visible columns of allColumns
     * @protected
     */
    async applyColumns() {
        let me = this;

        me.columns = Grid.visibleColumns(me.allColumns);

        // header.Toolbar#createItems() runs in afterSetColumns()
        await me.timeout(60);

        !me.isDestroyed && me.decorateHeader()
    }

    /**
     * @param {String} key column key (stateKey or dataField)
     * @param {Boolean} hidden
     */
    async setColumnHidden(key, hidden) {
        let me     = this,
            column = me.allColumns.find(c => Grid.columnKey(c) === key);

        if (!column || !column.hideable || column.hidden === hidden) {
            return
        }

        // never hide the last visible column
        if (hidden && me.allColumns.filter(c => !c.hidden).length < 2) {
            return
        }

        column.hidden = hidden;
        me.touchedColumns.add(key);

        await me.applyColumns();
        me.saveColumnState()
    }

    /**
     * @param {Object} data contextmenu dom event
     * @protected
     */
    onHeaderContextMenu(data) {
        const node   = data.path?.find(node => node.cls?.includes('neo-grid-header-button')),
              button = node && Neo.getComponent(node.id);

        button ? this.showHeaderMenu(button) : this.showColumnMenu(this.headerToolbar.id)
    }

    /**
     * GO 6.8 column header menu: sort ascending / descending, then the columns
     * @param {Neo.grid.header.Button} button
     */
    showHeaderMenu(button) {
        let me    = this,
            items = me.columnMenuItems();

        if (button.sortable) {
            items.unshift({
                text   : t('Sort ascending'),
                icon   : 'arrow_upward',
                handler: () => {button.isSorted = 'ASC'}
            }, {
                text   : t('Sort descending'),
                icon   : 'arrow_downward',
                handler: () => {button.isSorted = 'DESC'}
            }, {separator: true})
        }

        MenuList.showAt({appName: me.appName, target: button.id, windowId: me.windowId, items})
    }

    /**
     * Checkable list of the hideable columns (GO 6.8 "Columns", GOUI column menu)
     * @param {String} target DOM id to align the menu to
     */
    showColumnMenu(target) {
        let me = this;

        MenuList.showAt({
            appName : me.appName,
            target,
            windowId: me.windowId,
            items   : me.columnMenuItems()
        })
    }

    /**
     * @returns {Object[]} a checkable item per hideable column
     * @protected
     */
    columnMenuItems() {
        let me = this;

        return me.allColumns.filter(column => column.hideable && column.text).map(column => ({
            text   : column.text,
            icon   : column.hidden ? 'check_box_outline_blank' : 'check_box',
            handler: () => me.setColumnHidden(Grid.columnKey(column), !column.hidden)
        }))
    }

    /**
     * @param {Neo.grid.header.Button} button
     * @param {Number|String|null} width px
     * @protected
     */
    onColumnResize(button, width) {
        let me     = this,
            column = me.allColumns.find(c => c.dataField === button.dataField);

        width = parseInt(width, 10);

        if (!column || !width || column.width === width) {
            return
        }

        // a resized flex column keeps its new width
        me.touchedColumns.add(Grid.columnKey(column));
        column.width   = width;
        column.resized = true;
        delete column.flex;

        clearTimeout(me.saveStateTimer);
        me.saveStateTimer = setTimeout(() => me.isDestroyed || me.saveColumnState(), 500)
    }

    /**
     * @protected
     */
    async restoreColumnState() {
        let me      = this,
            {columns} = await getState(me.stateId, me.windowId),
            changed = false;

        if (!columns || me.isDestroyed) {
            return
        }

        const dp = await dpSize(me.windowId);

        if (me.isDestroyed) {
            return
        }

        me.allColumns.forEach(column => {
            const saved = columns[Grid.columnKey(column)];

            // a change made while the state was loading wins
            if (!saved || me.touchedColumns.has(Grid.columnKey(column))) {
                return
            }

            if (typeof saved.hidden === 'boolean' && column.hideable && saved.hidden !== column.hidden) {
                column.hidden = saved.hidden;
                changed       = true
            }

            // GOUI keeps auto widths in its state too: only a width the user set counts
            if (saved.width && !saved.autoWidth && !saved.initialAutoWidth) {
                column.width   = Math.round(saved.width * dp);
                column.resized = true;
                delete column.flex;
                changed = true
            }
        });

        // at least one column stays visible
        if (me.allColumns.length && !me.allColumns.some(c => !c.hidden)) {
            me.allColumns[0].hidden = false
        }

        changed && !me.isDestroyed && await me.applyColumns()
    }

    /**
     * Another state for the same grid (ExtJS ContactGrid: "company-grid" for organizations,
     * "contact-grid" for contacts): the configured columns, then that state's changes
     * @param {String} stateId
     * @returns {Promise<void>}
     */
    async switchState(stateId) {
        let me = this;

        // compare with the last requested state: a switch may still be saving
        if (stateId === (me.requestedStateId ?? me.stateId)) {
            return
        }

        me.requestedStateId = stateId;

        // a pending change still goes to the old state
        if (me.saveStateTimer) {
            clearTimeout(me.saveStateTimer);
            me.saveStateTimer = null;
            await me.saveColumnState()
        }

        // a later switch took over while saving
        if (me.isDestroyed || me.requestedStateId !== stateId) {
            return
        }

        me.stateId    = stateId;
        me.touchedColumns.clear();
        me.allColumns = me.defaultColumns.map(column => ({...column}));

        await me.applyColumns();
        !me.isDestroyed && me.requestedStateId === stateId && await me.restoreColumnState()
    }

    /**
     * Merged into the stored state: GOUI also keeps sort and column order there
     * @protected
     */
    async saveColumnState() {
        let me = this;

        if (!me.stateId) {
            return
        }

        const state   = await getState(me.stateId, me.windowId),
              dp      = await dpSize(me.windowId),
              columns = {...state.columns};

        if (me.isDestroyed) {
            return
        }

        me.allColumns.forEach(column => {
            // only widths the user dragged: configured widths may change with the code
            const key   = Grid.columnKey(column),
                  fixed = column.resized && column.width;

            columns[key] = {
                ...columns[key],
                hidden: column.hidden,
                ...(fixed ? {width: Math.round(column.width / dp), autoWidth: false, initialAutoWidth: false} : {})
            }
        });

        await setState(me.stateId, {...state, columns}, me.windowId)
    }
}

export default Neo.setupClass(Grid);
