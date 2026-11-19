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

    afterSetIcon(value, oldValue) {
        let me         = this,
            {iconNode} = me;

        NeoArray.toggle(iconNode.cls, 'go-icon', !!value);

        if (value) {
            iconNode.text = value;
            iconNode.removeDom = false
        } else {
            delete iconNode.text;
            iconNode.removeDom = !me.iconCls
        }

        me.update()
    }
}

export default Neo.setupClass(Button);
