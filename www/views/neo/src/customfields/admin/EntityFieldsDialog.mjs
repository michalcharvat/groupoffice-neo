import Toolbar       from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_DELETE, LEVEL_WRITE} from '../../Acl.mjs';
import Button        from '../../button/Button.mjs';
import UploadButton  from '../../component/UploadButton.mjs';
import client        from '../../jmap/Client.mjs';
import ActionTable   from '../../list/ActionTable.mjs';
import MenuList      from '../../menu/List.mjs';
import {notify, notifyError} from '../../Notify.mjs';
import {fmt, t}      from '../../Translate.mjs';
import ConfirmDialog from '../../view/ConfirmDialog.mjs';
import Dialog        from '../../view/Dialog.mjs';
import {getFieldType, getFieldTypes, loadModuleTypes} from './fieldTypes.mjs';

const order = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || Number(a.id) - Number(b.id);

/**
 * The custom fields of one entity (go.customfields.EntityDialog + EntityPanel): its field
 * sets, each followed by its fields. A field set row adds fields (menu of the types);
 * rows move up and down (a field moves on into the neighbouring field set), are edited
 * and deleted. The toolbar imports and exports field sets as JSON and adds a field set.
 * Changes are saved right away; pushes of FieldSet / Field reload the list.
 */
class EntityFieldsDialog extends Dialog {
    static config = {
        className   : 'GO.customfields.admin.EntityFieldsDialog',
        cls         : ['go-cf-entity-dialog'],
        modal       : true,
        resizable   : true,
        wrapperStyle: {height: '86vh', left: 'max(0px, calc(50vw - 500px))', top: '7vh', width: 'min(1000px, 100vw)'},
        containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}},
        /**
         * Entity name, e.g. 'Contact'
         * @member {String|null} forEntity=null
         */
        forEntity: null,
        /**
         * Entity title for the window title
         * @member {String|null} entityTitle=null
         */
        entityTitle: null
    }

    /** field sets, sorted */
    fieldSets = []
    /** fieldSetId → fields, sorted */
    fieldsBySet = {}

    construct(config) {
        super.construct(config);

        let me = this;

        me.title = t('Custom fields') + ': ' + (me.entityTitle || me.forEntity);

        me.items = [{
            module: Toolbar,
            cls   : ['go-cf-entity-tbar'],
            flex  : 'none',
            items : ['->', {
                module    : UploadButton,
                reference : 'importButton',
                cls       : ['go-cf-import-button'],
                multiple  : false,
                accept    : '.json,application/json',
                buttonText: t('Import'),
                disabled  : !client.isAdmin,
                listeners : {files: ({files}) => me.importJson(files[0])}
            }, {
                module  : Button,
                icon    : 'cloud_download',
                tooltip : t('Export fieldsets to JSON-file'),
                disabled: !client.isAdmin,
                handler : () => me.exportJson()
            }, {
                module  : Button,
                icon    : 'add',
                ui      : 'primary',
                text    : t('Add field set'),
                disabled: !client.isAdmin,
                handler : () => me.editFieldSet(null)
            }]
        }, {
            ntype : 'container',
            cls   : ['go-cf-entity-body'],
            flex  : 1,
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module   : ActionTable,
                reference: 'table',
                flex     : 'none',
                keyProperty: 'key',
                rowCls   : record => record.isFieldSet ? ['go-cf-fieldset-row'] : ['go-cf-field-row'],
                columns  : [
                    {text: t('Name'), field: 'name', flex: true},
                    {text: t('Database name'), field: 'databaseName'},
                    {text: t('Type'), field: 'typeLabel'}
                ],
                actions  : [
                    {action: 'addField', icon: 'add', tooltip: t('Add field'), hidden: r => !r.isFieldSet, disabled: r => r.permissionLevel < LEVEL_WRITE},
                    {action: 'up', icon: 'arrow_upward', tooltip: t('Move up'), disabled: r => !r.canMoveUp},
                    {action: 'down', icon: 'arrow_downward', tooltip: t('Move down'), disabled: r => !r.canMoveDown},
                    {action: 'edit', icon: 'edit', tooltip: t('Edit'), disabled: r => r.permissionLevel < LEVEL_WRITE},
                    {action: 'delete', icon: 'delete', tooltip: t('Delete'), disabled: r => r.permissionLevel < LEVEL_DELETE}
                ],
                listeners: {
                    action        : data => me.onAction(data),
                    rowDoubleClick: ({record}) => record.permissionLevel >= LEVEL_WRITE && me.edit(record)
                }
            }]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : ['->', {
                module : Button,
                text   : t('Close'),
                handler: () => me.close()
            }]
        }]
    }

    async onConstructed() {
        super.onConstructed();

        let me = this;

        client.watch(['FieldSet', 'Field']);
        me.removeStateListener = client.on('stateChange', ({changed}) => {
            changed?.some(e => e === 'FieldSet' || e === 'Field') && !me.saving && me.load()
        });

        // module types (labels, add menu) and field set extensions
        await loadModuleTypes();
        me.isDestroyed || me.load()
    }

    destroy(...args) {
        this.removeStateListener?.();
        super.destroy(...args)
    }

    get table() {
        return this.getReference('table')
    }

    /**
     * Loads the field sets and their fields
     */
    async load() {
        let me = this;

        try {
            const {list: fieldSets} = await client.queryGet('FieldSet', {filter: {entities: [me.forEntity]}}),
                  ids               = fieldSets.map(fs => fs.id),
                  fields            = ids.length ? (await client.queryGet('Field', {filter: {fieldSetId: ids}})).list : [];

            if (me.isDestroyed) {
                return
            }

            me.fieldSets   = fieldSets.sort(order);
            me.fieldsBySet = {};
            fields.forEach(f => (me.fieldsBySet[f.fieldSetId] ??= []).push(f));
            Object.values(me.fieldsBySet).forEach(list => list.sort(order));

            me.renderRows()
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * @protected
     */
    renderRows() {
        let me   = this,
            rows = [];

        me.fieldSets.forEach((fs, index) => {
            const fields = me.fieldsBySet[fs.id] || [],
                  level  = fs.permissionLevel ?? 0;

            rows.push({
                key        : 'fs' + fs.id,
                isFieldSet : true,
                id         : fs.id,
                name       : fs.name,
                databaseName: '',
                typeLabel  : fs.isTab ? t('Tab') : '',
                permissionLevel: level,
                canMoveUp  : index > 0 && client.isAdmin,
                canMoveDown: index < me.fieldSets.length - 1 && client.isAdmin
            });

            fields.forEach((f, fieldIndex) => {
                const type = getFieldType(f.type);

                rows.push({
                    key        : 'f' + f.id,
                    isFieldSet : false,
                    id         : f.id,
                    fieldSetId : fs.id,
                    type       : f.type,
                    name       : f.name,
                    databaseName: f.databaseName,
                    typeLabel  : type ? type.label : `${f.type} (${t('Unknown')})`,
                    permissionLevel: level,
                    canMoveUp  : level >= LEVEL_WRITE && (fieldIndex > 0 || index > 0),
                    canMoveDown: level >= LEVEL_WRITE && (fieldIndex < fields.length - 1 || index < me.fieldSets.length - 1)
                })
            })
        });

        me.table.records = rows
    }

    /**
     * @param {Object} data {action, record, target}
     */
    onAction({action, record, target}) {
        let me = this;

        switch (action) {
            case 'addField': return me.showAddFieldMenu(record, target);
            case 'up':       return me.move(record, -1);
            case 'down':     return me.move(record, 1);
            case 'edit':     return me.edit(record);
            case 'delete':   return me.remove(record)
        }
    }

    /**
     * @param {Object} record table row
     */
    edit(record) {
        record.isFieldSet ? this.editFieldSet(record.id) : this.editField(record.type, record.id)
    }

    /**
     * @param {String|null} id null: new
     */
    async editFieldSet(id) {
        let me = this;

        const {default: FieldSetDialog} = await import('./FieldSetDialog.mjs');

        Neo.create(FieldSetDialog, {
            appName  : me.appName,
            windowId : me.windowId,
            forEntity: me.forEntity,
            entityId : id
        }).on('save', () => me.load())
    }

    /**
     * @param {String} type GO type name
     * @param {String|null} id null: new
     * @param {Object} [values] of a new field
     */
    async editField(type, id, values) {
        let me = this;

        const {default: FieldDialog} = await import('./FieldDialog.mjs');

        Neo.create(FieldDialog, {
            appName  : me.appName,
            windowId : me.windowId,
            fieldType: type,
            entityId : id,
            ...values ? {values} : {}
        }).on('save', () => me.load())
    }

    /**
     * Menu of the field types (EntityPanel.showAddFieldMenu())
     * @param {Object} record field set row
     * @param {String} target DOM id of the button
     */
    showAddFieldMenu(record, target) {
        let me = this;

        MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target,
            items   : getFieldTypes().filter(type => !type.hideInNew).map(type => ({
                text   : type.label,
                icon   : type.icon,
                handler: () => me.editField(type.name, null, {fieldSetId: record.id, type: type.name})
            }))
        })
    }

    /**
     * Moves a field set, or a field within its field set and on into the neighbouring one
     * (EntityPanel.onSort()); saves the new sortOrder of the moved lists
     * @param {Object} record
     * @param {Number} step -1 up, 1 down
     */
    async move(record, step) {
        let me = this;

        try {
            me.saving = true;

            if (record.isFieldSet) {
                const list  = [...me.fieldSets],
                      index = list.findIndex(fs => String(fs.id) === String(record.id)),
                      to    = index + step;

                if (index < 0 || to < 0 || to >= list.length) {
                    return
                }

                list.splice(to, 0, ...list.splice(index, 1));
                await client.set('FieldSet', {update: Object.fromEntries(list.map((fs, i) => [fs.id, {sortOrder: i}]))});
            } else {
                const setIndex = me.fieldSets.findIndex(fs => String(fs.id) === String(record.fieldSetId)),
                      fields   = [...me.fieldsBySet[record.fieldSetId] || []],
                      index    = fields.findIndex(f => String(f.id) === String(record.id)),
                      to       = index + step,
                      update   = {};

                if (index < 0) {
                    return
                }

                if (to >= 0 && to < fields.length) {
                    fields.splice(to, 0, ...fields.splice(index, 1));
                    fields.forEach((f, i) => update[f.id] = {sortOrder: i})
                } else {
                    // over the edge: last of the previous / first of the next field set
                    const target = me.fieldSets[setIndex + step];

                    if (!target) {
                        return
                    }

                    const [moved]      = fields.splice(index, 1),
                          targetFields = [...me.fieldsBySet[target.id] || []];

                    step < 0 ? targetFields.push(moved) : targetFields.unshift(moved);
                    fields.forEach((f, i) => update[f.id] = {sortOrder: i});
                    targetFields.forEach((f, i) => update[f.id] = {sortOrder: i});
                    update[moved.id].fieldSetId = target.id
                }

                await client.set('Field', {update})
            }
        } catch (e) {
            notifyError(me, e)
        } finally {
            me.saving = false
        }

        me.isDestroyed || me.load()
    }

    /**
     * @param {Object} record
     */
    async remove(record) {
        let me = this;

        const yes = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Confirm delete'),
            message : fmt(t("Are you sure you want to delete '{item}'?"), {item: record.name})
        });

        if (!yes || me.isDestroyed) {
            return
        }

        try {
            me.saving = true;
            await client.set(record.isFieldSet ? 'FieldSet' : 'Field', {destroy: [record.id]})
        } catch (e) {
            notifyError(me, e)
        } finally {
            me.saving = false
        }

        me.isDestroyed || me.load()
    }

    /**
     * FieldSet/importFromJson: adds the file's field sets and fields that don't exist yet
     * @param {File} file
     */
    async importJson(file) {
        let me     = this,
            button = me.getReference('importButton');

        if (!file) {
            return
        }

        button.disabled = true;

        try {
            const {blobId}   = await client.upload(file),
                  {feedback} = await client.call('FieldSet/importFromJson', {entity: me.forEntity, blobId});

            // the toast shows text: one message per line of the feedback, joined
            feedback && notify(me, feedback.trim().split('\n').join(' · '), {title: t('Import messages'), closable: true});
            me.load()
        } catch (e) {
            notifyError(me, e)
        } finally {
            me.isDestroyed || (button.disabled = false)
        }
    }

    async exportJson() {
        let me = this;

        const {default: ExportDialog} = await import('./ExportDialog.mjs');

        Neo.create(ExportDialog, {
            appName    : me.appName,
            windowId   : me.windowId,
            forEntity  : me.forEntity,
            entityTitle: me.entityTitle,
            fieldSets  : me.fieldSets
        })
    }
}

export default Neo.setupClass(EntityFieldsDialog);
