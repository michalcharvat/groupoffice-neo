/**
 * Native drag and drop on a component (main thread addon WS/DragDrop): rows or list items
 * dragged onto drop targets, files dragged from the desktop.
 *
 *     enableDragDrop(grid, {
 *         drag : '.neo-grid-row',          // draggable descendants
 *         drop : '.go-drop-folder',        // drop targets; elsewhere: the component itself
 *         group: 'files',                  // only drags from components of the same group
 *         files: true,                     // accept files from the desktop
 *         onDrop: ({targetId, targetRecordId, position, files, source, copy}) => {}
 *     })
 *
 * `source` is {rootId, itemId, recordId} of the dragged element (null for desktop files);
 * grid rows carry their record id (data-record-id), list items only their DOM id. A drop
 * target under the pointer gets the class "go-drop-over" (position "on"),
 * "go-drop-before" or "go-drop-after".
 *
 * Sortable list (GOUI Sortable): drag and drop the items of the same component between
 * each other; dropIndex() turns the drop into the new index of the dragged item.
 *
 *     enableDragDrop(list, {
 *         drag    : '.neo-list-item',
 *         drop    : '.neo-list-item',
 *         position: 'between',
 *         onDrop  : ({source, targetId, position}) => {
 *             const from = indexOf(source.itemId), to = dropIndex(from, indexOf(targetId), position);
 *             to > -1 && move(from, to)
 *         }
 *     })
 *
 * A drag `handle` selector: an item can only be dragged by a descendant matching it, so text in
 * the item's inputs stays selectable (ArrayField sortable rows). Drop roots nested in each
 * other: a drag is offered to the nearest root of its group.
 *
 * Rows of different kinds (field sets and their fields): `accept` maps a drag selector to the
 * drop targets of what it matches; dropInGroups() places a dragged row of a grouped list.
 *
 *     enableDragDrop(table, {
 *         drag    : '.go-cf-drag',
 *         position: 'between',
 *         accept  : {'.go-cf-fieldset-row': '.go-cf-fieldset-row', '.go-cf-field-row': '.go-actiontable-row'},
 *         onDrop  : ...
 *     })
 *
 * @param {Neo.component.Base} component
 * @param {Object} options
 * @param {String} [options.drag]
 * @param {String} [options.drop] selector, or '' to drop on the component only
 * @param {String} [options.handle] an item is dragged only by a descendant matching it
 * @param {String} [options.group]
 * @param {Boolean} [options.files=false]
 * @param {String} [options.position='on'] on, between (sorting) or both
 * @param {Boolean} [options.horizontal=false] targets side by side: before / after by x
 * @param {Object} [options.accept] {dragSelector: dropSelector}: the drop targets depend on
 *        the dragged element (first matching key); a drag matching none can't be dropped, and
 *        the component itself is no drop target
 * @param {Function} [options.onHover] ({targetId, targetRecordId}) when the pointer rests on
 *        a target for a second during a drag (a tree expands the node)
 * @param {Function} options.onDrop
 * @returns {Promise<void>}
 */
export async function enableDragDrop(component, {drag, drop, handle, group, files=false, position, horizontal=false, accept, onHover, onDrop}) {
    const data = {};

    drag  && (data.goDrag = drag);
    handle && (data.goDragHandle = handle);
    // an empty selector still makes the component a drop root
    drop !== undefined && drop !== null && (data.goDrop = drop);
    group && (data.goDropGroup = group);
    files && (data.goFiles = 'true');
    position && position !== 'on' && (data.goDropPos = position);
    horizontal && (data.goDropHorizontal = 'true');
    onHover && (data.goDropHover = 'true');

    if (accept) {
        data.goDropAccept = JSON.stringify(Object.entries(accept));
        // the targets come from the rules; the attribute still makes the component a drop root
        data.goDrop ??= ''
    }

    component.vdom.data = {...component.vdom.data, ...data};
    component.update();

    // the events bubble through the components: only the drop root's own (nested drop roots)
    const own = event => !event.id || event.id === component.id || event.id === component.vdom.id;

    component.addDomListeners({goDrop: event => own(event) && onDrop(event), scope: component});
    onHover && component.addDomListeners({goDragHover: event => own(event) && onHover(event), scope: component});

    await Neo.Main.importAddon({name: 'WS/DragDrop', windowId: component.windowId})
}

/**
 * New index of a dragged item of a sortable list (GOUI Sortable sort event toIndex)
 *
 * @param {Number} fromIndex index of the dragged item
 * @param {Number} targetIndex index of the item it was dropped before, after or on
 * @param {String} position before, after or on (on: takes the target's place)
 * @returns {Number} the index to move it to, -1 when it doesn't move
 */
export function dropIndex(fromIndex, targetIndex, position) {
    if (fromIndex < 0 || targetIndex < 0) {
        return -1
    }

    let to = position === 'after' ? targetIndex + 1 : targetIndex;

    // the item leaves its old place first
    position !== 'on' && fromIndex < to && to--;

    return to === fromIndex ? -1 : to
}

/**
 * Where a dragged row of a grouped list lands (field sets, each followed by its fields): the
 * list without the dragged row, cut at the drop, belongs to the nearest group row above the
 * cut. Dropping before the first group row has no group.
 *
 * @param {Object[]} rows the flat list: group rows, each followed by its items
 * @param {Function} isGroup (row) => true for a group row
 * @param {Number} fromIndex index of the dragged item row
 * @param {Number} targetIndex index of the row it was dropped before or after
 * @param {String} position before or after
 * @returns {{group: Object, items: Object[], index: Number}|null} the group, its items in their
 *          new order (with the dragged row) and the dragged row's index in them; null when the
 *          drop has no group or doesn't move the row
 */
export function dropInGroups(rows, isGroup, fromIndex, targetIndex, position) {
    if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) {
        return null
    }

    const list  = [...rows],
          [row] = list.splice(fromIndex, 1),
          to    = (targetIndex > fromIndex ? targetIndex - 1 : targetIndex) + (position === 'after' ? 1 : 0);

    if (to === fromIndex) {
        return null
    }

    list.splice(to, 0, row);

    let start = to - 1;

    while (start >= 0 && !isGroup(list[start])) {
        start--
    }

    if (start < 0) {
        return null
    }

    let end = start + 1;

    while (end < list.length && !isGroup(list[end])) {
        end++
    }

    const items = list.slice(start + 1, end);

    return {group: list[start], items, index: items.indexOf(row)}
}
