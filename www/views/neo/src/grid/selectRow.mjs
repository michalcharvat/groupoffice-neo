/**
 * Selects a grid row from code (deep link, after create) so that it is painted.
 *
 * neo's selectRow() does not fire selectionChange. Right after a store load the grid
 * re-renders its rows for a while (layout passes, up to ~2s); the DOM row can end up
 * without the selected class while the vnode has it, and later updates diff against
 * that vnode. So: select, then watch the DOM row for 3s and, whenever it lacks the class,
 * toggle the selection once more.
 *
 * @param {Neo.grid.Container} grid
 * @param {String|Number} recordId
 * @returns {Promise<void>}
 */
export async function selectRow(grid, recordId) {
    // the store's own key: a deep link passes the id as a string, the grid selects numbers
    const found = grid.store.get(recordId);
    found && (recordId = grid.view.getRecordId(found));

    const sm         = grid.view.selectionModel,
          generation = grid.goSelectGeneration = (grid.goSelectGeneration || 0) + 1,
          current    = () => !grid.isDestroyed && grid.goSelectGeneration === generation,
          before     = [...sm.selectedRows],
          // a row the user selected since this call (rows selected before are replaced)
          userPicked = () => sm.selectedRows.some(id => id !== recordId && !before.includes(id));

    // called from a store load listener: let the grid finish its own load handling first
    await grid.timeout(50);
    // gone, or the user clicked a row meanwhile
    if (!current() || !grid.store.get(recordId) || userPicked()) {
        return
    }

    // only this row, also in a multi select grid (GO.grid.RowSelectionModel)
    [...sm.selectedRows].forEach(id => id !== recordId && sm.deselectRow(id));
    sm.isSelectedRow(recordId) || sm.selectRow(recordId);

    for (let attempt = 0; attempt < 10; attempt++) {
        await grid.timeout(300);

        const record = grid.store.get(recordId);
        // gone, or the user selected something else meanwhile
        if (!current() || !record || !sm.isSelectedRow(recordId)) {
            return
        }

        const row = grid.view.bodies.map(body => body.getRow(record)).find(Boolean);

        if (row) {
            const {className} = await Neo.main.DomAccess.getAttributes({id: row.id, attributes: 'className', windowId: grid.windowId});

            if (!current() || !sm.isSelectedRow(recordId)) {
                return
            }

            // keep watching: a later layout pass can drop the class again
            if (className?.split(' ').includes(sm.selectedCls)) {
                continue
            }
        }

        sm.deselectRow(recordId);
        await grid.timeout(20);

        // a click meanwhile selected another row (or a newer selectRow() call took over)
        if (!current() || sm.selectedRows.length) {
            return
        }

        sm.selectRow(recordId)
    }
}
