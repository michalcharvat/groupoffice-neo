import ComponentManager from '../../../node_modules/neo.mjs/src/manager/Component.mjs';
import FormContainer    from '../../../node_modules/neo.mjs/src/form/Container.mjs';
import {collectFields}  from '../nestedFields.mjs';

/**
 * GOUI ContainerField: child fields that form one value, an object by their names.
 * The surrounding form sees one field (`name`), not the children (see nestedFields.mjs).
 *
 *     {module: ContainerField, name: 'address', layout: {ntype: 'hbox'}, items: [
 *         {module: TextField, name: 'street'},
 *         {module: TextField, name: 'city'}
 *     ]}
 *     // form value: {address: {street: '…', city: '…'}}
 *
 * Child names may be dotted ("geo.lat"). Don't put it below a formGroup: give it a
 * dotted name instead.
 */
class ContainerField extends FormContainer {
    static config = {
        className: 'GO.form.field.ContainerField',
        ntype    : 'go-containerfield',
        baseCls  : ['go-containerfield', 'neo-container'],
        // its natural height in a form's vbox, which would shrink it
        flex     : 'none',
        layout   : {ntype: 'hbox', align: 'start'}
    }

    /** marks it as a field for forms (nestedFields.mjs) */
    isContainerField = true
    /** @member {String|null} name=null */
    name = null
    /** @member {Boolean} required=false */
    required = false
    /** {value, reset} set before the children existed */
    pendingValue = null

    onConstructed() {
        super.onConstructed();

        let me = this;

        // child fields fire fieldChange on every form container above them
        me.on('fieldChange', me.onChildChange, me);

        if (me.pendingValue) {
            const {value, reset} = me.pendingValue;

            me.pendingValue = null;
            me.applyValue(value, reset)
        }
    }

    /**
     * @param {Object} data
     * @protected
     */
    onChildChange(data) {
        let me = this;

        // fieldChange of our own (an ArrayField row added) or of nested fields: once per change
        if (data.component !== me && !me.suspendChange) {
            me.fire('change', {component: me, value: me.getSubmitValue()})
        }
    }

    /**
     * @returns {Neo.component.Base[]} the child fields
     */
    getChildFields() {
        return collectFields(this)
    }

    /**
     * Path of a child field relative to this one
     * @param {Neo.form.field.Base} field
     * @returns {String|null}
     * @protected
     */
    relativePath(field) {
        const path   = field.getPath?.() || field.name || null,
              prefix = this.groupPrefix();

        return path && prefix && path.startsWith(prefix + '.') ? path.substring(prefix.length + 1) : path
    }

    /**
     * formGroups above this field (child fields include them in their path)
     * @returns {String}
     * @protected
     */
    groupPrefix() {
        return ComponentManager.getParents(this).map(parent => parent.formGroup).filter(Boolean).reverse().join('.')
    }

    /**
     * neo form.Container#getFieldPath() / Neo.form.field.Base#getPath()
     * @returns {String|null}
     */
    getPath() {
        return this.name || null
    }

    /**
     * Always null: child fields add every parent's formGroup to their own path
     * @returns {null}
     */
    get formGroup() {
        return null
    }

    set formGroup(value) {}

    get value() {
        return this.getSubmitValue()
    }

    set value(value) {
        this.isConstructed ? this.applyValue(value) : (this.pendingValue = {value, reset: false})
    }

    /**
     * @returns {Object}
     */
    getSubmitValue() {
        let me     = this,
            Radio  = Neo.form.field?.Radio,
            values = {};

        me.getChildFields().forEach(field => {
            const path = me.relativePath(field);

            if (!path) {
                return
            }

            const keys  = path.split('.'),
                  key   = keys.pop(),
                  ns    = Neo.nsWithArrays(keys, true, values),
                  value = field.getSubmitValue();

            // a radio group: the checked one wins
            if (Radio && field instanceof Radio && Object.hasOwn(ns, key) && value === field.uncheckedValue) {
                return
            }

            ns[key] = value
        });

        return values
    }

    getValue() {
        return this.getSubmitValue()
    }

    /**
     * @param {Object|null} value
     * @param {Boolean} [reset=false] also as the fields' original value
     * @protected
     */
    applyValue(value, reset = false) {
        let me       = this,
            CheckBox = Neo.form.field?.CheckBox,
            Radio    = Neo.form.field?.Radio;

        me.suspendChange = true;

        me.getChildFields().forEach(field => {
            const path = me.relativePath(field),
                  v    = path ? Neo.nsWithArrays(path, false, value || {}) : undefined;

            if (reset) {
                field.reset(v ?? null)
            } else if ((Radio && field instanceof Radio) || (CheckBox && field instanceof CheckBox)) {
                field.checked = Array.isArray(v) ? v.includes(field.value) : v === field.value || v === true
            } else {
                field.value = v ?? null
            }
        });

        me.suspendChange = false
    }

    reset(value = null) {
        this.isConstructed ? this.applyValue(value, true) : (this.pendingValue = {value, reset: true})
    }

    set(values, ...args) {
        // neo's setValues() → set({value}): our setter, not a reactive config
        if (values && Object.hasOwn(values, 'value')) {
            const {value, ...rest} = values;

            this.value = value;
            return Object.keys(rest).length ? super.set(rest, ...args) : undefined
        }

        return super.set(values, ...args)
    }

    get clean() {
        return this.getChildFields().every(field => field.clean !== false)
    }

    set clean(value) {}

    get isDirty() {
        return this.getChildFields().some(field => field.isDirty)
    }

    isEmptyAndRequired() {
        return false
    }

    isValid() {
        return this.getChildFields().every(field => field.isValid())
    }

    validate(silent = true) {
        // all of them, so every invalid child shows its error
        return this.getChildFields().map(field => field.validate?.(silent) !== false).every(Boolean)
    }
}

export default Neo.setupClass(ContainerField);
