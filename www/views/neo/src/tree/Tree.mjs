import List      from '../../node_modules/neo.mjs/src/list/Base.mjs';
import Store     from '../../node_modules/neo.mjs/src/data/Store.mjs';
import {enableDragDrop} from '../component/dragDrop.mjs';
import {escapeHtml} from '../Format.mjs';
import {fmt, t}  from '../Translate.mjs';
import MenuList  from '../menu/List.mjs';
import SelectionModel from './SelectionModel.mjs';

// record id prefix of the "Show more..." rows; shortcut: a root node with the id "__more__" (or
// "__more__" + another node's id) would clash with a paging row, prefix such ids if that ever happens
const MORE = '__more__';
/** names in the ghost of a drag of several nodes, then "and N more" */
const GHOST_NAMES = 5;
/** ms between a change while searching and the search running again */
const SEARCH_DELAY = 300;

/**
 * @summary GOUI Tree (goui/script/component/tree): nodes load on demand from a nodeProvider,
 * expand/collapse with the caret, an optional checkbox per node.
 *
 * nodeProvider(node, {position}) returns the children of `node` (null = the root nodes), sync
 * or as a Promise. A node: {id, text, icon?, check?, children?, expanded?, cls?, badge?}
 * - children: [] = a leaf, an array = known children, undefined = ask the provider on expand
 * - check: true/false shows a checkbox (GOUI TreeRecord.check)
 * - expanded: load and show the children at once
 * - badge: a count or text at the end of the row (ExtJS "badge red-fill"), hidden at 0;
 *   setBadge(id, badge) changes it
 *
 * Paging (ExtJS FolderTreeLoader position / pageSize): a provider may return
 * {nodes, hasMore} instead of the array. With hasMore the level ends in a "Show more..."
 * row that asks the provider for the next page with `position` = the nodes loaded so far.
 *
 * openPath(ids) expands down a path of node ids (root first), loading levels and pages on
 * the way, and selects the last node (e.g. a deep link to a folder).
 *
 * Row menu: `nodeMenu: true` (or node => Boolean) shows a ⋮ icon per row; the icon and a
 * right click fire `menu` {node, target}. The listener builds the items and calls
 * showMenu(items, target).
 *
 * Expanded nodes are remembered across reload() (GOUI TreeStore.expandedRecordCache);
 * reloadNode(id) loads one node's children again the same way.
 *
 *     {module: Tree, defaultIcon: 'folder', nodeProvider: async node => {
 *         const {list} = await client.queryGet('Folder', {filter: {parentId: node?.id ?? null}});
 *         return list.map(f => ({id: f.id, text: f.name}))
 *     }}
 *
 * Events: expand / collapse ({node}), checkChange ({node, checked}), menu ({node, target}),
 * select via the list (itemClick {record}; getNode(record.id) gives the node).
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
 *
 * Multi-selection (`multiSelect`, GO.tree.SelectionModel): Ctrl / Cmd + click toggles a node,
 * Shift + click adds one; `selectionChange` {nodes} fires on every change, getSelectedNodes()
 * gives them. Dragging a selected node drags all selected nodes: the ghost shows up to five
 * names and "and N more", the selection is locked while dragging, and `drop` gets them all
 * as `dragNodes` (the topmost ones: a node whose ancestor is selected too goes with it). The
 * drop is refused when the target lies in the subtree of any of them. `dragNodes` is always
 * set ([dragNode] for a single drag).
 *
 * Search with hits in place (amd/pms component tree search): search(query) asks the
 * `searchProvider` (query) => node[] | {nodes} (sync or a Promise) for a FLAT list of the hits
 * and their ancestors, each node with `parentId` and `hit: true` on the hits. The tree nests
 * them: a node goes under its listed parent, which comes expanded with only the listed
 * children; a node without a listed child keeps its own `children` (a hit stays lazy and
 * expands through the nodeProvider); a node whose parent isn't listed (a parent the user may
 * not read) shows at the top level. Hits are bold (class "go-tree-hit"). An older answer is
 * dropped. While a search is shown, reload() runs it again, and reloadNode() / moveNode()
 * (live changes) run it again after 300 ms (scheduleSearch()) instead of patching the
 * search rows. resetSearch() (or search('')) loads the normal tree with the expanded nodes
 * of before the search and reveals the node selected during the search.
 *
 *     {module: Tree, searchProvider: async query => {
 *         const {list} = await client.queryGet('Folder', {filter: {treeSearch: query}});
 *         return list.map(f => ({id: f.id, parentId: f.parentId, text: f.name, hit: f.isHit}))
 *     }}
 * @class GO.tree.Tree
 * @extends Neo.list.Base
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
        /**
         * A ⋮ icon and a right click on rows fire `menu`: true, or (node) => Boolean
         * @member {Boolean|Function} nodeMenu=false
         */
        nodeMenu: false,
        /**
         * Ctrl / Cmd + click toggles and Shift + click adds nodes to the selection; a drag of a
         * selected node drags all of them
         * @member {Boolean} multiSelect=false
         */
        multiSelect: false,
        /**
         * (query) => node[] | {nodes} | Promise: the hits and their ancestors as a flat list,
         * each node with `parentId` and `hit` (see search())
         * @member {Function|null} searchProvider=null
         */
        searchProvider: null,
        selectionModel: {module: SelectionModel},
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
    /** children arrays (and roots) the provider has more pages of */
    moreLists = new WeakSet()
    /** node or children array → the running load of its children or next page */
    pending = new Map()
    /** the last reload() */
    loadPromise = null
    /** nodes of this tree are being dragged: the selection is locked */
    dragging = false
    /** the search shown (or loading), null for the normal tree */
    searchQuery = null
    /** the search whose rows are shown */
    shownQuery = null
    /** expandedIds of before the search, restored by resetSearch() */
    savedExpanded = null
    /** scheduleSearch() timer */
    searchTimer = null

    /**
     * @summary Loads the root nodes (autoLoad) and sets up the row menu and drag and drop.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.autoLoad && me.reload().catch(e => console.error('Tree', e));

        if (me.nodeMenu) {
            // the cls tells the main thread to drop the browser's own context menu here
            me.cls = [...(me.cls || []), 'go-tree-menu'];
            Neo.main?.DomEvents?.registerPreventDefaultTargets({name: 'contextmenu', cls: ['go-tree-menu'], windowId: me.windowId});
            me.addDomListeners({contextmenu: me.onContextMenu, scope: me})
        }

        if (me.dragNodes || me.dropOn || me.dropBetween) {
            const drop = me.dropOn || me.dropBetween;

            enableDragDrop(me, {
                drag    : me.dragNodes ? '.' + me.itemCls : undefined,
                drop    : drop ? '.' + me.itemCls : undefined,
                group   : me.dragGroup || me.id,
                position: me.dropOn && me.dropBetween ? 'both' : (me.dropBetween ? 'between' : 'on'),
                onHover : drop ? ({targetId}) => me.onDragHover(targetId) : undefined,
                onDragStart: me.dragNodes ? () => me.dragging = true : undefined,
                onDragEnd  : me.dragNodes ? () => me.dragging = false : undefined,
                onDrop  : event => me.onNodeDrop(event)
            }).catch(e => console.error('Tree drag and drop', e));

            me.dragNodes && me.multiSelect && me.updateDragGhost()
        }
    }

    /**
     * @summary Destroys the scheduleSearch() timer with the tree.
     * @param {...*} args
     */
    destroy(...args) {
        clearTimeout(this.searchTimer);
        super.destroy(...args)
    }

    /**
     * @summary Fires `selectionChange` {nodes} after neo's own handling, and updates the drag ghost.
     * @param {Object} data selectionChange of the selection model
     * @protected
     */
    onSelectionChange(data) {
        super.onSelectionChange(data);

        let me = this;

        me.dragNodes && me.multiSelect && me.updateDragGhost();
        me.fire('selectionChange', {nodes: me.getSelectedNodes()})
    }

    /**
     * @summary The selected nodes, in the order they were selected; a selected id whose node is
     * gone (a reload, a search) is left out.
     * @returns {Object[]}
     */
    getSelectedNodes() {
        let me = this;

        return (me.selectionModel?.getSelection?.() || [])
            .map(itemId => me.getNode(me.nodeIdOf(itemId)))
            .filter(Boolean)
    }

    /**
     * @summary The nodes a drag of `node` moves: all selected (topmost) nodes when it is one of
     * them and `multiSelect` is on, else only `node`.
     * @param {Object} node the dragged node
     * @returns {Object[]}
     */
    dragNodesOf(node) {
        let me       = this,
            selected = me.multiSelect ? me.getSelectedNodes() : [];

        if (!selected.includes(node)) {
            return [node]
        }

        // a node whose ancestor is dragged as well moves with that ancestor
        return selected.filter(child => !selected.some(other => other !== child && me.isAncestor(other, child)))
    }

    /**
     * @summary Writes the names of the selected nodes for the ghost of a drag (WS/DragDrop
     * data-go-drag-ghost): up to five, then "and N more"; the addon shows it for a drag of a
     * selected row when there are two or more.
     * @protected
     */
    updateDragGhost() {
        let me     = this,
            nodes  = me.getSelectedNodes(),
            names  = nodes.slice(0, GHOST_NAMES).map(node => String(node.text ?? ''));

        nodes.length > GHOST_NAMES && names.push(fmt(t('and {count} more'), {count: nodes.length - GHOST_NAMES}));

        const ghost = JSON.stringify(nodes.length > 1 ? names : []);

        if (me.vdom.data?.goDragGhost !== ghost) {
            me.vdom.data = {...me.vdom.data, goDragGhost: ghost};
            me.update()
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
     * @summary Record id of a row's DOM id via nodeIdOf(): neo's own takes the part after the first
     * "__", so a click on node "a__b" would select another node.
     * @param {String} itemId
     * @returns {String|Number}
     */
    getItemRecordId(itemId) {
        return this.nodeIdOf(itemId) ?? super.getItemRecordId(itemId)
    }

    /**
     * @summary Turns a goDrop into the tree's `drop` {dragNode, dragNodes, node, position}, or
     * drops it when the target is gone, not allowed or in a dragged node's subtree.
     * @param {Object} event goDrop of WS/DragDrop
     * @protected
     */
    onNodeDrop(event) {
        let me       = this,
            onRoot   = event.targetId === me.id,
            node     = onRoot ? null : me.getNode(me.nodeIdOf(event.targetId)) || null,
            ownDrag  = event.source?.rootId === me.id,
            dragNode = ownDrag ? me.getNode(me.nodeIdOf(event.source.itemId)) || null : null,
            position = node ? event.position || 'on' : 'on',
            dragNodes = dragNode ? me.dragNodesOf(dragNode) : [];

        // a row that is gone meanwhile (reload) is no drop on the root
        if ((!onRoot && !node) || (ownDrag && !dragNode)) {
            return
        }

        if (node && ((position === 'on' && !me.dropOn) || (position !== 'on' && !me.dropBetween))) {
            return
        }

        // a node can't go into its own subtree
        if (node && dragNodes.some(dragged => me.isAncestor(dragged, node))) {
            return
        }

        me.fire('drop', {dragNode, dragNodes, node, position, source: event.source, files: event.files, copy: event.copy})
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
     * @summary Moves a node in the local tree, e.g. after its move was saved, without asking the
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

        // the search rows are no tree to patch: the search runs again
        if (me.searchQuery !== null) {
            me.scheduleSearch();
            return true
        }

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
        this.pending.delete(node);
        Array.isArray(node.children) && node.children.forEach(child => this.unregister(child))
    }

    /**
     * @summary Loads the root nodes again (and the expanded nodes' children); while a search is
     * shown, runs the search again.
     * @returns {Promise<void>}
     */
    reload() {
        let me = this;

        return me.loadPromise = me.searchQuery === null ? me.loadRoots() : me.loadSearch()
    }

    /**
     * @summary Shows the hits of the searchProvider in their place (see the class docs); an
     * empty query is resetSearch().
     * @param {String} query
     * @returns {Promise<void>}
     */
    search(query) {
        let me = this;

        query = String(query ?? '').trim();

        if (!query) {
            return me.resetSearch()
        }

        // the shape to come back to; a search after a search keeps the first one's
        me.searchQuery === null && (me.savedExpanded = new Set(me.expandedIds));
        me.searchQuery = query;

        return me.reload()
    }

    /**
     * @summary A search is shown or loading.
     * @returns {Boolean}
     */
    isSearching() {
        return this.searchQuery !== null
    }

    /**
     * @summary Runs the shown search again after 300 ms, once for changes in a row (live updates
     * while searching); nothing without a search.
     */
    scheduleSearch() {
        let me = this;

        clearTimeout(me.searchTimer);
        me.searchTimer = me.searchQuery === null ? null : setTimeout(() => {
            me.searchTimer = null;
            me.isDestroyed || me.searchQuery === null || me.reload().catch(e => console.error('Tree search', e))
        }, SEARCH_DELAY)
    }

    /**
     * @summary Leaves the search: loads the normal tree with the nodes expanded before the
     * search, then expands down to the node selected during the search (openPath()) so it shows.
     * @returns {Promise<void>}
     */
    async resetSearch() {
        let me = this;

        if (me.searchQuery === null) {
            return
        }

        const selected = me.getSelectedNodes().pop(),
              path     = selected ? me.pathOf(selected) : null;

        clearTimeout(me.searchTimer);
        me.searchTimer   = null;
        me.searchQuery   = null;
        me.expandedIds   = me.savedExpanded || new Set();
        me.savedExpanded = null;

        await me.reload();

        const generation = me.generation;

        // a newer search or reset loaded meanwhile: this path is not theirs
        path && !me.isDestroyed && me.searchQuery === null && generation === me.generation &&
            await me.openPath(path, {select: false})
    }

    /**
     * @summary The ids from the top-level node down to `node`.
     * @param {Object} node
     * @returns {String[]}
     */
    pathOf(node) {
        const ids = [];

        for (let current = node; current; current = this.getParentNode(current.id)) {
            ids.unshift(current.id)
        }

        return ids
    }

    /**
     * @summary Asks the searchProvider and nests its flat answer (see the class docs); an
     * answer older than the last reload() or search() is dropped.
     * @returns {Promise<void>}
     * @protected
     */
    async loadSearch() {
        let me         = this,
            generation = ++me.generation,
            query      = me.searchQuery,
            result;

        clearTimeout(me.searchTimer);
        me.searchTimer = null;

        result = await me.searchProvider?.(query) || [];

        if (me.isDestroyed || generation !== me.generation) {
            return
        }

        const flat   = (Array.isArray(result) ? result : result.nodes || []).map(node => ({
                  ...node,
                  id      : String(node.id),
                  parentId: node.parentId === null || node.parentId === undefined ? null : String(node.parentId)
              })),
              byId   = new Map(flat.map(node => [node.id, node])),
              listed = new Map(),
              roots  = [],
              // the same search again (live changes) keeps the nodes the user expanded in it
              expanded = new Set(query === me.shownQuery ? me.expandedIds : []);

        flat.forEach(node => {
            const parent = node.parentId !== null && node.parentId !== node.id ? byId.get(node.parentId) : undefined;

            parent ? (listed.get(parent) || listed.set(parent, []).get(parent)).push(node) : roots.push(node)
        });

        listed.forEach((children, parent) => {
            parent.children = children;
            expanded.add(parent.id)
        });

        me.roots       = roots;
        me.expandedIds = expanded;
        me.nodes.clear();
        me.parents.clear();
        me.register(roots, null);
        await me.populate(roots, generation);

        if (!me.isDestroyed && generation === me.generation) {
            me.shownQuery = query;
            me.refresh();
            me.fire('search', {query, nodes: roots})
        }
    }

    /**
     * @summary Loads the normal tree: the root nodes and the children of the expanded nodes.
     * @returns {Promise<void>}
     * @protected
     */
    async loadRoots() {
        let me         = this,
            generation = ++me.generation,
            roots      = await me.provide(null);

        if (me.isDestroyed || generation !== me.generation) {
            return
        }

        me.shownQuery = null;
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
     * @summary Loads the children of one node again, and of its expanded descendants (e.g. folders
     * created elsewhere). Descendants that are still there stay expanded.
     * @param {String|Number} id
     * @returns {Promise<void>}
     */
    async reloadNode(id) {
        let me         = this,
            node       = me.getNode(id),
            generation = me.generation,
            children;

        // the search rows show only the branches to the hits: the search runs again
        if (me.searchQuery !== null) {
            me.scheduleSearch();
            return
        }

        if (!node || me.loadingIds.has(node.id)) {
            return
        }

        me.loadingIds.add(node.id);
        me.updateItem(node.id);

        try {
            children = await me.provide(node)
        } finally {
            me.loadingIds.delete(node.id);
            me.isDestroyed || me.updateItem(node.id)
        }

        // a reload() in between replaced the node
        if (me.isDestroyed || generation !== me.generation || me.getNode(node.id) !== node) {
            return
        }

        // forget the old subtree, but not which of its nodes were expanded (like reload())
        const expanded = new Set(me.expandedIds),
              known    = new Set();

        (function collect(list) {
            Array.isArray(list) && list.forEach(child => {
                known.add(child.id);
                collect(child.children)
            })
        })(node.children);

        Array.isArray(node.children) && node.children.forEach(child => me.unregister(child));
        expanded.forEach(childId => me.expandedIds.add(childId));

        // nodes shown before keep their state here: a provider's `expanded` may be older (saved later)
        (function local(list) {
            list.forEach(child => {
                known.has(child.id) && (child.expanded = expanded.has(child.id));
                Array.isArray(child.children) && local(child.children)
            })
        })(children);

        node.children = children;
        me.register(children, node);
        await me.populate(children, generation);

        !me.isDestroyed && generation === me.generation && me.refresh()
    }

    /**
     * @param {Object|null} node
     * @param {Number} [position=0] nodes of this level loaded so far (paging)
     * @returns {Promise<Object[]>} the provider's nodes (copies), in moreLists when it has more
     * @protected
     */
    async provide(node, position=0) {
        const copy   = children => children.map(child => ({
                  ...child,
                  id: String(child.id),
                  ...(Array.isArray(child.children) ? {children: copy(child.children)} : {})
              })),
              result = await this.nodeProvider?.(node, {position}) || [],
              list   = copy(Array.isArray(result) ? result : result.nodes || []);

        !Array.isArray(result) && result.hasMore && this.moreLists.add(list);

        return list
    }

    /**
     * Loads the next page of a level ("Show more...")
     * @param {String|Number|null} [id=null] the parent node, null for the root nodes
     * @returns {Promise<void>}
     */
    async loadMore(id=null) {
        let me     = this,
            parent = id === null || id === undefined ? null : me.getNode(id),
            list   = parent ? parent.children : me.roots;

        if ((id !== null && id !== undefined && !parent) || !me.moreLists.has(list)) {
            return
        }

        if (me.pending.has(list)) {
            return me.pending.get(list)
        }

        const moreId     = me.moreId(parent),
              generation = me.generation,
              promise    = (async () => {
                  let page;

                  me.loadingIds.add(moreId);
                  me.updateItem(moreId);

                  try {
                      page = await me.provide(parent, list.length)
                  } finally {
                      me.loadingIds.delete(moreId);
                      me.isDestroyed || me.updateItem(moreId)
                  }

                  // a reload() or reloadNode() replaced the level meanwhile
                  if (me.isDestroyed || generation !== me.generation || (parent ? parent.children : me.roots) !== list ||
                      (parent && me.getNode(parent.id) !== parent)) {
                      return
                  }

                  // nodes shown already (the level changed between pages) aren't added twice
                  const fresh = page.filter(node => !me.nodes.has(node.id));

                  list.push(...fresh);
                  (!fresh.length || !me.moreLists.has(page)) && me.moreLists.delete(list);
                  me.register(fresh, parent);

                  try {
                      await me.populate(fresh, generation)
                  } finally {
                      // also when an expanded child failed: the new nodes show, the old "Show more..." goes
                      !me.isDestroyed && generation === me.generation && me.refresh()
                  }
              })();

        me.pending.set(list, promise);

        try {
            await promise
        } finally {
            me.pending.delete(list)
        }
    }

    /**
     * @param {Object|null} parent
     * @returns {String} record id of the "Show more..." row of a level
     * @protected
     */
    moreId(parent) {
        return MORE + (parent ? parent.id : '')
    }

    /**
     * @summary Expands the nodes of a path and selects the last one, loading lazy levels and
     * further pages on the way (waits for a running reload())
     * @param {Array<String|Number>} ids node ids from a root node down
     * @param {Object} [options]
     * @param {Boolean} [options.select=true] false only reveals the last node, the selection stays
     * @returns {Promise<Object|null>} the last node, null when a node isn't found under the
     *          previous one
     */
    async openPath(ids, {select=true}={}) {
        let me   = this,
            node = null,
            loading;

        // a failed reload leaves the nodes it had: look in those
        do {
            loading = me.loadPromise;
            await loading?.catch(() => {})
        } while (loading !== me.loadPromise);

        for (let i = 0; i < ids.length; i++) {
            const id     = String(ids[i]),
                  parent = node;

            // the node may be on a later page of its level; stop when a page adds nothing
            // (the level was replaced or removed meanwhile)
            for (let list = parent ? parent.children : me.roots; !me.getNode(id) && me.moreLists.has(list);) {
                const before = list.length;

                await me.loadMore(parent ? parent.id : null);

                if (list.length === before) {
                    break
                }
            }

            node = me.getNode(id) || null;

            if (!node || me.getParentNode(id) !== parent || (parent && me.getNode(parent.id) !== parent)) {
                return null
            }

            i < ids.length - 1 && await me.expand(node.id)
        }

        node && select && me.selectNode(node.id);
        return node
    }

    /**
     * @summary Selects (highlights) only this node, without firing the list's itemClick
     * @param {String|Number|null} id
     */
    selectNode(id) {
        let me     = this,
            record = id !== null && id !== undefined && me.store.get(String(id));

        if (record) {
            // a multi-selection model adds to the selection
            me.selectionModel.selectOnly ? me.selectionModel.selectOnly(record) : me.selectionModel.select(record)
        } else {
            me.selectionModel.deselectAll?.()
        }
    }

    /**
     * Sets node.badge; a subclass with its own badgeOf() field has its own setter (email setUnseen())
     * @param {String|Number} id
     * @param {Number|String|null} badge
     */
    setBadge(id, badge) {
        const node = this.getNode(id);

        if (node && node.badge !== badge) {
            node.badge = badge;
            this.updateItem(node.id)
        }
    }

    /**
     * @param {Object} node
     * @returns {Number|String|null|undefined} the badge of a row; subclasses map their own field
     */
    badgeOf(node) {
        return node.badge
    }

    /**
     * @param {Object} node
     * @returns {Boolean} the row shows a ⋮ icon and fires `menu`
     */
    hasNodeMenu(node) {
        const menu = this.nodeMenu;

        return typeof menu === 'function' ? !!menu(node) : !!menu
    }

    /**
     * Shows a menu below a DOM element (e.g. the `menu` event's target)
     * @param {Object[]} items GO.menu.List items
     * @param {String} target DOM id
     */
    showMenu(items, target) {
        items?.length && MenuList.showAt({appName: this.appName, windowId: this.windowId, target, items})
    }

    /**
     * @param {Object[]} path DOM event path
     * @returns {Object|null} the node of the row
     */
    nodeFromPath(path) {
        const itemNode = path.find(node => node.cls?.includes(this.itemCls)),
              id       = itemNode && this.nodeIdOf(itemNode.id);

        return id === null || id === undefined ? null : this.getNode(id) || null
    }

    /**
     * @param {Object} data contextmenu DOM event
     * @protected
     */
    onContextMenu(data) {
        const node = this.nodeFromPath(data.path || []);

        node && this.hasNodeMenu(node) && this.fire('menu', {node, target: data.path[0]?.id})
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
     * @summary Loads the children of expanded nodes (GOUI TreeStore.populateChildren())
     * @protected
     */
    async populate(children, generation) {
        let me = this;

        for (const child of children) {
            // a newer load took over: don't touch its expanded nodes
            if (me.isDestroyed || generation !== me.generation) {
                return
            }

            if (child.expanded || me.expandedIds.has(child.id)) {
                me.expandedIds.add(child.id);

                if (child.children === undefined) {
                    const loaded = await me.provide(child);

                    // a reloadNode() of an ancestor replaced the child meanwhile
                    if (me.isDestroyed || generation !== me.generation || me.getNode(child.id) !== child) {
                        return
                    }

                    child.children = loaded;

                    me.register(child.children, child)
                }

                await me.populate(child.children, generation)
            }
        }
    }

    /**
     * @summary Rebuilds the visible rows from the node tree
     * @protected
     */
    refresh() {
        let me   = this,
            rows = [],
            walk = (children, level, parent) => {
                children.forEach(node => {
                    rows.push({id: node.id, text: String(node.text ?? ''), level, state: me.rowState(node)});
                    me.expandedIds.has(node.id) && Array.isArray(node.children) && walk(node.children, level + 1, node)
                });

                if (me.moreLists.has(children)) {
                    const id = me.moreId(parent);
                    rows.push({id, text: t('Show more...'), level, state: me.loadingIds.has(id) ? 'loading' : ''})
                }
            };

        walk(me.roots, 0, null);
        me.store.data = rows;
        // selected nodes gone from the tree (a search, a reload) leave the ghost
        me.dragNodes && me.multiSelect && me.updateDragGhost()
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

        if (!node || me.expandedIds.has(node.id)) {
            return
        }

        // another expand() loads the children: wait for it (openPath())
        if (me.pending.has(node)) {
            return me.pending.get(node)
        }

        // a node with known children expands while reloadNode() loads them again
        if (me.loadingIds.has(node.id) && node.children === undefined) {
            return
        }

        if (node.children === undefined) {
            const generation = me.generation,
                  promise    = (async () => {
                      let children;

                      me.loadingIds.add(node.id);
                      me.updateItem(node.id);

                      try {
                          do {
                              me.staleIds.delete(node.id);
                              children = await me.provide(node)
                          } while (me.staleIds.has(node.id) && !me.isDestroyed)
                      } finally {
                          me.loadingIds.delete(node.id);
                          me.isDestroyed || me.updateItem(node.id)
                      }

                      // or a reloadNode() of an ancestor replaced the node meanwhile
                      if (me.isDestroyed || generation !== me.generation || me.getNode(node.id) !== node) {
                          return false
                      }

                      node.children = children;
                      me.register(children, node);
                      return true
                  })();

            me.pending.set(node, promise);

            try {
                if (!await promise) {
                    return
                }
            } finally {
                me.pending.delete(node)
            }
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

        // a changed record field repaints its row ("Show more..." rows have no node)
        record && (record.state = node ? this.rowState(node) : (this.loadingIds.has(id) ? 'loading' : ''))
    }

    /**
     * @param {Object} node
     * @returns {String} leaf / expanded / loading / checked / icon / badge state of a row
     * @protected
     */
    rowState(node) {
        let me = this;

        return [
            String(me.badgeOf(node) ?? ''),
            me.hasNodeMenu(node) ? 'menu' : '',
            Array.isArray(node.children) && !node.children.length ? 'leaf' : '',
            me.expandedIds.has(node.id) ? 'expanded' : '',
            me.loadingIds.has(node.id) ? 'loading' : '',
            node.check === undefined ? '' : (node.check ? 'checked' : 'unchecked'),
            node.icon || ''
        ].join('|')
    }

    /**
     * @summary neo's createItem() plus the node's cls, and "go-tree-hit" on a search hit
     * @param {Object} record
     * @param {Number} index
     * @param {Number} [poolIndex=index]
     * @returns {Object|null}
     */
    createItem(record, index, poolIndex=index) {
        const item = super.createItem(record, index, poolIndex),
              cls  = this.getNode(record.id)?.cls;

        item && cls?.forEach(c => !item.cls.includes(c) && item.cls.push(c));
        item && this.isMoreId(record.id) && item.cls.push('go-tree-more');
        item && this.getNode(record.id)?.hit && item.cls.push('go-tree-hit');

        return item
    }

    /**
     * @param {String} id record id
     * @returns {Boolean} it is a "Show more..." row
     */
    isMoreId(id) {
        return typeof id === 'string' && id.startsWith(MORE) && !this.nodes.has(id)
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

        if (me.isMoreId(record.id)) {
            const busy = me.loadingIds.has(record.id);

            content.push(
                {tag: 'span', cls: ['go-tree-caret', 'go-icon', 'go-tree-leaf', busy ? 'go-tree-loading' : ''].filter(Boolean), text: busy ? 'progress_activity' : ''},
                {tag: 'span', cls: ['go-tree-label'], text: record.text}
            );
            return content
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

        const badge = me.badgeOf(node);

        // vdom text: neo escapes it
        badge !== undefined && badge !== null && badge !== '' && Number(badge) !== 0 &&
            content.push({tag: 'span', cls: ['go-tree-badge'], text: String(badge)});

        me.hasNodeMenu(node) && content.push({tag: 'i', cls: ['go-icon', 'go-row-menu'], text: 'more_vert', title: t('More options')});

        return content
    }

    /**
     * Caret, checkbox, row menu and "Show more..." clicks don't select the row
     */
    getInteractiveItemIndex(path) {
        if (path.some(node => ['go-tree-caret', 'go-check', 'go-row-menu', 'go-tree-more'].some(c => node.cls?.includes(c)))) {
            return undefined
        }

        return super.getInteractiveItemIndex(path)
    }

    onClick(data) {
        let me       = this,
            caret    = data.path.find(node => node.cls?.includes('go-tree-caret')),
            check    = data.path.find(node => node.cls?.includes('go-check')),
            menuIcon = data.path.find(node => node.cls?.includes('go-row-menu')),
            itemNode = data.path.find(node => node.cls?.includes(me.itemCls)),
            id       = itemNode && me.nodeIdOf(itemNode.id);

        if (me.isMoreId(id)) {
            const parentId = id.slice(MORE.length);
            me.loadMore(parentId === '' ? null : parentId).catch(e => console.error('Tree load more', e));
            return
        }

        if (menuIcon) {
            const node = me.getNode(id);
            node && me.hasNodeMenu(node) && me.fire('menu', {node, target: menuIcon.id || itemNode.id});
            return
        }

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
