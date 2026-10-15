import MenuList from '../../node_modules/neo.mjs/src/menu/List.mjs';

/**
 * GO menu: items may name a Material Symbols icon like GOUI's btn({icon}).
 *
 *     items: [{text: 'Edit', icon: 'edit', handler}, {separator: true}, {text: 'Delete', icon: 'delete', disabled: true}]
 *
 * GO.button.Button uses it for its `menu`.
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

    construct(config) {
        this.itemIcons = (config.items || []).map(item => item?.icon || null);
        super.construct(config)
    }

    createItemContent(record, index) {
        const content = super.createItemContent(record, index),
              icon    = this.itemIcons[index];

        if (icon && Array.isArray(content) && !record.iconCls) {
            content.unshift({tag: 'i', cls: ['neo-menu-icon', 'go-icon'], text: icon})
        }

        return content
    }

    /**
     * Set by showAt(): destroy the menu once it closes
     * @member {Boolean} destroyOnUnmount=false
     */
    destroyOnUnmount = false

    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        // a floating root menu closes by unmounting (item click, focus leaving, Escape)
        if (!value && oldValue && this.destroyOnUnmount) {
            setTimeout(() => this.isDestroyed || this.destroy(), 0)
        }
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
            ...config
        });

        menu.destroyOnUnmount = true;
        menu.hidden = false;
        return menu
    }
}

export default Neo.setupClass(List);
