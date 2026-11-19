import Container     from '../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar       from '../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../../views/neo/src/button/Button.mjs';
import {escapeHtml}  from '../../../../../../views/neo/src/Format.mjs';
import ActionTable   from '../../../../../../views/neo/src/list/ActionTable.mjs';
import {notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import {t as coreT}  from '../../../../../../views/neo/src/Translate.mjs';
import ConfirmDialog from '../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import {t}           from '../../util.mjs';
import * as accountApi from './accountApi.mjs';

/**
 * The records of one legacy store of an account in a card of the account dialog: aliases,
 * filters or labels (ExtJS AliasesGrid, FilterGrid, LabelsGrid). Add, edit (pencil or double
 * click), delete; with `sortable` move up / down (filter priority, email/filter/saveSort).
 *
 *     {module: RecordsPanel, legacyController: 'alias', dialog: AliasDialog, columns: [...]}
 *     panel.setAccount(accountId, readOnly)
 *
 * Fires `changed` after an add, edit, delete or move.
 */
class RecordsPanel extends Container {
    static config = {
        className: 'GO.email.account.RecordsPanel',
        cls      : ['go-email-records-panel'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * 'alias' | 'filter' | 'label'
         * @member {String|null} legacyController=null
         */
        legacyController: null,
        /**
         * RecordDialog subclass that edits one record
         * @member {Object|null} dialog=null
         */
        dialog: null,
        /**
         * ActionTable columns
         * @member {Object[]} columns=[]
         */
        columns: [],
        /**
         * Move up / down buttons (filters)
         * @member {Boolean} sortable=false
         */
        sortable: false,
        /**
         * Text above the list (e.g. the ExtJS FilterGrid hint)
         * @member {String|null} hint=null
         */
        hint: null,
        /**
         * Extra config of the record dialog, or a function that returns it (async)
         * @member {Object|Function|null} dialogConfig=null
         */
        dialogConfig: null
    }

    /**
     * @member {Number|null} accountId=null
     */
    accountId = null

    /**
     * No write permission on the account: the list only
     * @member {Boolean} readOnly=false
     */
    readOnly = false

    construct(config) {
        super.construct(config);

        let me      = this,
            actions = [];

        me.sortable && actions.push(
            {action: 'up', icon: 'arrow_upward', tooltip: t('Move up'), disabled: r => me.readOnly || me.indexOf(r) < 1},
            {action: 'down', icon: 'arrow_downward', tooltip: t('Move down'), disabled: r => me.readOnly || me.indexOf(r) >= me.records.length - 1}
        );

        actions.push(
            {action: 'edit', icon: 'edit', tooltip: coreT('Edit'), hidden: () => me.readOnly},
            {action: 'delete', icon: 'delete', tooltip: coreT('Delete'), hidden: () => me.readOnly}
        );

        me.items = [{
            module   : Toolbar,
            reference: 'toolbar',
            cls      : ['go-border-bottom'],
            flex     : 'none',
            items    : [...me.hint ? [{ntype: 'component', cls: ['go-email-records-hint'], text: me.hint, flex: 1}] : ['->'], {
                module   : Button,
                reference: 'addButton',
                icon     : 'add',
                text     : coreT('Add'),
                disabled : true,
                handler  : () => me.openRecord(null)
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
                columns  : me.columns,
                actions
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me    = this,
            table = me.table;

        table.on('action', ({action, record}) => me.onAction(action, record));
        table.on('rowDoubleClick', ({record}) => me.readOnly || me.openRecord(record))
    }

    /**
     * @returns {GO.list.ActionTable}
     */
    get table() {
        return this.getReference('table')
    }

    /**
     * @returns {Object[]}
     */
    get records() {
        return this.table.records
    }

    /**
     * @param {Object} record
     * @returns {Number}
     */
    indexOf(record) {
        return this.records.findIndex(r => String(r.id) === String(record.id))
    }

    /**
     * Shows the records of an account
     * @param {Number|null} accountId null: a new account, nothing to show yet
     * @param {Boolean} readOnly no write permission
     * @returns {Promise<void>}
     */
    setAccount(accountId, readOnly=false) {
        let me = this;

        me.accountId = accountId;
        me.readOnly  = readOnly;
        me.getReference('addButton').disabled = !accountId || readOnly;
        return me.load()
    }

    async load() {
        let me = this;

        if (!me.accountId) {
            me.table.records = [];
            return
        }

        try {
            const records = await accountApi.store(me.legacyController, me.accountId);
            me.isDestroyed || (me.table.records = records)
        } catch (e) {
            notifyError(me, e)
        }
    }

    onAction(action, record) {
        switch (action) {
            case 'edit':   return this.openRecord(record);
            case 'delete': return this.deleteRecord(record);
            case 'up':     return this.move(record, -1);
            case 'down':   return this.move(record, 1)
        }
    }

    /**
     * @param {Object|null} record null for a new record
     */
    async openRecord(record) {
        let me = this;

        if (!me.accountId || me.readOnly) {
            return
        }

        try {
            const extra  = typeof me.dialogConfig === 'function' ? await me.dialogConfig() : me.dialogConfig,
                  dialog = await me.dialog.open({appName: me.appName, windowId: me.windowId, accountId: me.accountId, id: record?.id || null, ...extra});

            dialog.on('save', () => {
                me.load();
                me.fire('changed')
            })
        } catch (e) {
            notifyError(me, e)
        }
    }

    async deleteRecord(record) {
        let me = this;

        const ok = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : escapeHtml(coreT('Are you sure you want to delete the selected item?'))
        });

        if (!ok || me.isDestroyed) {
            return
        }

        try {
            await accountApi.remove(me.legacyController, record.id);
            await me.load();
            me.fire('changed')
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * Moves a record up or down and saves the order (filters)
     * @param {Object} record
     * @param {Number} step -1 or 1
     */
    async move(record, step) {
        let me      = this,
            records = [...me.records],
            index   = me.indexOf(record),
            target  = index + step;

        if (index < 0 || target < 0 || target >= records.length) {
            return
        }

        [records[index], records[target]] = [records[target], records[index]];
        me.table.records = records;

        try {
            await accountApi.saveFilterSort(records.map(r => r.id));
            me.fire('changed')
        } catch (e) {
            notifyError(me, e);
            me.load()
        }
    }
}

export default Neo.setupClass(RecordsPanel);
