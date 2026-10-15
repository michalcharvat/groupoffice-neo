import Button           from '../../button/Button.mjs';
import ComponentManager from '../../../node_modules/neo.mjs/src/manager/Component.mjs';
import ContainerField   from './ContainerField.mjs';
import {isFormField}    from '../nestedFields.mjs';
import {t}              from '../../Translate.mjs';

/**
 * GOUI ArrayField: a list of values, one row field per value (e-mail addresses,
 * phone numbers). buildField(value) returns the row's field config, usually a
 * ContainerField with a remove button (ArrayField.removeButton()).
 *
 *     {module: ArrayField, name: 'emailAddresses', buildField: () => ({
 *         module: ContainerField, items: [
 *             {module: TextField, name: 'type', width: 120},
 *             {module: TextField, name: 'email', flex: 1},
 *             ArrayField.removeButton()
 *         ]
 *     })}
 *     arrayField.addValue({type: 'work', email: ''})
 *
 * Value: rows' values in order. The form sees the ArrayField only (nestedFields.mjs).
 */
class ArrayField extends ContainerField {
    static config = {
        className: 'GO.form.field.ArrayField',
        ntype    : 'go-arrayfield',
        baseCls  : ['go-arrayfield', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * (value) => row field config
         * @member {Function|null} buildField=null
         */
        buildField: null
    }

    /** value at the last reset (isDirty) */
    originalValue = []

    /**
     * Config of a button that removes its row
     * @param {Object} [config]
     * @returns {Object}
     */
    static removeButton(config = {}) {
        return {
            module : Button,
            icon   : 'delete',
            tooltip: t('Delete'),
            cls    : ['go-arrayfield-remove'],
            handler(data) {
                const button = data?.component || this,
                      row    = ArrayField.rowOf(button);

                row && ComponentManager.get(row.parentId)?.removeRow(row)
            },
            ...config
        }
    }

    /**
     * The ArrayField row a component is in
     * @param {Neo.component.Base} component
     * @returns {Neo.component.Base|null}
     */
    static rowOf(component) {
        let child = component;

        for (const parent of ComponentManager.getParents(component)) {
            if (parent instanceof ArrayField) {
                return child
            }

            child = parent
        }

        return null
    }

    /**
     * @returns {Neo.component.Base[]} row fields
     */
    getRows() {
        return (this.items || []).filter(isFormField)
    }

    getChildFields() {
        return this.getRows()
    }

    getSubmitValue() {
        return this.getRows().map(row => row.getSubmitValue())
    }

    applyValue(value, reset = false) {
        let me = this;

        me.suspendChange = true;

        me.getRows().forEach(row => me.remove(row, true, true));
        (Array.isArray(value) ? value : []).forEach(v => me.addRow(v, reset));
        me.update();

        if (reset) {
            me.originalValue = Neo.clone(me.getSubmitValue(), true)
        }

        me.suspendChange = false
    }

    /**
     * @param {*} value
     * @param {Boolean} reset
     * @returns {Neo.component.Base}
     * @protected
     */
    addRow(value, reset) {
        let me  = this,
            row = me.add({...me.buildField(value), ...(reset ? {} : {value})}, true);

        reset && row.reset(value);

        return row
    }

    /**
     * Adds a row (GOUI addValue())
     * @param {*} value
     * @returns {Neo.component.Base} the row field
     */
    addValue(value) {
        let me  = this,
            row = me.addRow(value, false);

        me.update();
        me.fireChange();

        return row
    }

    /**
     * @param {Neo.component.Base} row
     */
    removeRow(row) {
        let me = this;

        if (me.getRows().includes(row)) {
            me.remove(row, true);
            me.fireChange()
        }
    }

    /** @protected */
    fireChange() {
        let me    = this,
            value = me.getSubmitValue();

        me.fire('change', {component: me, value});
        // as a field: the surrounding forms hear it
        ComponentManager.getParents(me).forEach(parent => {
            Neo.form?.Container && parent instanceof Neo.form.Container && parent.fire('fieldChange', {component: me, value})
        })
    }

    reset(value = []) {
        super.reset(value)
    }

    get clean() {
        return Neo.isEqual(this.getSubmitValue(), this.originalValue)
    }

    set clean(value) {}

    get isDirty() {
        return !Neo.isEqual(this.getSubmitValue(), this.originalValue)
    }

    isEmptyAndRequired() {
        return this.required && !this.getRows().length
    }

    isValid() {
        return !this.isEmptyAndRequired() && super.isValid()
    }

    validate(silent = true) {
        const rowsValid = super.validate(silent);
        return !this.isEmptyAndRequired() && rowsValid
    }
}

export default Neo.setupClass(ArrayField);
