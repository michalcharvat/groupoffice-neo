import CheckBox from '../../../node_modules/neo.mjs/src/form/field/CheckBox.mjs';

/**
 * Checkbox whose value is the checked state (true / false), like a GOUI checkbox.
 * neo's CheckBox submits `value` when checked and form reset() sets `value`, not
 * `checked`, so a loaded boolean would not tick it.
 */
class BoolCheckBox extends CheckBox {
    static config = {
        className     : 'GO.form.field.BoolCheckBox',
        hideLabel     : true,
        uncheckedValue: false,
        value         : true
    }

    /**
     * @param {Boolean|Number|String|null} value
     */
    reset(value = null) {
        let me = this;

        me.originalConfig.value = true;
        me.value                = true;
        me.checked              = value === true || value === 1 || value === '1';
        me.originalChecked      = me.checked
    }

    /**
     * @returns {Boolean}
     */
    getSubmitValue() {
        return !!this.checked
    }

    get isDirty() {
        return this.checked !== !!this.originalChecked
    }
}

export default Neo.setupClass(BoolCheckBox);
