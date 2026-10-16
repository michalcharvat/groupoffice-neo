import Field from '../../../../../../../../views/neo/src/form/field/Field.mjs';

/** GOUI colorfield palette */
const PALETTE = ['C62828', 'AD1457', '6A1B9A', '4527A0', '283593', '1565C0', '0277BD', '00838F',
                 '00695C', '2E7D32', '558B2F', '9E9D24', 'F9A825', 'FF8F00', 'EF6C00', 'D84315',
                 '4E342E', '424242', '37474F', '356772'];

/**
 * Colour (GOUI colorfield): a palette and the browser's colour picker.
 * Value: hex without "#", e.g. "356772".
 */
class ColorField extends Field {
    static config = {
        className: 'GO.calendar.field.ColorField',
        baseCls  : ['go-field', 'go-cal-color']
    }

    construct(config) {
        super.construct(config);

        this.addDomListeners([
            {click : this.onSwatch, delegate: '.go-cal-swatch', scope: this},
            {change: this.onPicker, delegate: '.go-cal-color-input', scope: this}
        ])
    }

    beforeSetValue(value) {
        return value ? String(value).replace('#', '').toUpperCase() : null
    }

    createControl() {
        const value = this.value;

        return [
            {tag: 'input', type: 'color', cls: ['go-cal-color-input'], value: '#' + (value || '356772'), ...this.inputFlags()},
            {cls: ['go-cal-swatches'], cn: PALETTE.map(c => ({
                tag: 'span', cls: ['go-cal-swatch', c === value ? 'selected' : null].filter(Boolean),
                style: {backgroundColor: '#' + c}, 'data-color': c
            }))}
        ]
    }

    onSwatch(data) {
        const color = data.path.find(n => n.data?.color)?.data.color;
        color && !this.readOnly && this.userChange(color)
    }

    onPicker(data) {
        data.value && this.userChange(data.value.replace('#', '').toUpperCase())
    }
}

export default Neo.setupClass(ColorField);
