import BaseViewport from '../../../node_modules/neo.mjs/src/container/Viewport.mjs';
import {adopt}      from '../../../src/Popup.mjs';
import {t} from '../../../src/Translate.mjs';

/**
 * Viewport of a popup window opened by src/Popup.mjs openPopup(). The opener's
 * component (a dialog or a whole module view) moves itself into this window.
 */
class PopupView extends BaseViewport {
    static config = {
        className: 'GO.view.PopupView',
        cls      : ['go-popup'],
        layout   : 'fit',
        /**
         * Popup id from ?neoPopup=
         * @member {String|null} popupId=null
         */
        popupId: null
    }

    /**
     * @member {Object|null} entry=null the adopted popup, see Popup.mjs adopt()
     */
    entry = null

    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        let me = this;

        if (!value || oldValue || me.entry) {
            return
        }

        me.entry = adopt(me.popupId, me);

        // reloaded popup: the component went back to the opener with the old window
        me.entry || me.add({
            ntype: 'component',
            cls  : ['go-empty'],
            text : t('This window is no longer in use. You can close it.')
        })
    }

    /**
     * The window closed (app.mjs destroys a departed window's view): hand the
     * component back before the items get destroyed.
     */
    destroy(...args) {
        const {entry} = this;

        this.entry = null;
        entry?.onClose(this);

        super.destroy(...args)
    }
}

export default Neo.setupClass(PopupView);
