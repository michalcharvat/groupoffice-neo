import Store  from '../../../../../views/neo/node_modules/neo.mjs/src/data/Store.mjs';
import client from '../../../../../views/neo/src/jmap/Client.mjs';
import {setDataAndFireLoad} from '../../../../../views/neo/src/data/setData.mjs';

/**
 * Store over a legacy files list controller (ExtJS GO.data.JsonStore of the file browser):
 * `files/folder/list` for a folder (records keyed by type_id "d:<id>" / "f:<id>"), the same
 * route with folder_id "trash" for the trash (keyed by id).
 *
 * The response's folder data (permission_level, path, parent_id, thumbs, disk_usage,
 * disk_quota, …) is kept in `meta`. Header sorting reloads from the server; more records
 * load when the grid is scrolled to the end (loadMore()).
 */
class FolderStore extends Store {
    static config = {
        className  : 'GO.files.data.FolderStore',
        remoteSort : true,
        keyProperty: 'type_id',
        pageSize   : 100,
        /**
         * @member {String|Number|null} folderId=null "trash", "shared" or a folder id
         */
        folderId: null,
        /**
         * Search text (files below the folder)
         * @member {String} query=''
         */
        query: '',
        /**
         * Sort when no header was clicked
         * @member {Object} defaultSort={property: 'name', direction: 'ASC'}
         */
        defaultSort: {property: 'name', direction: 'ASC'},
        model: {fields: [
            {name: 'type_id',            type: 'String'},
            {name: 'id',                 type: 'String'},
            {name: 'name',               type: 'String'},
            {name: 'type',               type: 'String'},
            {name: 'extension',          type: 'String'},
            {name: 'size'},
            {name: 'mtime',              type: 'String'},
            {name: 'ctime',              type: 'String'},
            {name: 'username',           type: 'String'},
            {name: 'musername',          type: 'String'},
            {name: 'path',               type: 'String'},
            {name: 'thumb_url',          type: 'String'},
            {name: 'acl_id'},
            {name: 'readonly'},
            {name: 'locked'},
            {name: 'locked_user_id'},
            {name: 'unlock_allowed'},
            {name: 'folder_id'},
            {name: 'parent_id'},
            {name: 'permission_level'},
            {name: 'content_expire_date'},
            // trash
            {name: 'entity',             type: 'String'},
            {name: 'fullPath',           type: 'String'},
            {name: 'deletedAt',          type: 'String'},
            {name: 'deletedByUser',      type: 'String'}
        ]}
    }

    /**
     * Folder data of the last response
     * @member {Object} meta={}
     */
    meta = {}

    /**
     * @returns {Object} sort and dir of the legacy controllers
     */
    getSortParams() {
        const sorter = (this.sorters || []).find(s => typeof s.property === 'string') || this.defaultSort;
        return {sort: sorter.property, dir: sorter.direction === 'DESC' ? 'DESC' : 'ASC'}
    }

    /**
     * @param {Number} start
     * @param {Number} limit
     * @param {Object} extra e.g. {trash_keys: '["f:3"]'}
     * @returns {Object}
     */
    getParams(start, limit, extra={}) {
        const params = {folder_id: this.folderId ?? '', start, limit, ...this.getSortParams(), ...extra};

        this.query && (params.query = this.query);
        return params
    }

    /**
     * @param {String|Number} folderId
     * @param {String} [query='']
     * @returns {Promise<Object[]|null>}
     */
    loadFolder(folderId, query='') {
        this.folderId = folderId;
        this.query    = query;
        return this.load()
    }

    /**
     * @param {Object} [opts]
     * @param {Object} [opts.params] extra parameters, e.g. trash_keys (move to trash) or
     *        delete_keys (delete) like the ExtJS store's baseParams
     * @param {Boolean} [opts.keepCount] reload as many records as are loaded now
     * @returns {Promise<Object[]|null>} the records, null when a newer load replaced this one
     */
    async load(opts={}) {
        let me         = this,
            limit      = opts.keepCount ? Math.max(me.pageSize, me.count) : me.pageSize,
            generation = me.loadGeneration = (me.loadGeneration || 0) + 1;

        if (me.folderId === null || me.folderId === undefined) {
            return null
        }

        me.isLoading = true;
        // the grid hides its empty state until this load answers
        me.fire('beforeLoad', {});

        try {
            const response = await client.legacy('files/folder/list', me.getParams(0, limit, opts.params));

            if (me.isDestroyed || generation !== me.loadGeneration) {
                return null
            }

            const {results = [], total = 0, success, ...meta} = response;

            me.meta       = meta;
            me.totalCount = total;
            me.isLoading  = false;
            me.isLoaded   = true;
            // before load: listeners of load see the folder's data
            me.fire('meta', {meta, response});
            setDataAndFireLoad(me, results); // fires load, also for an empty folder
            return me.items
        } catch (e) {
            if (generation === me.loadGeneration && !me.isDestroyed) {
                me.isLoading = false;
                me.fire('loadError', {error: e})
            }
            throw e
        }
    }

    /**
     * @returns {Boolean}
     */
    hasMore() {
        return this.isLoaded && !this.isLoading && this.count < (this.totalCount || 0)
    }

    /**
     * Appends the next page
     * @returns {Promise<Object[]|null>}
     */
    async loadMore() {
        let me = this;

        if (!me.hasMore()) {
            return null
        }

        let generation = me.loadGeneration;

        me.isLoading = true;

        try {
            const {results = [], total = 0} = await client.legacy('files/folder/list', me.getParams(me.count, me.pageSize, {skip_fs_sync: 1}));

            if (me.isDestroyed || generation !== me.loadGeneration) {
                return null
            }

            me.totalCount = total;
            me.isLoading  = false;
            me.asContinuation(() => me.add(results.filter(r => !me.get(r[me.keyProperty]))));
            me.fire('loadMore', {records: results});
            return results
        } catch (e) {
            if (generation === me.loadGeneration && !me.isDestroyed) {
                me.isLoading = false;
                me.fire('loadError', {error: e})
            }
            throw e
        }
    }
}

export default Neo.setupClass(FolderStore);
