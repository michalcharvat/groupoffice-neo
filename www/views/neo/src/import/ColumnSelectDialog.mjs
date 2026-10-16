import Container     from '../../node_modules/neo.mjs/src/container/Base.mjs';
import TextField     from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../button/Button.mjs';
import LocalCombo    from '../form/field/LocalCombo.mjs';
import client        from '../jmap/Client.mjs';
import ActionTable   from '../list/ActionTable.mjs';
import TextList      from '../list/TextList.mjs';
import {notifyError} from '../Notify.mjs';
import {fmt, t}      from '../Translate.mjs';
import ConfirmDialog from '../view/ConfirmDialog.mjs';
import Dialog        from '../view/Dialog.mjs';

/**
 * Columns of a CSV / Excel / HTML export (go.import.ColumnSelectDialog with
 * SpreadSheetExportGrid): Entity/exportColumns as a check list, saved per user as presets
 * (SpreadSheetExport). Resolves with the checked column names, null when cancelled.
 *
 *     const columns = await ColumnSelectDialog.ask({appName, windowId, entity: 'Contact', extension: 'csv'});
 *     columns && client.call('Contact/export', {extension: 'csv', ids, columns})
 */
class ColumnSelectDialog extends Dialog {
    static config = {
        className   : 'GO.import.ColumnSelectDialog',
        cls         : ['go-column-select-dialog'],
        modal       : true,
        resizable   : true,
        title       : t('Select columns'),
        wrapperStyle: {height: '80vh', left: 'max(0px, calc(50vw - 240px))', top: '10vh', width: 'min(480px, 100vw)'},
        containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}},
        /**
         * @member {String|null} entity=null
         */
        entity: null,
        /**
         * @member {String} extension='csv'
         */
        extension: 'csv'
    }

    /**
     * Checked columns when exported, null when cancelled
     * @member {String[]|null} answer=null
     */
    answer = null

    /** the user's presets of this entity */
    presets = []

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Container,
            cls   : ['go-column-select-presets'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module         : LocalCombo,
                reference      : 'preset',
                labelText      : t('Preset'),
                labelPosition  : 'inline',
                placeholderText: t('Select preset...'),
                flex           : 1,
                width          : null,
                displayField   : 'name',
                valueField     : 'id',
                editable       : false,
                listConfig     : {module: TextList},
                store          : {keyProperty: 'id', data: []},
                listeners      : {select: ({value}) => value && me.applyPreset(value.id)}
            }, {
                module   : Button,
                reference: 'deletePreset',
                icon     : 'delete',
                tooltip  : t('Delete'),
                disabled : true,
                handler  : () => me.deletePreset()
            }]
        }, {
            module: Container,
            cls   : ['go-column-select-save'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                module       : TextField,
                reference    : 'presetName',
                labelText    : t('Name'),
                labelPosition: 'inline',
                flex         : 1
            }, {
                module : Button,
                icon   : 'save',
                tooltip: t('Save'),
                handler: () => me.savePreset()
            }]
        }, {
            module: Toolbar,
            cls   : ['go-column-select-tbar'],
            flex  : 'none',
            items : [{
                module : Button,
                text   : t('Select all'),
                handler: () => me.checkAll(true)
            }, {
                module : Button,
                text   : t('Deselect all'),
                handler: () => me.checkAll(false)
            }]
        }, {
            ntype : 'container',
            cls   : ['go-column-select-body'],
            flex  : 1,
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module     : ActionTable,
                reference  : 'columns',
                flex       : 'none',
                keyProperty: 'name',
                columns    : [
                    {text: '', field: 'checked', type: 'check'},
                    {text: t('Name'), field: 'label', flex: true}
                ]
            }]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : ['->', {
                module : Button,
                text   : t('Cancel'),
                handler: () => me.close()
            }, {
                module : Button,
                ui     : 'primary',
                text   : t('Export'),
                handler: () => me.onExport()
            }]
        }]
    }

    async onConstructed() {
        super.onConstructed();

        let me = this;

        try {
            const [columns] = await Promise.all([
                client.call(me.entity + '/exportColumns', {extension: me.extension}),
                me.loadPresets()
            ]);

            if (me.isDestroyed) {
                return
            }

            me.getReference('columns').records = Object.entries(columns || {})
                .map(([name, column]) => ({name, label: column?.label || name, checked: false}))
                .sort((a, b) => a.label.localeCompare(b.label));

            // like ExtJS: the first preset is applied
            me.presets[0] && me.applyPreset(me.presets[0].id)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * @returns {Promise<void>}
     */
    async loadPresets() {
        let me = this;

        const {list} = await client.queryGet('SpreadSheetExport', {
            filter    : {userId: client.user?.id, entity: me.entity},
            sort      : [{property: 'name', isAscending: true}],
            properties: ['id', 'name', 'columns']
        });

        if (!me.isDestroyed) {
            me.presets = list;
            me.getReference('preset').store.data = list.map(p => ({id: p.id, name: p.name}))
        }
    }

    /**
     * @param {String} id
     */
    applyPreset(id) {
        let me      = this,
            preset  = me.presets.find(p => String(p.id) === String(id)),
            checked = new Set(preset?.columns || []),
            table   = me.getReference('columns');

        if (!preset) {
            return
        }

        me.getReference('preset').value     = preset.id;
        me.getReference('presetName').value = preset.name;
        me.getReference('deletePreset').disabled = false;
        table.records = table.records.map(r => ({...r, checked: checked.has(r.name)}))
    }

    /**
     * @param {Boolean} checked
     */
    checkAll(checked) {
        const table = this.getReference('columns');
        table.records = table.records.map(r => ({...r, checked}))
    }

    /**
     * @returns {String[]}
     */
    getSelection() {
        return this.getReference('columns').records.filter(r => r.checked).map(r => r.name)
    }

    /**
     * Saves the checked columns: into the chosen preset when the name is unchanged, as a new
     * preset otherwise
     */
    async savePreset() {
        let me     = this,
            name   = String(me.getReference('presetName').value || '').trim(),
            id     = me.getReference('preset').getSubmitValue(),
            preset = me.presets.find(p => String(p.id) === String(id));

        if (!name) {
            me.getReference('presetName').error = t('Please enter a name');
            return
        }

        const values = {name, columns: me.getSelection(), userId: client.user?.id, entity: me.entity};

        try {
            let savedId;

            if (preset && preset.name === name) {
                await client.set('SpreadSheetExport', {update: {[preset.id]: values}});
                savedId = preset.id
            } else {
                savedId = (await client.set('SpreadSheetExport', {create: {new: values}})).created.new.id
            }

            await me.loadPresets();
            me.isDestroyed || me.applyPreset(savedId)
        } catch (e) {
            notifyError(me, e)
        }
    }

    async deletePreset() {
        let me     = this,
            id     = me.getReference('preset').getSubmitValue(),
            preset = me.presets.find(p => String(p.id) === String(id));

        if (!preset) {
            return
        }

        const yes = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Confirm delete'),
            message : fmt(t("Are you sure you want to delete '{item}'?"), {item: preset.name})
        });

        if (!yes || me.isDestroyed) {
            return
        }

        try {
            await client.set('SpreadSheetExport', {destroy: [preset.id]});
            await me.loadPresets();

            if (!me.isDestroyed) {
                me.getReference('preset').value     = null;
                me.getReference('presetName').value = '';
                me.getReference('deletePreset').disabled = true
            }
        } catch (e) {
            notifyError(me, e)
        }
    }

    onExport() {
        let me      = this,
            columns = me.getSelection();

        if (!columns.length) {
            return
        }

        me.answer = columns;
        me.close()
    }

    /**
     * @param {Object} config appName, windowId, entity, extension
     * @returns {Promise<String[]|null>}
     */
    static ask(config) {
        return new Promise(resolve => {
            const dialog = Neo.create(ColumnSelectDialog, config);
            dialog.on('close', () => resolve(dialog.answer))
        })
    }
}

export default Neo.setupClass(ColumnSelectDialog);
