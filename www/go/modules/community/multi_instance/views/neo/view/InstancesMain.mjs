import Container     from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar       from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../../../views/neo/src/button/Button.mjs';
import SearchButton  from '../../../../../../../views/neo/src/button/SearchButton.mjs';
import JmapStore     from '../../../../../../../views/neo/src/data/JmapStore.mjs';
import Grid          from '../../../../../../../views/neo/src/grid/Grid.mjs';
import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {notify, notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import ConfirmDialog from '../../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import {escapeHtml, formatUserDateTime, smartDateTime} from '../../../../../../../views/neo/src/Format.mjs';
import {fmt, t as coreT, translator} from '../../../../../../../views/neo/src/Translate.mjs';
import InstanceDialog from './InstanceDialog.mjs';

const t = translator('community', 'multi_instance');

const PAGE_SIZE = 50;

const text   = ({value}) => escapeHtml(value ?? ''),
      date   = ({value}) => value ? `<span title="${escapeHtml(formatUserDateTime(value))}">${escapeHtml(smartDateTime(value))}</span>` : '',
      number = ({value}) => escapeHtml(value ?? '');

/**
 * Bytes as GO shows them (GO.util.format.fileSize)
 * @param {Number|null} bytes
 * @returns {String}
 */
function fileSize(bytes) {
    if (bytes === null || bytes === undefined || bytes === '') {
        return ''
    }

    const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
    let size = Number(bytes), i = 0;

    while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++
    }

    return (i ? size.toFixed(1) : size) + ' ' + units[i]
}

/**
 * Multi instance module (multi_instance MainPanel): the GO instances this server hosts.
 * Toolbar filters (disabled, trials), search, add; the selected instances can be edited,
 * (de)activated, deleted or e-mailed.
 */
class InstancesMain extends Container {
    static config = {
        className : 'GO.multi_instance.view.InstancesMain',
        baseCls   : ['go-multi-instance', 'neo-container'],
        layout    : {ntype: 'vbox', align: 'stretch'},
        /**
         * Route prefix, set by the shell
         * @member {String|null} moduleName=null
         */
        moduleName: null
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            flex  : 'none',
            cls   : ['go-bg-mid', 'go-border-bottom'],
            items : [{
                module   : Button,
                reference: 'showDisabled',
                icon     : 'block',
                text     : t('Show disabled'),
                handler  : () => me.toggleFilter('showDisabled')
            }, {
                module   : Button,
                reference: 'showTrials',
                icon     : 'star',
                text     : t('Show trials'),
                pressed  : true,
                handler  : () => me.toggleFilter('showTrials')
            }, '->', {
                module   : Button,
                reference: 'editButton',
                icon     : 'edit',
                tooltip  : coreT('Edit'),
                disabled : true,
                handler  : () => me.edit(me.getSelected()[0]?.id)
            }, {
                module   : Button,
                reference: 'activateButton',
                icon     : 'block',
                tooltip  : t('Deactivate instance'),
                disabled : true,
                handler  : () => me.toggleEnabled()
            }, {
                module   : Button,
                reference: 'emailButton',
                icon     : 'email',
                tooltip  : t('E-mail selected'),
                disabled : true,
                handler  : () => me.emailSelected()
            }, {
                module   : Button,
                reference: 'deleteButton',
                icon     : 'delete',
                tooltip  : coreT('Delete'),
                disabled : true,
                handler  : () => me.deleteSelected()
            }, {
                module   : SearchButton,
                listeners: {search: ({text}) => me.setFilter({text: text || undefined})}
            }, {
                module : Button,
                icon   : 'add',
                ui     : 'primary',
                tooltip: coreT('Add'),
                handler: () => me.edit(null)
            }, {
                module : Button,
                icon   : 'more_vert',
                tooltip: coreT('More options'),
                menu   : {items: [{
                    text   : t('Download site config'),
                    icon   : 'download',
                    handler: () => Neo.Main.windowOpen({
                        url       : client.baseUrl + 'api/download.php?blob=community/multi_instance/siteConfig',
                        windowName: '_blank',
                        windowId  : me.windowId
                    })
                }]}
            }]
        }, {
            module     : Grid,
            reference  : 'grid',
            flex       : 1,
            multiSelect: true,
            stateId    : 'multi_instance-grid',
            store      : {
                module    : JmapStore,
                entity    : 'Instance',
                pageSize  : PAGE_SIZE,
                scrollLoad: true,
                jmapFilter: {enabled: true},
                sorters   : [{property: 'hostname', direction: 'ASC'}],
                properties: ['id', 'hostname', 'userCount', 'createdAt', 'lastLogin', 'adminDisplayName', 'adminEmail',
                             'enabled', 'loginCount', 'usersMax', 'version', 'isTrial', 'storageUsage', 'storageQuota']
            },
            columns: [
                {dataField: 'id', text: 'ID', width: 60, hidden: true, renderer: number},
                {dataField: 'hostname', text: t('Hostname'), flex: 1, hideable: false,
                 renderer: ({record}) => `<span class="${record.enabled ? '' : 'go-deactivated'}">${escapeHtml(record.hostname)}</span>`},
                {dataField: 'isTrial', text: t('Trial'), width: 70, cellAlign: 'center',
                 renderer: ({value}) => value ? '<i class="go-icon">check</i>' : ''},
                {dataField: 'createdAt', text: coreT('Created at'), width: 140, cellAlign: 'right', renderer: date},
                {dataField: 'lastLogin', text: t('Last login'), width: 140, cellAlign: 'right', renderer: date},
                {dataField: 'userCount', text: t('User count'), width: 110, cellAlign: 'right', renderer: number},
                {dataField: 'usersMax', text: t('Maximum users'), width: 120, cellAlign: 'right', renderer: number},
                {dataField: 'loginCount', text: t('Login count'), width: 110, cellAlign: 'right', renderer: number},
                {dataField: 'adminDisplayName', text: t('Admin name'), width: 160, renderer: text},
                {dataField: 'adminEmail', text: t('Admin E-mail'), width: 200, renderer: text},
                {dataField: 'storageQuota', text: t('Storage quota'), width: 120, cellAlign: 'right', renderer: ({value}) => escapeHtml(fileSize(value))},
                {dataField: 'storageUsage', text: t('Storage usage'), width: 120, cellAlign: 'right', renderer: ({value}) => escapeHtml(fileSize(value))},
                {dataField: 'version', text: t('Version'), width: 100, renderer: text}
            ]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me   = this,
            grid = me.getReference('grid');

        grid.view.selectionModel.on('selectionChange', () => me.onSelectionChange());
        grid.on('rowDoubleClick', ({record}) => record && me.edit(record.id));
        grid.body.on('scrollEdge', () => grid.store.loadMore().catch(() => {}));
        grid.store.on('loadError', ({error}) => notifyError(me, error));

        client.watch(['Instance']);
        grid.store.load().catch(() => {})
    }

    /**
     * @returns {Object[]} selected records
     */
    getSelected() {
        return this.getReference('grid').getSelectedRecords()
    }

    onSelectionChange() {
        let me       = this,
            selected = me.getSelected(),
            one      = selected.length === 1;

        me.getReference('editButton').disabled     = !one;
        me.getReference('activateButton').disabled = !one;
        me.getReference('emailButton').disabled    = !selected.length;
        me.getReference('deleteButton').disabled   = !selected.length;

        one && (me.getReference('activateButton').tooltip = selected[0].enabled ? t('Deactivate instance') : t('Activate instance'))
    }

    /**
     * @param {Object} filter
     */
    setFilter(filter) {
        this.getReference('grid').store.setFilter(filter).catch(() => {})
    }

    /**
     * "Show disabled" / "Show trials" toggle buttons
     * @param {String} reference
     */
    toggleFilter(reference) {
        let me     = this,
            button = me.getReference(reference);

        button.pressed = !button.pressed;

        reference === 'showDisabled'
            ? me.setFilter({enabled: button.pressed ? undefined : true})
            : me.setFilter({isTrial: button.pressed ? undefined : false})
    }

    /**
     * @param {String|null} id null: new
     */
    edit(id) {
        let me     = this,
            dialog = Neo.create(InstanceDialog, {appName: me.appName, windowId: me.windowId, entityId: id || null});

        dialog.on('save', () => me.getReference('grid').store.load({keepCount: true}).catch(() => {}))
    }

    async toggleEnabled() {
        let me       = this,
            [record] = me.getSelected();

        if (!record) {
            return
        }

        try {
            await client.set('Instance', {update: {[record.id]: {enabled: !record.enabled}}});
            me.getReference('grid').store.load({keepCount: true}).catch(() => {})
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * ExtJS "E-mail selected": the administrators' addresses to copy
     */
    emailSelected() {
        const addresses = [...new Set(this.getSelected().filter(r => r.adminEmail)
            .map(r => `"${(r.adminDisplayName || '').replace(/"/g, '\\"')}" <${r.adminEmail}>`))];

        notify(this, addresses.join(', ') || coreT('No items to display'), {title: 'E-mail addresses', closable: true})
    }

    async deleteSelected() {
        let me       = this,
            selected = me.getSelected();

        if (!selected.length) {
            return
        }

        const yes = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : coreT('Confirm delete'),
            message : selected.length === 1
                ? fmt(coreT("Are you sure you want to delete '{item}'?"), {item: selected[0].hostname})
                : fmt(coreT('Are you sure you want to delete the {count} selected items?'), {count: selected.length})
        });

        if (!yes || me.isDestroyed) {
            return
        }

        try {
            await client.set('Instance', {destroy: selected.map(r => r.id)});
            me.getReference('grid').store.load().catch(() => {})
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(InstancesMain);
