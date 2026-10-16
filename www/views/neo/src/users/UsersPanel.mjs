import Container     from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../button/Button.mjs';
import SearchButton  from '../button/SearchButton.mjs';
import {alertBlobId, dismissAlert, runBackgroundJob} from '../data/backgroundJob.mjs';
import JmapStore     from '../data/JmapStore.mjs';
import UserModel     from '../model/User.mjs';
import Grid          from '../grid/Grid.mjs';
import {selectRow}   from '../grid/selectRow.mjs';
import client        from '../jmap/Client.mjs';
import MenuList      from '../menu/List.mjs';
import {notify, notifyError} from '../Notify.mjs';
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
 * Not ported: import (CSV / JSON / XLSX mapping) and the permissions overview.
 */
class UsersPanel extends Container {
    static config = {
        className: 'GO.users.UsersPanel',
        baseCls  : ['go-users-panel', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            flex  : 'none',
            cls   : ['go-users-tbar'],
            items : [{
                module   : Button,
                reference: 'showDisabled',
                icon     : 'person_off',
                text     : t('Show disabled'),
                handler  : () => me.toggleDisabled()
            }, '->', {
                module   : SearchButton,
                listeners: {search: ({text}) => me.setFilter({text: text || undefined})}
            }, {
                module : Button,
                icon   : 'add',
                ui     : 'primary',
                text   : t('Add'),
                handler: () => me.create()
            }, {
                module   : Button,
                reference: 'moreButton',
                icon     : 'more_vert',
                tooltip  : t('More options'),
                handler  : () => me.showMoreMenu()
            }]
        }, {
            module   : Grid,
            reference: 'grid',
            cls      : ['go-users-grid'],
            flex     : 1,
            stateId  : 'users-grid',
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
                {dataField: 'username', text: '', width: 48, sortable: false, hideable: false, cellAlign: 'center',
                 renderer: ({record}) => `<i class="go-icon go-users-more" id="${me.id}__more__${escapeHtml(record.id)}" title="${escapeHtml(t('More options'))}">more_vert</i>`}
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
        grid.store.on('loadError', ({error}) => notifyError(me, error));

        Neo.main.DomEvents.registerPreventDefaultTargets({name: 'contextmenu', cls: ['go-users-grid'], windowId: me.windowId});
        grid.addDomListeners([
            {contextmenu: me.onGridContextMenu, scope: me},
            {click: me.onMoreClick, delegate: '.go-users-more', scope: me}
        ])
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
     * @param {Object} data DOM event
     * @returns {Object|null} the row's user
     * @protected
     */
    recordOf(data) {
        const row = data.path?.find(node => node.cls?.includes('neo-grid-row') && node.data?.recordId);
        return row ? this.grid.store.get(row.data.recordId) : null
    }

    onGridContextMenu(data) {
        const record = this.recordOf(data);
        record && this.showRowMenu(record, data.path[0]?.id)
    }

    onMoreClick(data) {
        const record = this.recordOf(data);
        record && this.showRowMenu(record, data.path[0]?.id)
    }

    /**
     * Edit, login as, archive, delete (SystemSettingsUserGrid.initMoreMenu())
     * @param {Object} user
     * @param {String} target DOM id the menu aligns to
     */
    showRowMenu(user, target) {
        let me = this;

        selectRow(me.grid, user.id);

        MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target,
            items   : [{
                text   : t('Edit'),
                icon   : 'edit',
                handler: () => me.edit(user.id)
            }, {
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
            }, {
                text    : t('Delete'),
                icon    : 'delete',
                disabled: !client.isAdmin,
                handler : () => me.remove(user)
            }]
        })
    }

    showMoreMenu() {
        let me     = this,
            export_ = extension => () => me.exportUsers(extension);

        MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : me.getReference('moreButton').id,
            items   : [{
                text    : t('User defaults'),
                icon    : 'settings',
                disabled: !client.isAdmin,
                handler : () => me.openDefaults()
            }, {
                separator: true
            }, {
                text : t('Export'),
                icon : 'cloud_download',
                items: [
                    {text: 'Microsoft Excel',         icon: 'table_view', handler: export_('xlsx')},
                    {text: 'Comma Separated Values',  icon: 'csv',        handler: export_('csv')},
                    {text: 'JSON',                    icon: 'data_object', handler: export_('json')}
                ]
            }]
        })
    }

    /**
     * Account dialog of a user (go.usersettings.UserSettingsDialog with an id)
     * @param {String} id
     */
    async edit(id) {
        let me = this;

        const {default: UserSettingsDialog} = await import('../usersettings/UserSettingsDialog.mjs');

        if (me.isDestroyed) {
            return
        }

        Neo.create(UserSettingsDialog, {appName: me.appName, windowId: me.windowId, entityId: id})
            .on('save', () => me.reload())
    }

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
                me.edit(id)
            })
    }

    async openDefaults() {
        let me = this;

        const {default: UserDefaultsDialog} = await import('./UserDefaultsDialog.mjs');

        me.isDestroyed || Neo.create(UserDefaultsDialog, {appName: me.appName, windowId: me.windowId})
    }

    reload() {
        this.isDestroyed || this.grid.store.load({keepCount: true}).catch(() => {})
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
     * @param {Object} user
     */
    async remove(user) {
        let me = this;

        const yes = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Confirm delete'),
            message : fmt(t("Are you sure you want to delete '{item}'?"), {item: user.displayName || user.username})
        });

        if (!yes || me.isDestroyed) {
            return
        }

        try {
            await client.set('User', {destroy: [user.id]});
            me.reload()
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * go.util.exportToFile('User', query, extension): runs in the background, its alert links the file
     * @param {String} extension xlsx, csv or json
     */
    async exportUsers(extension) {
        let me    = this,
            store = me.grid.store;

        try {
            const {ids} = await client.call('User/query', {filter: store.getJmapFilter(), sort: store.getJmapSort()});

            if (!ids.length) {
                throw new Error(t("There's nothing to export"))
            }

            const job = runBackgroundJob(() => client.call('User/export', {extension, ids}));

            notify(me, t('You will be notified when the export is complete. You can close this window now.'), {title: t('Export in progress')});

            const alert  = await job,
                  blobId = alertBlobId(alert);

            dismissAlert(alert);

            if (!blobId) {
                throw new Error(String(alert.data?.body || alert.data?.title || t('Error')).replace(/<[^>]*>/g, ' '))
            }

            me.isDestroyed || Neo.Main.redirectTo({url: client.baseUrl + 'api/download.php?blob=' + encodeURIComponent(blobId), windowId: me.windowId})
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }
}

export default Neo.setupClass(UsersPanel);
