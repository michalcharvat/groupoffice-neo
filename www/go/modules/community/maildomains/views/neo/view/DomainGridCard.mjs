import Container    from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar      from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button       from '../../../../../../../views/neo/src/button/Button.mjs';
import SearchButton from '../../../../../../../views/neo/src/button/SearchButton.mjs';
import JmapStore    from '../../../../../../../views/neo/src/data/JmapStore.mjs';
import Grid         from '../../../../../../../views/neo/src/grid/Grid.mjs';
import MultiSelectToolbar from '../../../../../../../views/neo/src/grid/MultiSelectToolbar.mjs';
import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import MenuList     from '../../../../../../../views/neo/src/menu/List.mjs';
import {notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import {fmt}        from '../../../../../../../views/neo/src/Translate.mjs';
import ConfirmDialog from '../../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import {loadPrincipalNames, t} from './util.mjs';

// GOUI tables in the domain detail: rows up to 40rem (CSS max-height); the neo grid
// adds a 30px header and reserves 17px for its horizontal scrollbar
const ROW_HEIGHT    = 35,
      HEADER_HEIGHT = 30 + 17,
      PAGE_SIZE     = 50;

/**
 * A card of the domain detail with the domain's mailboxes or aliases (GOUI
 * DomainDetail createMailboxesTab / createAliasTab): title, search, add, a grid
 * with a ⋮ menu per row (edit, delete), several rows deleted at once
 * (MultiSelectToolbar).
 *
 * Events: add {}, edit {record}
 */
class DomainGridCard extends Container {
    static config = {
        className: 'GO.maildomains.view.DomainGridCard',
        baseCls  : ['go-md-grid-card', 'go-card', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {String} title=''
         */
        title: '',
        /**
         * JMAP entity, e.g. 'MailBox'
         * @member {String|null} entity=null
         */
        entity: null,
        /**
         * Record model of the grid's store
         * @member {Neo.data.Model|null} model=null
         */
        model: null,
        /**
         * Sort property (ascending)
         * @member {String} sortProperty='id'
         */
        sortProperty: 'id',
        /**
         * Grid columns, the ⋮ column is added
         * @member {Object[]} gridColumns=[]
         */
        gridColumns: [],
        /**
         * Grid state id (hidden columns, widths), GOUI table stateId
         * @member {String|null} gridStateId=null
         */
        gridStateId: null,
        /**
         * (record) => text for the delete question
         * @member {Function} recordTitle
         */
        recordTitle: record => record.id
    }

    /**
     * @member {String|null} domainId=null
     */
    domainId = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype : 'container',
            flex  : 'none',
            cls   : ['go-mstb-host'],
            items : [{
                module: Toolbar,
                cls   : ['go-border-bottom'],
                items : [{
                    ntype: 'component',
                    tag  : 'h3',
                    cls  : ['go-toolbar-heading'],
                    text : me.title
                }, '->', {
                    module   : SearchButton,
                    listeners: {search: ({text}) => me.onSearch(text)}
                }, {
                    module   : Button,
                    icon     : 'add',
                    ui       : 'primary',
                    reference: 'addButton',
                    text     : t('Add'),
                    disabled : true,
                    handler  : () => me.fire('add', {})
                }]
            }, {
                module   : MultiSelectToolbar,
                reference: 'multiSelectToolbar',
                items    : [{
                    module : Button,
                    icon   : 'delete',
                    tooltip: t('Delete'),
                    handler: () => me.deleteRecords(me.getReference('grid').getSelectedRecords())
                }]
            }]
        }, {
            module     : Grid,
            reference  : 'grid',
            cls        : ['go-md-grid'],
            flex       : 'none',
            height     : HEADER_HEIGHT + ROW_HEIGHT,
            multiSelect: true,
            stateId    : me.gridStateId,
            store      : {
                module    : JmapStore,
                entity    : me.entity,
                model     : me.model,
                pageSize  : PAGE_SIZE,
                scrollLoad: true,
                sorters   : [{property: me.sortProperty, direction: 'ASC'}]
            },
            columns: [...me.gridColumns, {
                // GOUI: a ⋮ button per row
                dataField: 'rowMenu',
                text     : '',
                width    : 48,
                sortable : false,
                hideable : false,
                renderer : () => `<i class="go-icon go-md-row-menu" title="${t('More options')}">more_vert</i>`
            }]
        }, {
            ntype    : 'component',
            reference: 'empty',
            cls      : ['go-empty'],
            flex     : 'none',
            hidden   : true,
            text     : t('No items to display')
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me    = this,
            grid  = me.getReference('grid'),
            store = grid.store;

        me.getReference('multiSelectToolbar').setGrid(grid);

        store.on({
            load     : me.onStoreLoad,
            loadMore : me.onStoreLoad,
            loadError: ({error}) => notifyError(me, error),
            scope    : me
        });

        grid.body.on('scrollEdge', () => store.loadMore().catch(() => {}));

        grid.on({
            rowDoubleClick: ({record}) => record && me.fire('edit', {record}),
            cellClick     : ({data, dataField, record}) => {
                dataField === 'rowMenu' && record && me.showRowMenu(record, data.currentTarget)
            }
        })
    }

    destroy(...args) {
        const store = this.getReference?.('grid')?.store;

        super.destroy(...args);
        // the grid only detaches its store; this one is ours and watches the entity
        store && !store.isDestroyed && store.destroy()
    }

    /**
     * Shows the records of a domain, null: none
     * @param {String|null} domainId
     */
    setDomain(domainId) {
        let me    = this,
            store = me.getReference('grid').store;

        me.getReference('addButton').disabled = !domainId;

        if (me.domainId === domainId) {
            return
        }

        me.domainId = domainId;
        me.getReference('grid').view.selectionModel.clear?.();

        if (domainId) {
            store.setFilter({domainId}).catch(() => {}) // loadError shows it
        } else {
            store.jmapFilter = {};
            store.isLoaded   = false;
            store.data       = []
        }
    }

    /**
     * Reloads the rows (after a dialog saved: push may not be running)
     */
    reload() {
        this.domainId && this.getReference('grid').store.load({keepCount: true}).catch(() => {}) // loadError shows it
    }

    onSearch(text) {
        this.domainId && this.getReference('grid').store.setFilter({text: text || undefined}).catch(() => {})
    }

    async onStoreLoad() {
        let me    = this,
            grid  = me.getReference('grid'),
            count = grid.store.count;

        // empty: just the header, "No items to display" below it
        grid.height = HEADER_HEIGHT + count * ROW_HEIGHT;
        me.getReference('empty').hidden = count > 0;

        const ids = grid.store.items.flatMap(r => [r.createdBy, r.modifiedBy]);

        if (await loadPrincipalNames(ids)) {
            !me.isDestroyed && !grid.isDestroyed && grid.body?.createViewData()
        }
    }

    /**
     * @param {Object} record
     * @param {String} target DOM id of the cell
     */
    showRowMenu(record, target) {
        let me = this;

        MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target,
            items   : [{
                text   : t('Edit'),
                icon   : 'edit',
                handler: () => me.fire('edit', {record})
            }, {
                text   : t('Delete'),
                icon   : 'delete',
                handler: () => me.deleteRecords([record])
            }]
        })
    }

    /**
     * @param {Object[]} records
     */
    async deleteRecords(records) {
        let me = this;

        if (!records.length) {
            return
        }

        const confirmed = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : records.length === 1
                ? fmt(t("Are you sure you want to delete '{item}'?"), {item: me.recordTitle(records[0])})
                : fmt(t('Are you sure you want to delete the {count} items?'), {count: records.length})
        });

        if (!confirmed || me.isDestroyed) {
            return
        }

        try {
            await client.set(me.entity, {destroy: records.map(record => record.id)});
            me.getReference('grid').view.selectionModel.clear?.();
            me.getReference('grid').store.load().catch(() => {}) // loadError shows it
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(DomainGridCard);
