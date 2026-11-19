/**
 * Native drag and drop on a component (main thread addon WS/DragDrop): rows or list items
 * dragged onto drop targets, files dragged from the desktop.
 *
 *     enableDragDrop(grid, {
 *         drag : '.neo-grid-row',          // draggable descendants
 *         drop : '.go-drop-folder',        // drop targets; elsewhere: the component itself
 *         group: 'files',                  // only drags from components of the same group
 *         files: true,                     // accept files from the desktop
 *         onDrop: ({targetId, targetRecordId, files, source, copy}) => {}
 *     })
 *
 * `source` is {rootId, itemId, recordId} of the dragged element (null for desktop files);
 * grid rows carry their record id (data-record-id), list items only their DOM id. A drop
 * target under the pointer gets the class "go-drop-over".
 *
 * @param {Neo.component.Base} component
 * @param {Object} options
 * @param {String} [options.drag]
 * @param {String} [options.drop] selector, or '' to drop on the component only
 * @param {String} [options.group]
 * @param {Boolean} [options.files=false]
 * @param {Function} options.onDrop
 * @returns {Promise<void>}
 */
export async function enableDragDrop(component, {drag, drop, group, files=false, onDrop}) {
    const data = {};

    drag  && (data.goDrag = drag);
    // an empty selector still makes the component a drop root
    drop !== undefined && drop !== null && (data.goDrop = drop);
    group && (data.goDropGroup = group);
    files && (data.goFiles = 'true');

    component.vdom.data = {...component.vdom.data, ...data};
    component.update();

    component.addDomListeners({goDrop: event => onDrop(event), scope: component});

    await Neo.Main.importAddon({name: 'WS/DragDrop', windowId: component.windowId})
}
