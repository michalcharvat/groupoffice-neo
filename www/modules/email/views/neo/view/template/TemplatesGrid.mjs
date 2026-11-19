import Container from '../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Store     from '../../../../../../views/neo/node_modules/neo.mjs/src/data/Store.mjs';
import Toolbar   from '../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button    from '../../../../../../views/neo/src/button/Button.mjs';
import Grid      from '../../../../../../views/neo/src/grid/Grid.mjs';
import {LEVEL_DELETE, LEVEL_WRITE} from '../../../../../../views/neo/src/Acl.mjs';
import {escapeHtml} from '../../../../../../views/neo/src/Format.mjs';
import {notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import ConfirmDialog from '../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import {t} from '../../util.mjs';
import {deleteTemplates, templateStore} from './api.mjs';
import EmailTemplateDialog  from './EmailTemplateDialog.mjs';
import TemplateGroupsDialog from './TemplateGroupsDialog.mjs';

const text = ({value}) => escapeHtml(value ?? '');

/**
 * The e-mail templates the user may see (ExtJS GO.email.TemplatesGrid, email/template/store):
 * name, group, owner and a lock on the ones the user may not change. Add, edit (double click,
 * write permission), delete (delete permission) and the template groups.
 *
 * Fires `change` after a template or group was saved or deleted.
 */
class TemplatesGrid extends Container {
    static config = {
        className: 'GO.email.settings.TemplatesGrid',
        baseCls  : ['go-email-templates', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    loadCounter = 0

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            flex  : 'none',
            items : [{
                module : Button,
                icon   : 'folder',
                text   : t('Groups'),
                handler: () => me.openGroups()
            }, '->', {
                module   : Button,
                reference: 'deleteButton',
                icon     : 'delete',
                tooltip  : t('Delete'),
                disabled : true,
                handler  : () => me.deleteSelected()
            }, {
                module   : Button,
                reference: 'editButton',
                icon     : 'edit',
                tooltip  : t('Edit'),
                disabled : true,
                handler  : () => me.edit(me.getSelected()[0]?.id)
            }, {
                module : Button,
                icon   : 'add',
                text   : t('Add'),
                handler: () => me.edit(null)
            }]
        }, {
            module     : Grid,
            reference  : 'grid',
            cls        : ['go-email-templates-grid'],
            flex       : 1,
            multiSelect: true,
            stateId    : 'email-templates',
            store      : {
                module     : Store,
                keyProperty: 'id',
                sorters    : [{property: 'name', direction: 'ASC'}],
                model      : {fields: ['id', 'name', 'group_name', 'user_name', 'permissionLevel'].map(name => ({name}))}
            },
            columns: [{
                dataField: 'permissionLevel',
                text     : '',
                width    : 40,
                hideable : false,
                // GO.grid.GridPanel: a lock on rows without write permission
                renderer : ({value}) => +value < LEVEL_WRITE
                    ? `<i class="go-icon go-email-template-lock" title="${escapeHtml(t('Read only'))}">lock</i>` : ''
            },
            {dataField: 'name', text: t('Name'), flex: 1, hideable: false, renderer: text},
            {dataField: 'group_name', text: t('Group'), width: 160, renderer: text},
            {dataField: 'user_name', text: t('Owner'), width: 180, renderer: text}]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me   = this,
            grid = me.getReference('grid');

        grid.view.selectionModel.on('selectionChange', () => me.onSelectionChange());
        grid.on('rowDoubleClick', ({record}) => record && +record.permissionLevel >= LEVEL_WRITE && me.edit(record.id));

        me.load()
    }

    /**
     * @returns {Promise<void>}
     */
    async load() {
        let me      = this,
            counter = ++me.loadCounter;

        try {
            const templates = await templateStore();

            if (!me.isDestroyed && counter === me.loadCounter) {
                // "(None)" of templates without group (Template::getGroupName())
                me.getReference('grid').store.data = templates.map(r => ({...r, group_name: r.group_id ? r.group_name : ''}));
                me.onSelectionChange()
            }
        } catch (e) {
            me.isDestroyed || counter !== me.loadCounter || notifyError(me, e)
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

        me.getReference('editButton').disabled   = selected.length !== 1 || +selected[0].permissionLevel < LEVEL_WRITE;
        me.getReference('deleteButton').disabled = !selected.length || selected.some(r => +r.permissionLevel < LEVEL_DELETE)
    }

    /**
     * Opens a template (id) or a new one (null)
     * @param {Number|null} id
     */
    async edit(id) {
        let me = this;

        try {
            const dialog = await EmailTemplateDialog.open({appName: me.appName, windowId: me.windowId, templateId: id});

            dialog.on('save', () => me.onChange())
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
            await deleteTemplates(selected.map(r => r.id))
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }

        me.isDestroyed || me.onChange()
    }

    openGroups() {
        let me = this;

        Neo.create(TemplateGroupsDialog, {appName: me.appName, windowId: me.windowId}).on('change', () => me.onChange())
    }

    /**
     * @protected
     */
    onChange() {
        let me = this;

        if (!me.isDestroyed) {
            me.load();
            me.fire('change')
        }
    }
}

export default Neo.setupClass(TemplatesGrid);
