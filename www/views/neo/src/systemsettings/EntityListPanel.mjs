import Container     from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../button/Button.mjs';
import client        from '../jmap/Client.mjs';
import ActionTable   from '../list/ActionTable.mjs';
import {notifyError} from '../Notify.mjs';
import {fmt, t}      from '../Translate.mjs';
import ConfirmDialog from '../view/ConfirmDialog.mjs';

/**
 * A System settings card that lists one JMAP entity in a GO.list.ActionTable with
 * add / edit / delete, like the grids modules put in System settings (API keys,
 * OAuth2 clients, WOPI services, IMAP servers). Changes are saved right away, not with
 * the dialog's Save.
 *
 *     class KeysPanel extends EntityListPanel {
 *         static config = {
 *             className : 'GO.apikeys.view.KeysPanel',
 *             entity    : 'Key',
 *             properties: ['id', 'name', 'userId'],
 *             columns   : [{text: t('Name'), field: 'name', flex: true}],
 *             dialog    : () => import('./KeyDialog.mjs'),   // a FormWindow, opened with entityId
 *             intro     : t('API keys can be used ...')
 *         }
 *     }
 *
 * Subclasses may override prepareRecords(list) (e.g. names of ids) and onAction(action, record)
 * for extra `actions`.
 */
class EntityListPanel extends Container {
    static config = {
        className: 'GO.systemsettings.EntityListPanel',
        baseCls  : ['go-systemsettings-panel', 'go-entity-list-panel', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * JMAP entity
         * @member {String|null} entity=null
         */
        entity: null,
        /**
         * Entity/get properties
         * @member {String[]|null} properties=null
         */
        properties: null,
        /**
         * Entity/query sort
         * @member {Object[]} jmapSort=[]
         */
        jmapSort: [],
        /**
         * ActionTable columns
         * @member {Object[]} columns=[]
         */
        columns: [],
        /**
         * Row actions besides edit and delete (handled in onAction())
         * @member {Object[]} actions=[]
         */
        actions: [],
        /**
         * Rows can be edited (dialog)
         * @member {Boolean} editable=true
         */
        editable: true,
        /**
         * () => import() of the FormWindow that creates and edits an entity
         * @member {Function|null} dialog=null
         */
        dialog: null,
        /**
         * Text above the table
         * @member {String|null} intro=null
         */
        intro: null,
        /**
         * Text of the add button, null for an icon only
         * @member {String|null} addText=null
         */
        addText: null,
        /**
         * Name of a record in the delete question
         * @member {String} displayField='name'
         */
        displayField: 'name'
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [...me.intro ? [{
            ntype: 'component',
            tag  : 'p',
            cls  : ['go-systemsettings-text'],
            flex : 'none',
            text : me.intro
        }] : [], {
            module: Toolbar,
            cls   : ['go-systemsettings-grid-tbar'],
            flex  : 'none',
            items : ['->', {
                module : Button,
                icon   : 'add',
                ui     : me.addText ? 'primary' : undefined,
                text   : me.addText || undefined,
                tooltip: me.addText ? undefined : t('Add'),
                handler: () => me.edit(null)
            }]
        }, {
            module   : ActionTable,
            reference: 'table',
            flex     : 'none',
            columns  : me.columns,
            actions  : [
                ...me.actions,
                ...me.editable ? [{action: 'edit', icon: 'edit', tooltip: t('Edit')}] : [],
                {action: 'delete', icon: 'delete', tooltip: t('Delete')}
            ],
            listeners: {
                action        : ({action, record}) => me.onAction(action, record),
                rowDoubleClick: ({record}) => me.editable && me.edit(record.id)
            }
        }, ...me.createExtraItems()]
    }

    /**
     * Items below the table
     * @returns {Object[]}
     */
    createExtraItems() {
        return []
    }

    /**
     * Called by the System settings dialog when it opens
     */
    async load() {
        let me = this;

        try {
            const {list} = await client.queryGet(me.entity, {sort: me.jmapSort, properties: me.properties}),
                  records = await me.prepareRecords(list);

            me.isDestroyed || (me.getReference('table').records = records)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * Rows as the table shows them (e.g. names looked up)
     * @param {Object[]} list
     * @returns {Promise<Object[]>}
     */
    async prepareRecords(list) {
        return list
    }

    /**
     * @param {String} action
     * @param {Object} record
     */
    onAction(action, record) {
        if (action === 'edit') {
            this.edit(record.id)
        } else if (action === 'delete') {
            this.remove(record)
        }
    }

    /**
     * @param {String|null} id null: new
     * @param {Object} [values] initial values of a new entity
     */
    async edit(id, values) {
        let me = this;

        if (!me.dialog) {
            return
        }

        const {default: Dialog} = await me.dialog(),
              dialog            = Neo.create(Dialog, {appName: me.appName, windowId: me.windowId, entityId: id, ...values ? {values} : {}});

        dialog.on('save', () => me.load())
    }

    /**
     * @param {Object} record
     */
    async remove(record) {
        let me   = this,
            name = record[me.displayField];

        const yes = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Confirm delete'),
            message : name ? fmt(t("Are you sure you want to delete '{item}'?"), {item: name}) : t('Are you sure you want to delete the selected item?')
        });

        if (!yes || me.isDestroyed) {
            return
        }

        try {
            await client.set(me.entity, {destroy: [record.id]});
            me.load()
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * Principal names of ids, for "user" columns
     * @param {Array} ids
     * @returns {Promise<Object>} id → name
     */
    static async principalNames(ids) {
        ids = [...new Set(ids.filter(Boolean).map(String))];

        if (!ids.length) {
            return {}
        }

        const list = await client.get('Principal', ids, ['id', 'name']);
        return Object.fromEntries(list.map(p => [String(p.id), p.name]))
    }
}

export default Neo.setupClass(EntityListPanel);
