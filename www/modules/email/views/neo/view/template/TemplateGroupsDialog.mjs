import Store   from '../../../../../../views/neo/node_modules/neo.mjs/src/data/Store.mjs';
import Toolbar from '../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button  from '../../../../../../views/neo/src/button/Button.mjs';
import Grid    from '../../../../../../views/neo/src/grid/Grid.mjs';
import {escapeHtml} from '../../../../../../views/neo/src/Format.mjs';
import {notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import ConfirmDialog from '../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import Dialog, {headerTools} from '../../../../../../views/neo/src/view/Dialog.mjs';
import {t} from '../../util.mjs';
import PromptDialog from '../PromptDialog.mjs';
import {deleteGroups, groupStore, submitGroup} from './api.mjs';

/**
 * Template groups (ExtJS TemplateGroupGrid in a window, TemplateGroupDialog for the name):
 * add, rename (double click or the edit button) and delete. Templates of a deleted group
 * stay, without group.
 *
 *     Neo.create(TemplateGroupsDialog, {appName, windowId}).on('change', () => …)
 */
class TemplateGroupsDialog extends Dialog {
    static config = {
        className   : 'GO.email.settings.TemplateGroupsDialog',
        cls         : ['go-email-template-groups'],
        title       : t('Groups'),
        modal       : true,
        headerConfig: headerTools('close'),
        wrapperStyle: {height: 'min(500px, 90vh)', left: 'max(0px, calc(50vw - 225px))', top: '15vh', width: 'min(450px, 100vw)'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        }
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            flex  : 'none',
            items : ['->', {
                module   : Button,
                reference: 'editButton',
                icon     : 'edit',
                tooltip  : t('Edit'),
                disabled : true,
                handler  : () => me.edit(me.getSelected()[0])
            }, {
                module   : Button,
                reference: 'deleteButton',
                icon     : 'delete',
                tooltip  : t('Delete'),
                disabled : true,
                handler  : () => me.deleteSelected()
            }, {
                module : Button,
                icon   : 'add',
                text   : t('Add'),
                ui     : 'primary',
                handler: () => me.edit(null)
            }]
        }, {
            module     : Grid,
            reference  : 'grid',
            flex       : 1,
            multiSelect: true,
            store      : {
                module     : Store,
                keyProperty: 'id',
                sorters    : [{property: 'name', direction: 'ASC'}],
                model      : {fields: [{name: 'id'}, {name: 'name'}]}
            },
            columns: [{dataField: 'name', text: t('Name'), flex: 1, renderer: ({value}) => escapeHtml(value ?? '')}]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me   = this,
            grid = me.getReference('grid');

        grid.view.selectionModel.on('selectionChange', () => me.onSelectionChange());
        grid.on('rowDoubleClick', ({record}) => record && me.edit(record));

        me.load()
    }

    async load() {
        let me = this;

        try {
            const groups = await groupStore();

            if (!me.isDestroyed) {
                me.getReference('grid').store.data = groups;
                me.onSelectionChange()
            }
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * @returns {Object[]}
     */
    getSelected() {
        return this.getReference('grid').getSelectedRecords()
    }

    onSelectionChange() {
        let me       = this,
            selected = me.getSelected();

        me.getReference('editButton').disabled   = selected.length !== 1;
        me.getReference('deleteButton').disabled = !selected.length
    }

    /**
     * Asks for the name of a new (null) or existing group and saves it
     * @param {Object|null} group
     */
    async edit(group) {
        let me = this;

        const name = await PromptDialog.ask({
            appName  : me.appName,
            windowId : me.windowId,
            title    : t('Group'),
            labelText: t('Name'),
            value    : group?.name || ''
        });

        if (!name || me.isDestroyed || name === group?.name) {
            return
        }

        try {
            await submitGroup({id: group?.id, name});
            me.fire('change');
            await me.load()
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    async deleteSelected() {
        let me       = this,
            selected = me.getSelected();

        if (!selected.length || !await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : t('Are you sure you want to delete the selected item?')
        })) {
            return
        }

        try {
            await deleteGroups(selected.map(r => r.id));
            me.fire('change');
            await me.load()
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }
}

export default Neo.setupClass(TemplateGroupsDialog);
