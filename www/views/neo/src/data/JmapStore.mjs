import client from '../jmap/Client.mjs';
import Store  from '../../node_modules/neo.mjs/src/data/Store.mjs';

/**
 * neo.mjs Store backed by a Group Office JMAP entity.
 *
 * load() runs Entity/query + Entity/get for the current page. When the server
 * pushes a state change for the entity the current page is reloaded, which keeps
 * creations, filter membership, sorting and paging correct without patching.
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
         * Server sort property per field when they differ, e.g. {createdBy: 'creator'}
         * @member {Object|null} sortProperties=null
         */
        sortProperties: null
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
     * Sort of the last grid header click, else jmapSort
     * @returns {Object[]}
     */
    getJmapSort() {
        const sorters = (this.sorters || []).filter(s => typeof s.property === 'string'),
              map     = this.sortProperties || {};

        return sorters.length
            ? sorters.map(s => ({property: map[s.property] || s.property, isAscending: s.direction !== 'DESC'}))
            : this.jmapSort
    }

    /**
     * Whether loadMore() has records to fetch
     * @returns {Boolean}
     */
    hasMore() {
        return this.scrollLoad && this.isLoaded && this.count < (this.totalCount || 0)
    }

    /**
     * scrollLoad: appends the next pageSize records
     * @returns {Promise<Object[]|null>} the added records
     */
    async loadMore() {
        let me = this;

        if (!me.hasMore() || me.isLoading) {
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
                properties: me.properties
            });

            // a load() (filter, sort, push) replaced the records meanwhile; it owns isLoading
            if (me.isDestroyed || generation !== me.loadGeneration) {
                return null
            }

            me.totalCount = total;
            // before add(): the grid asks for more (scrollEdge) while it renders the new rows
            me.isLoading  = false;
            // the query may overlap after a change on the server
            me.add(list.filter(record => !me.get(record.id)));
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
     * @param {Object} opts
     * @param {Boolean} [opts.keepCount] scrollLoad: reload as many records as are loaded now
     * @returns {Promise<Object[]|null>}
     */
    async load(opts={}) {
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
                properties: me.properties
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
            me.data       = list; // fires the load event
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
