/**
 * Rule table of the ExtJS → neo converter (prototype, docs/neo-converter-study.md).
 *
 * Everything the converter knows is here: which classic class or xtype becomes which neo module,
 * how config keys are renamed, which keys are dropped because neo has no counterpart or does it
 * itself. A key that has no rule is not guessed: it goes into a TODO block with its original code.
 */

/** neo import paths, relative to the neo root of GroupOffice (www/views/neo/) */
export const IMPORTS = {
    TextField      : 'node_modules/neo.mjs/src/form/field/Text.mjs',
    TextArea       : 'node_modules/neo.mjs/src/form/field/TextArea.mjs',
    NumberField    : 'node_modules/neo.mjs/src/form/field/Number.mjs',
    Hidden         : 'node_modules/neo.mjs/src/form/field/Hidden.mjs',
    BoolCheckBox   : 'src/form/field/BoolCheckBox.mjs',
    DateField      : 'src/form/field/DateField.mjs',
    SelectField    : 'src/form/field/SelectField.mjs',
    DateTimeField  : 'src/form/field/DateTimeField.mjs',
    ColorField     : 'src/form/field/ColorField.mjs',
    DisplayField   : 'node_modules/neo.mjs/src/form/field/Display.mjs',
    JmapComboBox   : 'src/form/field/JmapComboBox.mjs',
    AutocompleteChips: 'src/form/field/AutocompleteChips.mjs',
    ArrayField     : 'src/form/field/ArrayField.mjs',
    ContainerField : 'src/form/field/ContainerField.mjs',
    Button         : 'src/button/Button.mjs',
    TableTitle     : 'src/component/TableTitle.mjs',
    JmapStore      : 'src/data/JmapStore.mjs',
    Grid           : 'src/grid/Grid.mjs',
    ListToolbar    : 'src/grid/ListToolbar.mjs',
    Container      : 'node_modules/neo.mjs/src/container/Base.mjs',
    LinesCard      : 'src/detail/LinesCard.mjs',
    Panel          : 'src/detail/Panel.mjs',
    FormWindow     : 'src/view/FormWindow.mjs',
    ModuleRegistry : 'src/ModuleRegistry.mjs',
    // named exports: [file, name]
    ...Object.fromEntries(['READ', 'CREATE', 'WRITE', 'DELETE', 'MANAGE'].map(l => ['LEVEL_' + l, ['src/Acl.mjs', 'LEVEL_' + l]])),
    fieldset       : ['src/form/fieldset.mjs', 'fieldset'],
    translator     : ['src/Translate.mjs', 'translator'],
    escapeHtml     : ['src/Format.mjs', 'escapeHtml'],
    formatUserDateTime: ['src/Format.mjs', 'formatUserDateTime'],
    smartDateTime  : ['src/Format.mjs', 'smartDateTime']
};

/** xtype of a form item → neo field module */
export const FIELD_XTYPES = {
    textfield  : 'TextField',
    textarea   : 'TextArea',
    numberfield: 'NumberField',
    hidden     : 'Hidden',
    xcheckbox  : 'BoolCheckBox',
    checkbox   : 'BoolCheckBox',
    datefield  : 'DateField',
    gonumberfield: 'NumberField',
    datetimefield: 'DateTimeField',
    colorfield : 'ColorField',
    displayfield: 'DisplayField'
};

/** classic field classes used with `new X({...})` → the xtype they read as */
export const CLASS_XTYPES = {
    'Ext.form.TextField'  : 'textfield',
    'Ext.form.TextArea'   : 'textarea',
    'Ext.form.NumberField': 'numberfield',
    'go.form.NumberField' : 'numberfield',
    'Ext.form.Hidden'     : 'hidden',
    'Ext.form.Checkbox'   : 'checkbox',
    'Ext.ux.form.XCheckbox': 'xcheckbox',
    'Ext.form.DateField'  : 'datefield',
    'go.form.DateField'   : 'datefield',
    'Ext.form.DisplayField': 'displayfield',
    'Ext.form.FieldSet'   : 'fieldset',
    'Ext.Container'       : 'container',
    'go.form.SelectField' : 'selectfield'
};

/**
 * Core classic classes used with `new X({...})` (or as an xtype) → a neo field config. `defaults` are
 * added before the item's own (converted) keys.
 */
export const CORE_CLASSES = {
    'go.modules.community.addressbook.ContactCombo': {
        module  : 'JmapComboBox',
        defaults: {
            entity      : "'Contact'",
            displayField: "'name'",
            valueField  : "'id'",
            // an AclItemEntity: Contact/get needs addressBookId
            properties  : "['id', 'name', 'addressBookId']",
            jmapSort    : "[{property: 'name', isAscending: true}]"
        },
        // ContactCombo keys with no neo counterpart (neo shows organisations and persons, no "+")
        drop: ['isOrganization', 'allowNew']
    }
};

/**
 * Field config keys: classic key → neo key, or a function (value code, item) → [[key, code], ...]
 * (empty = dropped on purpose: neo does it itself or has no counterpart).
 */
export const FIELD_KEYS = {
    name       : 'name',
    hiddenName : 'name',
    fieldLabel : 'labelText',
    boxLabel   : 'valueLabel',
    emptyText  : 'placeholderText',
    height     : 'height',
    value      : 'value',
    minValue   : 'minValue',
    maxValue   : 'maxValue',
    minLength  : 'minLength',
    maxLength  : 'maxLength',
    readOnly   : 'readOnly',
    disabled   : 'disabled',
    hideLabel  : 'hideLabel',
    itemId     : 'reference',
    // an explicit true stays: it overrides a factory that defaults to required
    allowBlank : v => v === 'false' ? [['required', 'true']] : v === 'true' ? [['required', 'false']] : [],
    allowDecimals: v => v === 'false' ? [['stepSize', '1']] : [],
    // go.form.NumberField decimals: 0 → stepSize 1, 2 → 0.01
    decimals: v => /^\d+$/.test(v) ? [['stepSize', String(10 ** -Number(v))]] : [],
    // a checkbox checked from the start
    checked : v => v === 'true' ? [['value', 'true']] : [],
    // neo has no flag: a minValue of 0 does it, unless the field has a minValue of its own
    allowNegative: (v, p, siblings) => v === 'false' && !siblings.some(s => s.key?.name === 'minValue') ? [['minValue', '0']] : [],
    // the neo field is as wide as its form; precision follows stepSize; the label sits inline
    anchor          : () => [],
    decimalPrecision: () => [],
    labelWidth      : () => [],
    setFocus        : () => [],
    // a column layout's width share: the hbox container makes it the field's flex
    columnWidth     : () => [],
    // classic combo plumbing that neo's JmapComboBox does itself
    triggerAction : () => [],
    selectOnFocus : () => [],
    forceSelection: () => [],
    editable      : () => [],
    mode          : () => [],
    pageSize      : () => []
};

/** grid column keys */
export const COLUMN_KEYS = {
    // a plain header string is translated too (classic 'ID' showed untranslated)
    header   : v => [['text', /^'/.test(v) ? `t(${v})` : v]],
    dataIndex: 'dataField',
    hidden   : v => v === 'true' ? [['hidden', 'true']] : [],
    hideable : 'hideable',
    align    : 'cellAlign',
    width    : 'width',
    sortable : v => v === 'false' ? [['sortable', 'false']] : [],
    // neo matches autoExpandColumn against dataField, there is no column id
    id       : () => [],
    groupable: () => []
};

/** go.form.Dialog class keys */
export const DIALOG_KEYS = {
    title     : 'title',
    entityStore: 'entityName',
    titleField: 'titleField',
    modal     : 'modal',
    // neo keeps the dialog's size in wrapperStyle (from width + height), not in a state id
    stateId       : () => [],
    width         : () => [],
    height        : () => [],
    // neo never redirects after save; no maximise / collapse tools on GO.view.Dialog
    redirectOnSave: () => [],
    maximizable   : () => [],
    collapsible   : () => [],
    formPanelLayout: () => []
};

/** go.detail.Panel class keys */
export const DETAIL_KEYS = {
    entityStore: 'entityName',
    stateId    : () => [],
    // neo loads the record by its properties and reads related entities in renderRecord()
    relations  : null
};

/** go.detail.Panel add*() calls → core card names (GO.detail.Panel `cards`) */
export const DETAIL_CARDS = {
    addCustomFields: 'customFields',
    addComments    : 'comments',
    addFiles       : 'files',
    addLinks       : 'links',
    addHistory     : 'history'
};

/** detail toolbar items that core GO.detail.Panel builds itself (Edit, links, ⋮ Print, Delete) */
export const CORE_DETAIL_BUTTONS = ['edit', 'delete', 'print', 'go.detail.addButton', 'linkbrowserbutton',
    'linkbrowsermenuitem', 'filebrowsermenuitem'];

/**
 * `clearable` of a plain (not Reset) combo factory: false as classic (no clear trigger); null leaves neo's
 * default (clearable), which the ports and crew hand ports chose for their factories.
 */
export const PLAIN_COMBO_CLEARABLE = false;

/** go.permissionLevels.* → the constants of core src/Acl.mjs */
export const PERMISSION_LEVELS = {read: 'LEVEL_READ', create: 'LEVEL_CREATE', write: 'LEVEL_WRITE', delete: 'LEVEL_DELETE', manage: 'LEVEL_MANAGE'};

/** classic base class → converter handler (convert.mjs) */
export const BASES = {
    'go.form.Dialog'       : 'dialog',
    'go.detail.Panel'      : 'detail',
    'go.grid.GridPanel'    : 'grid',
    'go.form.ComboBox'     : 'combo',
    'go.form.ComboBoxReset': 'combo',
    'go.form.Chips'        : 'chips'
};

/**
 * Kinds of code that stay manual: the first matching pattern names the TODO block (the report
 * counts lines per kind).
 */
export const TODO_KINDS = [
    ['Ext.override', /Ext\.override\s*\(/],
    ['server call (GO.request, go.Jmap, go.Db)', /GO\.request\s*\(|go\.Jmap\.request|go\.Db\.store|\.single\(|\.query\(/],
    ['listeners / events', /\blisteners\s*:|\.on\s*\(\s*['"]|\.addListener\s*\(|\.fireEvent\s*\(/],
    ['store handling', /\.store\.|\.setFilter\s*\(|\.load\s*\(|new go\.data\.Store|Ext\.data\./],
    ['template (XTemplate)', /XTemplate|<tpl|\{\[/],
    ['renderer', /renderer\s*:/],
    ['handler', /handler\s*:/],
    ['initComponent / method logic', /function\s*\(/]
];
