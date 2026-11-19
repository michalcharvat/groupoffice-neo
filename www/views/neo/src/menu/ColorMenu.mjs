import List from './List.mjs';
import {t}  from '../Translate.mjs';

/**
 * GOUI ColorMenu palette: GO blue, green and orange, then five shades of the Material
 * colours (hex without "#")
 */
const COLORS = [
    '000000', 'FFFFFF', '009BC9', '78A22F', 'FF9100',
    'B71C1C', 'C62828', 'D32F2F', 'E53935', 'F44336', // red
    '880E4F', 'AD1457', 'C2185B', 'D81B60', 'E91E63', // pink
    '4A148C', '6A1B9A', '7B1FA2', '8E24AA', '9C27B0', // purple
    '311B92', '4527A0', '512DA8', '5E35B1', '673AB7', // deep purple
    '1A237E', '283593', '303F9F', '3949AB', '3F51B5', // indigo
    '0D47A1', '1565C0', '1976D2', '1E88E5', '2196F3', // blue
    '01579B', '0277BD', '0288D1', '039BE5', '03A9F4', // light blue
    '006064', '00838F', '0097A7', '00ACC1', '00BCD4', // cyan
    '004D40', '00695C', '00796B', '00897B', '009688', // teal
    '1B5E20', '2E7D32', '388E3C', '43A047', '4CAF50', // green
    '33691E', '558B2F', '689F38', '7CB342', '8BC34A', // light green
    '827717', '9E9D24', 'AFB42B', 'C0CA33', 'CDDC39', // lime
    'F57F17', 'F9A825', 'FBC02D', 'FDD835', 'FFEB3B', // yellow
    'FF6F00', 'FF8F00', 'FFA000', 'FFB300', 'FFC107', // amber
    'E65100', 'EF6C00', 'F57C00', 'FB8C00', 'FF9800', // orange
    '212121', '424242', '616161', '757575', 'BDBDBD'  // grey
];

/** id of the "Auto" item (no colour) */
const AUTO = 'auto';

/**
 * GOUI ColorMenu: a palette of colours and "Auto" (no colour) as a menu, e.g. the text
 * colour of a button. Fires `colorSelect` with {color}: "#RRGGBB", or '' for Auto (GOUI
 * "select"; neo lists already fire `select` for the item selection). With `updateButton`
 * the button the menu belongs to takes the colour as its text colour.
 *
 *     {module: Button, icon: 'format_color_text', menu: {module: ColorMenu,
 *         listeners: {colorSelect: ({color}) => ...}}}
 *
 *     ColorMenu.showAt({appName, windowId, target: id, value: '#1E88E5', listeners: {colorSelect}})
 */
class ColorMenu extends List {
    static config = {
        className: 'GO.menu.ColorMenu',
        cls      : ['go-menu', 'go-colormenu'],
        /**
         * The selected colour, "#RRGGBB" ('' = Auto)
         * @member {String} value_=''
         */
        value_: '',
        /**
         * The button of the menu shows the colour as its text colour
         * @member {Boolean} updateButton=true
         */
        updateButton: true
    }

    construct(config) {
        config.items = [
            {id: AUTO, text: t('Auto'), handler: () => this.pick('')},
            ...COLORS.map(color => ({id: '#' + color, text: '', handler: () => this.pick('#' + color)}))
        ];

        super.construct(config)
    }

    /**
     * Upper case "#RRGGBB"; "rgb(r, g, b)" and colours without "#" are converted
     * @param {String|null} value
     * @returns {String}
     */
    beforeSetValue(value) {
        return ColorMenu.toHex(value)
    }

    onConstructed() {
        super.onConstructed();
        this.updateButton && this.colorButton(this.value)
    }

    afterSetValue(value, oldValue) {
        let me = this;

        if (oldValue === undefined) {
            return
        }

        me.updateButton && me.colorButton(value);
        // repaint the selected swatch
        me.store?.getCount?.() && me.createItems()
    }

    /**
     * @param {String|null} value
     * @returns {String} "#RRGGBB" or ''
     */
    static toHex(value) {
        const rgb = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/i.exec(value || '');

        if (rgb) {
            return '#' + rgb.slice(1).map(n => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase()
        }

        value = String(value || '').trim().toUpperCase();

        return /^#?[0-9A-F]{6}$/.test(value) ? (value[0] === '#' ? value : '#' + value) : ''
    }

    /**
     * @param {String} color "#RRGGBB" or ''
     * @protected
     */
    colorButton(color) {
        const button = this.parentComponent;

        if (button && !button.isDestroyed && 'iconNode' in button) {
            button.style = {...button.style, color: color || null}
        }
    }

    /**
     * @param {String} color
     * @protected
     */
    pick(color) {
        let me = this;

        me.value = color;
        me.fire('colorSelect', {color})
    }

    createItemContent(record, index) {
        if (record.id === AUTO) {
            return super.createItemContent(record, index)
        }

        return [{
            tag  : 'span',
            cls  : ['go-colormenu-swatch'],
            style: {backgroundColor: record.id},
            title: record.id
        }]
    }

    /**
     * Marks the selected colour (and Auto when there is none)
     */
    createItem(record, index, poolIndex=index) {
        const item = super.createItem(record, index, poolIndex),
              id   = this.value || '';

        if (item && (record.id === id || (record.id === AUTO && !id))) {
            item.cls = [...(item.cls || []), 'go-colormenu-selected']
        }

        record.id !== AUTO && item && (item.cls = [...(item.cls || []), 'go-colormenu-color']);

        return item
    }
}

export default Neo.setupClass(ColorMenu);
