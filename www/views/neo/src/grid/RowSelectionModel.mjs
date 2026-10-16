import RowModel from '../../node_modules/neo.mjs/src/selection/grid/RowModel.mjs';

/**
 * GOUI RowSelect with multiSelect: a click selects only that row (and keeps it
 * selected, neo would toggle it), ctrl/⌘ + click toggles a row, shift + click selects
 * the range from the last clicked row.
 *
 * GO.grid.Grid uses it with `multiSelect: true`. selectionChange also carries `record`,
 * the row clicked last (the one a detail panel shows).
 */
class RowSelectionModel extends RowModel {
    static config = {
        className   : 'GO.grid.RowSelectionModel',
        singleSelect: false
    }

    /** id of the row clicked last (shift + click range start) */
    anchorId = null

    onRowClick(event) {
        let me     = this,
            {view} = me,
            data   = event.data || {},
            record = event.record || me.getRecord(data.path);

        if (!record || me.hasAnnotations(record)) {
            return super.onRowClick(event)
        }

        const id     = view.getRecordId(record),
              store  = view.store,
              anchor = me.anchorId !== null ? store.get(me.anchorId) : null;
        let next;

        if (data.shiftKey && anchor) {
            const from = store.indexOf(anchor),
                  to   = store.indexOf(record);

            next = [];

            for (let i = Math.min(from, to); i <= Math.max(from, to); i++) {
                next.push(view.getRecordId(store.getAt(i)))
            }
        } else if (data.ctrlKey || data.metaKey) {
            next = me.isSelectedRow(id) ? me.selectedRows.filter(rowId => rowId !== id) : [...me.selectedRows, id];
            me.anchorId = id
        } else {
            next = [id];
            me.anchorId = id
        }

        me.setSelection(next, record)
    }

    /**
     * Selects exactly these rows, fires selectionChange once when it changed
     * @param {Array} ids record ids
     * @param {Object|null} [record] the row clicked last
     */
    setSelection(ids, record = null) {
        let me      = this,
            current = [...me.selectedRows],
            changed = false;

        current.forEach(id => {
            if (!ids.includes(id)) {
                me.deselectRow(id);
                changed = true
            }
        });

        ids.forEach(id => {
            if (!me.isSelectedRow(id)) {
                me.selectRow(id);
                changed = true
            }
        });

        if (changed) {
            me.lastRecord = record;
            me.fireRowSelectionChange()
        }
    }

    fireRowSelectionChange() {
        let me = this;

        me.fire('selectionChange', {
            records  : me.selectedRows.map(id => me.view.store.get(id)),
            selection: me.selectedRows,
            record   : me.lastRecord ?? null
        });

        me.lastRecord = null
    }

    /**
     * Selects every loaded row
     */
    selectAll() {
        const {view} = this;
        this.setSelection(view.store.items.map(record => view.getRecordId(record)))
    }

    /**
     * Clears the selection (GOUI rowSelection.clear())
     */
    clear() {
        this.anchorId = null;
        this.setSelection([])
    }
}

export default Neo.setupClass(RowSelectionModel);
