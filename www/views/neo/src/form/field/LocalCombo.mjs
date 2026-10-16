import ComboBox from '../../../node_modules/neo.mjs/src/form/field/ComboBox.mjs';

/**
 * ComboBox over fixed options [{id, name}] whose value is the option id. The API may
 * send the id as number or string ("1" / 1): match it loosely to the option. An id 0 is a value.
 */
class LocalCombo extends ComboBox {
    static config = {
        className: 'GO.form.field.LocalCombo'
    }

    beforeSetValue(value, oldValue) {
        if (value !== null && value !== undefined && typeof value !== 'object') {
            // eslint-disable-next-line eqeqeq
            const record = this.store?.items?.find(r => r[this.valueField] == value);
            record && (value = record)
        }

        return super.beforeSetValue(value, oldValue)
    }

    /**
     * neo returns `value[valueField] || emptyValue`: an option id 0 (e.g. Task priority
     * "Normal") would be submitted as null
     * @returns {*}
     */
    getSubmitValue() {
        const id = this.value?.[this.valueField];
        return id === undefined || id === null || id === '' ? this.emptyValue : id
    }
}

export default Neo.setupClass(LocalCombo);
