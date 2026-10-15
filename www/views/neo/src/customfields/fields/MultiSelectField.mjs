import Field from '../../../node_modules/neo.mjs/src/form/field/Base.mjs';
import {t}   from '../../Translate.mjs';

/**
 * Multi select custom field: one checkbox per option, value = array of option ids
 * (GOUI uses autocomplete chips; checkboxes suit the short option lists of GO).
 *
 *     {module: MultiSelectField, name: 'colors', labelText: 'Colors', options: [{id: 1, text: 'Red'}]}
 */
class MultiSelectField extends Field {
    static config = {
        className: 'GO.customfields.MultiSelectField',
        baseCls  : ['go-cf-multiselect'],
        /**
         * @member {String} labelText_=''
         */
        labelText_: '',
        /**
         * Flat options: [{id, text}]
         * @member {Object[]} options_=[]
         */
        options_: [],
        /**
         * @member {Boolean} readOnly_=false
         */
        readOnly_: false,
        /**
         * @member {Boolean} required=false
         */
        required: false,
        /**
         * @member {Number[]} value=[]
         */
        value: [],
        _vdom:
        {tag: 'fieldset', cn: [
            {tag: 'legend', cls: ['go-cf-multiselect-label']},
            {cls: ['go-cf-multiselect-options'], cn: []},
            {cls: ['go-cf-multiselect-error'], removeDom: true}
        ]}
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({change: me.onOptionChange, delegate: '.go-cf-multiselect-input', scope: me})
    }

    afterSetLabelText(value) {
        this.vdom.cn[0].text = value || '';
        this.update()
    }

    afterSetOptions() {
        this.render()
    }

    afterSetReadOnly() {
        this.render()
    }

    afterSetValue(value, oldValue) {
        super.afterSetValue(value, oldValue);
        this.render()
    }

    beforeSetValue(value) {
        return Array.isArray(value) ? value.map(Number) : []
    }

    render() {
        let me       = this,
            selected = new Set(me.value || []);

        me.vdom.cn[1].cn = (me.options || []).map(o => ({
            tag: 'label',
            cls: ['go-cf-multiselect-option'],
            cn : [{
                tag     : 'input',
                type    : 'checkbox',
                cls     : ['go-cf-multiselect-input'],
                checked : selected.has(Number(o.id)),
                disabled: me.readOnly,
                data    : {optionId: String(o.id)}
            }, {
                tag : 'span',
                text: o.text
            }]
        }));

        me.update()
    }

    onOptionChange({target}) {
        let me       = this,
            id       = Number(target?.data?.optionId),
            oldValue = me.value,
            value    = (oldValue || []).filter(v => v !== id);

        if (!id) {
            return
        }

        target.checked && value.push(id);
        me.value = value;
        me.fireUserChangeEvent?.(value, oldValue)
    }

    reset(value = null) {
        const v = Array.isArray(value) ? value.map(Number) : [];

        this.originalConfig.value = v;
        this.value = v
    }

    getSubmitValue() {
        return [...(this.value || [])]
    }

    get isDirty() {
        const sort = a => [...(a || [])].sort();
        return !Neo.isEqual(sort(this.value), sort(this.originalConfig.value))
    }

    validate(silent = true) {
        let me    = this,
            error = me.required && !me.value?.length ? t('Required field') : null,
            node  = me.vdom.cn[2];

        if (!silent || !error) {
            node.text      = error || '';
            node.removeDom = !error;
            me.update()
        }

        return !error
    }

    isValid() {
        return this.validate(true)
    }
}

export default Neo.setupClass(MultiSelectField);
