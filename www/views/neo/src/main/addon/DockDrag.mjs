import Base      from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';
import DomEvents from '../../../node_modules/neo.mjs/src/main/DomEvents.mjs';

/** the module tabs of the top bar (GO.view.MainView), reference "module-<name>" in data-ref */
const SOURCE = '.go-module-button[data-ref^="module-"]';
/** a dock (sf/workspaces GO.workspaces.Workspace) */
const TARGET = '[data-go-dock-drop]';
/** a top bar tab that takes modules (sf/workspaces: a workspace tab) */
const TAB    = '[data-go-dock-tab]';
const TYPE   = 'application/x-go-module';
/** ms the pointer rests on a tab before it is opened (goDockDragHover), so the drag can go on into its dock */
const HOVER_DELAY = 600;

/**
 * Main thread side of dragging a module tab of the top bar into a dock or onto a tab that takes
 * modules (docs/neo-workspace.md): native HTML5 drag and drop, the dock only drags its own tabs.
 * Module tabs are draggable only while the page has such a target (a main view extension added it).
 *
 * Sends custom DOM events to the components:
 * - goDockDragStart {module} to the top bar button
 * - goDockDragMove {clientX, clientY, module} to the dock, once per frame while over it
 * - goDockDragLeave {module} to the dock when the pointer leaves it
 * - goDockDrop {clientX, clientY, module} to the dock or the tab (data-go-dock-tab) it was dropped on
 * - goDockDragHover {module} to a tab the pointer rested on (HOVER_DELAY)
 * - goDockDragEnd {module, dropped} to the top bar button
 *
 * Loaded per window: await Neo.Main.importAddon({name: 'WS/DockDrag', windowId})
 */
class DockDrag extends Base {
    static config = {
        className        : 'GO.main.addon.DockDrag',
        preloadFilesDelay: false
    }

    /**
     * {button, module, over, frame, dropped}
     * @member {Object|null} drag=null
     */
    drag = null

    construct(config) {
        super.construct(config);

        let me     = this,
            signal = (me.listeners = new AbortController()).signal;

        document.addEventListener('pointerdown', e => me.onPointerDown(e), {capture: true, signal});
        document.addEventListener('dragstart',   e => me.onDragStart(e), {signal});
        // capture: a module's own drop zone (an upload area) stops the bubbling dragover
        document.addEventListener('dragover',    e => me.onDragOver(e), {capture: true, signal});
        document.addEventListener('drop',        e => me.onDrop(e), {capture: true, signal});
        document.addEventListener('dragend',     () => me.onDragEnd(), {signal})
    }

    destroy(...args) {
        this.listeners?.abort();
        super.destroy(...args)
    }

    /**
     * @param {HTMLElement} el
     * @param {String} type
     * @param {Object} data
     */
    send(el, type, data) {
        DomEvents.sendMessageToApp({
            id  : el.id,
            path: DomEvents.getPathFromElement(el).map(node => DomEvents.getTargetData(node)),
            type,
            ...data
        })
    }

    /**
     * neo renders buttons without the draggable attribute: set it just before a drag can start
     * @param {PointerEvent} e
     */
    onPointerDown(e) {
        const button = e.button === 0 && e.target?.closest?.(SOURCE);

        // no target on the page (no extension, logged out): a plain tab
        if (button) {
            button.draggable = !!document.querySelector(`${TARGET}, ${TAB}`)
        }
    }

    onDragStart(e) {
        const button = e.target?.closest?.(SOURCE);

        if (!button) {
            return
        }

        const module = button.dataset.ref.slice(7);

        this.drag = {button, module, over: null, frame: null, dropped: false};
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(TYPE, module);
        // Firefox starts a drag only with data
        e.dataTransfer.setData('text/plain', button.textContent.trim().slice(0, 100));
        this.send(button, 'goDockDragStart', {module})
    }

    onDragOver(e) {
        let me     = this,
            {drag} = me;

        if (!drag) {
            return
        }

        // the element under the pointer: a drag over a just re-parented view can report its old ancestor
        const el  = document.elementFromPoint(e.clientX, e.clientY) || e.target,
              tab = el?.closest?.(TAB);

        me.hoverTab(tab);

        if (tab) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move'
        }

        const target = !tab && el?.closest?.(TARGET);

        if (drag.over && drag.over !== target) {
            me.send(drag.over, 'goDockDragLeave', {module: drag.module});
            drag.over = null
        }

        if (!target) {
            return
        }

        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        drag.over = target;
        drag.point = {clientX: e.clientX, clientY: e.clientY};

        drag.frame ??= requestAnimationFrame(() => {
            drag.frame = null;
            me.drag === drag && drag.over && me.send(drag.over, 'goDockDragMove', {...drag.point, module: drag.module})
        })
    }

    /**
     * The tab under the pointer while dragging: marked, and opened after HOVER_DELAY
     * @param {HTMLElement|null} tab
     */
    hoverTab(tab) {
        let me     = this,
            {drag} = me;

        if (drag.tab === tab) {
            return
        }

        drag.tab?.classList.remove('go-dock-tab-over');
        clearTimeout(drag.tabTimer);
        drag.tab = tab;

        if (tab) {
            tab.classList.add('go-dock-tab-over');
            drag.tabTimer = setTimeout(() => me.drag === drag && drag.tab === tab && me.send(tab, 'goDockDragHover', {module: drag.module}), HOVER_DELAY)
        }
    }

    onDrop(e) {
        let me     = this,
            {drag} = me,
            el     = drag && (document.elementFromPoint(e.clientX, e.clientY) || e.target),
            target = el && (el.closest?.(TAB) || el.closest?.(TARGET));

        if (!target) {
            return
        }

        e.preventDefault();
        e.stopPropagation();
        me.hoverTab(null);
        drag.dropped = true;
        drag.frame && cancelAnimationFrame(drag.frame);
        drag.over = null;
        me.send(target, 'goDockDrop', {clientX: e.clientX, clientY: e.clientY, module: drag.module})
    }

    onDragEnd() {
        let me     = this,
            {drag} = me;

        if (!drag) {
            return
        }

        me.hoverTab(null);
        me.drag = null;
        drag.frame && cancelAnimationFrame(drag.frame);
        drag.over && me.send(drag.over, 'goDockDragLeave', {module: drag.module});
        drag.button.isConnected && me.send(drag.button, 'goDockDragEnd', {module: drag.module, dropped: drag.dropped})
    }
}

export default Neo.setupClass(DockDrag);
