import MenuList from '../../node_modules/neo.mjs/src/menu/List.mjs';

/**
 * @summary GO menu list with item icons, images, details and badges.
 *
 * GO menu: items may name a Material Symbols icon like GOUI's btn({icon}).
 *
 *     items: [{text: 'Edit', icon: 'edit', handler}, {separator: true}, {text: 'Delete', icon: 'delete', disabled: true}]
 *
 * An item's `badge` shows a count at its end (header main menu, see src/Badges.mjs).
 * An item's `image` (URL) shows a picture instead of the icon, e.g. a bookmark's logo.
 * An item's `detail` shows a muted text after its own, e.g. the address book of an organization.
 *
 * GO.button.Button uses it for its `menu`.
 * @class GO.menu.List
 * @extends Neo.menu.List
 */
class List extends MenuList {
    static config = {
        className: 'GO.menu.List',
        cls         : ['go-menu'],
        displayField: 'text'
    }

    /**
     * Material icon per item index: the menu model has no `icon` field
     * @member {String[]} itemIcons=[]
     */
    itemIcons = []

    /**
     * Badge text per item index, like itemIcons
     * @member {String[]} itemBadges=[]
     */
    itemBadges = []

    /**
     * Image URL per item index, like itemIcons
     * @member {String[]} itemImages=[]
     */
    itemImages = []

    /**
     * Muted text after the item text per item index, like itemIcons
     * @member {String[]} itemDetails=[]
     */
    itemDetails = []

    /**
     * @summary Takes the icon, badge, image and detail of each item from the config.
     * @param {Object} config
     */
    construct(config) {
        this.itemIcons  = (config.items || []).map(item => item?.icon || null);
        this.itemBadges = (config.items || []).map(item => item?.badge || null);
        this.itemImages = (config.items || []).map(item => item?.image || null);
        this.itemDetails = (config.items || []).map(item => item?.detail || null);
        super.construct(config)
    }

    /**
     * @summary Adds the icon or image, the detail and the badge to the item content.
     * @param {Object} record
     * @param {Number} index
     * @returns {Object[]|String}
     */
    createItemContent(record, index) {
        const content = super.createItemContent(record, index),
              icon    = this.itemIcons[index],
              badge   = this.itemBadges[index],
              image   = this.itemImages[index],
              detail  = this.itemDetails[index];

        if (image && Array.isArray(content) && !record.iconCls) {
            content.unshift({tag: 'img', cls: ['neo-menu-icon', 'go-menu-image'], src: image, alt: ''})
        } else if (icon && Array.isArray(content) && !record.iconCls) {
            content.unshift({tag: 'i', cls: ['neo-menu-icon', 'go-icon'], text: icon})
        }

        if (detail && Array.isArray(content)) {
            content.push({tag: 'span', cls: ['go-menu-detail'], text: detail})
        }

        if (badge && Array.isArray(content)) {
            content.push({tag: 'span', cls: ['go-menu-badge'], text: badge})
        }

        return content
    }

    /**
     * Changes the badge of an item
     * @param {Number} index
     * @param {String|null} text null or '' removes it
     */
    setItemBadge(index, text) {
        let me = this;

        if ((me.itemBadges[index] || null) === (text || null)) {
            return
        }

        me.itemBadges[index] = text || null;
        me.store?.getCount() > 0 && me.createItems()
    }

    /**
     * neo creates submenus as Neo.menu.List: make them GO.menu.List (icons, badges, and so their
     * own submenus get this too), with the GO menu look and the window (without it their
     * align goes to the deprecated "main" destination)
     */
    getSubMenuData(record) {
        return {...super.getSubMenuData(record), module: List, cls: ['go-menu'], windowId: this.windowId}
    }

    /**
     * Set by showAt(): destroy the menu once it closes
     * @member {Boolean} destroyOnUnmount=false
     */
    destroyOnUnmount = false

    /**
     * How the menu was opened ('pointer' | 'keyboard'): the focus it hands back on close (Escape) shows a
     * focus ring only after a keyboard open. undefined: neo's default (the browser decides).
     * @member {String|undefined} returnFocusModality=undefined
     */
    returnFocusModality = undefined

    /**
     * @summary neo's hand-back with the modality of the open (Neo.main.DomAccess.focus() modality)
     */
    revertFocusOnDeparture() {
        let me = this;

        if (me.returnFocusModality === undefined) {
            super.revertFocusOnDeparture();
            return
        }

        me.containsFocus && me.getFocusReturnTarget()?.focus(undefined, false, undefined, me.returnFocusModality, me.id)
    }

    /**
     * Called once the menu closed (unmounted), e.g. for a toggle that must not reopen it on the click
     * that closed it
     * @member {Function|null} onClose=null
     */
    onClose = null

    /**
     * @summary Calls onClose and, for a showAt() menu, destroys it once it closed.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        !value && oldValue && this.onClose?.();

        // a floating root menu closes by unmounting (item click, focus leaving, Escape)
        if (!value && oldValue && this.destroyOnUnmount) {
            setTimeout(() => this.isDestroyed || this.destroy(), 0)
        }
    }

    /**
     * Body-level mousedown listener of an open floating root menu, see syncOutsidePointerListener()
     * @member {Object|null} bodyPointerListener=null
     */
    bodyPointerListener = null

    /**
     * @summary neo dismisses a floating menu on a mousedown in the app's main view only; dialogs lie outside it,
     * so a click on a non-focusable part of a dialog left the menu open. Listens at the body as well.
     * @param {Boolean} attach
     * @protected
     */
    syncOutsidePointerListener(attach) {
        super.syncOutsidePointerListener(attach);

        let me = this;

        if (attach && !me.bodyPointerListener) {
            me.bodyPointerListener = {mousedown: me.onAppMouseDown, scope: me, vnodeId: 'document.body'};
            me.addDomListeners(me.bodyPointerListener)
        } else if (!attach && me.bodyPointerListener) {
            me.removeDomListeners(me.bodyPointerListener);
            me.bodyPointerListener = null
        }
    }

    /**
     * @summary A mousedown in the main view reaches both listeners: only the first one unmounts.
     * @param {Object} data
     * @protected
     */
    onAppMouseDown(data) {
        this.mounted && super.onAppMouseDown(data)
    }

    /**
     * Shows a floating menu below a DOM element, e.g. a row's "more" icon.
     * The menu destroys itself when it closes.
     * @param {Object} config appName, windowId, target (DOM id), items, optional align
     * @returns {GO.menu.List}
     */
    static showAt({target, align, ...config}) {
        const menu = Neo.create(this, {
            align   : {edgeAlign: 't100-b100', target, ...align},
            floating: true,
            hidden  : true,
            // neo menus default to z-index 100 (inline style): dialogs and their mask are 1000
            zIndex  : 1100,
            ...config
        });

        menu.destroyOnUnmount = true;
        menu.hidden = false;
        return menu
    }
}

export default Neo.setupClass(List);
