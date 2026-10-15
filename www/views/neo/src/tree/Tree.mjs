import List      from '../../node_modules/neo.mjs/src/list/Base.mjs';
import Store     from '../../node_modules/neo.mjs/src/data/Store.mjs';
import {escapeHtml} from '../Format.mjs';
import {t}       from '../Translate.mjs';

/**
 * GOUI Tree (goui/script/component/tree): nodes load on demand from a nodeProvider,
 * expand/collapse with the caret, an optional checkbox per node.
 *
 * nodeProvider(node) returns the children of `node` (null = the root nodes), sync or as
 * a Promise. A node: {id, text, icon?, check?, children?, expanded?, cls?}
 * - children: [] = a leaf, an array = known children, undefined = ask the provider on expand
 * - check: true/false shows a checkbox (GOUI TreeRecord.check)
 * - expanded: load and show the children at once
 *
 * Expanded nodes are remembered across reload() (GOUI TreeStore.expandedRecordCache).
 *
 *     {module: Tree, defaultIcon: 'folder', nodeProvider: async node => {
 *         const {list} = await client.queryGet('Folder', {filter: {parentId: node?.id ?? null}});
 *         return list.map(f => ({id: f.id, text: f.name}))
 *     }}
 *
 * Events: expand / collapse ({node}), checkChange ({node, checked}), select via the list
 * (itemClick {record}; getNode(record.id) gives the node).
 */
class Tree extends List {
    static config = {
        className    : 'GO.tree.Tree',
        ntype        : 'go-tree',
        baseCls      : ['go-tree', 'neo-list'],
        useInternalId: false,
        /**
         * Material icon for nodes without `icon`
         * @member {String|null} defaultIcon=null
         */
        defaultIcon: null,
        /**
         * (node|null) => node[] | Promise<node[]>
         * @member {Function|null} nodeProvider=null
         */
        nodeProvider: null,
        /**
         * Load the root nodes when created
         * @member {Boolean} autoLoad=true
         */
        autoLoad: true,
        store: {
            module     : Store,
            keyProperty: 'id',
            model      : {fields: [
                {name: 'id',    type: 'String'},
                {name: 'text',  type: 'String'},
                {name: 'level', type: 'Integer'},
                // what the row shows besides the text: a change repaints the row
                {name: 'state', type: 'String'}
            ]}
        }
    }

    /** root nodes */
    roots = []
    /** id → node */
    nodes = new Map()
    /** id → parent node (null for roots) */
    parents = new Map()
    /** ids of expanded nodes, kept across reload() */
    expandedIds = new Set()
    /** ids whose children are loading */
    loadingIds = new Set()
    /** load counter: a reload drops older answers */
    generation = 0

    onConstructed() {
        super.onConstructed();
        this.autoLoad && this.reload().catch(e => console.error('Tree', e))
    }

    /**
     * Loads the root nodes again (and the expanded nodes' children)
     * @returns {Promise<void>}
     */
    async reload() {
        let me         = this,
            generation = ++me.generation,
            roots      = await me.provide(null);

        if (me.isDestroyed || generation !== me.generation) {
            return
        }

        me.roots = roots;
        me.nodes.clear();
        me.parents.clear();
        me.register(roots, null);
        await me.populate(roots, generation);

        if (!me.isDestroyed && generation === me.generation) {
            me.refresh();
            me.fire('load', {nodes: roots})
        }
    }

    /**
     * @param {Object|null} node
     * @returns {Promise<Object[]>} the provider's nodes (copies)
     * @protected
     */
    async provide(node) {
        const copy = children => children.map(child => ({
            ...child,
            id: String(child.id),
            ...(Array.isArray(child.children) ? {children: copy(child.children)} : {})
        }));

        return copy(await this.nodeProvider?.(node) || [])
    }

    /**
     * @param {Object[]} children
     * @param {Object|null} parent
     * @protected
     */
    register(children, parent) {
        children.forEach(child => {
            this.nodes.set(child.id, child);
            this.parents.set(child.id, parent);
            Array.isArray(child.children) && this.register(child.children, child)
        })
    }

    /**
     * Loads the children of expanded nodes (GOUI TreeStore.populateChildren())
     * @protected
     */
    async populate(children, generation) {
        let me = this;

        for (const child of children) {
            if (child.expanded || me.expandedIds.has(child.id)) {
                me.expandedIds.add(child.id);

                if (child.children === undefined) {
                    child.children = await me.provide(child);

                    if (me.isDestroyed || generation !== me.generation) {
                        return
                    }

                    me.register(child.children, child)
                }

                await me.populate(child.children, generation)
            }
        }
    }

    /**
     * Rebuilds the visible rows from the node tree
     * @protected
     */
    refresh() {
        let me   = this,
            rows = [],
            walk = (children, level) => children.forEach(node => {
                rows.push({id: node.id, text: String(node.text ?? ''), level, state: me.rowState(node)});
                me.expandedIds.has(node.id) && Array.isArray(node.children) && walk(node.children, level + 1)
            });

        walk(me.roots, 0);
        me.store.data = rows
    }

    /**
     * @param {String|Number} id
     * @returns {Object|undefined}
     */
    getNode(id) {
        return this.nodes.get(String(id))
    }

    /**
     * @param {String|Number} id
     * @returns {Object|null}
     */
    getParentNode(id) {
        return this.parents.get(String(id)) || null
    }

    /**
     * @returns {Object[]} nodes with check === true
     */
    getChecked() {
        return [...this.nodes.values()].filter(node => node.check === true)
    }

    /**
     * @param {String|Number} id
     * @returns {Promise<void>}
     */
    async expand(id) {
        let me   = this,
            node = me.getNode(id);

        if (!node || me.expandedIds.has(node.id) || me.loadingIds.has(node.id)) {
            return
        }

        if (node.children === undefined) {
            const generation = me.generation;

            me.loadingIds.add(node.id);
            me.updateItem(node.id);

            try {
                node.children = await me.provide(node)
            } finally {
                me.loadingIds.delete(node.id);
                me.updateItem(node.id)
            }

            if (me.isDestroyed || generation !== me.generation) {
                return
            }

            me.register(node.children, node)
        }

        me.expandedIds.add(node.id);
        me.refresh();
        me.fire('expand', {node})
    }

    /**
     * @param {String|Number} id
     */
    collapse(id) {
        let me   = this,
            node = me.getNode(id);

        if (node && me.expandedIds.delete(node.id)) {
            me.refresh();
            me.fire('collapse', {node})
        }
    }

    /**
     * @param {String|Number} id
     * @param {Boolean} checked
     */
    setChecked(id, checked) {
        let me   = this,
            node = me.getNode(id);

        if (node && node.check !== undefined && node.check !== checked) {
            node.check = checked;
            me.updateItem(node.id);
            me.fire('checkChange', {node, checked})
        }
    }

    /**
     * Repaints one row
     * @param {String} id
     * @protected
     */
    updateItem(id) {
        const record = this.store.get(id),
              node   = this.getNode(id);

        // a changed record field repaints its row
        record && node && (record.state = this.rowState(node))
    }

    /**
     * @param {Object} node
     * @returns {String} leaf / expanded / loading / checked state of a row
     * @protected
     */
    rowState(node) {
        let me = this;

        return [
            Array.isArray(node.children) && !node.children.length ? 'leaf' : '',
            me.expandedIds.has(node.id) ? 'expanded' : '',
            me.loadingIds.has(node.id) ? 'loading' : '',
            node.check === undefined ? '' : (node.check ? 'checked' : 'unchecked'),
            node.icon || ''
        ].join('|')
    }

    createItemContent(record) {
        let me       = this,
            node     = me.getNode(record.id) || {},
            level    = record.level || 0,
            isLeaf   = Array.isArray(node.children) && !node.children.length,
            expanded = me.expandedIds.has(node.id),
            loading  = me.loadingIds.has(node.id),
            icon     = node.icon || me.defaultIcon,
            content  = [];

        for (let i = 0; i < level; i++) {
            content.push({tag: 'span', cls: ['go-tree-indent']})
        }

        content.push({
            tag : 'span',
            cls : ['go-tree-caret', 'go-icon', isLeaf ? 'go-tree-leaf' : '', loading ? 'go-tree-loading' : ''].filter(Boolean),
            text: isLeaf ? '' : (loading ? 'progress_activity' : (expanded ? 'expand_more' : 'chevron_right')),
            title: isLeaf ? null : (expanded ? t('Collapse') : t('Expand'))
        });

        icon && content.push({tag: 'i', cls: ['go-icon', 'go-tree-icon'], text: icon});

        node.check !== undefined && content.push({tag: 'span', cls: ['go-check', node.check ? 'go-checked' : ''].filter(Boolean), role: 'checkbox', 'aria-checked': String(!!node.check)});

        content.push({tag: 'span', cls: ['go-tree-label'], html: escapeHtml(record.text)});

        return content
    }

    /**
     * Caret and checkbox clicks don't select the row
     */
    getInteractiveItemIndex(path) {
        if (path.some(node => node.cls?.includes('go-tree-caret') || node.cls?.includes('go-check'))) {
            return undefined
        }

        return super.getInteractiveItemIndex(path)
    }

    onClick(data) {
        let me       = this,
            caret    = data.path.find(node => node.cls?.includes('go-tree-caret')),
            check    = data.path.find(node => node.cls?.includes('go-check')),
            itemNode = (caret || check) && data.path.find(node => node.cls?.includes(me.itemCls)),
            id       = itemNode && me.getItemRecordId(itemNode.id);

        if (id !== undefined && id !== null && caret) {
            me.expandedIds.has(String(id)) ? me.collapse(id) : me.expand(id).catch(e => console.error('Tree expand', e));
            return
        }

        if (id !== undefined && id !== null && check) {
            me.setChecked(id, !me.getNode(id)?.check);
            return
        }

        super.onClick(data)
    }
}

export default Neo.setupClass(Tree);
