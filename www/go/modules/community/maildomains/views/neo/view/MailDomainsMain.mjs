import Toolbar      from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button       from '../../../../../../../views/neo/src/button/Button.mjs';
import SearchButton from '../../../../../../../views/neo/src/button/SearchButton.mjs';
import JmapStore    from '../../../../../../../views/neo/src/data/JmapStore.mjs';
import BoolCheckBox from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import Grid         from '../../../../../../../views/neo/src/grid/Grid.mjs';
import {selectRow}  from '../../../../../../../views/neo/src/grid/selectRow.mjs';
import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {escapeHtml} from '../../../../../../../views/neo/src/Format.mjs';
import {notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import MainThreeColumnPanel from '../../../../../../../views/neo/src/view/MainThreeColumnPanel.mjs';
import MailDomainModel from '../model/MailDomain.mjs';
import DomainDetail from './DomainDetail.mjs';
import DomainDialog from './DomainDialog.mjs';
import {dateRenderer, domainStatusHtml, loadPrincipalNames, principalRenderer, quotaRenderer, t, usageRenderer,
        yesNoRenderer} from './util.mjs';

const PAGE_SIZE = 40;

/**
 * Mail domains main panel (GOUI MainPanel): the domains (with "show inactive", the
 * server's PTR status, search, add) | the selected domain's detail. GOUI uses
 * west + center; here the list is the center and the detail the east panel, the
 * west panel stays hidden. A phone shows the list, then the detail.
 */
class MailDomainsMain extends MainThreeColumnPanel {
    static config = {
        className: 'GO.maildomains.view.MailDomainsMain',
        cls      : ['go-maildomains'],
        // GOUI state ids ("maildomains-…")
        stateName: 'maildomains',
        /**
         * Route prefix, set by the shell (GO.view.MainView)
         * @member {String|null} moduleName=null
         */
        moduleName: null
    }

    /**
     * Domain to select once the grid has loaded (deep link or after create)
     * @member {String|null} pendingDomainId=null
     */
    pendingDomainId = null

    /**
     * Open dialogs: closing the module closes them too
     * @member {Set<GO.view.Dialog>} dialogs
     */
    dialogs = new Set()

    createWest() {
        return {ntype: 'container', hidden: true}
    }

    createCenter() {
        return {
            ntype : 'container',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Toolbar,
                cls   : ['go-bg-mid', 'go-border-bottom'],
                flex  : 'none',
                items : [{
                    module    : BoolCheckBox,
                    reference : 'showInactive',
                    valueLabel: t('Show inactive'),
                    flex      : 'none',
                    listeners : {change: ({value}) => this.onShowInactive(value)}
                }, '->', {
                    ntype    : 'component',
                    reference: 'ptrStatus',
                    cls      : ['go-md-ptr'],
                    flex     : 'none',
                    html     : ''
                }, {
                    module   : SearchButton,
                    listeners: {search: ({text}) => this.onSearch(text)}
                }, {
                    module   : Button,
                    icon     : 'add',
                    ui       : 'primary',
                    text     : t('Add'),
                    reference: 'addButton',
                    handler  : 'up.onAdd'
                }]
            }, {
                module   : Grid,
                reference: 'grid',
                flex     : 1,
                store    : {
                    module    : JmapStore,
                    entity    : 'MailDomain',
                    model     : MailDomainModel,
                    pageSize  : PAGE_SIZE,
                    scrollLoad: true,
                    // GOUI: inactive domains only with "show inactive"
                    jmapFilter: {active: true},
                    // GO sorts creator/modifier by name
                    sortProperties: {createdBy: 'creator', modifiedBy: 'modifier'},
                    sorters   : [{property: 'domain', direction: 'ASC'}],
                    properties: ['id', 'domain', 'description', 'userId', 'active', 'backupMx', 'mxStatus', 'dmarcStatus',
                                 'spfStatus', 'dkim', 'totalQuota', 'sumUsedQuota', 'sumUsage', 'createdAt', 'createdBy',
                                 'modifiedAt', 'modifiedBy', 'permissionLevel']
                },
                // GOUI DomainTable columns; right click on the header shows/hides them
                stateId: 'maildomains-table',
                columns: [{
                    dataField: 'id',
                    text     : 'ID',
                    cellAlign: 'right',
                    width    : 80,
                    hidden   : true
                }, {
                    dataField: 'domain',
                    text     : t('Domain'),
                    flex     : 1,
                    hideable : false,
                    renderer : ({value}) => escapeHtml(value)
                }, {
                    dataField: 'userId',
                    stateKey : 'owner',
                    text     : t('Owner'),
                    width    : 200,
                    hidden   : true,
                    sortable : false,
                    renderer : principalRenderer
                }, {
                    dataField: 'description',
                    text     : t('Description'),
                    width    : 200,
                    hidden   : true,
                    renderer : ({value}) => escapeHtml(value)
                }, {
                    dataField: 'totalQuota',
                    text     : t('Quota'),
                    width    : 100,
                    hidden   : true,
                    sortable : false,
                    renderer : quotaRenderer
                }, {
                    dataField: 'sumUsedQuota',
                    text     : t('Used quota'),
                    width    : 100,
                    hidden   : true,
                    sortable : false,
                    renderer : usageRenderer
                }, {
                    dataField: 'sumUsage',
                    text     : t('Usage'),
                    width    : 100,
                    hidden   : true,
                    sortable : false,
                    renderer : usageRenderer
                }, {
                    dataField: 'active',
                    text     : t('Active'),
                    width    : 100,
                    hidden   : true,
                    sortable : false,
                    renderer : yesNoRenderer
                }, {
                    dataField: 'backupMx',
                    text     : t('Backup MX'),
                    width    : 100,
                    hidden   : true,
                    sortable : false,
                    renderer : yesNoRenderer
                }, {
                    dataField: 'createdAt',
                    text     : t('Created at'),
                    cellAlign: 'right',
                    width    : 150,
                    hidden   : true,
                    renderer : dateRenderer
                }, {
                    dataField: 'createdBy',
                    stateKey : 'creator',
                    text     : t('Created by'),
                    width    : 160,
                    hidden   : true,
                    renderer : principalRenderer
                }, {
                    dataField: 'modifiedAt',
                    text     : t('Modified at'),
                    cellAlign: 'right',
                    width    : 150,
                    hidden   : true,
                    renderer : dateRenderer
                }, {
                    dataField: 'modifiedBy',
                    stateKey : 'modifier',
                    text     : t('Modified by'),
                    width    : 160,
                    hidden   : true,
                    renderer : principalRenderer
                }, {
                    // GOUI: the status column is "mxStatus" and shows the overall state
                    dataField: 'mxStatus',
                    text     : t('Status'),
                    cellAlign: 'center',
                    width    : 80,
                    sortable : false,
                    renderer : ({record}) => domainStatusHtml(record)
                }]
            }]
        }
    }

    createEast() {
        return {
            module   : DomainDetail,
            reference: 'detail'
        }
    }

    destroy(...args) {
        const store = this.getReference?.('grid')?.store;

        this.dialogs.forEach(dialog => dialog.isDestroyed || dialog.close());
        super.destroy(...args);
        // the grid only detaches its store; this one is ours and watches MailDomain
        store && !store.isDestroyed && store.destroy()
    }

    onConstructed() {
        super.onConstructed();

        let me     = this,
            grid   = me.getReference('grid'),
            store  = grid.store,
            detail = me.getReference('detail');

        me.setWestHidden(true);

        grid.view.selectionModel.on('selectionChange', me.onSelectionChange, me);
        // a click on the selected row shows it again (a phone after "close")
        grid.on('rowClick', ({record}) => {
            record && record.id === detail.domain?.id && me.activatePanel('east')
        });
        grid.on('rowDoubleClick', ({record}) => record && me.openDialog(record.id));

        store.on('load',      me.onDomainsLoad, me);
        store.on('loadMore',  me.loadNames, me);
        store.on('loadError', ({error}) => notifyError(me, error));
        grid.body.on('scrollEdge', () => store.loadMore().catch(() => {}));

        // GOUI createCenter(): back to the list on a phone
        detail.getReference('toolbar').insert(0, me.showCenterButton());
        detail.on('change', () => store.load({keepCount: true}).catch(() => {}));
        detail.on('delete', () => {
            me.activatePanel('center');
            me.moduleName && Neo.Main.setRoute({value: me.moduleName, windowId: me.windowId});
            store.load().catch(() => {})
        });

        store.load().catch(() => {}); // loadError shows it
        me.checkPtr()
    }

    /**
     * GOUI: the PTR records of the mail server's IPs (MailDomain/checkPtr)
     */
    async checkPtr() {
        let me = this,
            html;

        try {
            const response = await client.call('MailDomain/checkPtr', {}),
                  results  = Array.isArray(response) ? response : Object.values(response || {}),
                  ok       = results.every(rr => rr.status === 'SUCCESS');

            html = ok
                ? `<i class="go-icon go-md-success">check</i> ${escapeHtml(t('PTR OK'))}`
                : `<i class="go-icon go-md-warning">warning</i> ${escapeHtml(t('PTR error'))} (${escapeHtml(results.map(rr => rr.ip).join(' '))})`
        } catch (e) {
            html = `<i class="go-icon go-md-warning" title="${escapeHtml(e.message || String(e))}">warning</i> ${escapeHtml(t('PTR error'))}`
        }

        me.isDestroyed || (me.getReference('ptrStatus').html = html)
    }

    /**
     * Called by the shell for "#maildomains/<path>", e.g. "#maildomains/5"
     * @param {String} path
     */
    route(path) {
        const match = path.match(/^(\d+)$/);
        match && this.showDomain(match[1])
    }

    showDomain(id) {
        let me    = this,
            grid  = me.getReference('grid'),
            store = grid.store;

        me.activatePanel('east');

        if (store.get(id)) {
            me.pendingDomainId = null;
            selectRow(grid, id)
        } else {
            // not loaded (yet), inactive or on a later page: onDomainsLoad() selects it when it shows up
            me.pendingDomainId = id
        }

        me.getReference('detail').requestedId !== String(id) && me.getReference('detail').load(id)
    }

    onSelectionChange({records}) {
        let me     = this,
            domain = records[0] || null;

        if (!domain) {
            return
        }

        me.pendingDomainId = null;
        me.activatePanel('east');
        me.getReference('detail').requestedId !== String(domain.id) && me.getReference('detail').load(domain.id);

        me.moduleName && Neo.Main.setRoute({value: `${me.moduleName}/${domain.id}`, windowId: me.windowId})
    }

    async onDomainsLoad() {
        let me = this;

        if (me.isDestroyed) {
            return
        }

        const grid = me.getReference('grid'),
              id   = me.pendingDomainId || me.getReference('detail').domain?.id;

        me.pendingDomainId = null;
        id && grid.store.get(id) && selectRow(grid, id);

        me.loadNames()
    }

    /**
     * Names for the owner / created by / modified by columns, then the rows render again
     */
    async loadNames() {
        let me   = this,
            grid = me.getReference('grid');

        const ids = grid.store.items.flatMap(d => [d.userId, d.createdBy, d.modifiedBy]);

        if (await loadPrincipalNames(ids)) {
            !me.isDestroyed && !grid.isDestroyed && grid.body?.createViewData()
        }
    }

    onShowInactive(checked) {
        this.getReference('grid').store.setFilter({active: checked ? undefined : true}).catch(() => {})
    }

    onSearch(text) {
        this.getReference('grid').store.setFilter({text: text || undefined}).catch(() => {})
    }

    onAdd() {
        this.openDialog(null)
    }

    /**
     * @param {String|null} id null: new domain owned by the user
     */
    openDialog(id) {
        let me = this;

        me.dialogs.forEach(d => d.isDestroyed && me.dialogs.delete(d));

        const dialog = Neo.create(DomainDialog, {
            appName : me.appName,
            windowId: me.windowId,
            entityId: id,
            values  : {userId: client.user?.id, active: true, transport: 'virtual', defaultQuota: 0, totalQuota: 0,
                       maxAliases: 0, maxMailboxes: 0, backupMx: false}
        });

        me.dialogs.add(dialog);

        dialog.on('save', ({data, isNew}) => {
            if (me.isDestroyed) {
                return
            }

            if (isNew) {
                me.showDomain(data.id);
                me.getReference('grid').store.load().catch(() => {})
            } else {
                me.getReference('detail').onChanged()
            }
        })
    }
}

export default Neo.setupClass(MailDomainsMain);
