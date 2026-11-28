import Model from '../../../../../views/neo/node_modules/neo.mjs/src/data/Model.mjs';
import Store from '../../../../../views/neo/node_modules/neo.mjs/src/data/Store.mjs';
import {messageStore} from '../api.mjs';
import {unescapeHtml} from '../util.mjs';
import {setDataAndFireLoad} from '../../../../../views/neo/src/data/setData.mjs';

/**
 * A message row of email/message/store, see MessageStore.toRecord()
 */
class Message extends Model {
    static config = {
        className  : 'GO.email.data.Message',
        keyProperty: 'id',
        fields     : [
            {name: 'id',              type: 'String'},
            {name: 'uid',             type: 'Int'},
            {name: 'account_id',      type: 'Int'},
            {name: 'mailbox',         type: 'String'},
            {name: 'mailboxname',     type: 'String'},
            {name: 'subject',         type: 'String'},
            {name: 'from',            type: 'String'},
            {name: 'to',              type: 'String'},
            {name: 'sender',          type: 'String'},
            {name: 'size',            type: 'Int'},
            {name: 'udate',           type: 'Int'},
            {name: 'internal_udate',  type: 'Int'},
            {name: 'x_priority',      type: 'Int'},
            {name: 'seen',            type: 'Boolean'},
            {name: 'flagged',         type: 'Boolean'},
            {name: 'answered',        type: 'Boolean'},
            {name: 'forwarded',       type: 'Boolean'},
            {name: 'deleted',         type: 'Boolean'},
            {name: 'has_attachments', type: 'Boolean'},
            // [{name, color, flag}]
            {name: 'labels'}
        ]
    }
}

Neo.setupClass(Message);

/**
 * Store of one mailbox, loaded from the legacy email/message/store (ExtJS EmailClient
 * messagesStore). Like JmapStore with scrollLoad: load() fetches the first page, loadMore()
 * appends the next one (the grid calls it when scrolled to the end).
 *
 * Record ids: the uid, or "<n>_<uid>" when a search over several folders returns messages
 * of more mailboxes (uids are unique per mailbox only).
 *
 * After every load `response` holds the last answer without its results (permission_level,
 * sent, drafts, trash, deleteConfirm, unseen, allUids, …); the `response` event passes it.
 */
class MessageStore extends Store {
    static config = {
        className  : 'GO.email.data.MessageStore',
        model      : Message,
        keyProperty: 'id',
        remoteSort : true,
        pageSize   : 50,
        /**
         * email/message/store parameters: account_id, mailbox, query, unread, flagged, searchIn
         * @member {Object} params={}
         */
        params: {},
        /**
         * Grid field → email/message/store sort
         * @member {Object} sortMap
         */
        sortMap: {internal_udate: 'arrival', udate: 'date', from: 'from', subject: 'subject', size: 'size'}
    }

    /**
     * The last response without its results
     * @member {Object} response={}
     */
    response = {}

    /**
     * Mailbox name → number, for record ids of searches over more folders
     * @member {Map<String, Number>} mailboxIndex
     */
    mailboxIndex = new Map()

    /**
     * Whether an account and mailbox are set
     * @returns {Boolean}
     */
    get hasMailbox() {
        return !!this.params.account_id && typeof this.params.mailbox === 'string'
    }

    /**
     * Merges parameters (undefined or '' removes one) and loads from the start
     * @param {Object} params
     * @returns {Promise<Object[]|null>}
     */
    setParams(params) {
        let me = this;

        me.params = {...me.params, ...params};

        Object.keys(me.params).forEach(key => {
            if (me.params[key] === undefined || me.params[key] === '' || me.params[key] === null) {
                delete me.params[key]
            }
        });

        return me.load()
    }

    /**
     * @returns {{sort: String, dir: String}}
     */
    getSort() {
        const sorter = (this.sorters || []).find(s => typeof s.property === 'string');

        return sorter
            ? {sort: this.sortMap[sorter.property] || 'arrival', dir: sorter.direction === 'ASC' ? 'ASC' : 'DESC'}
            : {sort: 'arrival', dir: 'DESC'}
    }

    /**
     * @param {Object} row a result of email/message/store
     * @param {Boolean} multipleFolders
     * @returns {Object}
     */
    toRecord(row, multipleFolders) {
        let me      = this,
            mailbox = row.mailbox ?? me.params.mailbox,
            uid     = Number(row.uid);

        if (multipleFolders && !me.mailboxIndex.has(mailbox)) {
            me.mailboxIndex.set(mailbox, me.mailboxIndex.size)
        }

        return {
            id             : multipleFolders ? `${me.mailboxIndex.get(mailbox)}_${uid}` : String(uid),
            uid,
            account_id     : Number(row.account_id ?? me.params.account_id),
            mailbox,
            mailboxname    : row.mailboxname || mailbox,
            subject        : unescapeHtml(row.subject),
            from           : unescapeHtml(row.from),
            to             : unescapeHtml(row.to),
            sender         : row.sender || '',
            size           : Number(row.size) || 0,
            udate          : Number(row.udate) || 0,
            internal_udate : Number(row.internal_udate) || 0,
            x_priority     : Number(row.x_priority) || 3,
            seen           : !!Number(row.seen ?? 0) || row.seen === true,
            flagged        : !!Number(row.flagged || 0),
            answered       : !!Number(row.answered || 0),
            forwarded      : !!Number(row.forwarded || 0),
            deleted        : !!Number(row.deleted || 0),
            has_attachments: !!Number(row.has_attachments || 0),
            labels         : Array.isArray(row.labels) ? row.labels : []
        }
    }

    /**
     * @param {Object} extra parameters of this request only (e.g. action: 'move', delete_keys)
     * @param {Number} start
     * @param {Number} limit
     * @returns {Promise<Object>}
     * @protected
     */
    request(extra, start, limit) {
        return messageStore({...this.params, ...this.getSort(), start, limit, ...extra})
    }

    /**
     * @param {Object} response
     * @protected
     */
    storeResponse(response) {
        const {results, ...rest} = response;

        this.response = rest;
        this.fire('response', {response: rest})
    }

    /**
     * Whether loadMore() has records to fetch
     * @returns {Boolean}
     */
    hasMore() {
        return this.isLoaded && this.count < (this.totalCount || 0)
    }

    /**
     * Appends the next page
     * @returns {Promise<Object[]|null>}
     */
    async loadMore() {
        let me = this;

        if (!me.hasMore() || me.isLoading || !me.hasMailbox) {
            return null
        }

        let generation = me.loadGeneration,
            token      = me.loadToken = {};

        me.isLoading = true;

        try {
            const response = await me.request({}, me.count, me.pageSize);

            if (me.isDestroyed || generation !== me.loadGeneration) {
                return null
            }

            const multiple = !!response.multipleFolders,
                  records  = (response.results || []).map(row => me.toRecord(row, multiple));

            me.totalCount = Number(response.total) || 0;
            me.isLoading  = false;
            me.storeResponse(response);
            // new mail moves the pages: skip what is loaded already; a continuation keeps the grid's scroll
            me.asContinuation(() => me.add(records.filter(record => !me.get(record.id))));
            me.fire('loadMore', {records});
            return records
        } catch (e) {
            if (generation === me.loadGeneration && !me.isDestroyed) {
                me.loadToken === token && (me.isLoading = false);
                me.fire('loadError', {error: e})
            }
            throw e
        }
    }

    /**
     * Loads the first page; with `keepCount` as many messages as are loaded now.
     * `extra` goes with this request only: email/message/store moves and deletes messages
     * before it lists them (action: 'move', messages, to_mailbox / delete_keys).
     * @param {Object} [opts]
     * @param {Boolean} [opts.keepCount]
     * @param {Object} [opts.extra]
     * @returns {Promise<Object[]|null>}
     */
    async load(opts={}) {
        let me         = this,
            limit      = opts.keepCount ? Math.max(me.pageSize, me.count) : me.pageSize,
            generation = me.loadGeneration = (me.loadGeneration || 0) + 1,
            token      = me.loadToken = {};

        if (!me.hasMailbox) {
            me.totalCount = 0;
            me.isLoaded   = false;
            me.data       = [];
            return []
        }

        me.isLoading = true;
        me.fire('beforeLoad', {});

        try {
            const response = await me.request(opts.extra || {}, 0, limit);

            if (me.isDestroyed || generation !== me.loadGeneration) {
                return null
            }

            const multiple = !!response.multipleFolders;

            me.mailboxIndex.clear();
            me.totalCount = Number(response.total) || 0;
            me.isLoading  = false;
            me.isLoaded   = true;
            me.storeResponse(response);
            setDataAndFireLoad(me, (response.results || []).map(row => me.toRecord(row, multiple)), {total: me.chunkingTotal});
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

export default Neo.setupClass(MessageStore);
