import client from '../jmap/Client.mjs';
import Store  from '../../node_modules/neo.mjs/src/data/Store.mjs';
import {setDataAndFireLoad} from './setData.mjs';

/**
 * @summary neo.mjs Store backed by a Group Office JMAP entity.
 *
 * load() runs Entity/query + Entity/get for the current page. When the server
 * pushes a state change for the entity the current page is reloaded, which keeps
 * creations, filter membership, sorting and paging correct without patching.
 *
 * `scopeKeys`: filter keys of which one must hold a value (PHP empty(): not 0, '0', '', false,
 * null, []). Without one load() empties the store, drops the answer of a running load and stops
 * push reloads until the next scoped load; loadMore() fetches nothing. For server filters that
 * add no condition for an empty value, where an unscoped query (a header sort, a push reload, a
 * search before the scope is known) would list every scope's rows (amd/pms: `vessel`,
 * `componentIn`):
 *
 *     Neo.create(JmapStore, {entity: 'AmdPmsJob', scopeKeys: ['componentIn', 'vessel']})
 */
class JmapStore extends Store {
    static config = {
        className: 'GO.data.JmapStore',
        /**
         * Grid header sorting goes to the server (see load())
         * @member {Boolean} remoteSort=true
         */
        remoteSort: true,
        /**
         * JMAP entity name, e.g. "Note"
         * @member {String|null} entity=null
         */
        entity: null,
        /**
         * JMAP filter object passed to Entity/query
         * @member {Object} jmapFilter={}
         */
        jmapFilter: {},
        /**
         * JMAP sort, e.g. [{property: 'name', isAscending: true}]
         * @member {Object[]} jmapSort=[]
         */
        jmapSort: [],
        /**
         * Extra Entity/query arguments next to filter and sort, e.g. {viewType: 'combo'}
         * (classic go.data.Store baseParams)
         * @member {Object|null} queryArgs=null
         */
        queryArgs: null,
        /**
         * Properties to fetch with Entity/get, null for all
         * @member {String[]|null} properties=null
         */
        properties: null,
        /**
         * Reload when the server reports a change of these entities (default: entity)
         * @member {String[]|null} watch=null
         */
        watch: null,
        /**
         * GOUI scrollLoad: load() fetches the first pageSize records, loadMore() appends
         * the next ones (the grid calls it when scrolled to the end)
         * @member {Boolean} scrollLoad=false
         */
        scrollLoad: false,
        /**
         * Server sort property per field when they differ, e.g. {createdBy: 'creator'}.
         * Not "sortProperties": neo.collection.Base owns that name and resets it on every sort
         * @member {Object|null} serverSortProperties=null
         */
        serverSortProperties: null,
        /**
         * Filter keys of which one must hold a value, else nothing is queried (see the class docs)
         * @member {String[]|null} scopeKeys=null
         */
        scopeKeys: null
    }

    construct(config) {
        super.construct(config);

        let me    = this,
            watch = me.watch || [me.entity];

        client.watch(watch);

        me.removeStateListener = client.on('stateChange', ({changed}) => {
            if (me.isLoaded && changed.some(e => watch.includes(e))) {
                // failures fire loadError; keep what was scrolled into view
                me.load({keepCount: true}).catch(() => {})
            }
        })
    }

    destroy(...args) {
        this.removeStateListener?.();
        super.destroy(...args)
    }

    /**
     * Merge filter conditions and reload from page 1
     * @param {Object} filter
     */
    setFilter(filter) {
        let me = this;

        me.jmapFilter = {...me.jmapFilter, ...filter};

        Object.keys(me.jmapFilter).forEach(key => {
            if (me.jmapFilter[key] === undefined || me.jmapFilter[key] === '') {
                delete me.jmapFilter[key]
            }
        });

        me._currentPage = 1; // silent, load() follows
        return me.load()
    }

    /**
     * The filter for Entity/query. Conditions that are operator groups themselves
     * (e.g. {savedFilter: {operator: 'AND', conditions: [...]}}) are ANDed with the rest.
     *
     * GO's `text` filter joins the search words as w0, w1, … per condition, so two
     * `text` conditions in one query fail ("Not unique table/alias 'w0'"), e.g. the
     * search box plus a saved filter with a query. Every `text` that is ANDed anyway
     * is merged into one: GO matches all words of a text, so the result is the same.
     * @returns {Object}
     */
    getJmapFilter() {
        let flat   = {},
            groups = [],
            texts  = [];

        Object.entries(this.jmapFilter).forEach(([key, value]) => {
            if (value && typeof value === 'object' && !Array.isArray(value) && value.operator) {
                groups.push(value)
            } else {
                flat[key] = value
            }
        });

        groups = groups.map(group => JmapStore.extractAndTexts(group, texts)).filter(group => !JmapStore.isEmptyCondition(group));

        if (texts.length) {
            flat.text = [flat.text, ...texts].filter(text => text !== undefined && text !== null && text !== '').join(' ')
        }

        return groups.length ? {operator: 'AND', conditions: [flat, ...groups]} : flat
    }

    /**
     * Moves the `text` of conditions that are ANDed with the query (not below an
     * OR / NOT group) to `texts`
     * @param {Object} filter condition or operator group
     * @param {String[]} texts collects the removed texts
     * @returns {Object} the filter without them
     */
    static extractAndTexts(filter, texts) {
        if (!filter || typeof filter !== 'object') {
            return filter
        }

        if (filter.operator) {
            if (filter.operator !== 'AND' || !Array.isArray(filter.conditions)) {
                return filter
            }

            return {
                ...filter,
                conditions: filter.conditions
                    .map(condition => JmapStore.extractAndTexts(condition, texts))
                    .filter(condition => !JmapStore.isEmptyCondition(condition))
            }
        }

        if (!('text' in filter)) {
            return filter
        }

        const {text, ...rest} = filter;

        text !== undefined && text !== null && text !== '' && texts.push(String(text));

        return rest
    }

    /**
     * @param {Object} condition
     * @returns {Boolean} an empty condition or AND group (matches everything)
     */
    static isEmptyCondition(condition) {
        if (!condition || typeof condition !== 'object') {
            return false
        }

        return condition.operator
            ? condition.operator === 'AND' && Array.isArray(condition.conditions) && condition.conditions.length === 0
            : Object.keys(condition).length === 0
    }

    /**
     * @summary Sort of the last grid header click mapped through serverSortProperties, else jmapSort unchanged.
     * @returns {Object[]}
     */
    getJmapSort() {
        const sorters = (this.sorters || []).filter(s => typeof s.property === 'string'),
              map     = this.serverSortProperties || {};

        return sorters.length
            ? sorters.map(s => ({property: map[s.property] || s.property, isAscending: s.direction !== 'DESC'}))
            : this.jmapSort
    }

    /**
     * @summary No `scopeKeys`, or one of them holds a value the server applies.
     * @returns {Boolean}
     */
    hasScope() {
        const filter = this.jmapFilter || {};

        // as PHP's empty() of the server filters: 0, '0' and [] are no scope either
        return !this.scopeKeys?.length || this.scopeKeys.some(key => {
            const value = filter[key];

            return !(Array.isArray(value) ? value.length === 0 : [undefined, null, '', 0, '0', false].includes(value))
        })
    }

    /**
     * @summary Empties the store and drops a running load's answer; no push reloads until the
     * next load.
     * @protected
     */
    emptyScope() {
        let me = this;

        me.loadGeneration = (me.loadGeneration || 0) + 1;
        me.loadToken  = {};
        me.isLoading  = false;
        me.totalCount = 0;
        setDataAndFireLoad(me, []);
        // after the data: neo's afterSetData() sets isLoaded
        me.isLoaded   = false
    }

    /**
     * Whether loadMore() has records to fetch
     * @returns {Boolean}
     */
    hasMore() {
        return this.scrollLoad && this.isLoaded && this.count < (this.totalCount || 0)
    }

    /**
     * @summary scrollLoad: appends the next pageSize records (nothing without a scope)
     * @returns {Promise<Object[]|null>} the added records
     */
    async loadMore() {
        let me = this;

        if (!me.hasMore() || me.isLoading || !me.hasScope()) {
            return null
        }

        let generation = me.loadGeneration,
            position   = me.count,
            token      = me.loadToken = {};

        me.isLoading = true;

        try {
            const {list, total} = await client.queryGet(me.entity, {
                filter    : me.getJmapFilter(),
                sort      : me.getJmapSort(),
                position,
                limit     : me.pageSize,
                properties: me.properties,
                queryArgs : me.queryArgs
            });

            // a load() (filter, sort, push) replaced the records meanwhile; it owns isLoading
            if (me.isDestroyed || generation !== me.loadGeneration) {
                return null
            }

            me.totalCount = total;
            // before add(): the grid asks for more (scrollEdge) while it renders the new rows
            me.isLoading  = false;
            // the query may overlap after a change on the server; a continuation keeps the grid's scroll
            me.asContinuation(() => me.add(list.filter(record => !me.get(record.id))));
            me.fire('loadMore', {records: list});
            return list
        } catch (e) {
            if (generation === me.loadGeneration && !me.isDestroyed) {
                me.loadToken === token && (me.isLoading = false);
                me.fire('loadError', {error: e})
            }
            throw e
        }
    }

    /**
     * @summary Loads the current page; without a scope (scopeKeys) empties the store instead.
     * @param {Object} opts
     * @param {Boolean} [opts.keepCount] scrollLoad: reload as many records as are loaded now
     * @returns {Promise<Object[]|null>}
     */
    async load(opts={}) {
        if (!this.hasScope()) {
            this.emptyScope();
            return []
        }

        let me         = this,
            scrollLoad = me.scrollLoad,
            pageSize   = scrollLoad && opts.keepCount ? Math.max(me.pageSize, me.count) : me.pageSize,
            position   = pageSize && !scrollLoad ? (me.currentPage - 1) * pageSize : 0,
            generation = me.loadGeneration = (me.loadGeneration || 0) + 1,
            // owner of isLoading: a loadMore() started by the load event takes it over
            token      = me.loadToken = {};

        me.isLoading = true;
        me.fire('beforeLoad', {});

        try {
            const {list, total} = await client.queryGet(me.entity, {
                filter    : me.getJmapFilter(),
                sort      : me.getJmapSort(),
                position,
                limit     : pageSize || undefined,
                properties: me.properties,
                queryArgs : me.queryArgs
            });

            // destroyed, or a newer load (paging, search, push) was started meanwhile
            if (me.isDestroyed || generation !== me.loadGeneration) {
                return null
            }

            // the page shrank away (e.g. its last note was deleted): go to the last page
            if (!list.length && position > 0 && total > 0) {
                me._currentPage = Math.ceil(total / pageSize);
                return me.load(opts)
            }

            // before the load event: scrollLoad may ask for more right away
            me.totalCount = total;
            me.isLoading  = false;
            me.isLoaded   = true;
            // fires the load event, also for an empty list or records equal to the old ones
            setDataAndFireLoad(me, list);
            return me.items
        } catch (e) {
            if (generation === me.loadGeneration && !me.isDestroyed) {
                me.fire('loadError', {error: e})
            }
            throw e
        } finally {
            if (me.loadToken === token) {
                me.isLoading = false
            }
        }
    }
}

export default Neo.setupClass(JmapStore);
