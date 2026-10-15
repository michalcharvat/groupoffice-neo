import DateField     from '../../node_modules/neo.mjs/src/form/field/Date.mjs';
import NumberField   from '../../node_modules/neo.mjs/src/form/field/Number.mjs';
import TextArea      from '../../node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField     from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import GroupCombo    from '../form/field/GroupCombo.mjs';
import HtmlField     from '../form/field/HtmlField.mjs';
import JmapComboBox  from '../form/field/JmapComboBox.mjs';
import PrincipalCombo from '../form/field/PrincipalCombo.mjs';
import TextList      from '../list/TextList.mjs';
import client        from '../jmap/Client.mjs';
import {escapeHtml, formatDate, formatUserDateTime, sanitizeHtml, userFormat} from '../Format.mjs';
import {t}           from '../Translate.mjs';
import BoolCheckBox     from './fields/BoolCheckBox.mjs';
import DateTimeField    from './fields/DateTimeField.mjs';
import LocalCombo       from './fields/LocalCombo.mjs';
import MultiSelectField from './fields/MultiSelectField.mjs';

/**
 * GO custom field types (GOUI customfields/Types.ts) for neo:
 * - formField(field): item config of the form field, null for none
 * - detailHtml(field, value): Promise<String|null> HTML for the detail view, null when empty
 *
 * Form fields are named 'customFields.<databaseName>', so a form loads and saves them
 * as the entity's `customFields` object. Types without an editor here show their value
 * read-only (GO.customfields.ReadOnly, see FormFieldset).
 */

/**
 * Select options flattened with their path ("Green > Light green")
 * @param {Object[]} options GO select options (tree: id, text, children)
 * @param {String} [prefix]
 * @returns {Object[]} [{id, text}]
 */
export function flattenOptions(options = [], prefix = '') {
    const result = [];

    options.forEach(o => {
        const text = prefix ? prefix + ' > ' + o.text : o.text;

        o.enabled !== false && result.push({id: Number(o.id), text});
        o.children?.length && result.push(...flattenOptions(o.children, text))
    });

    return result
}

function optionText(field, id) {
    // eslint-disable-next-line eqeqeq
    return flattenOptions(field.dataType?.options).find(o => o.id == id)?.text ?? null
}

/**
 * Common form field config (GOUI AbstractCustomField.getFormFieldConfig())
 * @param {Object} field
 * @returns {Object}
 */
function baseConfig(field) {
    const config = {
        // a dotted name, not formGroup: neo caches a field's formGroup path the first
        // time it is read, which can happen before the config is applied
        name         : 'customFields.' + field.databaseName,
        labelText    : field.name + (field.prefix ? ` (${field.prefix})` : '') + (field.suffix ? ` (${field.suffix})` : ''),
        labelPosition: 'inline',
        required     : !!field.required,
        flex         : 'none',
        width        : null
    };

    field.hint && (config.subLabelText = field.hint);

    if (field.options?.validationRegex) {
        let regex;

        try {
            regex = new RegExp(field.options.validationRegex, field.options.validationModifiers || undefined)
        } catch (e) {
            regex = null
        }

        regex && (config.validator = f => !f.value || regex.test(String(f.value)) || t('Invalid input'))
    }

    return config
}

/** A combo over local options: [{id, name}] */
function localCombo(field, data) {
    return {
        ...baseConfig(field),
        module      : LocalCombo,
        displayField: 'name',
        valueField  : 'id',
        listConfig  : {module: TextList},
        store       : {keyProperty: 'id', data}
    }
}

async function entityName(entity, id, property = 'name') {
    if (id === null || id === undefined || id === '') {
        return null
    }

    try {
        const [record] = await client.get(entity, [String(id)], ['id', property]);
        return record ? record[property] : null
    } catch (e) {
        return null
    }
}

const text = v => v === null || v === undefined || v === '' ? null : escapeHtml(String(v));

function formatNumber(value, decimals) {
    if (value === null || value === undefined || value === '') {
        return null
    }

    const n = Number(value);

    return isNaN(n) ? escapeHtml(String(value)) : n.toLocaleString(undefined, {
        minimumFractionDigits: decimals ?? 0,
        maximumFractionDigits: decimals ?? 2
    })
}

const TYPES = {
    Text: {
        formField : f => ({...baseConfig(f), module: TextField, maxLength: Number(f.options?.maxLength) || null}),
        detailHtml: (f, v) => text(v)
    },
    TextArea: {
        formField : f => ({...baseConfig(f), module: TextArea, height: 100}),
        detailHtml: (f, v) => text(v)?.replace(/\n/g, '<br>') ?? null
    },
    EncryptedText: {
        formField : f => ({...baseConfig(f), module: TextField}),
        detailHtml: (f, v) => text(v)
    },
    Number: {
        formField: f => {
            const decimals = f.options?.decimals ?? 2;

            return {
                ...baseConfig(f),
                module        : NumberField,
                maxValue      : null,
                minValue      : null,
                stepSize      : Math.pow(10, -decimals),
                useSpinButtons: false
            }
        },
        detailHtml: (f, v) => formatNumber(v, f.options?.decimals)
    },
    FunctionField: {
        // calculated by the server: shown, never submitted
        formField : () => null,
        readOnly  : true,
        detailHtml: (f, v) => Number(v) > 0 ? formatNumber(v, f.options?.decimals) : null
    },
    Date: {
        formField : f => ({...baseConfig(f), module: DateField}),
        detailHtml: (f, v) => {
            const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || '');
            return m ? escapeHtml(formatDate(new Date(+m[1], m[2] - 1, +m[3]), userFormat.dateFormat)) : null
        }
    },
    DateTime: {
        formField : f => ({...baseConfig(f), module: DateTimeField}),
        detailHtml: (f, v) => v ? escapeHtml(formatUserDateTime(v)) : null
    },
    Checkbox: {
        formField : f => ({...baseConfig(f), module: BoolCheckBox, valueLabel: f.name, labelText: f.name}),
        detailHtml: (f, v) => v ? t('Yes') : null
    },
    YesNo: {
        // GO stores 1 = yes, -1 = no, null = not set
        formField : f => localCombo(f, [{id: 1, name: t('Yes')}, {id: -1, name: t('No')}]),
        detailHtml: (f, v) => Number(v) === 1 ? t('Yes') : Number(v) === -1 ? t('No') : null
    },
    Select: {
        formField : f => localCombo(f, flattenOptions(f.dataType?.options).map(o => ({id: o.id, name: o.text}))),
        detailHtml: (f, v) => text(optionText(f, v))
    },
    MultiSelect: {
        formField : f => ({...baseConfig(f), module: MultiSelectField, options: flattenOptions(f.dataType?.options)}),
        detailHtml: (f, v) => Array.isArray(v) && v.length ? escapeHtml(v.map(id => optionText(f, id) ?? id).join(', ')) : null
    },
    User: {
        formField : f => ({...baseConfig(f), module: PrincipalCombo, principalEntity: 'User'}),
        detailHtml: async (f, v) => text(await entityName('Principal', v))
    },
    Group: {
        formField : f => ({...baseConfig(f), module: GroupCombo}),
        detailHtml: async (f, v) => text(await entityName('Group', v))
    },
    Contact: {
        formField: f => {
            if (!client.hasCapability('go:community:addressbook')) {
                return null
            }

            const filter = {};

            f.options?.isOrganization !== undefined && (filter.isOrganization = !!f.options.isOrganization);
            f.options?.addressBookId?.length && (filter.addressBookId = f.options.addressBookId);

            return {
                ...baseConfig(f),
                module      : JmapComboBox,
                entity      : 'Contact',
                displayField: 'name',
                properties  : ['id', 'name'],
                jmapFilter  : filter,
                jmapSort    : [{property: 'name', isAscending: true}]
            }
        },
        readOnly  : true,
        detailHtml: async (f, v) => text(await entityName('Contact', v))
    },
    Html: {
        formField : f => ({...baseConfig(f), module: HtmlField, height: 200}),
        detailHtml: (f, v) => v ? sanitizeHtml(String(v)) : null
    },
    Notes: {
        // admin-written text, no value
        formField : f => f.options?.formNotes ? {ntype: 'component', cls: ['go-cf-notes'], flex: 'none', html: sanitizeHtml(f.options.formNotes)} : null,
        detailHtml: f => f.options?.detailNotes ? sanitizeHtml(f.options.detailNotes) : null,
        noValue   : true
    }
};

/** Types without an editor: the value is shown read-only in the form */
const FALLBACK = {
    formField : () => null,
    readOnly  : true,
    detailHtml: (f, v) => {
        if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) {
            return null
        }

        return escapeHtml(typeof v === 'object' ? JSON.stringify(v) : String(v))
    }
};

/**
 * @param {Object} field GO Field entity
 * @returns {Object} {formField, detailHtml, readOnly, noValue}
 */
export function getType(field) {
    return TYPES[field.type] || FALLBACK
}

/**
 * Form item config of a field, or a read-only display for types without an editor
 * (marked with goCustomField / goReadOnly so the fieldset fills in the value)
 * @param {Object} field
 * @returns {Object|null}
 */
export function createFormItem(field) {
    const type   = getType(field),
          config = type.formField(field);

    if (config) {
        return {...config, goCustomField: field}
    }

    if (type.readOnly) {
        return {
            ntype        : 'component',
            cls          : ['go-cf-readonly'],
            flex         : 'none',
            goCustomField: field,
            goReadOnly   : true,
            html         : ''
        }
    }

    return null
}
