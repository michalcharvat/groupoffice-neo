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
 */
class MainThreeColumnPanel extends Container {
    static config = {
        className: 'GO.view.MainThreeColumnPanel',
        baseCls  : ['go-main-3-col', 'neo-container'],
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
     * GOUI showCenterButton() in the west toolbar: closes the sidebar
     * @returns {Object}
     */
    hideWestButton() {
        return {
            module : Button,
            icon   : 'left_panel_close',
            cls    : ['small'],
            tooltip: t('Close sidebar'),
            handler: () => this.setWestHidden(true)
        }
    }

    /**
     * GOUI showWestButton() in the center toolbar: shown while the sidebar is closed
     * @returns {Object}
     */
    showWestButton() {
        return {
            module   : Button,
            icon     : 'left_panel_open',
            cls      : ['small'],
            reference: 'showWestButton',
            hidden   : true,
            tooltip  : t('Show sidebar'),
            handler  : () => this.setWestHidden(false)
        }
    }

    /**
     * @param {Boolean} hidden
     */
    setWestHidden(hidden) {
        let me = this;

        me.getReference('west').hidden         = hidden;
        me.getReference('westSplitter').hidden = hidden;

        const button = me.getReference('showWestButton');
        button && (button.hidden = !hidden)
    }

    createItems() {
        let me = this;

        const panel = (config, cls, width, minWidth) => ({
            ...config,
            cls     : [...(config.cls || []), cls],
            flex    : width ? 'none' : 1,
            minWidth: `${minWidth / 10}rem`,
            ...(width ? {width: `${width / 10}rem`} : {})
        });

        me._items = [
            {...panel(me.createWest(), 'go-west', 300, 140), reference: 'west'},
            {module: Splitter, reference: 'westSplitter', stateId: me.stateName && `${me.stateName}-west-splitter`},
            panel(me.createCenter(), 'go-center', 500, 300),
            {module: Splitter, stateId: me.stateName && `${me.stateName}-center-splitter`},
            panel(me.createEast(), 'go-east', 0, 140)
        ];

        super.createItems()
    }
}

export default Neo.setupClass(MainThreeColumnPanel);
