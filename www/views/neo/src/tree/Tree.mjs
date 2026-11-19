import List      from '../../node_modules/neo.mjs/src/list/Base.mjs';
import Store     from '../../node_modules/neo.mjs/src/data/Store.mjs';
import {enableDragDrop} from '../component/dragDrop.mjs';
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
 *
 * Drag and drop (GOUI Tree draggable / dropOn / dropBetween): `dragNodes` lets nodes be
 * dragged, `dropOn` / `dropBetween` accept drops on a node or before / after it. A node
 * resting under the pointer for a second expands. The tree only fires `drop`; the
 * listener saves the move (and reloads, or calls moveNode() for the local tree):
 *
 *     {module: Tree, dragNodes: true, dropOn: true, dropBetween: true, listeners: {
 *         drop: ({dragNode, node, position}) => {} // node null: dropped below the nodes
 *     }}
 *
 * `dragNode` is the dragged node of this tree, or null for rows of another component of the
 * same `dragGroup` (then `source` is the {rootId, itemId, recordId} of WS/DragDrop). A node
 * can't be dropped into itself or its own subtree.
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
        /**
         * Nodes can be dragged
         * @member {Boolean} dragNodes=false
         */
        dragNodes: false,
        /**
         * Drops on a node are allowed
         * @member {Boolean} dropOn=false
         */
        dropOn: false,
        /**
         * Drops before / after a node are allowed (sorting)
         * @member {Boolean} dropBetween=false
         */
        dropBetween: false,
        /**
         * Drags are accepted from components of the same group only (default: this tree)
         * @member {String|null} dragGroup=null
         */
        dragGroup: null,
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
    /** ids whose loading children were changed by moveNode(): load them again */
    staleIds = new Set()
    /** load counter: a reload drops older answers */
    generation = 0

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.autoLoad && me.reload().catch(e => console.error('Tree', e));

        if (me.dragNodes || me.dropOn || me.dropBetween) {
            const drop = me.dropOn || me.dropBetween;

            enableDragDrop(me, {
                drag    : me.dragNodes ? '.' + me.itemCls : undefined,
                drop    : drop ? '.' + me.itemCls : undefined,
                group   : me.dragGroup || me.id,
                position: me.dropOn && me.dropBetween ? 'both' : (me.dropBetween ? 'between' : 'on'),
                onHover : drop ? ({targetId}) => me.onDragHover(targetId) : undefined,
                onDrop  : event => me.onNodeDrop(event)
            }).catch(e => console.error('Tree drag and drop', e))
        }
    }

    /**
     * Expands a collapsed node the pointer rests on during a drag
     * @param {String} itemId
     * @protected
     */
    onDragHover(itemId) {
        const id = this.nodeIdOf(itemId);

        id !== null && this.expand(id).catch(e => console.error('Tree expand', e))
    }

    /**
     * Node id of a row's DOM id. neo's getItemRecordId() takes the part after the first "__",
     * which is wrong for ids that contain "__" themselves: strip this tree's prefix instead.
     * @param {String} itemId
     * @returns {String|null} null when it is no row of this tree
     */
    nodeIdOf(itemId) {
        const prefix = this.id + '__';

        return typeof itemId === 'string' && itemId.startsWith(prefix) ? itemId.slice(prefix.length) : null
    }

    /**
     * @param {Object} event goDrop of WS/DragDrop
     * @protected
     */
    onNodeDrop(event) {
        let me       = this,
            onRoot   = event.targetId === me.id,
            node     = onRoot ? null : me.getNode(me.nodeIdOf(event.targetId)) || null,
            ownDrag  = event.source?.rootId === me.id,
            dragNode = ownDrag ? me.getNode(me.nodeIdOf(event.source.itemId)) || null : null,
            position = node ? event.position || 'on' : 'on';

        // a row that is gone meanwhile (reload) is no drop on the root
        if ((!onRoot && !node) || (ownDrag && !dragNode)) {
            return
        }

        if (node && ((position === 'on' && !me.dropOn) || (position !== 'on' && !me.dropBetween))) {
            return
        }

        // a node can't go into its own subtree
        if (dragNode && node && me.isAncestor(dragNode, node)) {
            return
        }

        me.fire('drop', {dragNode, node, position, source: event.source, files: event.files, copy: event.copy})
    }

    /**
     * @param {Object} ancestor
     * @param {Object} node
     * @returns {Boolean} node is ancestor itself or in its subtree
     */
    isAncestor(ancestor, node) {
        for (let current = node; current; current = this.getParentNode(current.id)) {
            if (current === ancestor) {
                return true
            }
        }

        return false
    }

    /**
     * Moves a node in the local tree, e.g. after its move was saved, without asking the
     * nodeProvider again (GOUI TreeStore move)
     *
     * @param {String|Number} id the node to move
     * @param {String|Number|null} targetId the node to put it on (into), before or after;
     *        null with "on" appends it to the root nodes
     * @param {String} [position='on'] on, before or after
     * @returns {Boolean} false when it can't move there
     */
    moveNode(id, targetId, position='on') {
        let me     = this,
            node   = me.getNode(id),
            target = targetId === null || targetId === undefined ? null : me.getNode(targetId);

        if (!node || (targetId !== null && targetId !== undefined && !target) || (!target && position !== 'on') ||
            (target && me.isAncestor(node, target))) {
            return false
        }

        const parent   = position === 'on' ? target : me.getParentNode(target.id),
              siblings = list => list === null ? me.roots : list.children,
              from     = siblings(me.getParentNode(node.id));

        // a node whose children aren't loaded yet gets them from the provider on expand
        if (parent && !Array.isArray(parent.children)) {
            from.splice(from.indexOf(node), 1);
            me.unregister(node);
            // a load running now may have started before the move was saved
            me.loadingIds.has(parent.id) && me.staleIds.add(parent.id);
            me.refresh();
            return true
        }

        from.splice(from.indexOf(node), 1);

        const to = siblings(parent);

        to.splice(position === 'on' ? to.length : to.indexOf(target) + (position === 'after' ? 1 : 0), 0, node);
        me.parents.set(node.id, parent);
        me.refresh();
        return true
    }

    /**
     * Forgets a node and its loaded subtree
     * @param {Object} node
     * @protected
     */
    unregister(node) {
        this.nodes.delete(node.id);
        this.parents.delete(node.id);
        this.expandedIds.delete(node.id);
        Array.isArray(node.children) && node.children.forEach(child => this.unregister(child))
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
        return id === null || id === undefined ? undefined : this.nodes.get(String(id))
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
                do {
                    me.staleIds.delete(node.id);
                    node.children = await me.provide(node)
                } while (me.staleIds.has(node.id) && !me.isDestroyed)
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
            id       = itemNode && me.nodeIdOf(itemNode.id);

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
