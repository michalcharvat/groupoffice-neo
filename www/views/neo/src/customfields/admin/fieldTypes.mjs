import ModuleRegistry from '../../ModuleRegistry.mjs';
import NumberField from '../../../node_modules/neo.mjs/src/form/field/Number.mjs';
import TextArea    from '../../../node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField   from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';
import LocalCombo  from '../../form/field/LocalCombo.mjs';
import TextList    from '../../list/TextList.mjs';
import {t}         from '../../Translate.mjs';
import {createFormItem} from '../types.mjs';
import SelectOptionsField from './SelectOptionsField.mjs';

/**
 * Custom field types as the admin edits them (go.customfields.type.* label, iconCls and
 * getDialog() → *Dialog.js). A type adds items to the field dialog:
 *
 *     registerFieldType('Contact', {
 *         label    : t('Contact'),
 *         icon     : 'person',                  // Material Symbols
 *         hideInNew: false,                     // not offered for new fields (MultiContact)
 *         items    : dialog => ({
 *             general   : [...],                // below the common "General" fields
 *             validation: [...],                // below "Validation"
 *             options   : [...],                // own "Options" fieldset under both
 *             cards     : [{header: {text}, items}],  // extra tabs
 *             formProps : false,                // no hint / prefix / suffix (function, template)
 *             noValidation: true,               // no "Validation" fieldset
 *             onlyName  : true                  // only type and name (notes)
 *         }),
 *         beforeLoad: (data, dialog) => {},      // the loaded (or new) field, before the fields get it
 *         beforeSave: (data, dialog) => {}       // change the Field/set data
 *     })
 *
 * Modules register their types in a file their registry entry loads with `customFieldsAdmin`
 * (addressbook: Contact, MultiContact), see loadModuleTypes().
 */

const types = {};

/**
 * @param {String} name GO type name (Field.type)
 * @param {Object} definition
 */
export function registerFieldType(name, definition) {
    types[name] = {name, icon: 'description', items: () => ({}), ...definition}
}

/**
 * @param {String} name
 * @returns {Object|null}
 */
export function getFieldType(name) {
    return types[name] || null
}

/**
 * @returns {Object[]} all types, by label
 */
export function getFieldTypes() {
    return Object.values(types).sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Loads the modules' `customFieldsAdmin` files (their types and field set extensions)
 * @returns {Promise<void>}
 */
export async function loadModuleTypes() {
    await Promise.all(ModuleRegistry.getConfigs('customFieldsAdmin').map(load => load().catch(e => console.error('customFieldsAdmin', e))))
}

// item helpers for type definitions

export const text = (name, labelText, config = {}) => ({module: TextField, name, labelText, labelPosition: 'inline', flex: 'none', ...config});

export const textArea = (name, labelText, config = {}) => ({module: TextArea, name, labelText, labelPosition: 'inline', flex: 'none', height: 100, ...config});

export const number = (name, labelText, config = {}) => ({
    module        : NumberField,
    name,
    labelText,
    labelPosition : 'inline',
    flex          : 'none',
    // neo clamps to maxValue (default 100) on blur
    maxValue      : Number.MAX_SAFE_INTEGER,
    minValue      : -Number.MAX_SAFE_INTEGER,
    useSpinButtons: false,
    ...config
});

/**
 * Combo over fixed options (ExtJS radio groups)
 * @param {String} name
 * @param {String} labelText
 * @param {Array[]} options [[value, text]]
 * @param {Object} [config]
 * @returns {Object}
 */
export const select = (name, labelText, options, config = {}) => ({
    module       : LocalCombo,
    name,
    labelText,
    labelPosition: 'inline',
    flex         : 'none',
    width        : null,
    displayField : 'name',
    valueField   : 'id',
    editable     : false,
    listConfig   : {module: TextList},
    store        : {keyProperty: 'id', data: options.map(([id, name]) => ({id, name}))},
    ...config
});

export const note = (text, config = {}) => ({ntype: 'component', cls: ['go-field-hint'], flex: 'none', text, ...config});

/**
 * "Default value" field: the type's own form field (src/customfields/types.mjs) named "default"
 * @param {String} type
 * @param {Object} [options] field options (e.g. numberDecimals)
 * @returns {Object}
 */
export function defaultField(type, options = {}) {
    const item = createFormItem({type, name: t('Default value'), databaseName: 'default', options});

    delete item.goCustomField;
    return {...item, name: 'default', required: false}
}

const maxLength = () => number('options.maxLength', t('Maximum length'), {
    value       : 50,
    minValue    : 1,
    stepSize    : 1,
    subLabelText: t('If the maximum length is greater then 255 chars the column type will be TEXT instead of VARCHAR. Note that TEXT fields can\'t have a default value. See the MySQL/MaraDB documentation for more information.')
});

const decimals = () => number('options.numberDecimals', t('Decimals'), {value: 2, minValue: 0, maxValue: 6, stepSize: 1});

const textType = () => ({general: [defaultField('Text')], validation: [maxLength()]});

registerFieldType('Text', {label: t('Text'), icon: 'description', items: textType});
registerFieldType('EncryptedText', {label: t('Encrypted text'), icon: 'lock', items: textType});
registerFieldType('TextArea', {label: t('Text area'), icon: 'notes'});
registerFieldType('Html', {label: t('HTML'), icon: 'code'});
registerFieldType('Data', {label: t('Data'), icon: 'storage'});
registerFieldType('User', {label: t('User'), icon: 'person'});
registerFieldType('Group', {label: t('Group'), icon: 'group'});

registerFieldType('Number', {
    label: t('Number'),
    icon : 'format_list_numbered',
    items: () => ({general: [decimals(), defaultField('Number', {numberDecimals: 4})]})
});

registerFieldType('Checkbox', {
    label: t('Checkbox'),
    icon : 'check_box',
    items: () => ({general: [{...defaultField('Checkbox'), valueLabel: t('Default'), labelText: t('Default')}]})
});

registerFieldType('Date', {label: t('Date'), icon: 'event', items: () => ({general: [defaultField('Date')]})});
registerFieldType('DateTime', {label: t('Date and time'), icon: 'schedule', items: () => ({general: [defaultField('DateTime')]})});

registerFieldType('YesNo', {
    label: t('Yes or no'),
    icon : 'rule',
    items: () => ({general: [{...defaultField('YesNo'), labelText: t('Default')}]})
});

registerFieldType('Select', {
    label: t('Select'),
    icon : 'list',
    items: () => ({cards: [{
        header: {text: t('Options')},
        items : [
            note(t('Warning: removing select options also removes the data from the records. You can disable select options by unchecking them. ')),
            {module: SelectOptionsField, name: 'dataType.options', flex: 1}
        ]
    }]})
});

registerFieldType('MultiSelect', {
    label: t('Multi Select'),
    icon : 'checklist',
    items: () => ({options: [{module: SelectOptionsField, name: 'dataType.options', flat: true}]})
});

registerFieldType('Notes', {
    label: t('Notes'),
    icon : 'sticky_note_2',
    items: () => ({
        onlyName: true,
        general : [
            textArea('options.formNotes', t('Form'), {subLabelText: t('These notes will display in the form')}),
            textArea('options.detailNotes', t('Detail'), {subLabelText: t('These notes will display in the detail view')})
        ]
    })
});

registerFieldType('FunctionField', {
    label: t('Function'),
    icon : 'functions',
    items: () => ({
        formProps   : false,
        noValidation: true,
        general     : [
            note(t("You can create a function using other number fields. Use the 'databaseName' property as tag. For example {foo} + {bar}. You can use the following operators: / , * , + and -")),
            decimals(),
            textArea('options.function', t('Function'))
        ]
    })
});

registerFieldType('TemplateField', {
    label: t('Template'),
    icon : 'note',
    items: () => ({
        formProps   : false,
        noValidation: true,
        general     : [{
            ntype: 'component',
            tag  : 'p',
            flex : 'none',
            cn   : [{
                tag   : 'a',
                cls   : ['go-link'],
                href  : 'https://groupoffice.readthedocs.io/en/latest/system-settings/custom-fields.html#template-field',
                target: '_blank',
                rel   : 'noopener',
                text  : t('Visit documentation page')
            }]
        }, textArea('options.template', t('Template'), {
            value: '[assign firstContactLink = entity | links:Contact | first]{{firstContactLink.name}}'
        })]
    })
});

registerFieldType('Attachments', {
    label: t('Attachments'),
    icon : 'attachment',
    items: () => ({options: [
        select('options.accept', t('File types'), [
            ['*/*', t('All')],
            ['image/*', t('Images')],
            ['video/*', t('Video')],
            ['.xlsx,.xls,.doc, .docx,.ppt, .pptx,.txt,.pdf', t('Documents')],
            ['application/pdf', t('PDFs')]
        ], {value: '*/*'}),
        // a combo value can't be false: 0 / 1 (LocalCombo matches the loaded boolean loosely), boolean again in beforeSave
        select('options.multiFileSelect', t('File selection'), [[0, t('Single')], [1, t('Multiple')]], {value: 0})
    ]}),
    beforeSave: data => {
        data.options && 'multiFileSelect' in data.options && (data.options.multiFileSelect = !!data.options.multiFileSelect)
    }
});
