import ArrayField from './ArrayField.mjs';
import {t}        from '../../Translate.mjs';

/**
 * GOUI MapField: an object of values keyed by id, one row field per entry (JMAP maps such
 * as a calendar event's alerts or participants). buildField(value) returns the row's field
 * config, like ArrayField's.
 *
 *     {module: MapField, name: 'alerts', buildField: () => ({
 *         module: ContainerField, items: [
 *             {module: TextField, name: 'offset', flex: 1},
 *             ArrayField.removeButton()
 *         ]
 *     })}
 *     mapField.addValue({offset: '-PT15M'})          // a new key (GOUI nextKey())
 *     mapField.addValue({offset: '-PT1H'}, 'reminder') // a key of your own
 *
 * With `keyFieldName` the key is edited in the row: the row's value carries the key in
 * that property and the map value leaves it out. With `valueFieldName` an entry is a plain
 * value that the row edits in that property:
 *
 *     {module: MapField, name: 'keywords', keyFieldName: 'key', valueFieldName: 'value',
 *      buildField: () => ({module: ContainerField, items: [{module: TextField, name: 'key'},
 *          {module: TextField, name: 'value'}, ArrayField.removeButton()]})}
 *     // value {"$seen": true} ↔ rows [{key: '$seen', value: true}]
 *
 * Value: {key: row value}; an empty map is {}. Removed keys are not in the value, so
 * saving it replaces the whole map. Two rows with the same key make the field invalid
 * instead of one silently replacing the other.
 */
class MapField extends ArrayField {
    static config = {
        className: 'GO.form.field.MapField',
        ntype    : 'go-mapfield',
        baseCls  : ['go-mapfield', 'go-arrayfield', 'neo-container'],
        /**
         * Row property that holds the key (the key is editable)
         * @member {String|null} keyFieldName=null
         */
        keyFieldName: null,
        /**
         * Row property that holds the entry's plain value
         * @member {String|null} valueFieldName=null
         */
        valueFieldName: null
    }

    /** value at the last reset (isDirty) */
    originalValue = {}

    /** highest numeric key seen, for new keys */
    lastKey = 0

    /**
     * @returns {Array[]} [key, entry] per row, in row order (duplicate keys included)
     * @protected
     */
    getEntries() {
        let me = this;

        return me.getRows().map(row => {
            let rowValue = row.getSubmitValue(),
                key      = row.mapKey;

            if (me.keyFieldName && rowValue && typeof rowValue === 'object') {
                rowValue = {...rowValue};
                const typed = rowValue[me.keyFieldName];

                typed !== undefined && typed !== null && typed !== '' && (key = String(typed));
                delete rowValue[me.keyFieldName]
            }

            return [key, me.valueFieldName ? rowValue?.[me.valueFieldName] ?? null : rowValue]
        })
    }

    getSubmitValue() {
        // own properties: an assignment to "__proto__" would set the prototype instead
        return Object.fromEntries(this.getEntries())
    }

    /**
     * @returns {Boolean} two rows have the same key
     */
    hasDuplicateKeys() {
        const keys = this.getEntries().map(([key]) => key);

        return new Set(keys).size !== keys.length
    }

    applyValue(value, reset = false) {
        let me = this;

        me.suspendChange = true;
        me.getRows().forEach(row => me.remove(row, true, true));

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            Object.entries(value).forEach(([key, entry]) => me.addRow(entry, reset, key))
        }

        me.update();

        if (reset) {
            me.originalValue = Neo.clone(me.getSubmitValue(), true)
        }

        me.suspendChange = false
    }

    /**
     * @param {*} value the entry
     * @param {Boolean} reset
     * @param {String} [key] a new key when left out
     * @returns {Neo.component.Base}
     * @protected
     */
    addRow(value, reset, key) {
        let me = this;

        key = key === undefined || key === null ? me.nextKey() : String(key);
        /^\d+$/.test(key) && (me.lastKey = Math.max(me.lastKey, Number(key)));

        const rowValue = me.valueFieldName || me.keyFieldName
                  ? {...(me.valueFieldName ? {[me.valueFieldName]: value} : value), ...(me.keyFieldName ? {[me.keyFieldName]: key} : {})}
                  : value,
              row = me.add({...me.buildField(value), ...(reset ? {} : {value: rowValue})}, true);

        row.mapKey = key;
        reset && row.reset(rowValue);
        return row
    }

    /**
     * Adds an entry (GOUI add())
     * @param {*} value
     * @param {String} [key] a new key when left out
     * @returns {Neo.component.Base} the row field
     */
    addValue(value, key) {
        let me  = this,
            row = me.addRow(value, false, key);

        me.update();
        me.fireChange();
        return row
    }

    /**
     * @returns {String} a numeric key above the ones in use and not in a row (GOUI nextKey())
     * @protected
     */
    nextKey() {
        const used = new Set(this.getEntries().map(([key]) => key));

        while (used.has(String(++this.lastKey))) {}

        return String(this.lastKey)
    }

    reset(value = {}) {
        super.reset(value)
    }

    isEmptyAndRequired() {
        return this.required && !this.getRows().length
    }

    isValid() {
        return !this.hasDuplicateKeys() && super.isValid()
    }

    validate(silent = true) {
        let me        = this,
            valid     = super.validate(silent),
            duplicate = me.hasDuplicateKeys();

        // the key fields of the rows that share a key show it (keyFieldName)
        if (!silent && duplicate && me.keyFieldName) {
            const entries = me.getEntries(),
                  counts  = new Map();

            entries.forEach(([key]) => counts.set(key, (counts.get(key) || 0) + 1));

            me.getRows().forEach((row, index) => {
                const keyField = counts.get(entries[index][0]) > 1 && (row.getChildFields?.() || []).find(field => field.name === me.keyFieldName);

                keyField && (keyField.error = t('Every key may only be used once'))
            })
        }

        return valid && !duplicate
    }
}

export default Neo.setupClass(MapField);
