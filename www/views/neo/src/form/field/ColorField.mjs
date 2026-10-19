import Field from './Field.mjs';
import {t}   from '../../Translate.mjs';

const HEX = /^[0-9A-F]{6}$/;

/** GOUI colorfield palette */
const PALETTE = ['C62828', 'AD1457', '6A1B9A', '4527A0', '283593', '1565C0', '0277BD', '00838F',
                 '00695C', '2E7D32', '558B2F', '9E9D24', 'F9A825', 'FF8F00', 'EF6C00', 'D84315',
                 '4E342E', '424242', '37474F', '356772'];

/**
 * GO colour field (GO.form.ColorField, GOUI colorfield): the value is six hex digits
 * without "#" ("1652A1"), null for none. A swatch shows the colour, or the placeholder's
 * (the default) while empty; clicking it opens the browser's colour picker. Without a hex
 * box or a palette the whole box opens the picker. A clear button empties a field that is
 * not required.
 *
 *     {module: ColorField, name: 'color', labelText: t('Color')}
 *     {module: ColorField, name: 'color', labelText: t('Color'), palette: true}
 *     {module: ColorField, name: 'settings.primaryColor', labelText: t('Primary color'), showHexValue: true, placeholderText: '1652A1'}
 */
class ColorField extends Field {
    static config = {
        className: 'GO.form.field.ColorField',
        ntype    : 'go-colorfield',
        baseCls  : ['go-field', 'go-colorfield'],
        /**
         * GOUI palette next to the swatch
         * @member {Boolean} palette_=false
         */
        palette_: false,
        /**
         * Hex of the default colour, shown while empty
         * @member {String} placeholderText_=''
         */
        placeholderText_: '',
        /**
         * An editable hex box next to the swatch (GO.form.ColorField showHexValue)
         * @member {Boolean} showHexValue_=false
         */
        showHexValue_: false
    }

    /** The hex box as typed (onInputChange) */
    hexText = ''

    /** true while a typed hex sets the value: the hex box keeps what was typed */
    typing = false

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            // input, not change: the value (and a preview) follows typing and dragging in the picker
            {input : me.onInputChange,  delegate: '.go-field-input',        scope: me},
            {click : me.onSwatchClick,  delegate: '.go-colorfield-palette', scope: me},
            {click : me.onClearClick,   delegate: '.go-colorfield-clear',   scope: me}
        ])
    }

    /**
     * @param {String|null} value
     * @returns {String|null} upper case without "#", null when empty
     */
    static normalize(value) {
        value = String(value ?? '').trim().replace(/^#/, '').toUpperCase();
        return value || null
    }

    beforeSetValue(value) {
        return ColorField.normalize(value)
    }

    afterSetValue(value, oldValue) {
        this.typing || (this.hexText = value || '');
        super.afterSetValue(value, oldValue)
    }

    afterSetPalette(value, oldValue) {
        this.afterSetShowHexValue(this.showHexValue, oldValue)
    }

    afterSetPlaceholderText(value, oldValue) {
        oldValue !== undefined && this.renderControl()
    }

    afterSetShowHexValue(value, oldValue) {
        // only the swatch: the whole box opens the picker
        this.toggleCls('go-colorfield-plain', !this.showHexValue && !this.palette);
        oldValue !== undefined && this.renderControl()
    }

    /**
     * @returns {String|null} "#" + hex of the value, or of the placeholder
     */
    get color() {
        const value = ColorField.normalize(this.value) || ColorField.normalize(this.placeholderText);
        return value && HEX.test(value) ? '#' + value : null
    }

    getSubmitValue() {
        return this.value || null
    }

    getError() {
        const value = this.value;
        return value && !HEX.test(value) ? t('Enter six hexadecimal digits, e.g. 1652A1') : super.getError()
    }

    createControl() {
        let me     = this,
            color  = me.color,
            locked = me.readOnly || me.disabled,
            items  = [{
                tag: 'label',
                cls: ['go-colorfield-swatch', color ? null : 'go-colorfield-empty'].filter(Boolean),
                style: {backgroundColor: color},
                cn : [{
                    tag         : 'input',
                    id          : me.id + '__picker',
                    type        : 'color',
                    cls         : ['go-field-input', 'go-colorfield-picker'],
                    'aria-label': me.labelText || t('Color'),
                    value       : color || '#FFFFFF',
                    // readOnly does not stop a colour input from opening its picker
                    disabled    : locked || null
                }]
            }];

        if (me.showHexValue) {
            items.push({
                tag         : 'input',
                id          : me.id + '__input',
                type        : 'text',
                autocomplete: 'off',
                cls         : ['go-field-input', 'go-colorfield-hex'],
                'aria-label': me.labelText || t('Color'),
                maxLength   : 7,
                placeholder : me.placeholderText || null,
                value       : me.hexText,
                ...me.inputFlags()
            })
        }

        if (me.palette) {
            items.push({
                cls: ['go-colorfield-palette'],
                cn : PALETTE.map(c => ({
                    tag           : 'button',
                    type          : 'button',
                    cls           : ['go-colorfield-palette-color'],
                    style         : {backgroundColor: '#' + c},
                    'aria-label'  : '#' + c,
                    'aria-pressed': c === me.value ? 'true' : 'false',
                    'data-color'  : c,
                    disabled      : locked || null
                }))
            })
        }

        items.push({
            tag         : 'button',
            type        : 'button',
            cls         : ['go-field-tool', 'go-colorfield-clear'],
            title       : t('Clear'),
            'aria-label': t('Clear'),
            removeDom   : !me.value || me.required || locked,
            cn          : [{tag: 'i', cls: ['go-icon'], 'aria-hidden': 'true', text: 'clear'}]
        });

        return items
    }

    onInputChange({target, value}) {
        let me = this;

        if (target?.cls?.includes('go-colorfield-hex')) {
            // the box renders hexText: it keeps what was typed ("#16a"), not the normalised value
            me.hexText = value ?? '';
            me.typing  = true;
            me.userChange(ColorField.normalize(me.hexText));
            me.typing = false
        } else if (value) {
            me.userChange(ColorField.normalize(value))
        }
    }

    onSwatchClick({path}) {
        const color = path.find(n => n.data?.color)?.data.color;
        color && !this.readOnly && !this.disabled && this.userChange(color)
    }

    onClearClick() {
        this.userChange(null)
    }
}

export default Neo.setupClass(ColorField);
