import client from '../jmap/Client.mjs';

/**
 * Custom field definitions (GOUI customfields/CustomFields.ts): all FieldSets and
 * Fields the user can read, loaded once per App worker and grouped by entity.
 *
 *     await customFields.load();
 *     customFields.getFieldSets('Note').forEach(fs => customFields.getFields(fs));
 *
 * Entities store their values in the `customFields` property: {databaseName: value}.
 */
class CustomFields {
    /** entity → FieldSet[] */
    #fieldSets = {}
    /** fieldSetId → Field[] */
    #fields = {}
    /** @member {Promise|null} */
    #loading = null

    constructor() {
        // another user, or definitions changed by an admin: load again on next use
        const reset = () => this.reset();

        client.on('login',       reset);
        client.on('userChanged', reset);
        client.on('stateChange', ({changed}) => {
            changed?.some(e => e === 'FieldSet' || e === 'Field') && reset()
        })
    }

    reset() {
        this.#loading = null
    }

    /**
     * @returns {Promise<void>}
     */
    load() {
        let me = this;

        // push for the definitions: an admin's change resets the cache (constructor)
        client.watch(['FieldSet', 'Field']);

        me.#loading ??= (async () => {
            const [fieldSets, fields] = await Promise.all([
                      client.get('FieldSet', null),
                      client.get('Field', null)
                  ]),
                  bySet    = {},
                  byEntity = {},
                  order    = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.id).localeCompare(String(b.id));

            (fields || []).forEach(f => (bySet[f.fieldSetId] ??= []).push(f));
            Object.values(bySet).forEach(list => list.sort(order));

            (fieldSets || []).forEach(fs => (byEntity[fs.entity] ??= []).push(fs));
            Object.values(byEntity).forEach(list => list.sort(order));

            me.#fieldSets = byEntity;
            me.#fields    = bySet
        })().catch(e => {
            me.#loading = null;
            throw e
        });

        return me.#loading
    }

    /**
     * @param {String} entity e.g. 'Note'
     * @returns {Object[]} FieldSets, sorted
     */
    getFieldSets(entity) {
        return this.#fieldSets[entity] || []
    }

    /**
     * @param {Object} fieldSet
     * @returns {Object[]} Fields, sorted
     */
    getFields(fieldSet) {
        return this.#fields[fieldSet.id] || []
    }

    /**
     * Entity properties a fieldset filter reads, e.g. ['noteBookId']
     * @param {String} entity
     * @returns {String[]}
     */
    getFilterProperties(entity) {
        const names = new Set();

        this.getFieldSets(entity).forEach(fs => Object.keys(filterOf(fs)).forEach(n => names.add(n)));

        return [...names]
    }
}

/**
 * @param {Object} fieldSet
 * @returns {Object} the filter, {} when none (the server may send [] for none)
 */
function filterOf(fieldSet) {
    const {filter} = fieldSet;

    return filter && typeof filter === 'object' && !Array.isArray(filter) ? filter : {}
}

/**
 * Whether a fieldset applies to an entity (ExtJS FormFieldSet.filter()): every filter
 * property must match, an array filter lists the allowed values (loose compare).
 * @param {Object} fieldSet
 * @param {Object} values entity values
 * @returns {Boolean}
 */
export function matchesFilter(fieldSet, values) {
    return Object.entries(filterOf(fieldSet)).every(([name, allowed]) => {
        const value = values?.[name];

        // eslint-disable-next-line eqeqeq
        return Array.isArray(allowed) ? allowed.some(a => a == value) : allowed == value
    })
}

export default new CustomFields();
