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
 * @param {Neo.component.Base} component
 * @param {Object} options
 * @param {String} [options.drag]
 * @param {String} [options.drop] selector, or '' to drop on the component only
 * @param {String} [options.group]
 * @param {Boolean} [options.files=false]
 * @param {String} [options.position='on'] on, between (sorting) or both
 * @param {Boolean} [options.horizontal=false] targets side by side: before / after by x
 * @param {Function} [options.onHover] ({targetId, targetRecordId}) when the pointer rests on
 *        a target for a second during a drag (a tree expands the node)
 * @param {Function} options.onDrop
 * @returns {Promise<void>}
 */
export async function enableDragDrop(component, {drag, drop, group, files=false, position, horizontal=false, onHover, onDrop}) {
    const data = {};

    drag  && (data.goDrag = drag);
    // an empty selector still makes the component a drop root
    drop !== undefined && drop !== null && (data.goDrop = drop);
    group && (data.goDropGroup = group);
    files && (data.goFiles = 'true');
    position && position !== 'on' && (data.goDropPos = position);
    horizontal && (data.goDropHorizontal = 'true');
    onHover && (data.goDropHover = 'true');

    component.vdom.data = {...component.vdom.data, ...data};
    component.update();

    component.addDomListeners({goDrop: event => onDrop(event), scope: component});
    onHover && component.addDomListeners({goDragHover: event => onHover(event), scope: component});

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
