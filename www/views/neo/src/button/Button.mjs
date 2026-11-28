import NeoButton from '../../node_modules/neo.mjs/src/button/Base.mjs';
import NeoArray  from '../../node_modules/neo.mjs/src/util/Array.mjs';
import MenuList  from '../menu/List.mjs';

/**
 * GO button (GOUI btn()): flat by default, Material Symbols icons by name.
 *
 *     {module: Button, icon: 'add', ui: 'primary'}   // GOUI cls "filled primary"
 *     {module: Button, icon: 'search', cls: ['small']} // GOUI cls "small"
 */
class Button extends NeoButton {
    static config = {
        className: 'GO.button.Button',
        /**
         * Material Symbols ligature, e.g. 'add', 'more_vert'. Use iconCls for Font Awesome.
         * @member {String|null} icon_=null
         */
        icon_: null,
        /**
         * 'ghost' = GOUI default (flat), 'primary' = "filled primary", 'secondary' = "outlined"
         * @member {String} ui='ghost'
         */
        ui: 'ghost',
        useRippleEffect: false
    }

    /**
     * Called with the button before its menu opens; it may set a new `menu`. Its Promise holds the menu
     * until it settles, false keeps the menu closed.
     * @member {Function|null} beforeShowMenu=null
     */
    beforeShowMenu = null

    /**
     * The pending beforeShowMenu() result, null: none
     * @member {Promise|null} menuOpening=null
     * @protected
     */
    menuOpening = null

    /**
     * @summary Runs beforeShowMenu() before the menu opens, then toggles it.
     * @returns {Promise<void>}
     */
    async toggleMenu() {
        let me = this;

        if (me.beforeShowMenu && me.menuList?.hidden !== false) {
            // a second click while the hook runs would start it again
            if (me.menuOpening) {
                return
            }

            try {
                if (await (me.menuOpening = me.beforeShowMenu(me)) === false) {
                    return
                }
            } finally {
                me.menuOpening = null
            }
        }

        return super.toggleMenu()
    }

    /**
     * Menus are GO.menu.List: items may have an `icon`
     */
    afterSetMenu(value, oldValue) {
        if (Array.isArray(value)) {
            value = {module: MenuList, items: value}
        } else if (value && !value.module) {
            value = {module: MenuList, ...value}
        }

        super.afterSetMenu(value, oldValue)
    }

    /**
     * Enables or disables one item of the menu, e.g. "Delete" by the permission level
     * of the shown entity, without building the menu again
     * @param {String} id the item's `id`
     * @param {Boolean} disabled
     * @returns {Promise<void>}
     */
    async setMenuItemDisabled(id, disabled) {
        await this.menuListReady;

        const record = this.menuList?.store.get(id);

        record && (record.disabled = disabled)
    }

    /**
     * @summary Shows the Material icon in the glyph node.
     * @param {String|null} value
     */
    afterSetIcon(value) {
        setIcon(this, value)
    }
}

/**
 * @summary Shows a Material Symbols ligature in a neo button's glyph node (null: none).
 *
 * Also used by GO.tab.HeaderButton.
 * @param {Neo.button.Base} button
 * @param {String|null} value
 */
export function setIcon(button, value) {
    let {iconNode} = button;

    NeoArray.toggle(iconNode.cls, 'go-icon', !!value);

    if (value) {
        iconNode.text = value;
        iconNode.removeDom = false
    } else {
        delete iconNode.text;
        iconNode.removeDom = !button.iconCls
    }

    button.update()
}

export default Neo.setupClass(Button);
