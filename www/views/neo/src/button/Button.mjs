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
