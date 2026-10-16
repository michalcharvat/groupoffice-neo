import Container    from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import BoolCheckBox from '../../form/field/BoolCheckBox.mjs';
import {fieldset}   from '../../form/fieldset.mjs';
import FormWindow   from '../../view/FormWindow.mjs';
import {t}          from '../../Translate.mjs';
import {getFieldType, note, text, textArea} from './fieldTypes.mjs';

/**
 * MariaDB words a column must not be named (FieldDialog.isReserved())
 */
const RESERVED = ['select', 'char', 'table', 'action', 'add', 'alter', 'bigint', 'bit', 'cascade', 'change', 'character',
    'charset', 'check', 'clob', 'column', 'columns', 'comment', 'constraint', 'constraints', 'create', 'current_user', 'datetime',
    'dec', 'decimal', 'deferred', 'default', 'deferrable', 'double', 'drop', 'engine', 'exists', 'foreign', 'full', 'idb_blob',
    'idb_char', 'idb_delete', 'idb_float', 'idb_int', 'if', 'immediate', 'index', 'initially', 'integer', 'key', 'match',
    'max_rows', 'min_rows', 'modify', 'no', 'not', 'null_tok', 'number', 'numeric', 'on', 'partial', 'precision',
    'primary', 'real', 'references', 'rename', 'restrict', 'session_user', 'set', 'smallint', 'system_user',
    'time', 'tinyint', 'to', 'truncate', 'unique', 'unsigned', 'update', 'user', 'varbinary', 'varchar', 'varying',
    'with', 'zone'];

/**
 * A column name from any text: whitespace to "_", only letters, digits, "_" and "-", no leading
 * digits, "go_" before reserved words
 * @param {String} value
 * @returns {String}
 */
export function toDatabaseName(value) {
    const name = String(value || '').trim().replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]+/g, '').replace(/^[0-9]+/, '');

    return name && RESERVED.includes(name.toLowerCase()) ? 'go_' + name : name
}

/**
 * Checks a condition like "nameOfField = test AND checkbox = 1" or "field is empty"
 * (relatedFieldCondition validator)
 * @param {String} value
 * @returns {Boolean}
 */
export function isValidCondition(value) {
    if (!value) {
        return true
    }

    return String(value).split(/ (AND|OR) /).every(part => part === 'AND' || part === 'OR' ||
        String(part).split(/(={1,2}|<|>|!=|>=|<=)/).length === 3 ||
        /^\w+ is (not )?empty$/.test(part.replace(/\s{2,}/g, ' ').trim()))
}

const check = (name, valueLabel, config = {}) => ({module: BoolCheckBox, name, valueLabel, flex: 'none', ...config});

/**
 * Creates or edits a custom field (go.customfields.FieldDialog and the type dialogs):
 * "General" (type, name, database name, hint, prefix, suffix, hidden in grid) and
 * "Validation" (unique, required, conditions) plus what the type adds (fieldTypes.mjs).
 *
 *     Neo.create(FieldDialog, {appName, windowId, fieldType: 'Text', values: {fieldSetId}}) // new
 *     Neo.create(FieldDialog, {appName, windowId, fieldType: 'Select', entityId: 12})       // edit
 */
class FieldDialog extends FormWindow {
    static config = {
        className   : 'GO.customfields.admin.FieldDialog',
        cls         : ['go-form-window', 'go-cf-field-dialog'],
        entityName  : 'Field',
        title       : t('Field'),
        wrapperStyle: {height: '80vh', left: 'max(0px, calc(50vw - 450px))', top: '10vh', width: 'min(900px, 100vw)'},
        /**
         * GO type name (Field.type)
         * @member {String|null} fieldType=null
         */
        fieldType: null
    }

    construct(config) {
        super.construct(config);

        let me = this;

        // a new field starts with the defaults of its fields (ExtJS field `value`s)
        if (!me.entityId) {
            const defaults = {};

            me.collectDefaults(me.formItemConfigs, defaults);
            me.values = {...defaults, ...me.values, type: me.values.type || me.fieldType}
        }
    }

    /**
     * @returns {Object} the type definition (label, icon, items, beforeLoad, beforeSave)
     */
    get type() {
        return getFieldType(this.fieldType) || {name: this.fieldType, label: this.fieldType, items: () => ({})}
    }

    addCustomFields() {
        // a Field has no custom fields
    }

    createFormItems() {
        let me    = this,
            type  = me.type,
            extra = me.typeItems = type.items(me) || {},
            label = getFieldType(me.fieldType) ? type.label : `${me.fieldType} (${t('Unknown')})`;

        const typeItem = {ntype: 'component', cls: ['go-cf-type-label'], flex: 'none', text: t('Type') + ': ' + label},
              nameItem = text('name', t('Name'), {
                  required : true,
                  listeners: {change: ({value}) => me.onNameChange(value)}
              });

        if (extra.onlyName) {
            return me.formItemConfigs = [fieldset(t('General'), [typeItem, nameItem, ...extra.general || []])]
        }

        const general = [
            typeItem,
            nameItem,
            text('databaseName', t('Database name'), {
                required    : true,
                subLabelText: t("This name is used in the database and can only contain alphanumeric characters and underscores. It's only visible to exports and the API."),
                listeners   : {change: ({component, value}) => {
                    const clean = toDatabaseName(value);
                    value && clean !== value && (component.value = clean)
                }}
            }),
            ...extra.formProps === false ? [] : [
                text('hint', t('Hint text')),
                text('prefix', t('Prefix')),
                text('suffix', t('Suffix'))
            ],
            check('hiddenInGrid', t('Hidden in grid'), {value: true}),
            note(t('Field will be hidden by default in grids. Users can enable it through the grid column menu.')),
            ...extra.general || []
        ];

        const validation = extra.noValidation ? [] : [
            check('unique', t('Unique values')),
            check('required', t('Required field'), {
                reference: 'required',
                listeners: {userChange: ({component}) => me.onExclusiveCheck('required', component.checked)}
            }),
            textArea('relatedFieldCondition', t('Required condition'), {
                height      : 60,
                subLabelText: "eg. 'nameOfStandardOrCustomField = test' or 'checkbox = 1'",
                validator   : field => isValidCondition(field.value) || t('The value was not formatted correctly')
            }),
            check('conditionallyRequired', t('Conditionally required field'), {
                listeners: {userChange: ({component}) => me.onExclusiveCheck('conditionallyRequired', component.checked)}
            }),
            check('conditionallyHidden', t('Conditionally hidden field'), {
                listeners: {userChange: ({component}) => me.onExclusiveCheck('conditionallyHidden', component.checked)}
            }),
            ...extra.validation || []
        ];

        // read by construct() for a new field's defaults (no class field: it would reset them)
        return me.formItemConfigs = [{
            module: Container,
            cls   : ['go-cf-field-columns'],
            flex  : 'none',
            layout: 'base',
            items : [
                fieldset(t('General'), general),
                ...validation.length ? [fieldset(t('Validation'), validation)] : []
            ]
        }, ...extra.options?.length ? [fieldset(t('Options'), extra.options)] : []]
    }

    onConstructed() {
        const result = super.onConstructed();

        let me = this;

        // the form loads after a timeout (FormWindow.onConstructed())
        me.form.on({
            beforeload: ({data}) => me.type.beforeLoad?.(data, me),
            beforesave: event    => me.beforeSave(event.data)
        });

        (me.typeItems?.cards || []).forEach(card => me.addCard({...card, cls: ['go-form-card', 'go-cf-field-card']}));

        return result
    }

    /**
     * Values of item configs that have a `value`, by name ("options.maxLength" → nested)
     * @param {Object[]} items
     * @param {Object} target
     * @protected
     */
    collectDefaults(items, target) {
        (items || []).forEach(item => {
            if (item.name && item.value !== undefined) {
                const keys = item.name.split('.'),
                      last = keys.pop();
                let node = target;

                keys.forEach(key => node = node[key] ??= {});
                node[last] = item.value
            }

            item.items && this.collectDefaults(item.items, target)
        })
    }

    /**
     * The database name follows the name while it is empty or what this filled in
     * (change fires per keystroke, ExtJS on blur)
     * @param {String} value
     */
    async onNameChange(value) {
        let me    = this,
            field = await me.form.getField('databaseName');

        if (field && (!field.value || field.value === me.autoDatabaseName)) {
            me.autoDatabaseName = toDatabaseName(value);
            field.value = me.autoDatabaseName
        }
    }

    /**
     * Required, conditionally required and conditionally hidden exclude each other
     * @param {String} name the checked field
     * @param {Boolean} checked
     */
    async onExclusiveCheck(name, checked) {
        if (!checked) {
            return
        }

        for (const other of ['required', 'conditionallyRequired', 'conditionallyHidden']) {
            if (other !== name) {
                const field = await this.form.getField(other);
                field && (field.checked = false)
            }
        }
    }

    /**
     * Field/set data: alter the table on save (forceAlterTable), keep the required flags
     * exclusive, then the type's hook
     * @param {Object} data
     * @protected
     */
    beforeSave(data) {
        data.forceAlterTable = true;

        if (data.conditionallyRequired) {
            data.conditionallyHidden = false;
            data.required            = false
        } else if (data.conditionallyHidden) {
            data.conditionallyRequired = false;
            data.required              = false
        } else if (data.required) {
            data.conditionallyRequired = false;
            data.conditionallyHidden   = false
        }

        this.type.beforeSave?.(data, this)
    }
}

export default Neo.setupClass(FieldDialog);
