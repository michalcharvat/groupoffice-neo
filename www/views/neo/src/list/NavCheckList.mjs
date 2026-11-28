import Container    from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar      from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button       from '../button/Button.mjs';
import SearchButton from '../button/SearchButton.mjs';
import CheckBox     from '../component/CheckBox.mjs';
import client       from '../jmap/Client.mjs';
import {notifyError} from '../Notify.mjs';
import {t}          from '../Translate.mjs';
import CheckList    from './CheckList.mjs';

/**
 * @summary West filter list with a check per row (classic go.NavGrid): select all, heading,
 * search, header buttons, a CheckList and "Show more...".
 *
 * The checked ids restrict the module's grid; none checked means no restriction. The checked ids
 * outlive searches, paging and reloads: a row checked and then hidden by a search stays checked
 * (and counts). Checked rows that no longer exist (deleted, no longer readable) are dropped after
 * a load and `selectionChange` fires. The select-all box checks every loaded row; unchecking it
 * clears all checks, the hidden ones too; it is half checked while some but not all are checked.
 *
 *     {module: NavCheckList, heading: t('Category'), displayField: 'name',
 *      // the model declares id as a String: without one a CheckList gets no item ids
 *      store  : {module: JmapStore, entity: 'AmdLinksCategory', model: CategoryModel, properties: ['id', 'name'], jmapSort: [...]},
 *      buttons: [{module: Button, icon: 'add', cls: ['small'], tooltip: t('Add'), handler}],
 *      rowMenu: record => [{text: t('Edit'), icon: 'edit', handler}],
 *      listeners: {selectionChange: ({ids}) => grid.store.setFilter({categoryId: ids.length ? ids : undefined})}}
 *
 * Search sets the store's JMAP `text` filter; a store with `scrollLoad` gets "Show more...".
 * Saved checks: `setCheckedIds(ids, true)` before the grid's first load.
 * Events: selectionChange {ids} after the user checked or unchecked rows, or checked rows were dropped.
 * @class GO.list.NavCheckList
 * @extends Neo.container.Base
 * @see GO.list.CheckList
 */
class NavCheckList extends Container {
    static config = {
        /**
         * @member {String} className='GO.list.NavCheckList'
         * @protected
         */
        className: 'GO.list.NavCheckList',
        cls      : ['go-nav-check-list'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * Loads the store once constructed; false when the owner loads it (e.g. after setting a filter)
         * @member {Boolean} autoLoad=true
         */
        autoLoad: true,
        /**
         * Toolbar items after the search button (e.g. Add)
         * @member {Object[]} buttons=[]
         */
        buttons: [],
        /**
         * Record field shown per row
         * @member {String} displayField='name'
         */
        displayField: 'name',
        /**
         * Shown when the list is empty
         * @member {String} emptyText
         */
        emptyText: t('No items to display'),
        /**
         * Heading of the list, next to the select-all box
         * @member {String} heading=''
         */
        heading: '',
        /**
         * Config of the check list, e.g. {module: MyCheckList} for own row content
         * @member {Object} listConfig={}
         */
        listConfig: {},
        /**
         * Items of a row's menu (GO.list.CheckList rowMenu), null for none
         * @member {Function|null} rowMenu=null
         */
        rowMenu: null,
        /**
         * Store config of the list (a GO.data.JmapStore); the NavCheckList destroys it
         * @member {Object|null} store=null
         */
        store: null
    }

    /**
     * Ids of the checked rows, also those the list does not show now
     * @member {Set<String>} checkedIds
     */
    checkedIds = new Set()
    /**
     * Last loaded data per id of the checked rows (getCheckedRecords() of hidden ones)
     * @member {Map<String, Object>} seen
     * @protected
     */
    seen = new Map()

    /**
     * @summary Builds the toolbar, the check list and the "Show more..." button.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const me = this;

        me.items = [{
            module: Toolbar,
            flex  : 'none',
            items : [{
                module   : CheckBox,
                reference: 'selectAll',
                flex     : 'none',
                listeners: {change: ({checked}) => me.onSelectAll(checked)}
            }, {
                ntype: 'component',
                tag  : 'h4',
                cls  : ['go-toolbar-heading'],
                text : me.heading
            }, '->', {
                module   : SearchButton,
                cls      : ['small'],
                listeners: {search: ({text}) => me.search(text)}
            }, ...me.buttons]
        }, {
            module      : CheckList,
            reference   : 'list',
            flex        : 'none',
            displayField: me.displayField,
            emptyText   : me.emptyText,
            rowMenu     : me.rowMenu,
            store       : me.store,
            ...me.listConfig
        }, {
            module   : Button,
            reference: 'moreButton',
            cls      : ['go-nav-check-list-more'],
            flex     : 'none',
            text     : t('Show more...'),
            hidden   : true,
            handler  : () => me.list.store.loadMore().catch(() => {})
        }]
    }

    /**
     * @summary The check list.
     * @returns {GO.list.CheckList}
     */
    get list() {
        return this.getReference('list')
    }

    /**
     * @summary Wires the list and loads it (autoLoad).
     */
    onConstructed() {
        super.onConstructed();

        const me    = this,
              store = me.list.store;

        me.list.selectionModel.on('selectionChange', me.onSelectionChange, me);
        store.on({load: me.onStoreLoad, loadMore: me.onStoreLoad, scope: me});
        store.on('loadError', ({error}) => me.isDestroyed || notifyError(me, error));
        me.autoLoad && store.load().catch(() => {})
    }

    /**
     * @summary Destroys the store this list created (the list does not).
     * @param {...*} args
     */
    destroy(...args) {
        const store = this.list?.store;

        clearTimeout(this.dropTimer);
        super.destroy(...args);
        store && !store.isDestroyed && store.destroy()
    }

    /**
     * @summary The ids of the checked rows, also of those a search or paging hides.
     * @returns {String[]}
     */
    getCheckedIds() {
        return [...this.checkedIds]
    }

    /**
     * @summary The checked records: loaded ones from the store, hidden ones as last loaded.
     * @returns {Object[]}
     */
    getCheckedRecords() {
        const store = this.list.store;

        return this.getCheckedIds().map(id => store.get(id) || this.seen.get(id)).filter(Boolean)
    }

    /**
     * @summary Replaces the checks, e.g. with saved ones or none after a filter change.
     * @param {String[]} ids
     * @param {Boolean} [silent=false] no selectionChange
     */
    setCheckedIds(ids, silent = false) {
        this.applyChecks(new Set(ids.map(String)), silent)
    }

    /**
     * @summary Filters the list by the search text (JMAP `text` filter).
     * @param {String} text
     * @returns {Promise<void>}
     */
    search(text) {
        return this.list.store.setFilter({text: text || undefined}).then(() => {}, () => {})
    }

    /**
     * @summary After a load: checks the loaded rows that were checked, shows "Show more...",
     * drops checked rows that are gone.
     * @protected
     */
    onStoreLoad() {
        const me    = this,
              store = me.list.store;

        if (me.isDestroyed) {
            return
        }

        store.items.forEach(record => me.checkedIds.has(String(record.id)) && me.seen.set(String(record.id), record));
        // an Entity/get of an older load must not drop rows this one shows
        me.loadGeneration = (me.loadGeneration || 0) + 1;
        me.syncList();
        me.getReference('moreButton').hidden = !store.hasMore?.();
        // neo's store fires load per mutation too (clear, then add): check once it settled
        clearTimeout(me.dropTimer);
        me.dropTimer = setTimeout(() => me.dropMissing(), 50)
    }

    /**
     * @summary Unchecks checked rows that no longer exist. Unfiltered and complete (all pages
     * loaded), the store itself tells; otherwise the server is asked for the ids the list doesn't show.
     * @returns {Promise<void>}
     * @protected
     */
    async dropMissing() {
        const me      = this,
              store   = me.list.store,
              missing = me.getCheckedIds().filter(id => !store.get(id));

        if (!missing.length || me.isDestroyed || store.isLoading) {
            return
        }

        let gone       = missing,
            generation = me.loadGeneration;

        // a paged (not scrollLoad) store has no hasMore(): compare with the total
        if (Object.keys(store.jmapFilter || {}).length || store.count < (store.totalCount ?? store.count)) {
            if (!store.entity) {
                return
            }

            try {
                const found = new Set((await client.get(store.entity, missing, ['id'])).map(record => String(record.id)));

                gone = missing.filter(id => !found.has(id) && !store.get(id))
            } catch (e) {
                // can't tell now: keep them checked
                console.warn('NavCheckList: checked ids', e);
                return
            }
        }

        if (!me.isDestroyed && generation === me.loadGeneration && gone.some(id => me.checkedIds.has(id))) {
            me.applyChecks(new Set(me.getCheckedIds().filter(id => !gone.includes(id))))
        }
    }

    /**
     * @summary The user checked or unchecked rows: keeps the hidden checked ones.
     * @protected
     */
    onSelectionChange() {
        const me = this;

        if (me.restoring || me.isDestroyed) {
            return
        }

        const list   = me.list,
              loaded = new Set(list.store.items.map(record => String(record.id))),
              ids    = new Set([...me.getCheckedIds().filter(id => !loaded.has(id)), ...list.getCheckedIds()]);

        me.applyChecks(ids)
    }

    /**
     * @summary The select-all box: checks every loaded row, or clears all checks; also clears
     * when checking adds nothing (a half checked box over hidden checks only, e.g. a search without hits).
     * @param {Boolean} checked
     * @protected
     */
    onSelectAll(checked) {
        const me  = this,
              ids = new Set([...me.getCheckedIds(), ...me.list.store.items.map(record => String(record.id))]);

        me.applyChecks(checked && ids.size > me.checkedIds.size ? ids : new Set())
    }

    /**
     * @summary Sets the checked ids, selects them in the list, then fires selectionChange when they changed.
     * @param {Set<String>} ids
     * @param {Boolean} [silent=false]
     * @protected
     */
    applyChecks(ids, silent = false) {
        const me      = this,
              changed = ids.size !== me.checkedIds.size || [...ids].some(id => !me.checkedIds.has(id));

        me.checkedIds = ids;
        [...me.seen.keys()].forEach(id => ids.has(id) || me.seen.delete(id));
        me.list.store.items.forEach(record => ids.has(String(record.id)) && me.seen.set(String(record.id), record));
        me.syncList();

        changed && !silent && me.fire('selectionChange', {ids: me.getCheckedIds()})
    }

    /**
     * @summary Selects the loaded rows that are checked, without selectionChange of the list.
     * @protected
     */
    syncList() {
        const me    = this,
              list  = me.list,
              model = list.selectionModel;

        me.restoring = true;

        try {
            const records = list.store.items.filter(record => me.checkedIds.has(String(record.id)));

            model.deselectAll?.();
            records.length && model.select(records)
        } finally {
            me.restoring = false
        }

        me.syncSelectAll()
    }

    /**
     * @summary The select-all box: checked when every loaded row is, half checked when some
     * (hidden ones included) are.
     * @protected
     */
    syncSelectAll() {
        const me      = this,
              items   = me.list.store.items,
              all     = items.length > 0 && items.every(record => me.checkedIds.has(String(record.id)));

        me.getReference('selectAll').set({checked: all, indeterminate: !all && me.checkedIds.size > 0})
    }
}

export default Neo.setupClass(NavCheckList);
