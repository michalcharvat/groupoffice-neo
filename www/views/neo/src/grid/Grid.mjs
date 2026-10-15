import GridContainer from '../../node_modules/neo.mjs/src/grid/Container.mjs';
import HeaderButton  from './HeaderButton.mjs';
import MenuList      from '../menu/List.mjs';
import {dpSize, getState, setState} from '../State.mjs';
import {t}           from '../Translate.mjs';

/**
 * GO grid: neo's grid with the GOUI table metrics (goui/style/_table.scss) —
 * td padding dp(8) around a dp(24) line + 1px divider = 35px rows at the desktop density,
 * no vertical cell lines, dp(16) padding at the outer columns.
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
 */
class Grid extends GridContainer {
    static config = {
        className: 'GO.grid.Grid',
        baseCls  : ['go-grid', 'neo-grid-container'],
        rowHeight: 35,
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

    construct(config) {
        const all = (config.columns || []).map(column => ({hideable: true, hidden: false, ...column}));

        super.construct({
            ...config,
            columns      : Grid.visibleColumns(all),
            headerToolbar: {...config.headerToolbar, itemDefaults: {module: HeaderButton, ntype: 'go-grid-header-button'}}
        });

        this.allColumns = all
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

        me.decorateHeader();

        me.stateId && await me.restoreColumnState()
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
