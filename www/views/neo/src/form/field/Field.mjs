import BaseField from '../../../node_modules/neo.mjs/src/form/field/Base.mjs';
import VNodeUtil from '../../../node_modules/neo.mjs/src/util/VNode.mjs';
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

    // required_ is declared by neo's form.field.Base (13.4+), which re-validates on change
    afterSetRequired(value, oldValue) {
        super.afterSetRequired(value, oldValue);
        this.toggleCls('go-required', !!value)
    }

    afterSetValue(value, oldValue) {
        super.afterSetValue(value, oldValue);
        oldValue !== undefined && this.renderControl()
    }

    /**
     * The input value the user typed last ({id, value}), until a render writes that input
     * @member {Object|null} reportedInput=null
     * @protected
     */
    reportedInput = null

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
     * Takes over what the user typed into an input of the box without writing it back: the
     * vdom node and the last rendered vnode get the DOM's value, so the next update has no
     * value delta (like neo's Text field onInputValueChange()). An update() per keystroke
     * sent the value back late, with older text, while the user went on typing: characters
     * got lost and the caret jumped.
     * @param {Object} node vdom node of the input (with an id)
     * @param {String} value
     * @protected
     */
    syncInputValue(node, value) {
        if (!node) {
            return
        }

        node.value = value;
        // a render already on its way returns an older vnode: afterVnodeSync() restores this
        this.reportedInput = {id: node.id, value};
        this.setVnodeInputValue(node.id, value)
    }

    /**
     * @param {String} id
     * @param {String} value
     * @protected
     */
    setVnodeInputValue(id, value) {
        const {vnode} = VNodeUtil.find(this.vnode, id) || {};
        vnode?.attributes && (vnode.attributes.value = value)
    }

    /**
     * Unmounted, the typed text is gone: a remount renders the input from the vdom (as neo's
     * Text field drops its reportedInputValue)
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        value || (this.reportedInput = null)
    }

    /**
     * neo's Text field afterVnodeSync(): a render that was collected before the user typed lands
     * with a vnode holding the older input value. Unless that render wrote the input's value
     * itself, the DOM still shows what was typed, so the vnode gets it back.
     * @param {Object[]|null} deltas
     * @protected
     */
    afterVnodeSync(deltas) {
        let me       = this,
            reported = me.reportedInput;

        if (reported) {
            if (!deltas || deltas.some(delta => delta.id === reported.id && (delta.action === 'removeNode' || Object.hasOwn(delta.attributes || {}, 'value')))) {
                me.reportedInput = null
            } else {
                me.setVnodeInputValue(reported.id, reported.value)
            }
        }

        super.afterVnodeSync(deltas)
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
