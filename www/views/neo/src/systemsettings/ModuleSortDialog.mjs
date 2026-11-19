import Toolbar          from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button           from '../button/Button.mjs';
import {dropIndex, enableDragDrop} from '../component/dragDrop.mjs';
import client           from '../jmap/Client.mjs';
import ActionTable      from '../list/ActionTable.mjs';
import {notifyError}    from '../Notify.mjs';
import {t}              from '../Translate.mjs';
import Dialog           from '../view/Dialog.mjs';
import ModuleTiles      from './ModuleTiles.mjs';

/**
 * Order of the installed modules in the main menu and the module tabs
 * (go.modules.ModuleSortWindow): drag a row before or after another row, or move it with the up and
 * down buttons. Every move saves Module.sort_order right away (1, 2, ...), like ExtJS;
 * fires `change` when a move starts a save (the windows reload to show the new order).
 *
 *     Neo.create(ModuleSortDialog, {appName, windowId})
 */
class ModuleSortDialog extends Dialog {
    static config = {
        className   : 'GO.systemsettings.ModuleSortDialog',
        cls         : ['go-modulesort-dialog'],
        modal       : true,
        resizable   : true,
        title       : t('Modules sorting'),
        wrapperStyle: {
            height: 'min(750px, 90vh)',
            left  : 'max(0px, calc(50vw - 400px))',
            top   : 'max(5vh, calc(50vh - 375px))',
            width : 'min(800px, 100vw)'
        },
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        }
    }

    /**
     * Saves run one after the other; each saves the order shown at that moment
     * @member {Promise} saving=Promise.resolve()
     */
    saving = Promise.resolve()

    /**
     * Saves queued or running: closing waits for them
     * @member {Number} pendingSaves=0
     */
    pendingSaves = 0

    /**
     * The order shown, kept apart from the table: queued saves still run after close
     * @member {Object[]} order=[]
     */
    order = []

    /**
     * sort_order per module id as the server has it
     * @member {Map} saved=new Map()
     */
    saved = new Map()

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype: 'container',
            cls  : ['go-modulesort-list'],
            flex : 1,
            items: [{
                module   : ActionTable,
                reference: 'table',
                emptyText: t('Loading...'),
                columns  : [{
                    text: t('Name'),
                    flex: true,
                    vdom: record => [
                        {tag: 'img', cls: ['go-modulesort-icon'], src: ModuleTiles.iconUrl(record), alt: ''},
                        {tag: 'span', text: record.title || record.name}
                    ]
                }, {
                    text : t('Package'),
                    field: 'localizedPackage'
                }],
                actions: [
                    {action: 'up',   icon: 'arrow_upward',   tooltip: t('Move up'),   disabled: record => me.indexOf(record) === 0},
                    {action: 'down', icon: 'arrow_downward', tooltip: t('Move down'), disabled: record => me.indexOf(record) === me.table.records.length - 1}
                ],
                listeners: {action: ({action, record}) => me.move(me.indexOf(record), me.indexOf(record) + (action === 'up' ? -1 : 1))}
            }]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : ['->', {
                module : Button,
                ui     : 'primary',
                text   : t('Close'),
                handler: () => me.close()
            }]
        }]
    }

    /**
     * @returns {GO.list.ActionTable}
     */
    get table() {
        return this.getReference('table')
    }

    async onConstructed() {
        super.onConstructed();

        let me = this;

        enableDragDrop(me.table, {
            drag    : '.go-actiontable-row',
            drop    : '.go-actiontable-row',
            group   : 'go-module-sort',
            position: 'between',
            onDrop  : ({source, targetRecordId, position}) => {
                if (source?.recordId != null && targetRecordId != null) {
                    const from = me.indexOf(me.table.getRecord(source.recordId));
                    me.move(from, dropIndex(from, me.indexOf(me.table.getRecord(targetRecordId)), position))
                }
            }
        }).catch(e => console.error('Module sort drag and drop', e));

        await me.load()
    }

    /**
     * Loads the installed modules but core, in their order
     */
    async load() {
        let me = this;

        try {
            const {list} = await client.queryGet('Module', {
                filter    : {hideCore: true},
                sort      : [{property: 'sort_order', isAscending: true}],
                properties: ['id', 'name', 'package', 'sort_order', 'title', 'localizedPackage']
            });

            if (!me.isDestroyed) {
                me.order = list;
                me.saved = new Map(list.map(record => [String(record.id), Number(record.sort_order)]));
                me.table.emptyText = t('No items to display');
                me.table.records   = list
            }
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * @param {Object|null} record
     * @returns {Number} -1 when not listed
     */
    indexOf(record) {
        return record ? this.table.records.indexOf(record) : -1
    }

    /**
     * Moves a module to another index and saves the new order
     * @param {Number} from
     * @param {Number} to
     * @protected
     */
    move(from, to) {
        let me      = this,
            records = [...me.table.records];

        if (from < 0 || to < 0 || from >= records.length || to >= records.length || from === to) {
            return
        }

        records.splice(to, 0, ...records.splice(from, 1));
        me.order         = records;
        me.table.records = records;
        me.saveOrder()
    }

    /**
     * Queues a save of sort_order 1, 2, ... for the modules whose number differs from the
     * server's. Computed when the save runs, so a failed save before it (which reloads the
     * server's order) can't leave a partial order behind.
     * @protected
     */
    saveOrder() {
        let me    = this,
            owner = {appName: me.appName, windowId: me.windowId}; // still known after a close

        me.pendingSaves++;
        me.fire('change', {});

        me.saving = me.saving.then(async () => {
            const update = {};

            me.order.forEach((record, index) => {
                me.saved.get(String(record.id)) !== index + 1 && (update[record.id] = {sort_order: index + 1})
            });

            if (!Object.keys(update).length) {
                return
            }

            try {
                await client.set('Module', {update});
                Object.entries(update).forEach(([id, {sort_order}]) => me.saved.set(id, sort_order))
            } catch (e) {
                notifyError(owner, e);
                me.isDestroyed || await me.load()
            }
        }).finally(() => me.pendingSaves--)
    }

    /**
     * Waits for queued saves: System settings reloads the windows when it closes, which
     * would show an unfinished order
     */
    close(...args) {
        let me = this;

        if (me.pendingSaves > 0 && !me.isDestroyed) {
            me.isLoading = t('Saving...');
            me.saving.then(() => me.isDestroyed || super.close(...args));
            return
        }

        super.close(...args)
    }
}

export default Neo.setupClass(ModuleSortDialog);
