import NeoHeaderButton from '../../node_modules/neo.mjs/src/tab/header/Button.mjs';
import {setIcon}       from '../button/Button.mjs';

/**
 * @summary A tab header button with a Material Symbols icon by name, like GO.button.Button.
 *
 * Pass it as a card's header module:
 *
 *     {module: Container, header: {module: HeaderButton, text: t('General'), icon: 'description'}}
 */
class HeaderButton extends NeoHeaderButton {
    static config = {
        className: 'GO.tab.HeaderButton',
        /**
         * Material Symbols ligature, e.g. 'settings'. Use iconCls for Font Awesome.
         * @member {String|null} icon_=null
         */
        icon_: null
    }

    /**
     * @summary Shows the Material icon in the glyph node.
     * @param {String|null} value
     */
    afterSetIcon(value) {
        // the tab's text names it (and its card through aria-labelledby), not the ligature
        this.iconNode['aria-hidden'] = true;
        setIcon(this, value)
    }
}

export default Neo.setupClass(HeaderButton);
