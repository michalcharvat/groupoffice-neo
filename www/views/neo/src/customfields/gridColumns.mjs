import client from '../jmap/Client.mjs';
import customFields from './customFields.mjs';
import {cellHtml, getType} from './types.mjs';

/**
 * Grid columns of an entity's custom fields (ExtJS GridTrait.initCustomFields(),
 * GOUI CustomFields.getTableColumns()). GO.grid.Grid adds them with `customFieldsEntity`.
 *
 * - dataField 'customFields.<databaseName>': the record value and the sort the server knows
 *   (Entity::sort() joins the custom fields table for "customFields.*")
 * - stateKey '<databaseName>': GOUI's column id, so hidden columns and widths are shared
 * - hidden as the field's "Hide in grid" option, shown in the column menu
 */

/**
 * "<entity>:<id>" → name of users, groups and contacts in custom field cells
 * @type {Map<String, String>}
 */
const names = new Map();

// another user may not read the same names
client.on('login',       () => names.clear());
client.on('userChanged', () => names.clear());

/**
 * @param {Object} field GO Field entity
 * @returns {Object|null} GO.grid.Grid column config
 */
export function createColumn(field) {
    const type = getType(field);

    if (type.noColumn) {
        return null
    }

    return {
        dataField    : 'customFields.' + field.databaseName,
        stateKey     : field.databaseName,
        text         : field.name,
        width        : 160,
        hidden       : !!field.hiddenInGrid,
        goCustomField: field,
        ...type.column,
        renderer     : ({record}) => cellHtml(field, record.customFields?.[field.databaseName], names)
    }
}

/**
 * Columns of all custom fields of an entity, in field set and field order
 * @param {String} entity e.g. 'Contact'
 * @returns {Promise<Object[]>}
 */
export async function createColumns(entity) {
    await customFields.load();

    return customFields.getFieldSets(entity)
        .flatMap(fieldSet => customFields.getFields(fieldSet))
        .map(createColumn)
        .filter(Boolean)
}

/**
 * Loads the names that cells of user, group and contact fields show. Every load asks again
 * for the names of its records: a renamed contact or a user that became readable shows up
 * with the next reload, as in ExtJS where they came with the records.
 * @param {Object[]} fields GO Field entities of the visible columns
 * @param {Object[]} records
 * @returns {Promise<Boolean>} whether a name was added or changed (render the rows again)
 */
export async function loadNames(fields, records) {
    const wanted = {};

    fields.forEach(field => {
        const entity = getType(field).nameEntity;

        entity && records.forEach(record => {
            const id = record.customFields?.[field.databaseName];

            id !== null && id !== undefined && id !== '' && (wanted[entity] ??= new Set()).add(String(id))
        })
    });

    let changed = false;

    const set = (key, name) => {
        if (names.get(key) !== name) {
            names.set(key, name);
            changed = true
        }
    };

    await Promise.all(Object.keys(wanted).map(async entity => {
        const ids   = [...wanted[entity]],
              found = new Set();

        // Contact needs the address book module; Principal and Group are core
        if (entity === 'Contact' && !client.hasCapability('go:community:addressbook')) {
            ids.forEach(id => set(entity + ':' + id, ''));
            return
        }

        try {
            (await client.get(entity, ids, ['id', 'name'])).forEach(r => {
                found.add(String(r.id));
                set(entity + ':' + r.id, r.name)
            })
        } catch (e) {
            // keep the names shown; asked again on the next load
            return
        }

        // deleted or not readable
        ids.forEach(id => found.has(id) || set(entity + ':' + id, ''))
    }));

    return changed
}
