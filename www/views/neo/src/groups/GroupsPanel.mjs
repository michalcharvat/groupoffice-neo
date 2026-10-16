import Container     from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_DELETE, LEVEL_WRITE} from '../Acl.mjs';
import Button        from '../button/Button.mjs';
import SearchButton  from '../button/SearchButton.mjs';
import JmapStore     from '../data/JmapStore.mjs';
import GroupModel     from '../model/Group.mjs';
import Grid          from '../grid/Grid.mjs';
import {selectRow}   from '../grid/selectRow.mjs';
import client        from '../jmap/Client.mjs';
import MenuList      from '../menu/List.mjs';
import {notifyError} from '../Notify.mjs';
import {escapeHtml}  from '../Format.mjs';
import {fmt, t}      from '../Translate.mjs';
import ConfirmDialog from '../view/ConfirmDialog.mjs';

const PAGE_SIZE = 50;

/** member names shown per group (ExtJS: relation limit 5) */
const MEMBERS = 5;

/** Admins, Everyone and Internal: hard coded in the Group model, never deleted */
const SYSTEM_GROUPS = 3;

/**
 * System settings card "Groups" (go.groups.SystemSettingsGroupGrid), for users with the
 * core right mayChangeGroups: the groups they may write, with their first members. A row
 * opens the group dialog (name, members, permissions, modules); admins add groups and
 * set the default permissions of new groups. Changes are saved right away.
 */
class GroupsPanel extends Container {
    static config = {
        className: 'GO.groups.GroupsPanel',
        baseCls  : ['go-groups-panel', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    /** principal id → name */
    names = new Map()

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            flex  : 'none',
            cls   : ['go-groups-tbar'],
            items : ['->', {
                module   : SearchButton,
                listeners: {search: ({text}) => me.grid.store.setFilter({text: text || undefined}).catch(() => {})}
            }, {
                module  : Button,
                icon    : 'add',
                ui      : 'primary',
                text    : t('Add'),
                disabled: !client.isAdmin,
                handler : () => me.edit(null)
            }, {
                module  : Button,
                icon    : 'settings',
                tooltip : t('Group defaults'),
                disabled: !client.isAdmin,
                handler : () => me.openDefaults()
            }]
        }, {
            module   : Grid,
            reference: 'grid',
            cls      : ['go-groups-grid'],
            flex     : 1,
            stateId  : 'groups-grid',
            store    : {
                module    : JmapStore,
                entity    : 'Group',
                model     : GroupModel,
                pageSize  : PAGE_SIZE,
                scrollLoad: true,
                jmapFilter: {hideUsers: true, permissionLevel: LEVEL_WRITE},
                sorters   : [{property: 'name', direction: 'ASC'}],
                properties: ['id', 'name', 'users', 'isUserGroupFor', 'permissionLevel']
            },
            columns: [
                {dataField: 'id', text: 'ID', width: 80, hidden: true, renderer: ({value}) => escapeHtml(value)},
                {dataField: 'name', text: t('Name'), flex: 1, hideable: false, renderer: ({record}) => me.groupCell(record)},
                {dataField: 'isUserGroupFor', text: '', width: 48, sortable: false, hideable: false, cellAlign: 'center',
                 renderer: ({record}) => `<i class="go-icon go-groups-more" id="${me.id}__more__${escapeHtml(record.id)}" title="${escapeHtml(t('More options'))}">more_vert</i>`}
            ]
        }]
    }

    /**
     * @returns {GO.grid.Grid}
     */
    get grid() {
        return this.getReference('grid')
    }

    onConstructed() {
        super.onConstructed();

        let me   = this,
            grid = me.grid;

        grid.on('rowDoubleClick', ({record}) => record && me.edit(record.id));
        grid.body.on('scrollEdge', () => grid.store.loadMore().catch(() => {}));
        grid.store.on({
            load     : me.loadNames,
            loadMore : me.loadNames,
            loadError: ({error}) => notifyError(me, error),
            scope    : me
        });

        Neo.main.DomEvents.registerPreventDefaultTargets({name: 'contextmenu', cls: ['go-groups-grid'], windowId: me.windowId});
        grid.addDomListeners([
            {contextmenu: me.onRowMenu, scope: me},
            {click: me.onRowMenu, delegate: '.go-groups-more', scope: me}
        ])
    }

    /**
     * Called by the System settings dialog when it opens
     */
    load() {
        return this.grid.store.load().catch(() => {})
    }

    /**
     * @param {Object} group
     * @returns {String} HTML: name, first members
     * @protected
     */
    groupCell(group) {
        let me      = this,
            users   = group.users || [],
            members = users.slice(0, MEMBERS).map(id => me.names.get(String(id))).filter(Boolean).join(', '),
            more    = users.length - MEMBERS;

        more > 0 && (members += fmt(t(' and {count} more'), {count: more}));

        return `<div class="go-groups-cell"><div class="go-groups-name">${escapeHtml(group.name ?? '')}</div><small>${escapeHtml(members)}</small></div>`
    }

    /**
     * Member names of the loaded groups, then the rows render again
     * @protected
     */
    async loadNames() {
        let me   = this,
            grid = me.grid,
            ids  = new Set();

        grid.store.items.forEach(g => (g.users || []).slice(0, MEMBERS).forEach(id => me.names.has(String(id)) || ids.add(String(id))));

        if (!ids.size) {
            return
        }

        try {
            (await client.get('Principal', [...ids], ['id', 'name'])).forEach(p => me.names.set(String(p.id), p.name));
            ids.forEach(id => me.names.has(id) || me.names.set(id, ''))
        } catch (e) {
            return
        }

        !me.isDestroyed && !grid.isDestroyed && grid.body?.createViewData()
    }

    onRowMenu(data) {
        let me  = this,
            row = data.path?.find(node => node.cls?.includes('neo-grid-row') && node.data?.recordId),
            group = row && me.grid.store.get(row.data.recordId);

        if (!group) {
            return
        }

        selectRow(me.grid, group.id);

        MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : data.path[0]?.id,
            items   : [{
                text   : t('Edit'),
                icon   : 'edit',
                handler: () => me.edit(group.id)
            }, {
                separator: true
            }, {
                text    : t('Delete'),
                icon    : 'delete',
                // the system groups can't be deleted
                disabled: Number(group.id) <= SYSTEM_GROUPS || group.permissionLevel < LEVEL_DELETE,
                handler : () => me.remove(group)
            }]
        })
    }

    /**
     * @param {String|null} id null: new
     */
    async edit(id) {
        let me = this;

        const {default: GroupDialog} = await import('./GroupDialog.mjs');

        me.isDestroyed || Neo.create(GroupDialog, {appName: me.appName, windowId: me.windowId, entityId: id})
            .on('save', () => me.reload())
    }

    /**
     * Default permissions of new groups (go.defaultpermissions.ShareWindow for "Group")
     */
    async openDefaults() {
        let me = this;

        const {default: DefaultAclDialog} = await import('../defaultpermissions/DefaultAclDialog.mjs');

        me.isDestroyed || Neo.create(DefaultAclDialog, {appName: me.appName, windowId: me.windowId, forEntity: 'Group', entityTitle: t('Groups')})
    }

    reload() {
        this.isDestroyed || this.grid.store.load({keepCount: true}).catch(() => {})
    }

    /**
     * @param {Object} group
     */
    async remove(group) {
        let me = this;

        const yes = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Confirm delete'),
            message : fmt(t("Are you sure you want to delete '{item}'?"), {item: group.name})
        });

        if (!yes || me.isDestroyed) {
            return
        }

        try {
            await client.set('Group', {destroy: [group.id]});
            me.reload()
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(GroupsPanel);
