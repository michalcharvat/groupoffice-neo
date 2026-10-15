import client    from '../jmap/Client.mjs';
import JmapStore from '../data/JmapStore.mjs';
import Grid      from '../grid/Grid.mjs';
import {avatarHtml, escapeHtml, formatUserDateTime, smartDateTime} from '../Format.mjs';
import Card   from './Card.mjs';
import HistoryDetailDialog from './HistoryDetailDialog.mjs';
import {t} from '../Translate.mjs';

// GOUI LogEntryGrid in HistoryDetailPanel: grid rows, at most 40rem high.
// Besides the rows the neo grid has a 30px header and reserves 17px for its
// horizontal scrollbar.
const ROW_HEIGHT    = 35,
      HEADER_HEIGHT = 30 + 17,
      MAX_HEIGHT    = '40rem',
      PAGE_SIZE     = 20;

/**
 * "History" of an entity: community/history LogEntry rows in a grid, like GOUI's
 * HistoryDetailPanel with LogEntryGrid(forDetail): user, changes, action, date, IP,
 * request id; newest first, more rows load when scrolled to the end, push reloads.
 */
class HistoryPanel extends Card {
    static config = {
        className: 'GO.detail.HistoryPanel',
        cls      : ['go-history-panel'],
        title    : t('History'),
        stateId  : 'history-detail'
        // no `watch`: the grid's JmapStore reloads on LogEntry changes itself
    }

    /**
     * Principal id → {name, avatarId} of the users in the rows
     * @member {Object} principals={}
     */
    principals = {}

    createBody() {
        let me = this;

        return [{
            module   : Grid,
            reference: 'grid',
            cls      : ['go-history-grid'],
            hidden   : true,
            height   : HEADER_HEIGHT + ROW_HEIGHT,
            style    : {maxHeight: MAX_HEIGHT},
            store    : {
                module    : JmapStore,
                entity    : 'LogEntry',
                pageSize  : PAGE_SIZE,
                scrollLoad: true,
                sorters   : [{property: 'createdAt', direction: 'DESC'}],
                properties: ['id', 'action', 'createdAt', 'createdBy', 'remoteIp', 'requestId', 'changes', 'description'],
                model     : {
                    fields: [
                        {name: 'id',          type: 'String'},
                        {name: 'action',      type: 'String'},
                        {name: 'createdAt',   type: 'String'},
                        {name: 'createdBy',   type: 'String'},
                        {name: 'remoteIp',    type: 'String'},
                        {name: 'requestId',   type: 'String'},
                        {name: 'changes',     type: 'String'},
                        {name: 'description', type: 'String'},
                        // filled in from Principal after a load
                        {name: 'creatorName', type: 'String'},
                        {name: 'avatarId',    type: 'String'}
                    ]
                }
            },
            columns: [{
                dataField: 'creatorName',
                text     : t('User'),
                flex     : 1,
                sortable : false,
                renderer : ({record}) => me.renderCreator(record)
            }, {
                dataField: 'changes',
                text     : t('Changes'),
                cellAlign: 'center',
                width    : 80,
                sortable : false,
                renderer : ({value}) => value
                    ? `<i class="go-icon go-history-changes" title="${escapeHtml(t('Show changes'))}">note</i>`
                    : ''
            }, {
                dataField: 'action',
                text     : t('Action'),
                width    : 100,
                sortable : false,
                // GOUI: t() of the capitalised action ("update" → t("Update"))
                renderer : ({value}) => escapeHtml(value ? t(value.charAt(0).toUpperCase() + value.slice(1)) : '')
            }, {
                // GOUI datetimecolumn: right aligned, smart date, full date as title
                dataField: 'createdAt',
                text     : t('Date'),
                cellAlign: 'right',
                width    : 120,
                renderer : ({value}) => `<span title="${escapeHtml(formatUserDateTime(value))}">${escapeHtml(smartDateTime(value))}</span>`
            }, {
                dataField: 'remoteIp',
                text     : 'IP',
                width    : 120,
                sortable : false,
                renderer : ({value}) => escapeHtml(value || '')
            }, {
                dataField: 'requestId',
                text     : t('Request ID'),
                width    : 200,
                sortable : false,
                renderer : ({value}) => escapeHtml(value || '')
            }]
        }, {
            ntype    : 'component',
            reference: 'empty',
            cls      : ['go-empty'],
            hidden   : true,
            text     : t('No items to display')
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me    = this,
            grid  = me.getReference('grid'),
            store = grid.store;

        store.on({
            load     : me.onStoreLoad,
            loadMore : me.onStoreLoad,
            loadError: ({error}) => me.showError(error),
            scope    : me
        });

        // GOUI reloads the history with its entity: a change of the shown entity's type
        // writes a log entry in the same request (LogEntry itself may not be pushed)
        me.removeEntityListener = client.on('stateChange', ({changed}) => {
            me.current && store.isLoaded && changed.includes(me.current.entity) && store.load({keepCount: true}).catch(() => {})
        });

        // GOUI scrollLoad: the next page when the grid is scrolled to its end
        grid.body.on('scrollEdge', () => store.loadMore().catch(() => {}));

        grid.on('cellClick', ({dataField, record}) => {
            dataField === 'changes' && record?.changes && me.openChanges(record)
        })
    }

    destroy(...args) {
        const store = this.getReference?.('grid')?.store;

        this.removeEntityListener?.();
        super.destroy(...args);
        // the grid only detaches its store; this one is ours and watches LogEntry
        store && !store.isDestroyed && store.destroy()
    }

    /**
     * @param {Object} record
     * @returns {String} html
     */
    renderCreator(record) {
        const name   = record.creatorName || (record.createdBy ? '' : t('Unknown user')),
              avatar = record.avatarId
                  ? `<img class="go-avatar go-avatar-small" alt="" src="${escapeHtml(client.baseUrl + 'api/thumb.php?blob=' + encodeURIComponent(record.avatarId) + '&w=64&h=64&zc=1')}">`
                  : avatarHtml(name || '?', ['go-avatar-small']);

        return `<span class="go-history-user">${avatar}<span>${escapeHtml(name)}</span></span>`
    }

    /**
     * GOUI HistoryDetailWindow: the changed properties of one entry
     * @param {Object} record
     */
    openChanges(record) {
        let me = this;

        Neo.create(HistoryDetailDialog, {
            appName : me.appName,
            windowId: me.windowId,
            logEntry: {
                action     : record.action,
                changes    : record.changes,
                createdAt  : record.createdAt,
                description: record.description,
                id         : record.id
            }
        })
    }

    /**
     * Card.reload() (setEntity): the store queries the shown entity
     */
    reload() {
        let me        = this,
            {current} = me;

        if (!current) {
            me.clearData();
            return
        }

        client.watch([current.entity]);

        me.getReference('grid').store
            .setFilter({entity: current.entity, entityId: current.entityId})
            .catch(() => {}) // loadError shows it
    }

    clearData() {
        let me   = this,
            grid = me.getReference('grid');

        grid.hidden = true;
        me.getReference('empty').hidden = true;
        grid.store.clear()
    }

    /**
     * Rows arrived: size the grid to them (CSS caps it at MAX_HEIGHT, then it
     * scrolls) and fill in the users' names and avatars
     */
    async onStoreLoad() {
        let me    = this,
            grid  = me.getReference('grid'),
            empty = me.getReference('empty'),
            store = grid.store,
            count = store.getCount();

        if (me.isDestroyed || !me.current) {
            return
        }

        grid.hidden  = !count;
        grid.height  = HEADER_HEIGHT + Math.max(count, 1) * ROW_HEIGHT;
        empty.text   = t('No items to display');
        empty.hidden = !!count;

        const missing = [...new Set(store.items.map(r => r.createdBy).filter(id => id && !me.principals[id]))];

        if (missing.length) {
            try {
                (await client.get('Principal', missing, ['id', 'name', 'avatarId'])).forEach(p => {
                    me.principals[p.id] = {name: p.name || '', avatarId: p.avatarId || ''}
                })
            } catch (e) {
                console.warn('HistoryPanel: cannot load users', e)
            }

            if (me.isDestroyed) {
                return
            }
        }

        store.items.forEach(record => {
            const principal = me.principals[record.createdBy];

            if (principal && record.creatorName !== principal.name) {
                record.set({avatarId: principal.avatarId, creatorName: principal.name})
            }
        })
    }

    showError(e) {
        let me    = this,
            empty = me.getReference('empty');

        // the history module may be off or not allowed: show why instead of the grid
        me.getReference('grid').hidden = true;
        empty.text   = e?.message || String(e);
        empty.hidden = false
    }
}

export default Neo.setupClass(HistoryPanel);
