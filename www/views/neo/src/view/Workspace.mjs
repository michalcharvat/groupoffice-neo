import Container         from '../../node_modules/neo.mjs/src/container/Base.mjs';
import DockWorkspace     from '../../node_modules/neo.mjs/src/dashboard/dock/Workspace.mjs';
import DragAffordances   from '../../node_modules/neo.mjs/src/dashboard/dock/interaction/DragAffordances.mjs';
import DropIndicators    from '../../node_modules/neo.mjs/src/dashboard/dock/interaction/DropIndicators.mjs';
import Preview           from '../../node_modules/neo.mjs/src/dashboard/dock/interaction/Preview.mjs';
import Operations        from '../../node_modules/neo.mjs/src/dashboard/dock/model/Operations.mjs';
import WorkspaceDocument from '../../node_modules/neo.mjs/src/dashboard/dock/model/WorkspaceDocument.mjs';
import '../../node_modules/neo.mjs/src/tab/Container.mjs';
import {t} from '../Translate.mjs';

export const SCHEMA = 'neo.dock.zone.v1';

const ROOT = 'root';

/**
 * An empty dock document: an edge-zone root, so closing the last panel leaves a valid document
 * @returns {Object}
 */
export function emptyDocument() {
    return {schema: SCHEMA, root: ROOT, items: {}, nodes: {[ROOT]: {type: 'edge-zone', zones: {}}}}
}

/**
 * PHP decodes an empty JSON object to an empty array, which comes back as []: objects again
 * @param {Object|null} doc a stored layout
 * @returns {Object|null}
 */
export function normalizeDocument(doc) {
    if (!doc || typeof doc !== 'object' || doc.schema !== SCHEMA) {
        return null
    }

    const object = value => Array.isArray(value) && !value.length ? {} : value || {};

    doc = WorkspaceDocument.clone(doc);
    doc.items = object(doc.items);
    doc.nodes = object(doc.nodes);

    // an empty item record
    Object.keys(doc.items).forEach(id => Array.isArray(doc.items[id]) && (doc.items[id] = {}));

    Object.values(doc.nodes).forEach(node => {
        node.type === 'edge-zone' && (node.zones = object(node.zones))
    });

    return doc
}

/**
 * The panels as tabs of one group (a profile without a saved layout, the narrow profile)
 * @param {Object[]} panels [{id, title}]
 * @param {String|null} activeId
 * @returns {Object}
 */
export function tabsDocument(panels, activeId = null) {
    const doc = emptyDocument();

    if (!panels.length) {
        return doc
    }

    panels.forEach(({id, title}) => doc.items[id] = {title});
    doc.nodes.main = {type: 'tabs', items: panels.map(p => p.id), activeItemId: activeId && doc.items[activeId] ? activeId : panels[0].id};
    doc.nodes[ROOT].zones.center = {nodeId: 'main'};

    return doc
}

/**
 * GO's main area: neo.mjs 14's dock (Neo.dashboard.dock.Workspace) wrapped in one class, so a neo
 * upgrade touches one place (docs/neo-workspace.md, docs/neo-core-components.md "neo.mjs upgrades").
 *
 * Every dock item is a panel of the GO workspace: the item id is the panel id, the pane is the
 * panel's host container that GO.view.MainView owns (resolveHost()). The panes are preserved
 * (getPreservedItemIds()): the dock never destroys a module view, MainView does when a panel closes.
 *
 * Events:
 * - panelClose {panelId}: the user closed a panel in the dock
 * - panelActivate {panelId}: a panel became the focused one
 * - documentChange {document, descriptor}: any committed change (autosave)
 */
class Workspace extends DockWorkspace {
    static config = {
        className        : 'GO.view.Workspace',
        baseCls          : ['go-workspace', 'neo-dock-workspace'],
        dockHostReference: 'dock-host',
        layout           : {ntype: 'fit'},
        // phase 1: split, tab, move, resize, maximize, close (docs/neo-workspace.md)
        enableDockLockAction  : false,
        enableDockPinAction   : false,
        enableDockPopOutAction: false,
        enableDockReloadAction: false,
        /**
         * (panelId) => host component of the panel, or null
         * @member {Function|null} resolveHost=null
         */
        resolveHost: null,
        /**
         * () => panel ids whose hosts MainView holds
         * @member {Function|null} hostIds=null
         */
        hostIds: null
    }

    /**
     * The panel shown last (clicked, activated, opened)
     * @member {String|null} focusedPanelId=null
     */
    focusedPanelId = null

    /**
     * A module dragged in from the top bar: {itemId, item}
     * @member {Object|null} external=null
     */
    external = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.dockModel = me.dockModel || emptyDocument();

        me.add({
            module   : Container,
            // neo-dashboard on the host: the dock's tokens reach the overlays beside the projection
            cls      : ['go-dock-host', 'neo-dashboard'],
            layout   : {ntype: 'fit'},
            reference: 'dock-host',
            items    : [me.projectDockModel(), {
                module   : Preview,
                reference: 'dock-preview'
            }, {
                module   : DropIndicators,
                reference: 'drop-indicators'
            }]
        });

        me.dragAffordances = Neo.create(DragAffordances, {
            host      : me.getReference('dock-host'),
            indicators: me.getReference('drop-indicators'),
            owner     : me,
            preview   : me.getReference('dock-preview')
        });

        me.on('beforeDockZoneDocumentChange', me.onBeforeDocumentChange, me);

        // drop target of the top bar's module tabs (src/main/addon/DockDrag.mjs)
        me.vdom['data-go-dock-drop'] = 'true';
        // shown while no panel is open (MainView.scss)
        me.vdom['data-empty-text'] = t('Select a module from the menu.');

        me.addDomListeners({
            click          : me.onPaneClick,
            goDockDragMove : me.onExternalDragMove,
            goDockDragLeave: me.onExternalDragCancel,
            scope          : me
        })
    }

    destroy(...args) {
        this.dragAffordances?.destroy();
        super.destroy(...args)
    }

    /**
     * @param {String} itemId panel id
     * @param {Object} item
     * @returns {Object|Neo.component.Base}
     */
    resolvePane(itemId, item) {
        return this.resolveHost?.(itemId) || super.resolvePane(itemId, item)
    }

    /**
     * MainView owns the module views: the dock parks a removed pane instead of destroying it
     * @returns {String[]}
     */
    getPreservedItemIds() {
        return [...super.getPreservedItemIds(), ...this.hostIds?.() || []]
    }

    getDockProjectionOptions() {
        let me = this;

        return {
            ...super.getDockProjectionOptions(),
            onDockCrossZoneDragCancel: data => me.dragAffordances.onDragCancel(data),
            onDockCrossZoneDragMove  : data => me.dragAffordances.onDragMove(data),
            onDockCrossZoneDrop      : data => me.dragAffordances.onDrop(data)
        }
    }

    beforeRefreshDockWorkspace(document, refreshOptions) {
        this.dragAffordances?.clear();
        return super.beforeRefreshDockWorkspace?.(document, refreshOptions)
    }

    /**
     * A module dragged in from the top bar is no dock item yet: the drop's addTab / splitNode /
     * restoreTab adds it to the catalog first
     * @param {Object} descriptor
     * @returns {{document: Object, errors: String[]}}
     */
    applyDockZoneOperation(descriptor) {
        const {external} = this;

        if (external && descriptor?.itemId === external.itemId && !this.dockModel?.items?.[external.itemId]) {
            const added = Operations.applyOperation(this.dockModel, {operation: 'addItem', itemId: external.itemId, item: external.item});

            if (added.errors?.length) {
                return added
            }

            return Operations.applyOperation(added.document, descriptor)
        }

        return super.applyDockZoneOperation(descriptor)
    }

    /**
     * Commits an operation
     * @param {Object} descriptor
     * @returns {Promise<Boolean>} landed
     */
    async apply(descriptor) {
        const result = this.applyDockZoneOperation(descriptor);

        if (result.errors?.length || !result.document) {
            console.warn('GO.view.Workspace: operation refused', descriptor, result.errors);
            return false
        }

        await this.onDockZoneDocumentChange(result.document, descriptor, this);
        return true
    }

    /**
     * Replaces the whole document (a workspace loaded from the server, another profile)
     * @param {Object} document
     * @returns {Promise<Boolean>}
     */
    setDocument(document) {
        return this.apply({operation: 'applyDocument', document})
    }

    /**
     * The document to save: torn out panes folded back home
     * @returns {Object}
     */
    getDocument() {
        return WorkspaceDocument.clone(this.getPerspectiveDocument())
    }

    /**
     * @param {String} panelId
     * @returns {Boolean}
     */
    hasPanel(panelId) {
        return !!this.dockModel?.items?.[panelId]
    }

    /**
     * Panel ids in tree order
     * @returns {String[]}
     */
    getPanelIds() {
        return Object.keys(this.dockModel?.items || {})
    }

    /**
     * The tabs node a panel is in
     * @param {String} panelId
     * @returns {String|null}
     */
    tabsNodeOf(panelId) {
        return this.dockModel ? WorkspaceDocument.findContainingTabsId(this.dockModel, panelId) || null : null
    }

    /**
     * Shows a panel: activates its tab, or adds it as a tab of the focused panel's group (one
     * panel = today: a module opened from the menu takes the area)
     * @param {String} panelId
     * @param {Object} item {title}
     * @returns {Promise<void>}
     */
    async showPanel(panelId, item) {
        let me = this,
            tabsNodeId = me.tabsNodeOf(panelId);

        if (tabsNodeId) {
            me.dockModel.nodes[tabsNodeId].activeItemId !== panelId &&
                await me.apply({operation: 'setActiveItem', tabsNodeId, itemId: panelId})
        } else {
            const target = me.tabsNodeOf(me.focusedPanelId) || Object.keys(me.dockModel.nodes).find(id => me.dockModel.nodes[id].type === 'tabs');

            target ? await me.apply({
                operation: 'addItem', itemId: panelId, item,
                target   : {operation: 'addTab', tabsNodeId: target, itemId: panelId}
            }) : await me.fillEmptyCentre(panelId, item);

            me.syncCards(panelId)
        }

        me.setFocusedPanel(panelId)
    }

    /**
     * The reconciler activates an added pane silently (Reconciler applyChildAttributes): the
     * group's other cards keep their DOM until the next update, the old pane stays visible
     * @param {String} panelId
     * @protected
     */
    syncCards(panelId) {
        const body = this.resolveHost?.(panelId)?.parent;

        if (body && !body.isDestroyed) {
            body.updateDepth = -1;
            body.update()
        }
    }

    /**
     * The first panel of an empty workspace: a tabs node in the root's centre
     * @param {String} panelId
     * @param {Object} item
     * @returns {Promise<Boolean>}
     * @protected
     */
    async fillEmptyCentre(panelId, item) {
        const doc = WorkspaceDocument.clone(this.dockModel);

        doc.items[panelId] = item;
        doc.nodes.main && (doc.nodes = Object.fromEntries(Object.entries(doc.nodes).filter(([id]) => id !== 'main')));
        doc.nodes.main = {type: 'tabs', items: [panelId], activeItemId: panelId};
        doc.nodes[doc.root].type === 'edge-zone' ? doc.nodes[doc.root].zones.center = {nodeId: 'main'} : (doc.root = 'main');

        return this.setDocument(doc)
    }

    /**
     * Closes a panel (the module tab's close button, "Close others"): its neighbour takes the space
     * @param {String} panelId
     * @returns {Promise<Boolean>}
     */
    closePanel(panelId) {
        return this.hasPanel(panelId) ? this.apply({operation: 'closeItem', itemId: panelId}) : Promise.resolve(true)
    }

    /**
     * @param {String|null} panelId
     */
    setFocusedPanel(panelId) {
        let me = this;

        if (me.focusedPanelId === panelId) {
            return
        }

        me.focusedPanelId = panelId;
        me.fire('panelActivate', {panelId})
    }

    /**
     * The maximize plugin (Esc restores)
     * @returns {Object|null}
     */
    get maximizer() {
        return this.getPlugin('dock-maximize')
    }

    /**
     * @param {String} panelId
     */
    toggleMaximize(panelId) {
        const tabsNodeId = this.tabsNodeOf(panelId);

        tabsNodeId && this.maximizer?.toggle(tabsNodeId)
    }

    /**
     * Restores a maximized panel (narrow profile, another workspace)
     */
    restore() {
        const maximizer = this.maximizer;

        maximizer?.maximizedNodeId && maximizer.toggle(maximizer.maximizedNodeId)
    }

    /**
     * @param {Object} data
     * @protected
     */
    onBeforeDocumentChange({descriptor, document, previousDocument}) {
        let me      = this,
            before  = previousDocument?.items || {},
            after   = document?.items || {};

        Object.keys(before).forEach(panelId => {
            panelId in after || me.fire('panelClose', {panelId})
        });

        if (descriptor?.itemId && after[descriptor.itemId] && ['addTab', 'setActiveItem', 'moveItem', 'splitNode', 'addItem', 'restoreTab'].includes(descriptor.operation)) {
            me.setFocusedPanel(descriptor.itemId)
        } else if (me.focusedPanelId && !after[me.focusedPanelId]) {
            // the focused panel closed: the active tab of the first group
            const tabs = Object.values(document?.nodes || {}).find(node => node.type === 'tabs' && node.activeItemId);

            me.setFocusedPanel(tabs?.activeItemId || null)
        }

        me.fire('documentChange', {document, descriptor})
    }

    /**
     * A click into a panel focuses it
     * @param {Object} data
     * @protected
     */
    onPaneClick(data) {
        let me  = this,
            ids = new Set(me.hostIds?.() || []);

        let button = null;

        for (const node of data.path || []) {
            const component = Neo.getComponent(node.id);

            component?.baseCls?.includes('neo-tab-header-button') && (button = component);

            // a tab button of a group header: the pane at its index
            const panelId = component?.panelId ||
                (button && component?.getCardContainer?.()?.items[button.index]?.panelId);

            if (panelId && ids.has(panelId)) {
                me.setFocusedPanel(panelId);
                return
            }
        }
    }

    /**
     * Prepares a top-bar drag of a module: the item it will be
     * @param {String} itemId panel id (existing, or reserved for a module not open yet)
     * @param {Object} item {title}
     */
    beginExternalDrag(itemId, item) {
        this.external = {itemId, item}
    }

    /**
     * @param {Object} data {clientX, clientY}
     * @protected
     */
    onExternalDragMove({clientX, clientY}) {
        const {external} = this;

        external && this.dragAffordances.onDragMove({clientX, clientY, itemId: external.itemId, sourceNodeId: this.tabsNodeOf(external.itemId)})
    }

    /**
     * @protected
     */
    onExternalDragCancel() {
        this.dragAffordances.onDragCancel()
    }

    /**
     * Drops the module dragged from the top bar
     * @param {Object} data {clientX, clientY}
     * @returns {Promise<Boolean>} landed
     */
    async dropExternal({clientX, clientY}) {
        let me = this,
            {external} = me;

        if (!external) {
            return false
        }

        const before = me.dockModel;

        try {
            await me.dragAffordances.onDrop({clientX, clientY, itemId: external.itemId, sourceNodeId: me.tabsNodeOf(external.itemId)});
            await me.refreshPromise
        } finally {
            me.external = null
        }

        const landed = me.dockModel !== before && me.hasPanel(external.itemId);

        landed && me.syncCards(external.itemId);

        return landed
    }

    /**
     * The top-bar drag ended without a drop on the dock
     */
    endExternalDrag() {
        this.external = null;
        this.dragAffordances.clear()
    }
}

export default Neo.setupClass(Workspace);
