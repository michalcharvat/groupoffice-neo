import TextField from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';
import {t}       from '../../Translate.mjs';

const HEX = /^[0-9a-f]{6}$/i;

/**
 * GO colour field (GO.form.ColorField, showHexValue): the value is six hex digits
 * without "#" ("1652A1"), empty for none. A swatch in front shows the colour, or the
 * placeholder's (the default) while empty.
 *
 *     {module: ColorField, name: 'settings.primaryColor', labelText: t('Primary color'), placeholderText: '1652A1'}
 */
class ColorField extends TextField {
    static config = {
        className    : 'GO.form.field.ColorField',
        baseCls      : ['go-colorfield', 'neo-textfield'],
        labelPosition: 'inline',
        maxLength    : 7,
        validator    : field => {
            const value = ColorField.normalize(field.value);
            return !value || HEX.test(value) || t('Enter six hexadecimal digits, e.g. 1652A1')
        }
    }

    /**
     * @param {String|null} value
     * @returns {String|null} without "#", null when empty
     */
    static normalize(value) {
        value = String(value ?? '').trim().replace(/^#/, '');
        return value || null
    }

    afterSetValue(value, oldValue) {
        super.afterSetValue(value, oldValue);
        this.updateSwatch()
    }

    afterSetPlaceholderText(value, oldValue) {
        super.afterSetPlaceholderText(value, oldValue);
        this.updateSwatch()
    }

    /**
     * @returns {String|null} "#" + hex of the value, or of the placeholder
     */
    get color() {
        const value = ColorField.normalize(this.value) || ColorField.normalize(this.placeholderText);
        return value && HEX.test(value) ? '#' + value : null
    }

    /**
     * @protected
     */
    updateSwatch() {
        let me    = this,
            style = {...me.style};

        style['--go-colorfield-color'] = me.color || 'transparent';
        me.style = style
    }

    /**
     * @returns {String|null}
     */
    getSubmitValue() {
        return ColorField.normalize(super.getSubmitValue())
    }
}

export default Neo.setupClass(ColorField);
