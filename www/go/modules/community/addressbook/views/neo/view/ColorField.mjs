import Field from '../../../../../../../views/neo/src/form/field/Field.mjs';
import {t}   from '../util.mjs';

/**
 * GO.form.ColorField: a colour as GO stores it, hex without "#" ("C62828"), or null.
 * A native colour input and a clear button.
 */
class ColorField extends Field {
    static config = {
        className: 'GO.addressbook.view.ColorField',
        ntype    : 'go-ab-colorfield',
        baseCls  : ['go-field', 'go-ab-colorfield']
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {change: me.onInputChange, delegate: '.go-field-input', scope: me},
            {click : me.onClearClick,  delegate: '.go-ab-color-clear', scope: me}
        ])
    }

    beforeSetValue(value) {
        value = value ? String(value).replace(/^#/, '').toUpperCase() : null;
        return /^[0-9A-F]{6}$/.test(value || '') ? value : null
    }

    getSubmitValue() {
        return this.value || null
    }

    createControl() {
        let me = this;

        return [{
            tag  : 'input',
            id   : me.id + '__input',
            type : 'color',
            cls  : ['go-field-input', me.value ? null : 'go-ab-color-empty'].filter(Boolean),
            value: '#' + (me.value || 'FFFFFF'),
            ...me.inputFlags()
        }, {
            tag    : 'i',
            cls    : ['go-icon', 'go-ab-color-clear'],
            text   : 'clear',
            title  : t('Clear'),
            removeDom: !me.value || me.readOnly || me.disabled
        }]
    }

    onInputChange({value}) {
        this.userChange(this.beforeSetValue(value))
    }

    onClearClick() {
        this.userChange(null)
    }
}

export default Neo.setupClass(ColorField);
