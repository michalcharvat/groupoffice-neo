import Base      from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';
import DomEvents from '../../../node_modules/neo.mjs/src/main/DomEvents.mjs';

/** classes of the drop target under the pointer, by drop position */
const POSITION_CLS = {on: 'go-drop-over', before: 'go-drop-before', after: 'go-drop-after'};
/** class of a drop target that refuses drops (e.g. a note book the user can't write to) */
const NO_DROP_CLS = 'go-no-drop';
/** class of the dragged element (GOUI .drag-src) */
const DRAG_SRC_CLS = 'go-drag-src';
/** ms the pointer rests on a target before "goDragHover" (a tree expands the node) */
const HOVER_DELAY = 1000;

/**
 * @summary Main thread side of drag and drop (GOUI DragAndDrop / ExtJS DD in the file browser):
 * native HTML5 drag and drop, declared on a component's root element by
 * GO.util.dragDrop enableDragDrop() with data attributes:
 *
 * - data-go-drag="<selector>": descendants matching it can be dragged (made draggable on
 *   pointer down), e.g. ".neo-grid-row"
 * - data-go-drag-handle="<selector>": an item is draggable only from a descendant matching it
 * - data-go-drop="<selector>": descendants matching it are drop targets; elsewhere inside
 *   the root (or with an empty selector) the root itself is the target
 * - data-go-drop-group="<name>": drags are accepted from roots with the same group only; with
 *   drop roots nested in each other, the nearest one of the drag's group takes it
 * - data-go-files="true": files dragged from the desktop can be dropped
 * - data-go-drop-pos="on|between|both": drop on a target (default), between targets
 *   (sorting: before / after, GOUI Sortable dropBetween) or both (the outer quarters of a
 *   target are before / after, the middle is on)
 * - data-go-drop-horizontal="true": targets are side by side, before / after go by x
 * - data-go-drop-hover="true": resting on a target for a second sends "goDragHover"
 *   {targetId, targetRecordId} (a tree expands the node, GOUI Tree.setupExpandOnDragOver())
 * - class "go-no-drop" on a target (or the root): it refuses drops (not highlighted, no drop
 *   on the root instead), e.g. a note book the user can't write to
 * - data-go-drop-accept='[["<drag selector>", "<drop selector>"], ...]': the drop targets
 *   depend on what is dragged (a sortable list with kinds of rows): the first rule whose drag
 *   selector matches the dragged element gives the drop selector instead of data-go-drop;
 *   no matching rule, no drop. The root itself is no drop target then.
 *
 * A drop sends the custom DOM event "goDrop" to the drop root's component:
 * {targetId, targetRecordId, position, files, source: {rootId, itemId, recordId}|null, copy}.
 * position is "on", "before" or "after"; a drop on the root itself (outside the targets) is
 * always "on".
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
    /**
     * Drop position on `over`: on, before or after
     * @member {String|null} position=null
     */
    position = null
    /**
     * Item made draggable by a press on its handle (data-go-drag-handle)
     * @member {HTMLElement|null} armed=null
     */
    armed = null
    /**
     * @member {Number|null} hoverTimer=null
     */
    hoverTimer = null
    /**
     * Removes the document listeners on destroy
     * @member {AbortController|null} domListeners=null
     */
    domListeners = null

    construct(config) {
        super.construct(config);

        let me     = this,
            signal = (me.domListeners = new AbortController()).signal;

        document.addEventListener('pointerdown', e => me.onPointerDown(e), {capture: true, signal});
        document.addEventListener('dragstart',   e => me.onDragStart(e), {signal});
        document.addEventListener('dragover',    e => me.onDragOver(e), {signal});
        document.addEventListener('dragleave',   e => me.onDragLeave(e), {signal});
        document.addEventListener('drop',        e => me.onDrop(e), {signal});
        document.addEventListener('dragend',     () => me.reset(), {signal})
    }

    destroy(...args) {
        this.domListeners?.abort();
        this.reset();
        super.destroy(...args)
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
     * @summary Rows are rendered by neo without the draggable attribute: sets it just before
     * a drag can start; with a handle only on a press on the handle (and takes it off again on
     * the next press, so the item's inputs stay selectable).
     * @param {PointerEvent} e
     */
    onPointerDown(e) {
        let me   = this,
            drag = e.button === 0 && me.dragItem(e);

        if (me.armed) {
            me.armed.draggable = false;
            me.armed           = null
        }

        if (!drag) {
            return
        }

        const handle = drag.root.dataset.goDragHandle;

        if (handle) {
            const grip = e.target.closest(handle);

            if (!grip || !drag.item.contains(grip)) {
                return
            }

            me.armed = drag.item;
            drag.item.draggable = true
        } else {
            drag.item.draggable || (drag.item.draggable = true)
        }
    }

    /**
     * @summary Starts the drag of an item; with a handle only of the item armed by it (not
     * selected text dragged out of an input).
     * @param {DragEvent} e
     */
    onDragStart(e) {
        const drag = this.dragItem(e);

        if (!drag || (drag.root.dataset.goDragHandle && drag.item !== this.armed)) {
            return
        }

        this.dragging = drag;
        drag.item.classList.add(DRAG_SRC_CLS);
        e.dataTransfer.effectAllowed = 'copyMove';
        // Firefox starts a drag only with data
        e.dataTransfer.setData('text/plain', drag.item.textContent.trim().slice(0, 200))
    }

    /**
     * @summary The drop root and target under the pointer: the nearest root of the drag's group.
     * @param {DragEvent} e
     * @returns {{root: HTMLElement, target: HTMLElement, position: String}|null} where a drop
     *          would go
     */
    dropTarget(e) {
        let me    = this,
            roots = '[data-go-drop], [data-go-files]',
            root  = e.target?.closest?.(roots),
            // where the target search starts: above the nested roots skipped
            from  = e.target,
            files = !me.dragging && [...e.dataTransfer?.types || []].includes('Files');

        if (!root) {
            return null
        }

        if (files) {
            if (root.dataset.goFiles !== 'true') {
                return null
            }
        } else {
            const source = me.dragging?.root,
                  group  = el => el.dataset.goDropGroup || '';

            if (!source) {
                return null
            }

            // nested drop roots (an ArrayField in a row of another): the nearest of the drag's group
            while (root && (!('goDrop' in root.dataset) || group(source) !== group(root))) {
                from = root.parentElement;
                root = from?.closest(roots)
            }

            if (!root) {
                return null
            }
        }

        let selector = root.dataset.goDrop,
            accept   = !files && me.acceptRules(root),
            target;

        if (accept) {
            const rule = accept.find(([drag]) => me.dragging.item.matches(drag));

            if (!rule) {
                return null
            }

            selector = rule[1]
        }

        target = selector && from.closest(selector);
        target = target && root.contains(target) ? target : (accept ? null : root);

        if (!target) {
            return null
        }

        if (target.classList.contains(NO_DROP_CLS)) {
            return null
        }

        return {root, target, position: target === root ? 'on' : me.dropPosition(e, root, target)}
    }

    /**
     * @param {HTMLElement} root
     * @returns {Array[]|null} [[dragSelector, dropSelector], ...] of data-go-drop-accept
     */
    acceptRules(root) {
        const json = root.dataset.goDropAccept;

        if (!json) {
            return null
        }

        try {
            return JSON.parse(json)
        } catch (e) {
            console.error('data-go-drop-accept', e);
            return []
        }
    }

    /**
     * @param {DragEvent} e
     * @param {HTMLElement} root
     * @param {HTMLElement} target
     * @returns {String} on, before or after
     */
    dropPosition(e, root, target) {
        const mode = root.dataset.goDropPos || 'on';

        if (mode !== 'between' && mode !== 'both') {
            return 'on'
        }

        const rect       = target.getBoundingClientRect(),
              horizontal = root.dataset.goDropHorizontal === 'true',
              size       = horizontal ? rect.width : rect.height,
              offset     = horizontal ? e.clientX - rect.left : e.clientY - rect.top;

        if (mode === 'between') {
            return offset < size / 2 ? 'before' : 'after'
        }

        return offset < size / 4 ? 'before' : (offset > size * 3 / 4 ? 'after' : 'on')
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
        me.setOver(drop.target, drop.position, drop.root)
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
            position      : drop.position,
            files         : drag ? [] : [...e.dataTransfer.files],
            source        : drag ? {rootId: drag.root.id, itemId: drag.item.id, recordId: drag.item.dataset.recordId ?? null} : null,
            copy          : !!(e.ctrlKey || e.altKey || e.metaKey)
        })
    }

    /**
     * Marks the drop target under the pointer, and starts the hover timer of a root with
     * data-go-drop-hover when the pointer moves on to another target
     * @param {HTMLElement|null} el
     * @param {String} [position='on']
     * @param {HTMLElement} [root]
     */
    setOver(el, position='on', root) {
        let me = this;

        if (me.over === el && me.position === position) {
            return
        }

        me.over?.classList.remove(POSITION_CLS[me.position]);
        el?.classList.add(POSITION_CLS[position]);

        if (me.over !== el) {
            clearTimeout(me.hoverTimer);
            me.hoverTimer = null;

            if (el && el !== root && root?.dataset.goDropHover === 'true') {
                me.hoverTimer = setTimeout(() => {
                    me.hoverTimer = null;
                    me.over === el && DomEvents.sendMessageToApp({
                        id            : root.id,
                        path          : DomEvents.getPathFromElement(el).map(node => DomEvents.getTargetData(node)),
                        type          : 'goDragHover',
                        targetId      : el.id,
                        targetRecordId: el.dataset.recordId ?? null
                    })
                }, HOVER_DELAY)
            }
        }

        me.over     = el;
        me.position = el ? position : null
    }

    reset() {
        this.setOver(null);
        this.dragging?.item.classList.remove(DRAG_SRC_CLS);
        this.dragging = null
    }
}

export default Neo.setupClass(DragDrop);
