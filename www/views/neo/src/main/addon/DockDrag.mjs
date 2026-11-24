import Base      from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';
import DomEvents from '../../../node_modules/neo.mjs/src/main/DomEvents.mjs';

/** the module tabs of the top bar (GO.view.MainView), reference "module-<name>" in data-ref */
const SOURCE = '.go-module-button[data-ref^="module-"]';
/** the workspace root (GO.view.Workspace) */
const TARGET = '[data-go-dock-drop]';
const TYPE   = 'application/x-go-module';

/**
 * Main thread side of dragging a module tab of the top bar into the workspace (docs/neo-workspace.md):
 * native HTML5 drag and drop, the dock only drags its own tabs.
 *
 * Sends custom DOM events to the components:
 * - goDockDragStart {module} to the top bar button
 * - goDockDragMove {clientX, clientY, module} to the workspace, once per frame while over it
 * - goDockDragLeave {module} to the workspace when the pointer leaves it
 * - goDockDrop {clientX, clientY, module} to the workspace
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
        document.addEventListener('dragover',    e => me.onDragOver(e), {signal});
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

        button && !button.draggable && (button.draggable = true)
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

        const target = e.target?.closest?.(TARGET);

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

    onDrop(e) {
        let me     = this,
            {drag} = me,
            target = drag && e.target?.closest?.(TARGET);

        if (!target) {
            return
        }

        e.preventDefault();
        e.stopPropagation();
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

        me.drag = null;
        drag.frame && cancelAnimationFrame(drag.frame);
        drag.over && me.send(drag.over, 'goDockDragLeave', {module: drag.module});
        drag.button.isConnected && me.send(drag.button, 'goDockDragEnd', {module: drag.module, dropped: drag.dropped})
    }
}

export default Neo.setupClass(DockDrag);
