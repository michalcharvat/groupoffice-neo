import Container     from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Button        from '../button/Button.mjs';
import JmapStore     from '../data/JmapStore.mjs';
import UserModel     from '../model/User.mjs';
import Grid          from '../grid/Grid.mjs';
import ListToolbar   from '../grid/ListToolbar.mjs';
import client        from '../jmap/Client.mjs';
import {notifyError} from '../Notify.mjs';
import {avatarHtml, escapeHtml, formatUserDateTime, smartDateTime} from '../Format.mjs';
import {fmt, t}      from '../Translate.mjs';
import ConfirmDialog from '../view/ConfirmDialog.mjs';

const PAGE_SIZE = 50;

const date = ({value}) => value ? `<span title="${escapeHtml(formatUserDateTime(value))}">${escapeHtml(smartDateTime(value))}</span>` : '';

/**
 * Avatar, display name and user name (go.users.SystemSettingsUserGrid "Name" column)
 * @param {Object} user
 * @returns {String} HTML
 */
function userCell(user) {
    const name   = String(user.displayName ?? ''),
          avatar = user.avatarId
              ? `<img class="go-avatar go-avatar-small" alt="" src="${escapeHtml(client.baseUrl + 'api/thumb.php?blob=' + encodeURIComponent(user.avatarId) + '&w=64&h=64&zc=1')}">`
              : avatarHtml(name, ['go-avatar-small']);

    return `<div class="go-users-user${user.enabled ? '' : ' go-users-disabled'}">${avatar}<div class="go-users-text">`
        + `<div class="go-users-name">${escapeHtml(name)}</div><small>${escapeHtml(user.username ?? '')}</small></div></div>`
}

/**
 * System settings card "Users" (go.users.SystemSettingsUserGrid), for user managers
 * (core right mayChangeUsers): all users, disabled ones on request, searchable. A row
 * opens the user's account dialog; its menu (⋮ or right click) logs in as the user
 * (admins), archives or deletes them. The ⋮ of the toolbar has the user defaults and
 * the export. Changes are saved right away, not with the dialog's Save.
 *
 * The permissions overview (admins) opens GO.permissions.AclOverviewDialog.
 */
class UsersPanel extends Container {
    static config = {
        className: 'GO.users.UsersPanel',
        baseCls  : ['go-users-panel', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    /**
     * @summary Builds the toolbar and the users grid.
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module       : ListToolbar,
            reference    : 'listToolbar',
            flex         : 'none',
            toolbarCls   : ['go-users-tbar'],
            exportFormats: ['xlsx', 'csv', 'json'],
            moreItems    : items => me.moreItems(items),
            startItems   : [{
                module   : Button,
                reference: 'showDisabled',
                pressed  : false, // a toggle: neo 14 renders aria-pressed only for a boolean
                icon     : 'person_off',
                text     : t('Show disabled'),
                handler  : () => me.toggleDisabled()
            }],
            endItems: [{
                module : Button,
                icon   : 'add',
                ui     : 'primary',
                text   : t('Add'),
                handler: () => me.create()
            }]
        }, {
            module   : Grid,
            reference: 'grid',
            cls      : ['go-users-grid'],
            multiSelect: true,
            rowLines : 2, // avatar, name + user name
            flex     : 1,
            stateId  : 'users-grid',
            entityActions: {
                dialog      : () => import('../usersettings/UserSettingsDialog.mjs'),
                displayField: 'displayName',
                // the own account is never deleted
                mayDelete   : user => client.isAdmin && String(user.id) !== String(client.user?.id),
                rowMenuItems: (user, items) => me.rowMenuItems(user, items)
            },
            store    : {
                module    : JmapStore,
                entity    : 'User',
                model     : UserModel,
                pageSize  : PAGE_SIZE,
                scrollLoad: true,
                sorters   : [{property: 'displayName', direction: 'ASC'}],
                properties: ['id', 'username', 'displayName', 'avatarId', 'loginCount', 'authenticators',
                             'enabled', 'createdAt', 'modifiedAt', 'lastLogin']
            },
            columns: [
                {dataField: 'displayName', text: t('Name'), flex: 1, hideable: false, renderer: ({record}) => userCell(record)},
                {dataField: 'createdAt',  text: t('Created at'),  width: 150, renderer: date},
                {dataField: 'modifiedAt', text: t('Modified at'), width: 150, renderer: date, hidden: true},
                {dataField: 'lastLogin',  text: t('Last login'),  width: 150, renderer: date},
                {dataField: 'loginCount', text: t('Logins'), width: 90, cellAlign: 'right', renderer: ({value}) => escapeHtml(value ?? '')},
                {dataField: 'authenticators', text: t('Authentication'), width: 140, sortable: false,
                 renderer: ({value}) => escapeHtml((value || []).join(', '))},
                {dataField: 'id', text: 'ID', width: 80, hidden: true, renderer: ({value}) => escapeHtml(value)},
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
     * @summary Wires the paging and the load errors of the grid.
     */
    onConstructed() {
        super.onConstructed();

        let me   = this,
            grid = me.grid;

        me.getReference('listToolbar').setGrid(grid);
        grid.body.on('scrollEdge', () => grid.store.loadMore().catch(() => {}));
        grid.store.on('loadError', ({error}) => notifyError(me, error))
    }

    /**
     * Called by the System settings dialog when it opens
     */
    load() {
        return this.grid.store.load().catch(() => {})
    }

    /**
     * @param {Object} filter
     */
    setFilter(filter) {
        this.grid.store.setFilter(filter).catch(() => {})
    }

    toggleDisabled() {
        const button = this.getReference('showDisabled');

        button.pressed = !button.pressed;
        this.setFilter({showDisabled: button.pressed || undefined})
    }

    /**
     * @summary The row menu (SystemSettingsUserGrid.initMoreMenu()): Edit, login as, archive, Delete.
     * @param {Object} user
     * @param {Object} items the grid's edit and delete items
     * @returns {Object[]}
     */
    rowMenuItems(user, items) {
        let me = this;

        return [items.edit, {
            text    : t('Login as this user'),
            icon    : 'swap_horiz',
            disabled: !client.isAdmin || !user.enabled || String(user.id) === String(client.user?.id),
            handler : () => me.loginAs(user)
        }, {
            separator: true
        }, {
            text    : t('Archive user'),
            icon    : 'archive',
            disabled: !client.mayChangeUsers,
            handler : () => me.archive(user)
        }, items.delete]
    }

    /**
     * @summary The toolbar ⋮: user defaults, import, export, delete selected, permissions overview.
     * @param {Object} items the list toolbar's export and delete items
     * @returns {Object[]}
     */
    moreItems(items) {
        let me = this;

        return [{
            text    : t('User defaults'),
            icon    : 'settings',
            disabled: !client.isAdmin,
            handler : () => me.openDefaults()
        }, {
            separator: true
        }, {
            text    : t('Import'),
            icon    : 'cloud_upload',
            disabled: !client.mayChangeUsers,
            handler : () => me.openImport()
        }, items.export, items.delete, {
            separator: true
        }, {
            text    : t('Permissions overview'),
            icon    : 'share',
            disabled: !client.isAdmin, // Acl/overview: admins only
            handler : () => me.openAclOverview()
        }]
    }

    async openAclOverview() {
        let me = this;

        const {default: AclOverviewDialog} = await import('../permissions/AclOverviewDialog.mjs');

        me.isDestroyed || AclOverviewDialog.show({appName: me.appName, windowId: me.windowId})
    }

    /**
     * @summary Opens the create-user wizard, then the new user's account dialog.
     */
    async create() {
        let me = this;

        const {default: CreateUserDialog} = await import('./CreateUserDialog.mjs');

        if (me.isDestroyed) {
            return
        }

        // go.users.CreateUserWizard opens the new user's account dialog when done
        Neo.create(CreateUserDialog, {appName: me.appName, windowId: me.windowId})
            .on('save', ({id}) => {
                me.reload();
                me.isDestroyed || me.grid.openDialog({entityId: id})
            })
    }

    async openDefaults() {
        let me = this;

        const {default: UserDefaultsDialog} = await import('./UserDefaultsDialog.mjs');

        me.isDestroyed || Neo.create(UserDefaultsDialog, {appName: me.appName, windowId: me.windowId})
    }

    /**
     * @summary Reloads the users as far as they were loaded.
     */
    reload() {
        this.isDestroyed || this.grid.reloadEntities()
    }

    /**
     * User/loginAs: the session's token switches to the user, every window reloads as them.
     * There is no way back but logging out.
     * @param {Object} user
     */
    async loginAs(user) {
        let me = this;

        const yes = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Login as this user'),
            message : fmt(t('Login as {name}? You will have to log out to return to your own account.'), {name: user.displayName || user.username})
        });

        if (!yes || me.isDestroyed) {
            return
        }

        try {
            const result = await client.call('User/loginAs', {userId: user.id});

            if (!result?.success) {
                throw new Error(t('Failed to login as this user'))
            }

            Object.keys(Neo.apps || {}).forEach(windowId => Neo.Main.redirectTo({url: client.baseUrl, windowId}))
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * Disables the user, drops their group memberships and hides their items
     * @param {Object} user
     */
    async archive(user) {
        let me = this;

        if (String(user.id) === String(client.user?.id)) {
            notifyError(me, new Error(t("You can't archive yourself")));
            return
        }

        const yes = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Confirm'),
            message : t('Archiving a user will disable them, revoke all group memberships and make their items invisible. Are you sure?')
        });

        if (!yes || me.isDestroyed) {
            return
        }

        try {
            await client.set('User', {update: {[user.id]: {enabled: false, archive: true}}});
            me.reload()
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * go.util.importFile('User', '.csv, .json, .xlsx'): CSV and Excel go through the column mapping
     */
    async openImport() {
        const {default: ImportFileDialog} = await import('../import/ImportFileDialog.mjs');

        Neo.create(ImportFileDialog, {
            appName : this.appName,
            windowId: this.windowId,
            entity  : 'User',
            accept  : '.csv,.json,.xlsx',
            options : {labels: {
                username     : t('Username'),
                displayName  : t('Display name'),
                password     : t('Password'),
                email        : t('E-mail'),
                recoveryEmail: t('Recovery e-mail'),
                groups       : t('Groups')
            }}
        })
    }
}

export default Neo.setupClass(UsersPanel);
