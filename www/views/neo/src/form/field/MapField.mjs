import ArrayField from './ArrayField.mjs';

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
 * saving it replaces the whole map.
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

    getSubmitValue() {
        let me    = this,
            value = {};

        me.getRows().forEach(row => {
            let rowValue = row.getSubmitValue(),
                key      = row.mapKey;

            if (me.keyFieldName && rowValue && typeof rowValue === 'object') {
                rowValue = {...rowValue};
                const typed = rowValue[me.keyFieldName];

                typed !== undefined && typed !== null && typed !== '' && (key = String(typed));
                delete rowValue[me.keyFieldName]
            }

            value[key] = me.valueFieldName ? rowValue?.[me.valueFieldName] ?? null : rowValue
        });

        return value
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
     * @returns {String} a numeric key above the ones in use (GOUI nextKey())
     * @protected
     */
    nextKey() {
        return String(++this.lastKey)
    }

    reset(value = {}) {
        super.reset(value)
    }

    isEmptyAndRequired() {
        return this.required && !this.getRows().length
    }
}

export default Neo.setupClass(MapField);
