import DateField     from '../../node_modules/neo.mjs/src/form/field/Date.mjs';
import NumberField   from '../../node_modules/neo.mjs/src/form/field/Number.mjs';
import TextArea      from '../../node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField     from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import GroupCombo    from '../form/field/GroupCombo.mjs';
import HtmlField     from '../form/field/HtmlField.mjs';
import JmapComboBox  from '../form/field/JmapComboBox.mjs';
import PrincipalCombo from '../form/field/PrincipalCombo.mjs';
import TextList      from '../list/TextList.mjs';
import AttachmentsField from '../form/field/AttachmentsField.mjs';
import client        from '../jmap/Client.mjs';
import {decodeEntities, escapeHtml, formatDate, formatUserDateTime, sanitizeHtml, userFormat} from '../Format.mjs';
import {t}           from '../Translate.mjs';
import BoolCheckBox     from '../form/field/BoolCheckBox.mjs';
import DateTimeField    from './fields/DateTimeField.mjs';
import LocalCombo       from '../form/field/LocalCombo.mjs';
import MultiSelectField from './fields/MultiSelectField.mjs';

/**
 * GO custom field types (GOUI customfields/Types.ts) for neo:
 * - formField(field): item config of the form field, null for none
 * - detailHtml(field, value): Promise<String|null> HTML for the detail view, null when empty
 * - cellHtml(field, value, names): HTML of a grid cell (GOUI createTableColumn()), default the
 *   detailHtml of types that render it at once; `nameEntity` types (ids of users, groups,
 *   contacts) get the loaded names (see gridColumns.mjs)
 * - column: extra grid column config (sortable, cellAlign, width); noColumn: no grid column
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

/**
 * Decimals of a number / function field (GO option "numberDecimals")
 * @param {Object} field
 * @returns {Number}
 */
function decimalsOf(field) {
    const decimals = parseInt(field.options?.numberDecimals, 10);
    return isNaN(decimals) ? 2 : decimals
}

/**
 * Attachments of an Attachments field (ExtJS type/Attachments.js renderDetailView()):
 * download links, or thumbnails when the field accepts images
 * @param {Object} field
 * @param {Object[]} value [{blobId, name, description}]
 * @returns {String|null}
 */
function attachmentsHtml(field, value) {
    if (!Array.isArray(value) || !value.length) {
        return null
    }

    const url = a => escapeHtml(client.apiUrl + 'download.php?blob=' + encodeURIComponent(a.blobId) + '&inline=1'),
          caption = a => escapeHtml(a.description || a.name || a.blobId);

    if (!String(field.options?.accept || '').includes('image')) {
        return '<span class="go-cf-attachments">' + value.map(a =>
            `<a class="go-cf-attachment" target="_blank" rel="noopener" href="${url(a)}"><span class="go-icon">attachment</span>${caption(a)}</a>`
        ).join('') + '</span>'
    }

    return '<span class="go-cf-thumbs">' + value.map(a => {
        const thumb = escapeHtml(client.baseUrl + 'api/thumb.php?blob=' + encodeURIComponent(a.blobId) + '&w=480&h=270&zc=1');

        return `<a class="go-cf-thumb" target="_blank" rel="noopener" href="${url(a)}" title="${caption(a)}">` +
            `<img alt="" src="${thumb}"><span>${caption(a)}</span></a>`
    }).join('') + '</span>'
}

/**
 * HTML of a JSON value (ExtJS type/Data.js renderJsonValue()): lists, "key value"
 * lines and date-times formatted
 * @param {*} data
 * @returns {String}
 */
function jsonHtml(data) {
    if (data === null || data === undefined) {
        return '<i>null</i>'
    }

    if (typeof data === 'string' && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(data)) {
        return escapeHtml(formatUserDateTime(data))
    }

    if (Array.isArray(data)) {
        return '<ul class="go-cf-data-list">' + data.map(v => `<li>${jsonHtml(v)}</li>`).join('') + '</ul>'
    }

    if (typeof data === 'object') {
        return Object.entries(data).map(([key, v]) => `<b>${escapeHtml(key)}</b> ${jsonHtml(v)}`).join('<br>')
    }

    return escapeHtml(String(data))
}

/**
 * Detail HTML of a Data field: its JSON text rendered, the text itself when it isn't JSON
 * @param {*} value
 * @returns {String|null}
 */
function dataHtml(value) {
    if (value === null || value === undefined || value === '') {
        return null
    }

    if (typeof value !== 'string') {
        return jsonHtml(value)
    }

    try {
        return jsonHtml(JSON.parse(value))
    } catch (e) {
        return text(value).replace(/\n/g, '<br>')
    }
}

const TYPES = {
    Text: {
        formField : f => ({...baseConfig(f), module: TextField, maxLength: Number(f.options?.maxLength) || null}),
        detailHtml: (f, v) => text(v)
    },
    TextArea: {
        formField : f => ({...baseConfig(f), module: TextArea, height: 100}),
        detailHtml: (f, v) => text(v)?.replace(/\n/g, '<br>') ?? null,
        // GOUI TextAreaCustomField column: one line
        cellHtml  : (f, v) => text(v)?.replace(/\r?\n/g, ' ') ?? null
    },
    EncryptedText: {
        formField : f => ({...baseConfig(f), module: TextField}),
        detailHtml: (f, v) => text(v)
    },
    Number: {
        formField: f => {
            const decimals = decimalsOf(f);

            return {
                ...baseConfig(f),
                module        : NumberField,
                // no limits: neo clamps on blur with Math.min/max, a null limit turns any value into 0
                maxValue      : Number.MAX_SAFE_INTEGER,
                minValue      : -Number.MAX_SAFE_INTEGER,
                // neo reads the decimals from the step as text: 1e-7 would round to integers
                stepSize      : Math.pow(10, -Math.min(decimals, 6)),
                useSpinButtons: false
            }
        },
        detailHtml: (f, v) => formatNumber(v, decimalsOf(f)),
        column    : {cellAlign: 'right', width: 120}
    },
    FunctionField: {
        // calculated by the server: shown, never submitted
        formField : () => null,
        readOnly  : true,
        detailHtml: (f, v) => Number(v) > 0 ? formatNumber(v, decimalsOf(f)) : null,
        // GOUI numbercolumn: zero and negative results too
        cellHtml  : (f, v) => formatNumber(v, decimalsOf(f)),
        column    : {cellAlign: 'right', width: 120}
    },
    Date: {
        formField : f => ({...baseConfig(f), module: DateField}),
        detailHtml: (f, v) => {
            const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || '');
            return m ? escapeHtml(formatDate(new Date(+m[1], m[2] - 1, +m[3]), userFormat.dateFormat)) : null
        },
        column    : {cellAlign: 'right', width: 120}
    },
    DateTime: {
        formField : f => ({...baseConfig(f), module: DateTimeField}),
        detailHtml: (f, v) => v ? escapeHtml(formatUserDateTime(v)) : null,
        column    : {cellAlign: 'right', width: 164}
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
        detailHtml: (f, v) => Array.isArray(v) && v.length ? escapeHtml(v.map(id => optionText(f, id) ?? id).join(', ')) : null,
        // ExtJS MultiSelect.getColumn(): a list of ids, the server cannot sort it
        column    : {sortable: false}
    },
    User: {
        formField : f => ({...baseConfig(f), module: PrincipalCombo, principalEntity: 'User'}),
        detailHtml: async (f, v) => text(await entityName('Principal', v)),
        nameEntity: 'Principal'
    },
    Group: {
        formField : f => ({...baseConfig(f), module: GroupCombo}),
        detailHtml: async (f, v) => text(await entityName('Group', v)),
        nameEntity: 'Group'
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
        detailHtml: async (f, v) => text(await entityName('Contact', v)),
        nameEntity: 'Contact'
    },
    Html: {
        formField : f => ({...baseConfig(f), module: HtmlField, height: 200}),
        detailHtml: (f, v) => v ? sanitizeHtml(String(v)) : null,
        // GOUI HtmlCustomField column: the text without tags
        cellHtml  : (f, v) => text(decodeEntities(String(v ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim())
    },
    Notes: {
        // admin-written text, no value
        formField : f => f.options?.formNotes ? {ntype: 'component', cls: ['go-cf-notes'], flex: 'none', html: sanitizeHtml(f.options.formNotes)} : null,
        detailHtml: f => f.options?.detailNotes ? sanitizeHtml(f.options.detailNotes) : null,
        noValue   : true,
        noColumn  : true
    },
    Attachments: {
        // ExtJS type/Attachments.js: files with a description, kept in a table of their own
        formField : f => {
            const accept = f.options?.accept;

            return {
                ...baseConfig(f),
                module        : AttachmentsField,
                accept        : accept && accept !== '*/*' ? accept : null,
                multiple      : !!f.options?.multiFileSelect,
                hasDescription: true,
                hasDisposition: false
            }
        },
        detailHtml: attachmentsHtml,
        // the names, the server cannot sort the list
        cellHtml  : (f, v) => Array.isArray(v) ? escapeHtml(v.map(a => a.description || a.name).join(', ')) : '',
        column    : {sortable: false}
    },
    Data: {
        // JSON written by code (ExtJS type/Data.js): shown, never edited
        formField : () => null,
        readOnly  : true,
        detailHtml: (f, v) => dataHtml(v),
        cellHtml  : (f, v) => text(typeof v === 'object' && v !== null ? JSON.stringify(v) : v) ?? ''
    },
    TemplateField: {
        // text the server renders from the field's template on save (ExtJS TemplateField.js)
        formField : () => null,
        readOnly  : true,
        detailHtml: (f, v) => TYPES.TextArea.detailHtml(f, v),
        cellHtml  : (f, v) => TYPES.TextArea.cellHtml(f, v)
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
 * @returns {Object} {formField, detailHtml, readOnly, noValue, cellHtml, nameEntity, column, noColumn}
 */
export function getType(field) {
    return TYPES[field.type] || FALLBACK
}

/**
 * HTML of a grid cell, '' when empty
 * @param {Object} field
 * @param {*} value
 * @param {Map<String, String>} [names] "<entity>:<id>" → name, for `nameEntity` types
 * @returns {String}
 */
export function cellHtml(field, value, names) {
    const type = getType(field);

    if (type.nameEntity) {
        const empty = value === null || value === undefined || value === '';
        return empty ? '' : text(names?.get(type.nameEntity + ':' + value)) ?? ''
    }

    const html = (type.cellHtml || type.detailHtml)(field, value);

    // an async detailHtml has no cell renderer: show nothing rather than "[object Promise]"
    return typeof html === 'string' ? html : ''
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
