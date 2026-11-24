import GridContainer from '../../node_modules/neo.mjs/src/grid/Container.mjs';
import HeaderButton  from './HeaderButton.mjs';
import MenuList      from '../menu/List.mjs';
import RowSelectionModel from './RowSelectionModel.mjs';
import {dpSize, getState, setState} from '../State.mjs';
import {dpPixels, onThemeChange} from '../Preferences.mjs';
import client        from '../jmap/Client.mjs';
import {t}           from '../Translate.mjs';
import {escapeHtml}  from '../Format.mjs';
import {createColumns as createCustomFieldColumns, loadNames as loadCustomFieldNames} from '../customfields/gridColumns.mjs';

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
 * Custom fields (ExtJS GridTrait.initCustomFields(), GOUI CustomFields.getTableColumns()):
 * `customFieldsEntity: 'Contact'` adds a column per custom field of the entity after the
 * configured ones, hidden when the field is "Hidden in grid", sortable on the server. The store
 * needs the `customFields` property (added to `properties` when they are listed) and a model
 * field `customFields`.
 *
 * Keyboard (ExtJS GridTrait, GOUI Table "delete"): with selected rows, Delete or ctrl/⌘+Backspace
 * fires `deleteKey` and Enter fires `enterKey`, both {records}; the module decides what they do.
 *
 * Group headers (GOUI Table groupBy / groupByRenderer, ExtJS GroupingView):
 *
 *     groupBy      : 'tasklistId',
 *     groupRenderer: ({value, record}) => escapeHtml(listName(value)),   // HTML
 *     store        : {sorters: [{property: 'tasklistId', direction: 'ASC'}, …]}
 *
 * A header shows above the first row of each run of the same value, while the store's first
 * sorter is the groupBy field. Sorting by a column keeps that sorter first and changes the
 * second one (GOUI Table.sort edits the last sorter). neo's grid has no group rows: the first
 * row of a group is one header taller (content-sized rows) and carries the header band.
 * Not supported: collapsing groups, and columns locked at runtime (their body misses the band).
 *
 * Empty state (GOUI List/Table emptyStateHtml, ExtJS GridPanel emptyText): once the store has
 * loaded and holds no records, the grid shows `emptyIcon` and `emptyText` below its header
 * (default: "article", "No items found" like GOUI). Not before the first load, not while a load
 * runs (from the store's `beforeLoad` event to its `load` or `loadError`), not after a failed
 * one (until the next load); adding a record hides it again. `emptyText: null` turns it off. A
 * grid sized by fitToRows() (a detail card) has no room for it: its owner shows its own text.
 * A plain Store whose `data` is replaced by [] fires no load: fire it (see JmapStore.load()).
 *
 *     {module: Grid, emptyText: t('No items to display'), emptyIcon: 'description'}
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
        stateId: null,
        /**
         * JMAP entity whose custom fields get columns, e.g. 'Note'
         * @member {String|null} customFieldsEntity=null
         */
        customFieldsEntity: null,
        /**
         * dataField whose value starts a new group (header above its first row)
         * @member {String|null} groupBy=null
         */
        groupBy: null,
        /**
         * HTML of a group header: ({value, record}) => String. Default: the escaped value.
         * @member {Function|null} groupRenderer=null
         */
        groupRenderer: null,
        /**
         * Text shown when the loaded store has no records, null for none
         * @member {String|null} emptyText_=t('No items found')
         */
        emptyText_: t('No items found'),
        /**
         * Material symbol above the emptyText, null for none
         * @member {String|null} emptyIcon_='article'
         */
        emptyIcon_: 'article'
    }

    /**
     * Ids (String) of the records that start a group
     * @member {Set<String>} groupStarts
     */
    groupStarts = new Set()

    /**
     * Record ids of the rows that got a height of their own (group starts, also former ones):
     * String(id) → id
     * @member {Map} sizedRows
     */
    sizedRows = new Map()

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
     * px a flex column keeps when custom field columns are added
     * @member {Number} FLEX_MIN_WIDTH
     */
    static FLEX_MIN_WIDTH = 200

    /**
     * px of dp(1) the rowHeight is based on
     * @member {Number} dp
     */
    dp = 0

    /**
     * px around the rows of a grid: the 30px header, the 17px neo reserves for the horizontal
     * scrollbar and the 1px border above and below (neo-grid-container)
     * @member {Number} CHROME_HEIGHT
     */
    static CHROME_HEIGHT = 30 + 17 + 2

    /**
     * Rows the grid is sized to by fitToRows(), null when it isn't
     * @member {Number|null} fittedRows=null
     */
    fittedRows = null

    /**
     * The last load of the store failed: no empty state until the next load
     * @member {Boolean} emptyLoadFailed=false
     */
    emptyLoadFailed = false

    /**
     * The store fired beforeLoad and no load or loadError yet: no empty state meanwhile. Not
     * store.isLoading: neo's beforeSetData() sets it and an equal empty array never clears it.
     * @member {Boolean} emptyLoading=false
     */
    emptyLoading = false

    /**
     * Height of a grid that shows `count` rows without scrolling. neo's body shows
     * ceil(bodyHeight / rowHeight) - 1 rows and nothing below one row, so the body gets 1px
     * more than the rows. 0 rows: just the header.
     * @param {Number} count rows
     * @returns {Number} px
     */
    heightForRows(count) {
        return Grid.CHROME_HEIGHT + count * this.rowHeight + 1
    }

    /**
     * Sizes the grid to `count` rows (a grid in a detail card; CSS max-height may cap it, then
     * it scrolls). The height follows a later change of the row height (theme, density).
     * @param {Number} count rows
     */
    fitToRows(count) {
        this.fittedRows = count;
        this.height     = this.heightForRows(count);
        this.updateEmptyState()
    }

    /**
     * Triggered after the emptyText config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetEmptyText(value, oldValue) {
        oldValue !== undefined && this.updateEmptyState()
    }

    /**
     * Triggered after the emptyIcon config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetEmptyIcon(value, oldValue) {
        oldValue !== undefined && this.updateEmptyState()
    }

    /**
     * Shows or hides the empty state: CSS pseudo elements of the root (go-grid-empty) render the
     * data-empty-icon and data-empty-text attributes, so the text is never HTML and neo's
     * container keeps its own children
     * @protected
     */
    updateEmptyState() {
        let me      = this,
            {store} = me,
            vdom    = me.vdom,
            // a fitted grid (detail card) is too low for it, its owner shows its own text
            show    = !!me.emptyText && !!store?.isLoaded && store.count === 0 && me.fittedRows === null && !me.emptyLoadFailed && !me.emptyLoading;

        if (!vdom || me.isDestroyed) {
            return
        }

        const text = show ? String(me.emptyText) : null,
              icon = show && me.emptyIcon ? String(me.emptyIcon) : null;

        if ((vdom['data-empty-text'] ?? null) === text && (vdom['data-empty-icon'] ?? null) === icon) {
            return
        }

        vdom['data-empty-text'] = text;
        vdom['data-empty-icon'] = icon;

        // a class change updates the vdom with the attributes
        me.cls.includes('go-grid-empty') !== show ? me.toggleCls('go-grid-empty', show) : me.update()
    }

    /**
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        let me = this;

        super.afterSetStore(value, oldValue);

        // a failed load leaves the records of the previous one: their empty state is no answer
        oldValue?.un({beforeLoad: me.onEmptyBeforeLoad, loadError: me.onEmptyLoadError, scope: me});
        value?.on({beforeLoad: me.onEmptyBeforeLoad, loadError: me.onEmptyLoadError, scope: me});

        me.emptyLoadFailed = false;
        me.emptyLoading    = false;
        me.updateEmptyState()
    }

    /**
     * @protected
     */
    onEmptyBeforeLoad() {
        this.emptyLoading = true;
        this.updateEmptyState()
    }

    /**
     * @protected
     */
    onEmptyLoadError() {
        this.emptyLoadFailed = true;
        this.emptyLoading    = false;
        this.updateEmptyState()
    }

    /**
     * @protected
     */
    onStoreFilter() {
        super.onStoreFilter();
        this.updateEmptyState()
    }

    /**
     * @param {Object} data
     * @protected
     */
    onStoreLoad(data) {
        super.onStoreLoad(data);
        this.emptyLoadFailed = false;
        this.emptyLoading    = false;
        this.updateEmptyState()
    }

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

        // custom field values come with the entity's `customFields` property
        const properties = config.store?.properties;

        if (config.customFieldsEntity && Neo.typeOf(config.store) === 'Object' && Array.isArray(properties) && !properties.includes('customFields')) {
            config = {...config, store: {...config.store, properties: [...properties, 'customFields']}}
        }

        super.construct({
            rowHeight: Grid.rowHeightFor(config.rowLines || 1, dp),
            // group headers make the first row of a group taller
            ...(config.groupBy ? {contentSizedRows: true} : {}),
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
        this.groupListeners && this.groupStore?.un(this.groupListeners);
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
        typeof me.fittedRows === 'number' && (me.height = me.heightForRows(me.fittedRows));

        // content-sized rows: neo's afterSetRowHeight() moved the estimate, the group rows follow
        if (me.view?.rowGeometry) {
            me.updateGroups(true);
            return
        }

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
     * Group headers: store listeners, rows that render the header band
     * @protected
     */
    initGroups() {
        let me      = this,
            {store} = me,
            update  = () => me.updateGroups();

        // removed in destroy(): a store may outlive the grid
        me.groupListeners = {
            load        : update,
            loadMore    : update,
            filter      : update,
            recordChange: ({fields}) => fields?.some(field => field.name === me.groupBy) && update()
        };

        me.groupStore = store;
        store.on(me.groupListeners);

        me.view.bodies.forEach(body => me.groupBody(body));
        store.count && update()
    }

    /**
     * Lets a body's rows render the group header band and ignore clicks on it
     * @param {Neo.grid.Body} body
     * @protected
     */
    groupBody(body) {
        let me = this;

        if (body.goGrouped) {
            return
        }

        body.goGrouped = true;

        // a click on a header is not a click on its row. Body binds its click listeners at
        // construction; isEditorEvent() is looked up per event
        const isEditorEvent = body.isEditorEvent;

        body.isEditorEvent = function(data) {
            return isEditorEvent.call(this, data) || data.path.some(node => node.cls?.includes('go-grid-group-header'))
        };

        // rows are created when the pool grows (a taller grid)
        const createRowPool = body.createRowPool;

        body.createRowPool = function(...args) {
            const result = createRowPool.apply(this, args);
            this.items.forEach(row => me.groupRow(row));
            return result
        };

        body.items.forEach(row => me.groupRow(row))
    }

    /**
     * @param {Neo.grid.Row} row
     * @protected
     */
    groupRow(row) {
        let me = this;

        if (row.goGrouped) {
            return
        }

        row.goGrouped = true;

        const createVdom = row.createVdom;

        row.createVdom = function(silent = false, recycle = true) {
            // silent: the band goes in before the update. neo 14 marks the body dirty on a silent
            // call; a row updated here right away leaves nothing for the body to update.
            const body  = this.parent,
                  dirty = body?.hasSilentVdomChanges;

            createVdom.call(this, true, recycle);
            me.decorateGroupRow(this);

            if (!silent) {
                body && (body.hasSilentVdomChanges = dirty);
                this.update()
            }
        }
    }

    /**
     * Adds the header band to the vdom of a row that starts a group. The band is always the
     * last child (removeDom when not needed): neo keeps the DOM order of a row's cells stable.
     * @param {Neo.grid.Row} row
     * @protected
     */
    decorateGroupRow(row) {
        let me       = this,
            {record} = row,
            vdom     = row.vdom;

        if (!record || !Array.isArray(vdom.cn)) {
            return
        }

        const body    = row.parent,
              isStart = me.groupStarts.has(String(body.getRecordId(record))),
              // the text once, in the first region (locked start columns or the center)
              isLead  = body === (me.bodyStart || me.body);

        vdom.cls = (vdom.cls || []).filter(cls => cls !== 'go-grid-group-start');
        isStart && vdom.cls.push('go-grid-group-start');

        vdom.cn.push({
            id       : row.id + '__group',
            cls      : ['go-grid-group-header'],
            removeDom: !isStart,
            html     : isStart && isLead ? me.renderGroup(record) : ''
        })
    }

    /**
     * @param {Object} record
     * @returns {String} HTML
     * @protected
     */
    renderGroup(record) {
        const value = record[this.groupBy];

        try {
            return this.groupRenderer ? (this.groupRenderer({value, record}) ?? '') : escapeHtml(value ?? '')
        } catch (e) {
            console.error('Group renderer', e);
            return ''
        }
    }

    /**
     * Finds the first record of each group and gives its row the height of row + header
     * @param {Boolean} [all=false] set the height of every group row again (row height changed)
     */
    updateGroups(all = false) {
        let me            = this,
            {store, view} = me,
            rowGeometry   = view?.rowGeometry,
            starts        = new Map(), // String(id) → record id as the rows key it
            heights       = new Map(),
            field         = me.groupBy,
            body          = me.body;

        if (!field || !rowGeometry || !body || me.isDestroyed) {
            return
        }

        // groups only make sense while the rows are sorted by the field
        if (store.sorters?.[0]?.property === field) {
            let previous;

            (store.items || []).forEach((record, index) => {
                const value = record?.[field] ?? null;

                if (record && (index === 0 || value !== previous)) {
                    const id = body.getRecordId(record);
                    starts.set(String(id), id)
                }

                previous = value
            });
        }

        const groupHeight = me.rowHeight + Grid.rowHeightFor(1, me.dp || Grid.THEME_DP.Paper),
              changed     = starts.size !== me.groupStarts.size || [...starts.keys()].some(key => !me.groupStarts.has(key));

        starts.forEach((id, key) => (all || !me.groupStarts.has(key)) && heights.set(id, groupHeight));

        // RowGeometry can't forget a height: a former first row gets the row height (again after a
        // density change)
        me.sizedRows.forEach((id, key) => !starts.has(key) && (all || me.groupStarts.has(key)) && heights.set(id, me.rowHeight));
        starts.forEach((id, key) => me.sizedRows.set(key, id));

        me.groupStarts = new Set(starts.keys());

        heights.size && view.setRowHeights(heights);

        // the rows that gained or lost their header render again
        (changed || all) && view.bodies.forEach(item => item.createViewData(false, true))
    }

    /**
     * Grouped: a column sort keeps the group field as the first sorter (GOUI Table.sort)
     * @param {Object} opts
     * @protected
     */
    onSortColumn(opts) {
        let me      = this,
            field   = me.groupBy,
            {store} = me;

        if (!field || store.sorters?.[0]?.property !== field) {
            return super.onSortColumn(opts)
        }

        const group = store.sorters[0];

        // tri-state sorting cleared a column: the groups stay
        if (!opts.direction) {
            store.sorters = [group];
            me.removeSortingCss(opts.property);
            return
        }

        store.sorters = opts.property === field
            ? [{property: field, direction: opts.direction}, ...store.sorters.slice(1)]
            : [group, {property: opts.property, direction: opts.direction}];

        me.removeSortingCss(opts.property)
    }

    /**
     * Renders every row again, e.g. after names in renderers were loaded
     */
    refreshRows() {
        this.view?.bodies.forEach(body => body.createViewData(false, true))
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
        return columns.filter(column => !column.hidden).map(({hidden, hideable, resized, stateKey, goCustomField, ...column}) => ({...column}))
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

        me.groupBy && me.initGroups();

        me.measureRowHeight();

        // before the state: it may show or resize them
        me.customColumnsLoaded = me.customFieldsEntity ? me.addCustomFieldColumns() : null;
        await me.customColumnsLoaded;

        !me.isDestroyed && me.stateId && await me.restoreColumnState()
    }

    /**
     * Appends the custom field columns of customFieldsEntity
     * @protected
     */
    async addCustomFieldColumns() {
        let me = this,
            columns;

        try {
            columns = await createCustomFieldColumns(me.customFieldsEntity)
        } catch (e) {
            console.error('Custom field columns', e);
            return
        }

        if (me.isDestroyed) {
            return
        }

        // names of user, group and contact fields
        const loadNames = () => me.loadCustomFieldNames();

        me.store.on({load: loadNames, loadMore: loadNames});

        if (!columns.length) {
            return
        }

        // shown fields would squeeze a flex column (the name) to nothing: scroll instead
        [me.allColumns, me.defaultColumns].forEach(list => list.forEach(column => {
            column.flex && !column.minWidth && (column.minWidth = Grid.FLEX_MIN_WIDTH)
        }));

        me.allColumns.push(...columns.map(column => ({hideable: true, ...column})));
        me.defaultColumns.push(...columns.map(column => ({hideable: true, ...column})));

        await me.applyColumns();
        me.loadCustomFieldNames()
    }

    /**
     * Loads the names that the visible user, group and contact columns show, then renders
     * the rows again
     * @protected
     */
    async loadCustomFieldNames() {
        let me     = this,
            fields = me.allColumns.filter(c => c.goCustomField && !c.hidden).map(c => c.goCustomField);

        if (!fields.length || !me.store?.items?.length) {
            return
        }

        (await loadCustomFieldNames(fields, me.store.items)) && !me.isDestroyed && me.body?.createViewData()
    }

    /**
     * Delete / ctrl+Backspace → `deleteKey`, Enter → `enterKey` (not while typing in a field).
     * `deleteKey` also gets `ctrlKey`: ctrl (or cmd) + Delete, e.g. delete instead of trash
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

        records.length && this.fire(name, isDelete
            ? {records, ctrlKey: data.key === 'Delete' && !!(data.ctrlKey || data.metaKey)}
            : {records})
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

        !me.isDestroyed && me.decorateHeader();

        // a locked column adds a body
        !me.isDestroyed && me.groupBy && me.view?.bodies.forEach(body => me.groupBody(body))
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
        me.saveColumnState();

        // a shown user / group / contact column
        !hidden && column.goCustomField && me.loadCustomFieldNames()
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
        let me = this;

        // a switchState() while they load: their state counts too
        await me.customColumnsLoaded;

        let {columns} = await getState(me.stateId, me.windowId),
            changed   = false;

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

        changed && !me.isDestroyed && await me.applyColumns();

        changed && !me.isDestroyed && me.loadCustomFieldNames()
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
