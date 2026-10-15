import Container from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Button    from '../button/Button.mjs';
import Splitter  from '../component/Splitter.mjs';
import {t} from '../Translate.mjs';

/**
 * GO module layout, the neo version of groupoffice-core's MainThreeColumnPanel (GOUI):
 *
 *     west | splitter | center | splitter | east
 *
 * Subclasses implement createWest(), createCenter() and createEast(), returning item configs.
 * Sizes are in dp like GOUI (west 300, center 500, east flexes); both splitters remember
 * the size under the GOUI state ids "<stateName>-west-splitter" and "<stateName>-center-splitter".
 *
 * Phone (GOUI "mobile-cards", CSS below $breakpointSmall): one panel at a time, the one
 * activatePanel() marked `go-active` (center at first). Subclasses activate the east panel
 * when they show a record there; showCenterButton() goes back.
 */
class MainThreeColumnPanel extends Container {
    static config = {
        className: 'GO.view.MainThreeColumnPanel',
        baseCls  : ['go-main-3-col', 'go-mobile-cards', 'neo-container'],
        layout   : {ntype: 'hbox', align: 'stretch'},
        /**
         * GOUI idAndRoute, e.g. 'notes'
         * @member {String|null} stateName=null
         */
        stateName: null
    }

    /**
     * @returns {Object}
     */
    createWest() {
        return {ntype: 'container'}
    }

    /**
     * @returns {Object}
     */
    createCenter() {
        return {ntype: 'container'}
    }

    /**
     * @returns {Object}
     */
    createEast() {
        return {ntype: 'container'}
    }

    /**
     * GOUI showCenterButton() in the west toolbar: closes the sidebar (phone: shows the center,
     * CSS turns the icon into "close")
     * @returns {Object}
     */
    hideWestButton() {
        return {
            module : Button,
            icon   : 'left_panel_close',
            cls    : ['small', 'go-hide-west'],
            tooltip: t('Close sidebar'),
            handler: () => {
                this.setWestHidden(true);
                this.activatePanel('center')
            }
        }
    }

    /**
     * GOUI showWestButton() in the center toolbar: shown while the sidebar is closed and always
     * on a phone (CSS, as "menu"), where it shows the west panel
     * @returns {Object}
     */
    showWestButton() {
        return {
            module : Button,
            icon   : 'left_panel_open',
            cls    : ['small', 'go-show-west'],
            tooltip: t('Show sidebar'),
            handler: () => {
                this.setWestHidden(false);
                this.activatePanel('west')
            }
        }
    }

    /**
     * GOUI showCenterButton() outside the west panel: a "close" button for the east toolbar,
     * on a phone only. A static config can use `handler: 'up.showCenter'` instead.
     * @returns {Object}
     */
    showCenterButton() {
        return {
            module : Button,
            icon   : 'close',
            cls    : ['small', 'go-for-small-device'],
            tooltip: t('Close'),
            handler: () => this.showCenter()
        }
    }

    /**
     * GOUI activatePanel(): the panel a phone shows
     * @param {'west'|'center'|'east'} name
     */
    activatePanel(name) {
        let me = this;

        ['west', 'center', 'east'].forEach(panel => {
            me.panels[panel]?.toggleCls('go-active', panel === name)
        })
    }

    showCenter() {
        this.activatePanel('center')
    }

    /**
     * west, center and east component, in item order (subclasses may set their own references)
     * @member {Object} panels
     */
    get panels() {
        const [west, , center, , east] = this.items;
        return {west, center, east}
    }

    /**
     * @param {Boolean} hidden
     */
    setWestHidden(hidden) {
        let me = this;

        me.getReference('west').hidden         = hidden;
        me.getReference('westSplitter').hidden = hidden;
        // shows the showWestButton() (CSS)
        me.toggleCls('go-west-hidden', hidden)
    }

    createItems() {
        let me = this;

        const panel = (config, cls, width, minWidth) => ({
            ...config,
            cls     : [...(config.cls || []), ...[cls].flat()],
            flex    : width ? 'none' : 1,
            minWidth: `${minWidth / 10}rem`,
            ...(width ? {width: `${width / 10}rem`} : {})
        });

        me._items = [
            {...panel(me.createWest(), 'go-west', 300, 140), reference: 'west'},
            {module: Splitter, reference: 'westSplitter', stateId: me.stateName && `${me.stateName}-west-splitter`},
            panel(me.createCenter(), ['go-center', 'go-active'], 500, 300),
            {module: Splitter, stateId: me.stateName && `${me.stateName}-center-splitter`},
            panel(me.createEast(), 'go-east', 0, 140)
        ];

        super.createItems()
    }
}

export default Neo.setupClass(MainThreeColumnPanel);
