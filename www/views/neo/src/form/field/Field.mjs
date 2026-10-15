import BaseField from '../../../node_modules/neo.mjs/src/form/field/Base.mjs';
import {t}       from '../../Translate.mjs';

/**
 * Base of GO's composite form fields (GOUI goui/script/component/form/Field.ts): an
 * outlined box with the label in its top border (GOUI "no-floating-label"), a hint
 * below that turns into the error text.
 *
 * Subclasses return the box content from createControl() (vdom array) and call
 * renderControl() when it changes. A user edit goes through userChange(value).
 *
 *     {module: DurationField, name: 'duration', labelText: t('Duration'), required: true,
 *      validator: field => field.value !== '0:00' || t('Too short')}
 *
 * Supports what GO.form.DataSourceForm needs: name, value, reset(), getSubmitValue(),
 * isValid(), validate(silent), `validator` (server errors), `clean`.
 */
class Field extends BaseField {
    static config = {
        className: 'GO.form.field.Field',
        ntype    : 'go-field',
        baseCls  : ['go-field'],
        /**
         * Text in the box's top border
         * @member {String} labelText_=''
         */
        labelText_: '',
        /**
         * Help text below the box (GOUI hint)
         * @member {String} hint_=''
         */
        hint_: '',
        /**
         * Shown error, null for none
         * @member {String|null} error_=null
         */
        error_: null,
        /**
         * @member {Boolean} readOnly_=false
         */
        readOnly_: false,
        /**
         * @member {Boolean} required_=false
         */
        required_: false,
        /**
         * (field) => true | error text
         * @member {Function|null} validator=null
         */
        validator: null,
        /**
         * @member {*} value=null
         */
        value: null,
        _vdom:
        {cn: [
            {tag: 'label', cls: ['go-field-label'], removeDom: true},
            {cls: ['go-field-box'], cn: []},
            {cls: ['go-field-hint'], removeDom: true}
        ]}
    }

    /**
     * false once the user changed the value (neo form state)
     * @member {Boolean} clean=true
     */
    clean = true

    get labelNode() {return this.vdom.cn[0]}
    get boxNode()   {return this.vdom.cn[1]}
    get hintNode()  {return this.vdom.cn[2]}

    construct(config) {
        super.construct(config);
        this.renderControl()
    }

    afterSetDisabled(value, oldValue) {
        super.afterSetDisabled?.(value, oldValue);
        oldValue !== undefined && this.renderControl()
    }

    afterSetError(value) {
        this.toggleCls('go-invalid', !!value);
        this.renderHint()
    }

    afterSetHint() {
        this.renderHint()
    }

    afterSetLabelText(value) {
        let node = this.labelNode;

        node.text      = value || '';
        node.removeDom = !value;
        this.update()
    }

    afterSetReadOnly(value, oldValue) {
        this.toggleCls('go-readonly', !!value);
        oldValue !== undefined && this.renderControl()
    }

    afterSetRequired(value) {
        this.toggleCls('go-required', !!value)
    }

    afterSetValue(value, oldValue) {
        super.afterSetValue(value, oldValue);
        oldValue !== undefined && this.renderControl()
    }

    /**
     * @returns {Object[]} vdom of the box content
     * @protected
     */
    createControl() {
        return []
    }

    /**
     * disabled / readOnly attributes for inputs. neo renders a false boolean as the
     * attribute "false", which still disables: leave them out instead.
     * @returns {Object}
     */
    inputFlags() {
        return {disabled: this.disabled || null, readOnly: this.readOnly || null}
    }

    /**
     * Rebuilds the box content
     */
    renderControl() {
        let me = this;

        me.boxNode.cn = me.createControl();
        me.update()
    }

    /** @protected */
    renderHint() {
        let me   = this,
            node = me.hintNode,
            text = me.error || me.hint;

        node.text      = text || '';
        node.removeDom = !text;
        me.update()
    }

    /**
     * @returns {Boolean}
     */
    isEmpty() {
        const value = this.getSubmitValue();
        return value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)
    }

    /**
     * @returns {Boolean}
     */
    isEmptyAndRequired() {
        return this.required && this.isEmpty()
    }

    /**
     * @returns {String|null} the error for the current value
     * @protected
     */
    getError() {
        let me = this;

        if (me.isEmptyAndRequired()) {
            return t('Required field')
        }

        const result = typeof me.validator === 'function' ? me.validator.call(me, me) : true;

        return result === true || result === undefined || result === null ? null : String(result || t('Invalid input'))
    }

    isValid() {
        return !this.getError()
    }

    /**
     * @param {Boolean} silent=true false shows the error
     * @returns {Boolean}
     */
    validate(silent = true) {
        let me    = this,
            error = me.getError();

        // a valid value always clears a shown error
        if (!silent || !error) {
            me.error = error
        }

        return !error
    }

    /**
     * A value the user entered: fires userChange, revalidates a shown error
     * @param {*} value
     */
    userChange(value) {
        let me       = this,
            oldValue = me.value;

        me.clean = false;
        me.value = value;

        if (!Neo.isEqual(value, oldValue)) {
            me.fireUserChangeEvent(value, oldValue)
        }

        me.error && me.validate(false)
    }

    reset(value = null) {
        let me = this;

        super.reset(value);
        // the normalised value (beforeSetValue()), so isDirty compares like with like
        me.originalConfig.value = Neo.clone(me.getSubmitValue(), true);
        me.clean = true;
        me.error = null
    }
}

export default Neo.setupClass(Field);
