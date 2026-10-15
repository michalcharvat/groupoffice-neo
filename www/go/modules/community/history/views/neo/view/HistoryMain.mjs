import Toolbar        from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import SearchButton   from '../../../../../../../views/neo/src/button/SearchButton.mjs';
import Splitter       from '../../../../../../../views/neo/src/component/Splitter.mjs';
import TableTitle     from '../../../../../../../views/neo/src/component/TableTitle.mjs';
import JmapStore      from '../../../../../../../views/neo/src/data/JmapStore.mjs';
import HistoryDetailDialog from '../../../../../../../views/neo/src/detail/HistoryDetailDialog.mjs';
import DateRangeField from '../../../../../../../views/neo/src/form/field/DateRangeField.mjs';
import PrincipalCombo from '../../../../../../../views/neo/src/form/field/PrincipalCombo.mjs';
import {fieldset}     from '../../../../../../../views/neo/src/form/fieldset.mjs';
import Grid           from '../../../../../../../views/neo/src/grid/Grid.mjs';
import client         from '../../../../../../../views/neo/src/jmap/Client.mjs';
import CheckList      from '../../../../../../../views/neo/src/list/CheckList.mjs';
import {notifyError}  from '../../../../../../../views/neo/src/Notify.mjs';
import MainThreeColumnPanel from '../../../../../../../views/neo/src/view/MainThreeColumnPanel.mjs';
import {addDays, toYmd, weekStart} from '../../../../../../../views/neo/src/DateUtil.mjs';
import {avatarHtml, escapeHtml, formatUserDateTime, smartDateTime} from '../../../../../../../views/neo/src/Format.mjs';
import {t as coreT, translator} from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'history');

// GOUI LogEntryGrid loads more rows on scroll
const PAGE_SIZE = 40;

// LogEntry `actions` filter values (LogEntry::$actionMap)
const ACTIONS = [
    ['create', 'Create'], ['update', 'Update'], ['delete', 'Delete'], ['login', 'Login'],
    ['logout', 'Logout'], ['badlogin', 'Bad login'], ['download', 'Download'], ['email', 'E-mail']
];

/**
 * History module (GOUI history Main): the log of all entities. West: date range, user,
 * actions and entity types; center: LogEntry grid, a click on "Changes" shows them.
 * Two columns, no detail panel.
 */
class HistoryMain extends MainThreeColumnPanel {
    static config = {
        className : 'GO.history.view.HistoryMain',
        cls       : ['go-history'],
        stateName : 'history',
        /**
         * Route prefix, set by the shell
         * @member {String|null} moduleName=null
         */
        moduleName: null
    }

    /**
     * Principal id → {name, avatarId} of the rows' users
     * @member {Object} principals={}
     */
    principals = {}

    createWest() {
        let me    = this,
            today = new Date();

        return {
            ntype : 'container',
            cls   : ['go-scroll'],
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Toolbar,
                flex  : 'none',
                items : ['->', me.hideWestButton()]
            }, fieldset(null, [{
                // GOUI: this week at first
                module   : DateRangeField,
                reference: 'dateRange',
                labelText: coreT('Date'),
                value    : toYmd(weekStart(today)) + '..' + toYmd(addDays(weekStart(today), 6)),
                listeners: {change: ({value}) => me.setFilter({createdAt: value || undefined})}
            }, {
                module         : PrincipalCombo,
                principalEntity: 'User',
                name           : 'user',
                labelText      : coreT('Users'),
                labelPosition  : 'inline',
                placeholderText: t('All users'),
                listeners      : {change: ({value}) => me.setFilter({createdBy: value || undefined})}
            }]), {
                module: Toolbar,
                flex  : 'none',
                items : [{ntype: 'component', tag: 'h4', cls: ['go-toolbar-heading'], text: coreT('Actions')}]
            }, {
                module      : CheckList,
                reference   : 'actionList',
                flex        : 'none',
                displayField: 'name',
                store       : {keyProperty: 'id', data: ACTIONS.map(([id, text]) => ({id, name: coreT(text)}))}
            }, {
                module: Toolbar,
                flex  : 'none',
                items : [{ntype: 'component', tag: 'h4', cls: ['go-toolbar-heading'], text: coreT('Types')}]
            }, {
                module      : CheckList,
                reference   : 'typeList',
                flex        : 'none',
                displayField: 'name',
                store       : {keyProperty: 'id', data: []}
            }]
        }
    }

    createCenter() {
        let me = this;

        return {
            ntype : 'container',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Toolbar,
                flex  : 'none',
                cls   : ['go-bg-mid', 'go-border-bottom'],
                items : [me.showWestButton(), {
                    module: TableTitle,
                    title : t('History')
                }, '->', {
                    module   : SearchButton,
                    listeners: {search: ({text}) => me.setFilter({text: text || undefined})}
                }]
            }, {
                module   : Grid,
                reference: 'grid',
                flex     : 1,
                stateId  : 'history-logentry-grid',
                store    : {
                    module    : JmapStore,
                    entity    : 'LogEntry',
                    pageSize  : PAGE_SIZE,
                    scrollLoad: true,
                    autoLoad  : false,
                    sorters   : [{property: 'id', direction: 'DESC'}],
                    properties: ['id', 'entityId', 'entity', 'description', 'action', 'createdAt', 'createdBy',
                                 'remoteIp', 'requestId', 'changes'],
                    model     : {
                        fields: ['id', 'entityId', 'entity', 'description', 'action', 'createdAt', 'createdBy',
                                 'remoteIp', 'requestId', 'changes', 'creatorName', 'avatarId']
                            .map(name => ({name, type: 'String'}))
                    }
                },
                columns: [{
                    dataField: 'entityId',
                    text     : coreT('ID'),
                    cellAlign: 'right',
                    width    : 80,
                    hidden   : true,
                    sortable : false
                }, {
                    dataField: 'description',
                    text     : coreT('Description'),
                    flex     : 1,
                    hideable : false,
                    sortable : false,
                    renderer : ({value}) => escapeHtml(value || '')
                }, {
                    dataField: 'entity',
                    text     : coreT('Entity'),
                    width    : 120,
                    sortable : false,
                    renderer : ({value}) => escapeHtml(value ? coreT(value) : '')
                }, {
                    dataField: 'creatorName',
                    stateKey : 'creator',
                    text     : coreT('User'),
                    width    : 200,
                    sortable : false,
                    renderer : ({record}) => me.renderCreator(record)
                }, {
                    dataField: 'changes',
                    text     : coreT('Changes'),
                    cellAlign: 'center',
                    width    : 80,
                    sortable : false,
                    renderer : ({value}) => value
                        ? `<i class="go-icon go-history-changes" title="${escapeHtml(coreT('Show changes'))}">note</i>`
                        : ''
                }, {
                    dataField: 'action',
                    text     : coreT('Action'),
                    width    : 100,
                    sortable : false,
                    renderer : ({value}) => escapeHtml(value ? coreT(value.charAt(0).toUpperCase() + value.slice(1)) : '')
                }, {
                    dataField: 'createdAt',
                    text     : coreT('Date'),
                    cellAlign: 'right',
                    width    : 140,
                    renderer : ({value}) => value
                        ? `<span title="${escapeHtml(formatUserDateTime(value))}">${escapeHtml(smartDateTime(value))}</span>`
                        : ''
                }, {
                    dataField: 'remoteIp',
                    text     : 'IP',
                    width    : 120,
                    sortable : false,
                    renderer : ({value}) => escapeHtml(value || '')
                }, {
                    dataField: 'requestId',
                    text     : coreT('Request ID'),
                    width    : 200,
                    sortable : false,
                    renderer : ({value}) => escapeHtml(value || '')
                }]
            }]
        }
    }

    /**
     * Two columns: west | center (no detail panel)
     */
    createItems() {
        let me = this;

        me._items = [{
            ...me.createWest(),
            reference: 'west',
            cls      : ['go-scroll', 'go-west'],
            flex     : 'none',
            minWidth : '14rem',
            width    : '34rem'
        }, {
            module   : Splitter,
            reference: 'westSplitter',
            stateId  : 'history-west-splitter'
        }, {
            ...me.createCenter(),
            cls     : ['go-center', 'go-active'],
            flex    : 1,
            minWidth: '30rem'
        }];

        Object.getPrototypeOf(MainThreeColumnPanel.prototype).createItems.call(me)
    }

    onConstructed() {
        super.onConstructed();

        let me    = this,
            grid  = me.getReference('grid'),
            store = grid.store;

        me.getReference('actionList').selectionModel.on('selectionChange', () => {
            const ids = me.getReference('actionList').getCheckedIds();
            me.setFilter({actions: ids.length ? ids : undefined})
        });

        me.getReference('typeList').selectionModel.on('selectionChange', () => {
            const ids = me.getReference('typeList').getCheckedIds();
            me.setFilter({entities: ids.length ? ids : undefined})
        });

        store.on({load: me.onStoreLoad, loadMore: me.onStoreLoad, scope: me});
        store.on('loadError', ({error}) => notifyError(me, error));
        grid.body.on('scrollEdge', () => store.loadMore().catch(() => {}));

        grid.on('cellClick', ({dataField, record}) => {
            dataField === 'changes' && record?.changes && Neo.create(HistoryDetailDialog, {
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
        });

        client.watch(['LogEntry']);
        me.loadTypes();
        me.setFilter({createdAt: me.getReference('dateRange').value || undefined})
    }

    /**
     * Merges LogEntry filter conditions and reloads
     * @param {Object} filter
     */
    setFilter(filter) {
        this.getReference('grid')?.store.setFilter(filter).catch(() => {}) // loadError shows it
    }

    /**
     * Entity types of the installed modules (GOUI entities.getAll()), by title
     */
    async loadTypes() {
        let me = this;

        try {
            const {list} = await client.call('Module/get', {properties: ['id', 'package', 'name', 'enabled', 'entities']}),
                  types  = [];

            list.filter(module => module.enabled).forEach(module => {
                const mt = translator(module.package || 'core', module.name);

                Object.keys(module.entities || {}).forEach(name => {
                    types.some(type => type.id === name) || types.push({id: name, name: mt(name)})
                })
            });

            types.sort((a, b) => a.name.localeCompare(b.name));

            me.isDestroyed || (me.getReference('typeList').store.data = types)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * @param {Object} record
     * @returns {String} html
     */
    renderCreator(record) {
        const name   = record.creatorName || (record.createdBy ? '' : coreT('Unknown user')),
              avatar = record.avatarId
                  ? `<img class="go-avatar go-avatar-small" alt="" src="${escapeHtml(client.baseUrl + 'api/thumb.php?blob=' + encodeURIComponent(record.avatarId) + '&w=64&h=64&zc=1')}">`
                  : avatarHtml(name || '?', ['go-avatar-small']);

        return `<span class="go-history-user">${avatar}<span>${escapeHtml(name)}</span></span>`
    }

    /**
     * Fills in the users' names and avatars
     */
    async onStoreLoad() {
        let me      = this,
            store   = me.getReference('grid')?.store,
            missing = store ? [...new Set(store.items.map(r => r.createdBy).filter(id => id && !me.principals[id]))] : [];

        if (missing.length) {
            try {
                (await client.get('Principal', missing, ['id', 'name', 'avatarId'])).forEach(p => {
                    me.principals[p.id] = {name: p.name || '', avatarId: p.avatarId || ''}
                })
            } catch (e) {
                console.warn('History: cannot load users', e)
            }
        }

        if (me.isDestroyed || !store) {
            return
        }

        store.items.forEach(record => {
            const principal = me.principals[record.createdBy];

            if (principal && record.creatorName !== principal.name) {
                record.set({avatarId: principal.avatarId, creatorName: principal.name})
            }
        })
    }
}

export default Neo.setupClass(HistoryMain);
