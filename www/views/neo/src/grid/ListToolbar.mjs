import Container       from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar         from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button          from '../button/Button.mjs';
import SearchButton    from '../button/SearchButton.mjs';
import {exportMenuItem} from '../export/exportEntities.mjs';
import MenuList        from '../menu/List.mjs';
import {t}             from '../Translate.mjs';
import {searchFilter}  from '../view/filterTypes.mjs';
import BatchEditButton from './BatchEditButton.mjs';
import MultiSelectToolbar from './MultiSelectToolbar.mjs';

/**
 * tbsearch filters of a plain list: the query (GO.grid.ListToolbar searchFilters)
 * @type {Object[]}
 */
export const QUERY_FILTERS = [{name: 'text', type: 'string', multiple: false, title: t('Query')}];

/**
 * @summary The toolbar of an entity list: start items, search, end items, ⋮ (export, delete
 * selected, the host's items), and the multi select toolbar (batch edit, delete) over it.
 *
 * The list toolbar works on a GO.grid.Grid over a GO.data.JmapStore, bound with setGrid() once
 * both exist. Search runs the text through the tbsearch filters (`searchFilters`, GO's
 * "name: value" syntax, custom fields of the entity too) and sets the store filter; only the
 * latest search counts. Delete goes through the grid's entity actions (deleteRecords(): the
 * confirmation, permissionLevel and entityActions.mayDelete()), so a list whose delete does more
 * (clears its detail panel …) keeps its own toolbar.
 *
 *     items: [{
 *         module       : ListToolbar,
 *         reference    : 'listToolbar',
 *         flex         : 'none',
 *         exportFormats: ['xlsx', 'csv', 'json'],
 *         startItems   : [{module: Button, text: t('Show disabled'), …}],
 *         endItems     : [{module: Button, icon: 'add', ui: 'primary', text: t('Add'), handler: …}],
 *         moreItems    : ({export: exp, delete: del}) => [importItem, exp, {separator: true}, del]
 *     }, {module: Grid, reference: 'grid', multiSelect: true, entityActions: {…}, …}]
 *     // onConstructed():
 *     me.getReference('listToolbar').setGrid(me.getReference('grid'))
 *
 * References inside: `moreButton`, `multiSelectToolbar`, `deleteSelectedButton`.
 * @class GO.grid.ListToolbar
 * @extends Neo.container.Base
 * @see GO.grid.Grid#entityActions
 * @see GO.grid.MultiSelectToolbar
 */
class ListToolbar extends Container {
    static config = {
        /**
         * @member {String} className='GO.grid.ListToolbar'
         * @protected
         */
        className: 'GO.grid.ListToolbar',
        /**
         * @member {String} ntype='go-list-toolbar'
         * @protected
         */
        ntype    : 'go-list-toolbar',
        // the multi select toolbar lies over the toolbar (MultiSelectToolbar.scss)
        baseCls  : ['go-mstb-host', 'neo-container'],
        /**
         * Items left of the search
         * @member {Object[]} startItems=[]
         */
        startItems: [],
        /**
         * Items right of the search, before ⋮ (Add)
         * @member {Object[]} endItems=[]
         */
        endItems: [],
        /**
         * tbsearch filters of the search, null: no search
         * @member {Object[]|null} searchFilters=QUERY_FILTERS
         */
        searchFilters: QUERY_FILTERS,
        /**
         * Export formats of the ⋮ "Export" (what the grid shows), null: no export
         * @member {String[]|null} exportFormats=null
         */
        exportFormats: null,
        /**
         * The ⋮ menu: ({export, delete}) => Object[] (export is null without exportFormats).
         * Default: export, separator, delete selected.
         * @member {Function|null} moreItems=null
         */
        moreItems: null,
        /**
         * Batch edit of the custom fields in the multi select toolbar
         * @member {Boolean} batchEdit=true
         */
        batchEdit: true,
        /**
         * More items of the multi select toolbar, before batch edit and delete
         * @member {Object[]} multiSelectItems=[]
         */
        multiSelectItems: [],
        /**
         * Classes of the toolbar itself
         * @member {String[]} toolbarCls=['go-bg-mid','go-border-bottom']
         */
        toolbarCls: ['go-bg-mid', 'go-border-bottom']
    }

    /**
     * The list's grid (setGrid())
     * @member {GO.grid.Grid|null} grid=null
     */
    grid = null

    /**
     * @summary Builds the toolbar and the multi select toolbar from the configs.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const me = this;

        me.items = [{
            module: Toolbar,
            cls   : me.toolbarCls,
            items : [...me.startItems, '->', ...me.searchFilters ? [{
                module   : SearchButton,
                listeners: {search: ({text}) => me.search(text)}
            }] : [], ...me.endItems, {
                module   : Button,
                icon     : 'more_vert',
                reference: 'moreButton',
                tooltip  : t('More options'),
                handler  : () => me.showMoreMenu()
            }]
        }, {
            module   : MultiSelectToolbar,
            reference: 'multiSelectToolbar',
            items    : [...me.multiSelectItems, ...me.batchEdit ? [{
                module   : BatchEditButton,
                reference: 'batchEditButton',
                listeners: {save: () => me.grid?.reloadEntities()}
            }] : [], {
                module   : Button,
                icon     : 'delete',
                reference: 'deleteSelectedButton',
                tooltip  : t('Delete'),
                handler  : () => me.grid?.deleteRecords(me.grid.getSelectedRecords())
            }]
        }]
    }

    /**
     * @summary Binds the list's grid: the multi select toolbar, batch edit of its entity and the
     * delete button follow its selection.
     * @param {GO.grid.Grid} grid GO.grid.Grid with multiSelect and a JmapStore
     */
    setGrid(grid) {
        const me         = this,
              batchEdit  = me.getReference('batchEditButton'),
              sm         = grid.view.selectionModel;

        me.grid && !me.grid.isDestroyed && me.grid.view.selectionModel.un('selectionChange', me.onSelectionChange, me);
        me.grid = grid;

        batchEdit && (batchEdit.entity = grid.store.entity);
        me.getReference('multiSelectToolbar').setGrid(grid);
        sm.on('selectionChange', me.onSelectionChange, me);
        me.onSelectionChange()
    }

    /**
     * @summary Disables the bulk delete while no selected row may be deleted.
     * @protected
     */
    onSelectionChange() {
        const grid = this.grid;

        this.getReference('deleteSelectedButton').disabled = !grid.getSelectedRecords().some(record => grid.canDelete(record))
    }

    /**
     * @summary Sets the store filter of the search text (searchFilters); only the latest search counts.
     * @param {String} text
     * @returns {Promise<void>}
     */
    async search(text) {
        const me    = this,
              store = me.grid?.store,
              gen   = me.searchGen = (me.searchGen || 0) + 1;

        if (!store) {
            return
        }

        const filter = await searchFilter(text, me.searchFilters, store.entity);

        gen !== me.searchGen || me.isDestroyed || me.grid?.store !== store || store.isDestroyed || await store.setFilter(filter).catch(() => {})
    }

    /**
     * @summary The ⋮ items: moreItems() of the export and delete selected items, or both.
     * @returns {Object[]} menu items
     */
    moreMenuItems() {
        const me    = this,
              grid  = me.grid,
              items = {
                  export: me.exportFormats ? exportMenuItem(me, {entity: grid.store.entity, store: grid.store, formats: me.exportFormats}) : null,
                  delete: grid.deleteSelectedMenuItem()
              };

        return (me.moreItems?.(items) || (items.export ? [items.export, {separator: true}, items.delete] : [items.delete])).filter(Boolean)
    }

    /**
     * @summary Shows the ⋮ menu below its button.
     */
    showMoreMenu() {
        const me = this;

        me.grid && MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : me.getReference('moreButton').id,
            items   : me.moreMenuItems()
        })
    }

    /**
     * @summary Unbinds the grid's selection.
     * @param {...*} args
     */
    destroy(...args) {
        const grid = this.grid;

        grid && !grid.isDestroyed && grid.view?.selectionModel?.un('selectionChange', this.onSelectionChange, this);
        super.destroy(...args)
    }
}

export default Neo.setupClass(ListToolbar);
