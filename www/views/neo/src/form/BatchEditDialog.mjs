import FormContainer from '../../node_modules/neo.mjs/src/form/Container.mjs';
import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../button/Button.mjs';
import customFields  from '../customfields/customFields.mjs';
import {createFormItem, getType} from '../customfields/types.mjs';
import {escapeHtml}  from '../Format.mjs';
import client        from '../jmap/Client.mjs';
import {notify, notifyError} from '../Notify.mjs';
import {fmt, t}      from '../Translate.mjs';
import Dialog        from '../view/Dialog.mjs';
import BoolCheckBox  from './field/BoolCheckBox.mjs';
import DataSourceForm from './DataSourceForm.mjs';

/**
 * @param {Object} field GO Field entity
 * @returns {Boolean} the type has a form field with a value (not a read-only display or form notes)
 */
function isEditable(field) {
    if (getType(field).noValue) {
        return false
    }

    const config = createFormItem(field);
    return !!config && !config.goReadOnly
}

/**
 * Edits several entities at once (ExtJS go.form.BatchEditDialog): the custom fields of
 * the entity, grouped by field set. Every field starts disabled behind a checkbox; only the
 * checked fields are saved, with the same value for every entity (Entity/set update).
 * Entities the user may not change are reported, the others are saved.
 *
 *     if (await BatchEditDialog.isAvailable('Contact')) {
 *         Neo.create(BatchEditDialog, {appName, windowId, entity: 'Contact', ids})
 *             .on('save', ({updated}) => ...)
 *     }
 *
 * Fires `save` {updated: String[]} after saving, also when some entities failed.
 */
class BatchEditDialog extends Dialog {
    static config = {
        className   : 'GO.form.BatchEditDialog',
        cls         : ['go-batch-edit-dialog'],
        modal       : true,
        resizable   : true,
        title       : t('Batch edit'),
        wrapperStyle: {height: '80vh', left: 'max(0px, calc(50vw - 320px))', top: '10vh', width: 'min(640px, 100vw)'},
        containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}},
        /**
         * JMAP entity name, e.g. 'Contact'
         * @member {String|null} entity=null
         */
        entity: null,
        /**
         * The entities to change
         * @member {String[]} ids=[]
         */
        ids: []
    }

    /**
     * Rows: {checkbox, field} per editable custom field
     * @member {Object[]} rows=[]
     */
    rows = []

    /**
     * Whether the entity has custom fields to batch edit (the ExtJS button is hidden otherwise)
     * @param {String} entity
     * @returns {Promise<Boolean>}
     */
    static async isAvailable(entity) {
        try {
            await customFields.load()
        } catch (e) {
            return false
        }

        return customFields.getFieldSets(entity).some(fs => customFields.getFields(fs).some(isEditable))
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype: 'component',
            cls  : ['go-batch-edit-intro'],
            flex : 'none',
            text : fmt(t('Check the fields to change in {count} items.'), {count: me.ids.length})
        }, {
            module   : FormContainer,
            reference: 'form',
            cls      : ['go-batch-edit-body'],
            flex     : 1,
            layout   : {ntype: 'vbox', align: 'stretch'},
            items    : []
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : ['->', {
                module : Button,
                text   : t('Cancel'),
                handler: () => me.close()
            }, {
                module   : Button,
                reference: 'saveButton',
                ui       : 'primary',
                text     : t('Save'),
                handler  : () => me.save()
            }]
        }]
    }

    async onConstructed() {
        super.onConstructed();

        let me = this;

        try {
            await customFields.load()
        } catch (e) {
            me.isDestroyed || notifyError(me, e);
            return
        }

        if (me.isDestroyed) {
            return
        }

        const items = [];

        customFields.getFieldSets(me.entity).forEach(fieldSet => {
            const rows = customFields.getFields(fieldSet)
                .filter(isEditable)
                .map(field => me.createRow(field, createFormItem(field)));

            if (!rows.length) {
                return
            }

            items.push({ntype: 'component', tag: 'h4', cls: ['go-cf-legend'], flex: 'none', text: fieldSet.name});

            fieldSet.description && items.push({
                ntype: 'component',
                cls  : ['go-cf-description'],
                flex : 'none',
                html : escapeHtml(fieldSet.description).replace(/\n/g, '<br>')
            });

            items.push(...rows)
        });

        if (!items.length) {
            items.push({ntype: 'component', cls: ['go-batch-edit-empty'], flex: 'none', text: t('There are no fields to edit')});
            me.getReference('saveButton').disabled = true
        }

        const form = me.getReference('form');

        form.add(items);

        // pair every checkbox with its field
        me.rows = form.items.filter(item => item.goBatchRow).map(row => ({
            checkbox: row.items[0],
            field   : row.items[1]
        }))
    }

    /**
     * One row: a checkbox with the field's name, the field (no label) disabled until checked
     * @param {Object} field GO Field entity
     * @param {Object} config form item config (createFormItem)
     * @returns {Object}
     * @protected
     */
    createRow(field, config) {
        return {
            ntype     : 'container',
            cls       : ['go-batch-edit-row'],
            flex      : 'none',
            layout    : {ntype: 'hbox', align: 'start'},
            goBatchRow: true,
            items     : [{
                module    : BoolCheckBox,
                cls       : ['go-batch-edit-check'],
                flex      : 'none',
                valueLabel: field.name,
                listeners : {change: ({component}) => {
                    const target = component.up().items[1];
                    target.disabled = !component.checked
                }}
            }, {
                ...config,
                labelText: '',
                hideLabel: true,
                disabled : true,
                // empty is a value too: clears the field on every entity
                required : false,
                flex     : 1
            }]
        }
    }

    /**
     * The checked fields, nested like the entity ({customFields: {color: 'red'}})
     * @returns {Object|null} null when a checked field is invalid
     */
    getValues() {
        let values = {},
            valid  = true;

        this.rows.filter(({checkbox}) => checkbox.checked).forEach(({field}) => {
            if (!field.isValid()) {
                valid = false;
                field.validate(false)
            }

            DataSourceForm.setPath(values, field.name, DataSourceForm.fieldValue(field))
        });

        return valid ? values : null
    }

    async save() {
        let me     = this,
            button = me.getReference('saveButton'),
            values = me.getValues();

        if (!values) {
            return
        }

        if (!Object.keys(values).length) {
            notify(me, t('Check the fields to change first'));
            return
        }

        button.disabled = true;

        try {
            const update   = Object.fromEntries(me.ids.map(id => [id, values])),
                  response = await client.call(me.entity + '/set', {update}),
                  failed   = Object.entries(response.notUpdated || {}),
                  updated  = Object.keys(response.updated || {});

            if (failed.length) {
                const [, error] = failed[0];

                notifyError(me, new Error(fmt(t('{count} items were not saved'), {count: failed.length}) + ': ' + client.constructor.describeSetError(error)))
            }

            if (me.isDestroyed) {
                return
            }

            updated.length && me.fire('save', {updated});

            failed.length ? (button.disabled = false) : me.close()
        } catch (e) {
            if (!me.isDestroyed) {
                button.disabled = false;
                notifyError(me, e)
            }
        }
    }
}

export default Neo.setupClass(BatchEditDialog);
