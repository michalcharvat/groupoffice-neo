import Base      from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';
import DomEvents from '../../../node_modules/neo.mjs/src/main/DomEvents.mjs';

/** class of the drop target under the pointer */
const OVER_CLS = 'go-drop-over';

/**
 * Main thread side of drag and drop (GOUI DragAndDrop / ExtJS DD in the file browser):
 * native HTML5 drag and drop, declared on a component's root element by
 * GO.util.dragDrop enableDragDrop() with data attributes:
 *
 * - data-go-drag="<selector>": descendants matching it can be dragged (made draggable on
 *   pointer down), e.g. ".neo-grid-row"
 * - data-go-drop="<selector>": descendants matching it are drop targets; elsewhere inside
 *   the root (or with an empty selector) the root itself is the target
 * - data-go-drop-group="<name>": drags are accepted from roots with the same group only
 * - data-go-files="true": files dragged from the desktop can be dropped
 *
 * A drop sends the custom DOM event "goDrop" to the drop root's component:
 * {targetId, targetRecordId, files, source: {rootId, itemId, recordId}|null, copy}.
 * File objects survive postMessage (structured clone).
 *
 * Loaded per window: await Neo.Main.importAddon({name: 'WS/DragDrop', windowId})
 */
class DragDrop extends Base {
    static config = {
        className: 'GO.main.addon.DragDrop',
        // no library files to load
        preloadFilesDelay: false
    }

    /**
     * The drag that started in this window: {root, item}
     * @member {Object|null} dragging=null
     */
    dragging = null
    /**
     * @member {HTMLElement|null} over=null
     */
    over = null

    construct(config) {
        super.construct(config);

        let me = this;

        document.addEventListener('pointerdown', e => me.onPointerDown(e), true);
        document.addEventListener('dragstart',   e => me.onDragStart(e));
        document.addEventListener('dragover',    e => me.onDragOver(e));
        document.addEventListener('dragleave',   e => me.onDragLeave(e));
        document.addEventListener('drop',        e => me.onDrop(e));
        document.addEventListener('dragend',     () => me.reset())
    }

    /**
     * @param {Event} e
     * @returns {{root: HTMLElement, item: HTMLElement}|null}
     */
    dragItem(e) {
        const root = e.target?.closest?.('[data-go-drag]'),
              item = root && e.target.closest(root.dataset.goDrag);

        return item && root.contains(item) ? {root, item} : null
    }

    /**
     * Rows are rendered by neo without the draggable attribute: set it just before a drag
     * can start
     * @param {PointerEvent} e
     */
    onPointerDown(e) {
        const drag = e.button === 0 && this.dragItem(e);

        drag && !drag.item.draggable && (drag.item.draggable = true)
    }

    onDragStart(e) {
        const drag = this.dragItem(e);

        if (!drag) {
            return
        }

        this.dragging = drag;
        e.dataTransfer.effectAllowed = 'copyMove';
        // Firefox starts a drag only with data
        e.dataTransfer.setData('text/plain', drag.item.textContent.trim().slice(0, 200))
    }

    /**
     * @param {DragEvent} e
     * @returns {{root: HTMLElement, target: HTMLElement}|null} where a drop would go
     */
    dropTarget(e) {
        let me    = this,
            root  = e.target?.closest?.('[data-go-drop], [data-go-files]'),
            files = !me.dragging && [...e.dataTransfer?.types || []].includes('Files');

        if (!root) {
            return null
        }

        if (files) {
            if (root.dataset.goFiles !== 'true') {
                return null
            }
        } else {
            const source = me.dragging?.root;

            if (!source || !('goDrop' in root.dataset) || (source.dataset.goDropGroup || '') !== (root.dataset.goDropGroup || '')) {
                return null
            }
        }

        const selector = root.dataset.goDrop,
              target   = selector && e.target.closest(selector);

        return {root, target: target && root.contains(target) ? target : root}
    }

    onDragOver(e) {
        let me   = this,
            drop = me.dropTarget(e);

        if (!drop) {
            me.setOver(null);
            return
        }

        // a row can't be dropped on itself
        if (me.dragging && me.dragging.item === drop.target) {
            me.setOver(null);
            return
        }

        e.preventDefault();
        e.dataTransfer.dropEffect = me.dragging && !(e.ctrlKey || e.altKey || e.metaKey) ? 'move' : 'copy';
        me.setOver(drop.target)
    }

    onDragLeave(e) {
        // leaving the window or a drop root
        if (!e.relatedTarget || !e.relatedTarget.closest?.('[data-go-drop], [data-go-files]')) {
            this.setOver(null)
        }
    }

    onDrop(e) {
        let me   = this,
            drop = me.dropTarget(e),
            drag = me.dragging;

        me.reset();

        if (!drop || (drag && drag.item === drop.target)) {
            return
        }

        e.preventDefault();

        DomEvents.sendMessageToApp({
            id            : drop.root.id,
            path          : DomEvents.getPathFromElement(drop.target).map(el => DomEvents.getTargetData(el)),
            type          : 'goDrop',
            targetId      : drop.target.id,
            targetRecordId: drop.target.dataset.recordId ?? null,
            files         : drag ? [] : [...e.dataTransfer.files],
            source        : drag ? {rootId: drag.root.id, itemId: drag.item.id, recordId: drag.item.dataset.recordId ?? null} : null,
            copy          : !!(e.ctrlKey || e.altKey || e.metaKey)
        })
    }

    /**
     * @param {HTMLElement|null} el
     */
    setOver(el) {
        let me = this;

        if (me.over !== el) {
            me.over?.classList.remove(OVER_CLS);
            el?.classList.add(OVER_CLS);
            me.over = el
        }
    }

    reset() {
        this.setOver(null);
        this.dragging = null
    }
}

export default Neo.setupClass(DragDrop);
