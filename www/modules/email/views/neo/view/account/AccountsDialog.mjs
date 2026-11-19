import Toolbar       from '../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import TextField     from '../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import {LEVEL_DELETE, LEVEL_WRITE} from '../../../../../../views/neo/src/Acl.mjs';
import Button        from '../../../../../../views/neo/src/button/Button.mjs';
import {escapeHtml}  from '../../../../../../views/neo/src/Format.mjs';
import ActionTable   from '../../../../../../views/neo/src/list/ActionTable.mjs';
import {notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import {t as coreT}  from '../../../../../../views/neo/src/Translate.mjs';
import ConfirmDialog from '../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import Dialog        from '../../../../../../views/neo/src/view/Dialog.mjs';
import {t}           from '../../util.mjs';
import * as accountApi from './accountApi.mjs';
import {centered}    from './RecordDialog.mjs';

/** Sortable columns of email/account/store */
const SORT_FIELDS = ['email', 'username', 'host', 'smtp_host'];

/**
 * "Accounts" (ExtJS GO.email.AccountsDialog / AccountsGrid): the accounts the user may change
 * (email/account/store with permissionLevel WRITE), search, sort by a column, add (write
 * permission on the e-mail module), edit (pencil or double click), delete.
 *
 * Fires `changed` after an add, edit or delete: the e-mail tree reloads.
 */
class AccountsDialog extends Dialog {
    static config = {
        className   : 'GO.email.account.AccountsDialog',
        cls         : ['go-email-accounts-dialog'],
        modal       : true,
        resizable   : true,
        title       : t('Accounts'),
        wrapperStyle: centered(820, 520),
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        }
    }

    /**
     * @member {Object} sort={field, dir}
     */
    sort = {field: 'email', dir: 'ASC'}

    /**
     * email/account/clientSettings
     * @member {Object} settings={}
     */
    settings = {}

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            cls   : ['go-border-bottom'],
            flex  : 'none',
            items : [{
                module         : TextField,
                reference      : 'search',
                cls            : ['go-email-accounts-search'],
                placeholderText: coreT('Search'),
                hideLabel      : true,
                flex           : 1,
                listeners      : {change: () => me.onSearch()}
            }, {
                module   : Button,
                reference: 'sortButton',
                icon     : 'sort',
                text     : coreT('Sort'),
                menu     : SORT_FIELDS.map(field => ({text: me.columnText(field), handler: () => me.setSort(field)}))
            }, {
                module   : Button,
                reference: 'addButton',
                icon     : 'add',
                text     : coreT('Add'),
                disabled : true,
                handler  : () => me.openAccount(null)
            }]
        }, {
            // a scrolling box: the table itself would stretch its rows over the height
            ntype: 'container',
            cls  : ['go-scroll'],
            flex : 1,
            items: [{
                module   : ActionTable,
                reference: 'table',
                flex     : 'none',
                columns  : [
                    {text: coreT('E-mail'), field: 'email', flex: true},
                    {text: coreT('Username'), field: 'username'},
                    {text: coreT('Owner'), field: 'user_name'},
                    {text: t('Host'), field: 'host'},
                    {text: 'SMTP', field: 'smtp_host'}
                ],
                actions  : [
                    {action: 'edit', icon: 'edit', tooltip: coreT('Edit')},
                    {action: 'delete', icon: 'delete', tooltip: coreT('Delete'), disabled: r => +r.permission_level > 0 && +r.permission_level < LEVEL_DELETE}
                ]
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me    = this,
            table = me.getReference('table');

        table.on('action', ({action, record}) => action === 'edit' ? me.openAccount(record) : me.deleteAccount(record));
        table.on('rowDoubleClick', ({record}) => me.openAccount(record));

        accountApi.clientSettings().then(settings => {
            me.settings = settings;
            me.isDestroyed || (me.getReference('addButton').disabled = !settings.module_write)
        }).catch(e => notifyError(me, e));

        me.load()
    }

    /**
     * @param {String} field
     * @returns {String}
     */
    columnText(field) {
        return {email: coreT('E-mail'), username: coreT('Username'), host: t('Host'), smtp_host: 'SMTP'}[field] || field
    }

    /**
     * Sorts by the field; the same field again turns the direction
     * @param {String} field
     */
    setSort(field) {
        let me = this;

        me.sort = {field, dir: me.sort.field === field && me.sort.dir === 'ASC' ? 'DESC' : 'ASC'};
        me.load()
    }

    onSearch() {
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => this.isDestroyed || this.load(), 300)
    }

    destroy(...args) {
        clearTimeout(this.searchTimer);
        super.destroy(...args)
    }

    async load() {
        let me    = this,
            query = String(me.getReference('search').value || '').trim(),
            // overlapping loads (typing, sorting): only the last one fills the table
            run   = me.loadRun = (me.loadRun || 0) + 1;

        try {
            const {results = []} = await accountApi.accountStore({
                permissionLevel: LEVEL_WRITE,
                sort           : me.sort.field,
                dir            : me.sort.dir,
                limit          : 0,
                ...query ? {query: '%' + query + '%'} : {}
            });

            me.isDestroyed || run !== me.loadRun || (me.getReference('table').records = results)
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * @param {Object|null} record null for a new account
     */
    async openAccount(record) {
        let me = this;

        const {openAccountDialog} = await import('./accountActions.mjs');

        if (await openAccountDialog(me, record?.id || null) && !me.isDestroyed) {
            me.load();
            me.fire('changed')
        }
    }

    async deleteAccount(record) {
        let me = this;

        const ok = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : escapeHtml(coreT('Are you sure you want to delete the selected item?')) + '<br><br>' + escapeHtml(record.email || '')
        });

        if (!ok || me.isDestroyed) {
            return
        }

        try {
            await accountApi.deleteAccount(record.id);
            me.load();
            me.fire('changed')
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(AccountsDialog);
