import Field from '../../../../../../../../views/neo/src/form/field/Field.mjs';

/**
 * GOUI SelectField: a native <select> in the GO field box. Option values may be any
 * scalar or null; the option is matched loosely ("30" == 30).
 *
 *     {module: SelectField, name: 'privacy', labelText: t('Visibility'),
 *      options: [{value: 'public', text: t('Public')}, {value: 'private', text: t('Private')}]}
 */
class SelectField extends Field {
    static config = {
        className: 'GO.calendar.field.SelectField',
        baseCls  : ['go-field', 'go-cal-select'],
        /**
         * @member {Object[]} options_=[] {value, text}
         */
        options_: []
    }

    construct(config) {
        super.construct(config);
        this.addDomListeners({change: this.onSelectChange, delegate: '.go-field-input', scope: this})
    }

    afterSetOptions(value, oldValue) {
        oldValue !== undefined && this.renderControl()
    }

    /**
     * Index of the option of a value
     * @param {*} value
     * @returns {Number}
     */
    indexOf(value) {
        return this.options.findIndex(o => (o.value ?? null) === (value ?? null) || (o.value != null && value != null && String(o.value) === String(value)))
    }

    createControl() {
        let me    = this,
            index = me.indexOf(me.value);

        return [{
            tag: 'select',
            cls: ['go-field-input'],
            ...me.inputFlags(),
            cn : me.options.map((o, i) => ({tag: 'option', value: String(i), text: o.text, ...(i === index ? {selected: true} : {})}))
        }]
    }

    onSelectChange(data) {
        const option = this.options[Number(data.value)];
        option && this.userChange(option.value ?? null)
    }
}

export default Neo.setupClass(SelectField);
