import Container from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Button    from '../button/Button.mjs';
import Splitter  from '../component/Splitter.mjs';
import {exportMenuItem} from '../export/exportEntities.mjs';
import {t} from '../Translate.mjs';

/**
 * @summary GO module layout: west, center and east panels with splitters.
 *
 * The neo version of groupoffice-core's MainThreeColumnPanel (GOUI):
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
 *
 * Medium (CSS up to GOUI's $breakpointMedium, 1200px of the module's width): center and east side
 * by side, the west panel is a drawer over them while it is the active panel.
 *
 * A view whose east panel is empty until a record opens (e.g. a planning board) sets
 * `eastHidden: true`: the center takes the free width, activatePanel('east') shows the east again
 * and setEastHidden(true) hides it once more.
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
        stateName: null,
        /**
         * Start without the east panel and its splitter, the center flexes, see setEastHidden()
         * @member {Boolean} eastHidden=false
         */
        eastHidden: false
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
     * @summary The button that closes the sidebar.
     *
     * GOUI showCenterButton() in the west toolbar: closes the sidebar (phone: shows the center,
     * CSS turns the icon into classic ExtJS's "arrow_forward")
     * @returns {Object}
     */
    hideWestButton() {
        return {
            module : Button,
            icon   : 'left_panel_close',
            cls    : ['small', 'go-hide-west'],
            tooltip: t('Close sidebar'),
            handler: async () => {
                // medium and phone (CSS up to $breakpointMedium of the module's width): the west
                // is a drawer or a card, closing it only shows the center; the wide sidebar stays
                // hidden until showWestButton()
                const rect = await this.getDomRect();

                rect?.width > 1200 && this.setWestHidden(true);
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
     * @summary The phone-only back button from the detail to the center.
     *
     * GOUI showCenterButton() outside the west panel: a back button for the east toolbar,
     * on a phone only (classic ExtJS narrow detail: ic-arrow-back). A static config can use
     * `handler: 'up.showCenter'` instead.
     * @returns {Object}
     */
    showCenterButton() {
        return {
            module : Button,
            icon   : 'arrow_back',
            cls    : ['small', 'go-for-small-device'],
            tooltip: t('Close'),
            handler: () => this.showCenter()
        }
    }

    /**
     * The "Export" item of the center toolbar's ⋮ menu (GOUI module Main "Export" submenu):
     * exports what the grid shows, see GO.export exportMenuItem()
     *
     *     items: [this.exportMenuItem({entity: 'Note', store: grid.store, formats: ['xlsx', 'csv', 'html', 'json']})]
     *
     * @param {Object} options entity, formats, store or query, ids, disabled, items
     * @returns {Object} menu item config
     */
    exportMenuItem(options) {
        return exportMenuItem(this, options)
    }

    /**
     * @summary GOUI activatePanel(): the panel a phone shows; 'east' shows a hidden east panel.
     * @param {'west'|'center'|'east'} name
     */
    activatePanel(name) {
        let me = this;

        name === 'east' && me.eastHidden && me.setEastHidden(false);

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

    /**
     * @summary Hides or shows the east panel and the center splitter.
     *
     * Hidden, the center takes the free width; shown again, it gets back its fixed (saved) width.
     * @param {Boolean} hidden
     */
    setEastHidden(hidden) {
        let me                     = this,
            {center, east}         = me.panels,
            {flex, ...centerStyle} = center.wrapperStyle || {};

        hidden = !!hidden;

        if (hidden === me.eastHidden) {
            return
        }

        // flex-basis 0% wins over the center's width, which stays set for when the east comes back
        hidden && (me.centerFlex = flex);

        me.eastHidden = hidden;
        east.hidden   = hidden;
        me.getReference('centerSplitter').hidden = hidden;
        center.wrapperStyle = {...centerStyle, flex: hidden ? '1 1 0%' : me.centerFlex ?? null};

        // phone: the hidden east can't stay the one card shown
        hidden && east.cls?.includes('go-active') && me.showCenter()
    }

    /**
     * @summary Builds west, splitter, center, splitter and east from the create*() configs.
     * @protected
     */
    createItems() {
        let me = this;

        const panel = (config, cls, width, minWidth) => ({
            ...config,
            cls     : [...(config.cls || []), ...[cls].flat()],
            flex    : width ? 'none' : 1,
            minWidth: `${minWidth / 10}rem`,
            ...(width ? {width: `${width / 10}rem`} : {})
        });

        const center = panel(me.createCenter(), ['go-center', 'go-active'], 500, 300);

        // the flex layout only sets flex on an item that has a wrapperStyle
        if (me.eastHidden) {
            me.centerFlex       = center.wrapperStyle?.flex;
            center.wrapperStyle = {...center.wrapperStyle, flex: '1 1 0%'}
        }

        me._items = [
            {...panel(me.createWest(), 'go-west', 300, 140), reference: 'west'},
            {module: Splitter, reference: 'westSplitter', stateId: me.stateName && `${me.stateName}-west-splitter`},
            center,
            {module: Splitter, reference: 'centerSplitter', hidden: me.eastHidden, stateId: me.stateName && `${me.stateName}-center-splitter`},
            {...panel(me.createEast(), 'go-east', 0, 140), hidden: me.eastHidden}
        ];


        super.createItems()
    }
}

export default Neo.setupClass(MainThreeColumnPanel);
