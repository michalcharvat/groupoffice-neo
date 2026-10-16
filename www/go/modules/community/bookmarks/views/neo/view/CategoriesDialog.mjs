import Toolbar       from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_MANAGE} from '../../../../../../../views/neo/src/Acl.mjs';
import Button        from '../../../../../../../views/neo/src/button/Button.mjs';
import JmapStore     from '../../../../../../../views/neo/src/data/JmapStore.mjs';
import {escapeHtml}  from '../../../../../../../views/neo/src/Format.mjs';
import Grid          from '../../../../../../../views/neo/src/grid/Grid.mjs';
import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import {fmt}         from '../../../../../../../views/neo/src/Translate.mjs';
import ConfirmDialog from '../../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import Dialog        from '../../../../../../../views/neo/src/view/Dialog.mjs';
import {moduleRights, t} from '../util.mjs';
import CategoryDialog from './CategoryDialog.mjs';

/**
 * "Administrate categories" (GOUI ManageCategoriesWindow, ExtJS ManageCategoriesGrid):
 * the categories with their owner; add, delete, double click edits.
 */
class CategoriesDialog extends Dialog {
    static config = {
        className: 'GO.bookmarks.CategoriesDialog',
        cls      : ['go-bookmarks-categories'],
        modal    : true,
        resizable: true,
        title    : t('Administrate categories'),
        wrapperStyle: {
            height: '500px',
            left  : 'calc(50vw - 300px)',
            maxHeight: '90vh',
            top   : 'max(5vh, calc(50vh - 250px))',
            width : '600px'
        },
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        }
    }

    /**
     * createdBy → owner name
     * @member {Map<String, String>} ownerNames
     */
    ownerNames = new Map()

    /**
     * Open category dialogs: closed with this one
     * @member {Set<GO.view.Dialog>} dialogs
     */
    dialogs = new Set()

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            cls   : ['go-border-bottom'],
            flex  : 'none',
            items : [{
                module : Button,
                icon   : 'add',
                text   : t('Add'),
                // the server lets only module managers create categories
                hidden : !moduleRights().mayManage,
                handler: () => me.openCategory(null)
            }, {
                module   : Button,
                icon     : 'delete',
                text     : t('Delete'),
                reference: 'deleteButton',
                disabled : true,
                handler  : () => me.deleteSelected()
            }]
        }, {
            module   : Grid,
            reference: 'grid',
            flex     : 1,
            store    : {
                module    : JmapStore,
                entity    : 'BookmarksCategory',
                model     : {fields: [
                    {name: 'id'}, {name: 'name', type: 'String'},
                    {name: 'createdBy'}, {name: 'permissionLevel', type: 'Int'}
                ]},
                sortProperties: {createdBy: 'creator'},
                sorters   : [{property: 'name', direction: 'ASC'}],
                properties: ['id', 'name', 'createdBy', 'permissionLevel']
            },
            stateId: 'bookmarks-categoryGrid',
            columns: [{
                dataField: 'name',
                text     : t('Name'),
                flex     : 1,
                hideable : false,
                renderer : ({value}) => escapeHtml(value)
            }, {
                dataField: 'createdBy',
                text     : t('Owner'),
                width    : 200,
                sortable : false,
                // GOUI: "-" when the owner is unknown or not visible
                renderer : ({value}) => escapeHtml((value && me.ownerNames.get(String(value))) || '-')
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me   = this,
            grid = me.getReference('grid');

        grid.view.selectionModel.on('selectionChange', me.onSelectionChange, me);
        grid.on('rowDoubleClick', ({record}) => record && me.openCategory(record));
        grid.store.on('load', me.loadOwnerNames, me);
        grid.store.on('loadError', ({error}) => notifyError(me, error));

        grid.store.load().catch(() => {})
    }

    destroy(...args) {
        // the grid does not destroy its store (state change listener)
        const store = this.getReference('grid')?.store;

        this.dialogs.forEach(dialog => dialog.isDestroyed || dialog.close());
        super.destroy(...args);
        store && !store.isDestroyed && store.destroy()
    }

    /**
     * @returns {Object|null} the selected category
     */
    getSelected() {
        return this.getReference('grid').getSelectedRecords?.()[0] || null
    }

    onSelectionChange() {
        const record = this.getSelected();

        this.getReference('deleteButton').disabled = !record || record.permissionLevel < LEVEL_MANAGE
    }

    /**
     * @param {Object|null} record null for a new category
     */
    openCategory(record) {
        let me = this;

        // editing a category's name and sharing needs manage permission on it
        if (record && record.permissionLevel < LEVEL_MANAGE) {
            return
        }

        me.dialogs.forEach(d => d.isDestroyed && me.dialogs.delete(d));
        me.dialogs.add(Neo.create(CategoryDialog, {
            appName   : me.appName,
            windowId  : me.windowId,
            categoryId: record?.id || null
        }))
        // the grid reloads by itself (push of the change)
    }

    async deleteSelected() {
        let me     = this,
            record = me.getSelected();

        if (!record) {
            return
        }

        const confirmed = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            // the server deletes the category's bookmarks with it
            message : fmt(t("Are you sure you want to delete '{item}'?"), {item: escapeHtml(record.name)})
        });

        if (!confirmed || me.isDestroyed) {
            return
        }

        try {
            await client.set('BookmarksCategory', {destroy: [record.id]})
        } catch (e) {
            notifyError(me, e)
        }
    }

    async loadOwnerNames() {
        let me      = this,
            grid    = me.getReference('grid'),
            missing = [...new Set(grid.store.items.map(c => c.createdBy && String(c.createdBy)).filter(id => id && !me.ownerNames.has(id)))];

        if (!missing.length) {
            return
        }

        try {
            (await client.get('Principal', missing, ['id', 'name'])).forEach(p => me.ownerNames.set(String(p.id), p.name))
        } catch (e) {
            return
        }

        missing.forEach(id => me.ownerNames.has(id) || me.ownerNames.set(id, ''));
        !me.isDestroyed && !grid.isDestroyed && grid.body?.createViewData()
    }
}

export default Neo.setupClass(CategoriesDialog);
