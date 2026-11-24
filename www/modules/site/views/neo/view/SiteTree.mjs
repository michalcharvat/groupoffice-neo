import Tree     from '../../../../../views/neo/src/tree/Tree.mjs';
import MenuList from '../../../../../views/neo/src/menu/List.mjs';
import client   from '../../../../../views/neo/src/jmap/Client.mjs';
import {t as coreT} from '../../../../../views/neo/src/Translate.mjs';

/**
 * Node id of the server (site/site/tree, GO.site.extractTreeNode()):
 * "site_<siteId>", "<siteId>_content", "<siteId>_content_<id>", "<siteId>_menu",
 * "<siteId>_menu_<id>", "<siteId>_menuitem_<id>"
 * @param {String} id
 * @returns {{siteId: String, type: String, modelId: String|null}}
 */
export function parseNodeId(id) {
    const parts = String(id).split('_');

    if (parts[0] === 'site') {
        return {siteId: parts[1], type: 'site', modelId: null}
    }

    return {siteId: parts[0], type: parts[1], modelId: parts[2] || null}
}

/** Material icon per node type (ExtJS iconCls go-model-icon-*) */
const ICONS = {
    site    : 'language',
    content : 'description',
    menu    : 'menu',
    menuitem: 'link'
};

/** ms after the last expand or collapse before the state is saved */
const SAVE_STATE_DELAY = 500;

/**
 * West tree of the Website Manager (GO.site.SiteTreePanel): every site the user can read, with
 * its "Content" (content items, nested) and "Menu's" (menus with their items, nested).
 * site/site/tree sends the whole tree at once; only menu items with children load them on
 * expand. Expanded nodes are saved per user (site/site/saveTreeState).
 *
 * A node carries `site` = parseNodeId() and the server's attributes (slug, menu_id,
 * hasChildren). Right click or the ⋮ of a row opens `rowMenu(node)`.
 *
 * Drag and drop (GO.site.treeNodes.*): content items and menu items are sorted by dropping
 * them between their siblings; a content item dropped on a menu or menu item fires
 * `contentToMenu`. The parent's children are saved in their new order (site/site/treeSort).
 *
 * Events: nodeSelect {node}, contentToMenu {content, target}
 */
class SiteTree extends Tree {
    static config = {
        className  : 'GO.site.view.SiteTree',
        baseCls    : ['go-tree', 'go-site-tree', 'neo-list'],
        dragNodes  : true,
        dropOn     : true,
        dropBetween: true,
        /**
         * Group of the drag and drop: the content editor accepts content items of it
         * @member {String} dragGroup='go-site-tree'
         */
        dragGroup: 'go-site-tree',
        /**
         * (node) => menu items, null for no row menu
         * @member {Function|null} rowMenu=null
         */
        rowMenu: null
    }

    /**
     * (siteId) => may the user change the site's content and menus; set by the main panel
     * @member {Function} mayChange
     */
    mayChange = () => true

    /**
     * Timer of the delayed saveState()
     * @member {Number|null} saveTimer=null
     */
    saveTimer = null

    /**
     * Expanding and collapsing during a reload are not the user's
     * @member {Boolean} loading=false
     */
    loading = false

    construct(config) {
        config.nodeProvider ??= node => this.loadNodes(node);

        super.construct(config);

        let me = this;

        me.on({
            expand  : () => me.scheduleSaveState(),
            collapse: () => me.scheduleSaveState(),
            drop    : data => me.onTreeDrop(data)
        })
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        Neo.main.DomEvents.registerPreventDefaultTargets({name: 'contextmenu', cls: ['go-site-tree'], windowId: me.windowId});
        me.addDomListeners({contextmenu: data => me.onContextMenu(data), scope: me})
    }

    destroy(...args) {
        clearTimeout(this.saveTimer);
        super.destroy(...args)
    }

    async reload() {
        this.loading = true;

        try {
            await super.reload()
        } finally {
            this.loading = false
        }
    }

    /**
     * @param {Object|null} node
     * @returns {Promise<Object[]>}
     */
    async loadNodes(node) {
        const result = await client.legacy('site/site/tree', {node: node ? node.id : 'root'});

        return (Array.isArray(result) ? result : []).map(n => this.toNode(n))
    }

    /**
     * A node of site/site/tree as a tree node
     * @param {Object} data
     * @returns {Object}
     * @protected
     */
    toNode(data) {
        const site = parseNodeId(data.id),
              root = !site.modelId && site.type !== 'site';

        let children;

        if (Array.isArray(data.children)) {
            children = data.children.map(child => this.toNode(child))
        } else {
            // null: a menu item whose children load on expand
            children = data.hasChildren ? undefined : []
        }

        return {
            id         : String(data.id),
            text       : data.text,
            icon       : root ? 'folder' : ICONS[site.type],
            site,
            slug       : data.slug,
            menuId     : data.menu_id,
            hasChildren: !!data.hasChildren,
            // a leaf is expanded on the server (hasChildren false), only folders count
            expanded   : !!data.expanded && children?.length > 0,
            // nothing is dropped on a site itself
            cls        : site.type === 'site' ? ['go-no-drop'] : undefined,
            children
        }
    }

    /**
     * site/site/saveTreeState, shortly after the last expand or collapse
     * @protected
     */
    scheduleSaveState() {
        let me = this;

        if (me.loading) {
            return
        }

        clearTimeout(me.saveTimer);
        me.saveTimer = setTimeout(() => {
            client.legacy('site/site/saveTreeState', {expandedNodes: JSON.stringify([...me.expandedIds])})
                .catch(e => console.error('SiteTree saveTreeState', e))
        }, SAVE_STATE_DELAY)
    }

    /**
     * The node of a DOM event's row
     * @param {Object} data neo DOM event
     * @returns {Object|null}
     * @protected
     */
    nodeOfEvent(data) {
        const item = data.path.find(node => node.cls?.includes(this.itemCls)),
              id   = item && this.nodeIdOf(item.id);

        return (id !== undefined && id !== null && this.getNode(id)) || null
    }

    onContextMenu(data) {
        let me   = this,
            node = me.nodeOfEvent(data);

        node && me.showRowMenu(node, data.path[0]?.id)
    }

    /**
     * @param {Object} node
     * @param {String} target DOM id the menu aligns to
     */
    showRowMenu(node, target) {
        let me    = this,
            items = me.rowMenu?.(node);

        items?.length && MenuList.showAt({appName: me.appName, windowId: me.windowId, target, items})
    }

    createItemContent(record) {
        const content = super.createItemContent(record);

        this.rowMenu && content.push({tag: 'i', cls: ['go-icon', 'go-row-menu'], text: 'more_vert', title: coreT('More options')});

        return content
    }

    getInteractiveItemIndex(path) {
        if (path.some(node => node.cls?.includes('go-row-menu'))) {
            return undefined
        }

        return super.getInteractiveItemIndex(path)
    }

    onClick(data) {
        let me    = this,
            icon  = data.path.find(node => node.cls?.includes('go-row-menu')),
            caret = data.path.find(node => node.cls?.includes('go-tree-caret')),
            node  = me.nodeOfEvent(data);

        if (icon && node) {
            me.showRowMenu(node, icon.id);
            return
        }

        super.onClick(data);

        node && !caret && me.fire('nodeSelect', {node})
    }

    /**
     * Sorts content items and menu items, or turns a content item dropped on a menu into a
     * menu item (GO.site.treeNodes.AbstractNode/ContentNode nodeDrop())
     * @param {Object} data {dragNode, node, position}
     * @protected
     */
    async onTreeDrop({dragNode, node, position}) {
        let me = this;

        if (!dragNode || !node) {
            return
        }

        const drag   = dragNode.site,
              parent = position === 'on' ? node : me.getParentNode(node.id);

        if ((drag.type !== 'content' && drag.type !== 'menuitem') || !me.mayChange(drag.siteId)) {
            return
        }

        const target = parent?.site;

        // a content item on a menu or menu item: a new menu item
        if (drag.type === 'content' && target && (target.type === 'menu' || target.type === 'menuitem') && target.modelId) {
            me.fire('contentToMenu', {content: dragNode, target: parent});
            return
        }

        // sorting stays within the content of one site, or within one menu
        if (!target || target.siteId !== drag.siteId || (drag.type === 'content' ? target.type !== 'content' : !(target.type === 'menu' || target.type === 'menuitem') || !target.modelId)) {
            return
        }

        // the parent's children in their new order (the dragged node at its drop place)
        const siblings = (parent.children || []).map(child => child.id).filter(id => id !== dragNode.id);

        if (position === 'on') {
            siblings.push(dragNode.id)
        } else {
            const index = siblings.indexOf(node.id);
            siblings.splice(position === 'before' ? index : index + 1, 0, dragNode.id)
        }

        try {
            await client.legacy('site/site/treeSort', {parent: parent.id, sortOrder: JSON.stringify(siblings)});
        } catch (e) {
            me.fire('error', {error: e})
        }

        me.isDestroyed || me.reload().catch(e => console.error('SiteTree', e))
    }
}

export default Neo.setupClass(SiteTree);
