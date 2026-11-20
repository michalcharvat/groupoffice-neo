import TextField      from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import customFields   from '../customfields/customFields.mjs';
import {flattenOptions} from '../customfields/types.mjs';
import AutocompleteChips from '../form/field/AutocompleteChips.mjs';
import ChipsField     from '../form/field/ChipsField.mjs';
import GroupCombo     from '../form/field/GroupCombo.mjs';
import JmapComboBox   from '../form/field/JmapComboBox.mjs';
import OptionsChips   from '../form/field/OptionsChips.mjs';
import PrincipalCombo from '../form/field/PrincipalCombo.mjs';
import SelectField    from '../form/field/SelectField.mjs';
import {linkFilterEntities} from '../link/linkTypes.mjs';
import {t} from '../Translate.mjs';

/**
 * Value editors of the saved filter conditions (GO.view.FilterDialog), the neo version of
 * go.filter.types and the combos ExtJS filter definitions name as `type`.
 *
 * A filter definition: {name, title, type, multiple, ...}
 *
 * - `string`, `number`, `date`: text. Strings match with wildcards like GO's
 *   (go.util.Filters.normalize: every string filter but "text"); `multiple` takes a comma
 *   separated list. Numbers and dates take GO's syntax (">10", "<-1 week", "2026-01-01..2026-02-01").
 * - `select`: `options: [{value, title}]` (ExtJS go.filter.types.select)
 * - `user`: a user id (ExtJS go.users.UserCombo)
 * - `group`: a group id (ExtJS go.groups.GroupCombo)
 * - `entity`: an id of `entity`, offered with `jmapFilter` and `displayField` (default "name"),
 *   e.g. {type: 'entity', entity: 'AddressBook'} (ExtJS module combos like AddresBookCombo)
 * - `link`: {entity} of the items it has links to (ExtJS go.links.FilterLinkEntityCombo)
 *
 * Combo values are saved as one value, like the ExtJS filter dialog does.
 */

/**
 * @param {Object} def
 * @returns {Boolean}
 */
export function usesWildcards(def) {
    return def?.type === 'string' && def.name.toLowerCase() !== 'text'
}

const isEmpty = v => v === null || v === undefined || v === '';

/** Value of a combo field: the id, null when none is chosen */
const comboValue = comp => {
    const v = comp.getSubmitValue?.() ?? comp.value;
    return isEmpty(v) ? undefined : v
};

/** One saved value: a combo shows one, an array of more cannot be edited here */
const single = v => Array.isArray(v) ? (v.length === 1 ? v[0] : undefined) : v;

const isScalar = v => typeof v === 'string' || typeof v === 'number';

/**
 * The saved value when the field still shows what it showed when it was opened: an edit
 * of another condition must not change this one (e.g. an exact "Acme" would become "%Acme%")
 * @param {Object} comp value field with goShown / goSaved
 * @param {*} current what the field shows now
 * @returns {*} the saved value, undefined when changed or new
 */
const unchanged = (comp, current) => comp.goSaved !== undefined && current === comp.goShown ? comp.goSaved : undefined;

const text = {
    // null ("is empty") and objects can't be typed: such conditions are kept as they are
    accepts: value => isScalar(value) || (Array.isArray(value) && value.length > 0 && value.every(isScalar)),

    field(def, value) {
        let v = Array.isArray(value) ? value.join(', ') : String(value ?? '');

        // "contains" (%x%) shows as x; other patterns (x%, exact) keep their % so saving keeps them
        if (usesWildcards(def)) {
            v = v.split(', ').map(s => /^%.*%$/.test(s) ? s.slice(1, -1) : s).join(', ')
        }

        return {module: TextField, value: v, goShown: v.trim(), goSaved: value}
    },

    read(def, comp) {
        const input = String(comp.value ?? '').trim(),
              saved = unchanged(comp, input);

        if (saved !== undefined) {
            return saved
        }

        if (!input) {
            return undefined
        }

        let values = def.multiple ? input.split(',').map(s => s.trim()).filter(Boolean) : [input];

        // GO's wildcard filters: plain text means "contains", a value with % is a pattern
        if (usesWildcards(def)) {
            values = values.map(v => v.includes('%') ? v : `%${v}%`)
        }

        return def.multiple ? values : values[0]
    }
};

/**
 * @param {Function} config def → field config without the value
 * @returns {Object}
 */
const combo = config => ({
    accepts: value => isScalar(single(value)),
    field  : (def, value) => ({...config(def), value: single(value) ?? null, goShown: single(value), goSaved: value}),
    // eslint-disable-next-line eqeqeq
    read   : (def, comp) => {const v = comboValue(comp); return comp.goSaved !== undefined && v == comp.goShown ? comp.goSaved : v}
});

/**
 * The option of a value, compared loosely like GO does ("1" == 1 == true)
 * @param {Object} def
 * @param {*} value
 * @returns {Object|undefined}
 */
function findOption(def, value) {
    const options = def.options || [];

    return options.find(o => (o.value ?? null) === (value ?? null))
        // eslint-disable-next-line eqeqeq
        || (value === null || value === undefined ? undefined : options.find(o => o.value != null && (o.value == value || String(o.value) === String(value))))
}

const TYPES = {
    string: text,
    number: text,
    date  : text,

    select: {
        accepts: (value, def) => {
            const v = single(value);
            return v !== undefined && !!findOption(def, v)
        },
        field: (def, value) => {
            const options = (def.options || []).map(o => ({value: o.value ?? null, text: o.title}));

            if (value === undefined) {
                // a new condition starts at the first option: null may be an option ("Unknown")
                return {module: SelectField, options, value: options[0]?.value ?? null}
            }

            // the option's own value: SelectField compares strings, a saved 1 must show "true"
            const shown = findOption(def, single(value))?.value ?? null;

            return {module: SelectField, options, value: shown, goShown: shown, goSaved: value}
        },
        // every option is a value, also null
        read: (def, comp) => {
            const v     = comp.value ?? null,
                  saved = unchanged(comp, v);

            return saved !== undefined ? saved : v
        }
    },

    user  : combo(() => ({module: PrincipalCombo, principalEntity: 'User'})),
    group : combo(() => ({module: GroupCombo})),
    entity: combo(def => ({
        module      : JmapComboBox,
        entity      : def.entity,
        jmapFilter  : def.jmapFilter || {},
        displayField: def.displayField || 'name',
        jmapSort    : [{property: def.displayField || 'name', isAscending: true}]
    })),

    link: {
        accepts: value => typeof value?.entity === 'string' && Object.keys(value).length === 1,
        field  : (def, value) => {
            const options = linkFilterEntities().map(e => ({value: e.entity, text: e.title}));

            // an entity of a module this user doesn't have stays in the list
            if (value?.entity && !options.some(o => o.value === value.entity)) {
                options.push({value: value.entity, text: value.entity})
            }

            return {module: SelectField, options, value: value?.entity ?? options[0]?.value ?? null}
        },
        read: (def, comp) => comp.value ? {entity: comp.value} : undefined
    }
};

/**
 * @param {Object} def filter definition
 * @returns {Object} {accepts(value, def), field(def, value), read(def, component)}
 */
export function filterType(def) {
    return TYPES[def?.type] || text
}

/**
 * Editor of an "Input field" (EntityFilter type "variable", go.filter.VariableFilterPanel):
 * the values to search for as chips. Typed text for string, number and date filters,
 * the options of a select or link filter, the entities of a user, group or entity filter.
 * @param {Object} def filter definition
 * @returns {Object} field config, its value an array
 */
export function variableField(def) {
    switch (def?.type) {
        case 'select':
            return {module: OptionsChips, options: (def.options || []).map(o => ({value: o.value ?? null, text: o.title}))};
        case 'link':
            return {module: OptionsChips, options: linkFilterEntities().map(e => ({value: e.entity, text: e.title}))};
        case 'user':
            return {module: AutocompleteChips, entity: 'Principal', jmapFilter: {entity: 'User'}, displayField: 'name', jmapSort: [{property: 'name', isAscending: true}]};
        case 'group':
            return {module: AutocompleteChips, entity: 'Group', displayField: 'name', jmapSort: [{property: 'name', isAscending: true}]};
        case 'entity':
            return {
                module      : AutocompleteChips,
                entity      : def.entity,
                jmapFilter  : def.jmapFilter || {},
                displayField: def.displayField || 'name',
                // a Contact's permissions come from its address book
                properties  : def.properties || null,
                jmapSort    : [{property: def.displayField || 'name', isAscending: true}]
            };
        default:
            return {module: ChipsField}
    }
}

/**
 * JMAP filter of the values of an "Input field": any of them matches, like
 * go.filter.VariableFilterPanel.load(). A `multiple` filter gets them as one array (GO
 * matches any; some server filters can't be repeated in an OR, e.g. Contact userGroupId),
 * one value is the condition itself, more are an OR. Typed text of a wildcard filter means "contains".
 * @param {Object} def filter definition
 * @param {Array} values the field's value
 * @returns {Object|undefined} undefined without values
 */
export function variableCondition(def, values) {
    if (!values?.length) {
        return undefined
    }

    const wildcards = usesWildcards(def),
          converted = values.map(v => {
              if (def.type === 'link') {
                  return {entity: v}
              }

              return wildcards && typeof v === 'string' && !v.includes('%') ? `%${v}%` : v
          });

    if (def.multiple && def.type !== 'link') {
        return {[def.name]: converted}
    }

    return converted.length === 1
        ? {[def.name]: converted[0]}
        : {operator: 'OR', conditions: converted.map(v => ({[def.name]: v}))}
}

/**
 * Filter definition of a custom field (ExtJS go.customfields.type.*.getFilter()), null
 * for types that can't be filtered on
 * @param {Object} field GO Field entity
 * @returns {Object|null}
 */
export function customFieldFilter(field) {
    const base = {name: field.databaseName, title: field.name, multiple: false},
          // the search matches the option texts / names ("region: North, South"), the dialog saves an id
          byName = {...base, multiple: true, wildcards: true};

    switch (field.type) {
        case 'Text':
        case 'TextArea':
        case 'Html':
            return {...base, type: 'string', multiple: true};
        case 'Number':
            return {...base, type: 'number'};
        case 'Date':
        case 'DateTime':
            return {...base, type: 'date'};
        case 'Checkbox':
            return {...base, type: 'select', options: [{value: true, title: t('Yes')}, {value: false, title: t('No')}]};
        case 'YesNo':
            return {...base, type: 'select', options: [{value: 1, title: t('Yes')}, {value: -1, title: t('No')}]};
        case 'Select':
        case 'MultiSelect':
            return {...byName, type: 'select', options: flattenOptions(field.dataType?.options).map(o => ({value: o.id, title: o.text}))};
        case 'User':
            return {...byName, type: 'user'};
        case 'Group':
            return {...byName, type: 'group'};
        case 'Contact':
        case 'MultiContact': {
            // the contacts the field can hold (types.mjs Contact.formField)
            const jmapFilter = {};

            field.options?.isOrganization !== undefined && (jmapFilter.isOrganization = !!field.options.isOrganization);
            field.options?.addressBookId?.length && (jmapFilter.addressBookId = field.options.addressBookId);

            return {...byName, type: 'entity', entity: 'Contact', jmapFilter, properties: ['id', 'name', 'addressBookId']}
        }
        default:
            return null
    }
}

/**
 * Filter definitions of the custom fields of an entity the user can read
 * @param {String} entity e.g. "Contact"
 * @returns {Promise<Object[]>}
 */
export async function customFieldFilters(entity) {
    await customFields.load();

    return customFields.getFieldSets(entity)
        .flatMap(fs => customFields.getFields(fs))
        .map(customFieldFilter)
        .filter(Boolean)
}

/**
 * Splits at a separator outside double quotes (GO String.splitCSV())
 * @param {String} string
 * @param {String} separator
 * @returns {String[]}
 */
function splitOutsideQuotes(string, separator) {
    return string.split(new RegExp(separator + '(?=(?:(?:[^"]*"){2})*[^"]*$)'))
}

/** Strips surrounding quotes and backslash escapes */
function unquote(value) {
    return value.replace(/^"|"$|^'|'$/g, '').replace(/\\(.?)/g, (s, c) => c === '0' ? '\u0000' : c)
}

/**
 * A typed search value as the filter takes it: "link: Contact" → {entity: 'Contact'}, a select
 * without wildcards gets the option's value ("isTrial: yes" / "true" → the true option)
 * @param {Object} def
 * @param {String} value
 * @param {Boolean} wildcards
 * @returns {*}
 */
function searchValue(def, value, wildcards) {
    if (def.type === 'link') {
        return {entity: value}
    }

    if (def.type === 'select' && !wildcards) {
        const lower  = value.toLowerCase(),
              option = (def.options || []).find(o => String(o.value).toLowerCase() === lower || String(o.title).toLowerCase() === lower);

        return option ? option.value ?? null : value
    }

    return value
}

/**
 * The toolbar search with GO's "name:value" syntax (go.util.Filters.parseQueryString(),
 * used by the ExtJS search button of every entity grid):
 *
 *     "Piet"                       → {text: 'Piet'}
 *     "email: piet name: Jansen"   → AND of email %piet% and name %Jansen%
 *     "name: Piet, Jan -city: Ede" → name %Piet% or %Jan%, NOT city %Ede%
 *     'name: "Piet"'               → quoted: exact, without wildcards
 *
 * Text before the first "name:" is the free text search. Names are the filter definitions'
 * (case insensitive); `multiple` filters take a comma separated list. When a word before a
 * colon is not a filter (e.g. "12:30") the whole input is the free text search.
 *
 * @param {String} input
 * @param {Object[]} filters filter definitions, see the top of this file
 * @returns {Object|undefined} JMAP filter, undefined for an empty input
 */
export function parseQuery(input, filters) {
    const query = String(input ?? '').trim();

    if (!query) {
        return undefined
    }

    const defs   = new Map(filters.map(f => [f.name.toLowerCase(), f])),
          tokens = splitOutsideQuotes(query, ':'),
          and    = [],
          not    = [];

    if (tokens.length === 1 || !defs.has('text')) {
        // like GO: a quoted search is the text without its quotes
        return {text: tokens.length === 1 ? unquote(query) : query}
    }

    let current = 'text',
        target  = and;

    for (let i = 0; i < tokens.length; i++) {
        const words = tokens[i].split(' ');
        // the last word of all but the last token is the name of the next filter
        let next = i < tokens.length - 1 ? words.pop().toLowerCase() : null;

        const str = words.join(' ').trim(),
              def = defs.get(current);

        if (str) {
            const wildcards = def.wildcards ?? usesWildcards(def),
                  convert   = v => {
                      const value = unquote(v);
                      // a quoted value is exact
                      return wildcards && value === v ? `%${value}%` : value
                  };

            const values = def.multiple ? splitOutsideQuotes(str, ',').map(v => searchValue(def, convert(v.trim()), wildcards)) : searchValue(def, convert(str), wildcards);

            target.push({[def.name]: values})
        }

        if (next !== null) {
            const negate = next.startsWith('-');

            next = negate ? next.slice(1) : next;

            if (!defs.has(next)) {
                return {text: query}
            }

            current = next;
            target  = negate ? not : and
        }
    }

    not.length && and.push({operator: 'NOT', conditions: not});

    return and.length ? {operator: 'AND', conditions: and} : undefined
}

/**
 * parseQuery() as values for JmapStore.setFilter(): `text` for a plain search, `search`
 * for a "name:value" query, the other one cleared. With an entity its custom fields
 * can be searched too (loaded only for a query with a colon).
 *
 *     store.setFilter(await searchFilter(text, FILTERS, 'Note'))
 *
 * @param {String} input
 * @param {Object[]} filters filter definitions
 * @param {String|null} [entity] e.g. "Note"
 * @returns {Promise<{text: (String|undefined), search: (Object|undefined)}>}
 */
export async function searchFilter(input, filters, entity=null) {
    let defs = filters;

    if (entity && String(input ?? '').includes(':')) {
        try {
            const known = new Set(filters.map(f => f.name.toLowerCase()));
            defs = [...filters, ...(await customFieldFilters(entity)).filter(f => !known.has(f.name.toLowerCase()))]
        } catch (e) {
            // the module's own filters still work
            console.error(e)
        }
    }

    const filter = parseQuery(input, defs);

    return filter?.operator ? {text: undefined, search: filter} : {text: filter?.text, search: undefined}
}
