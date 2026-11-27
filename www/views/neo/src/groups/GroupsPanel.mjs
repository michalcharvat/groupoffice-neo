import Container     from '../../node_modules/neo.mjs/src/container/Base.mjs';
import {LEVEL_WRITE} from '../Acl.mjs';
import Button        from '../button/Button.mjs';
import JmapStore     from '../data/JmapStore.mjs';
import GroupModel     from '../model/Group.mjs';
import Grid          from '../grid/Grid.mjs';
import ListToolbar   from '../grid/ListToolbar.mjs';
import client        from '../jmap/Client.mjs';
import {notifyError} from '../Notify.mjs';
import {escapeHtml}  from '../Format.mjs';
import {fmt, t}      from '../Translate.mjs';

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

    /**
     * @summary Builds the toolbar and the groups grid.
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module    : ListToolbar,
            reference : 'listToolbar',
            flex      : 'none',
            toolbarCls: ['go-groups-tbar'],
            endItems  : [{
                module  : Button,
                icon    : 'add',
                ui      : 'primary',
                text    : t('Add'),
                disabled: !client.isAdmin,
                handler : () => me.grid.openDialog({entityId: null})
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
            multiSelect: true,
            flex     : 1,
            stateId  : 'groups-grid',
            entityActions: {
                dialog   : () => import('./GroupDialog.mjs'),
                // the system groups can't be deleted
                mayDelete: group => Number(group.id) > SYSTEM_GROUPS
            },
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
                Grid.rowMenuColumn()
            ]
        }]
    }

    /**
     * @returns {GO.grid.Grid}
     */
    get grid() {
        return this.getReference('grid')
    }

    /**
     * @summary Wires the paging, the member names and the load errors of the grid.
     */
    onConstructed() {
        super.onConstructed();

        let me   = this,
            grid = me.grid;

        me.getReference('listToolbar').setGrid(grid);
        grid.body.on('scrollEdge', () => grid.store.loadMore().catch(() => {}));
        grid.store.on({
            load     : me.loadNames,
            loadMore : me.loadNames,
            loadError: ({error}) => notifyError(me, error),
            scope    : me
        })
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

    /**
     * Default permissions of new groups (go.defaultpermissions.ShareWindow for "Group")
     */
    async openDefaults() {
        let me = this;

        const {default: DefaultAclDialog} = await import('../defaultpermissions/DefaultAclDialog.mjs');

        me.isDestroyed || Neo.create(DefaultAclDialog, {appName: me.appName, windowId: me.windowId, forEntity: 'Group', entityTitle: t('Groups')})
    }
}

export default Neo.setupClass(GroupsPanel);
