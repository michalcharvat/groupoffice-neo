import ListModel from '../../node_modules/neo.mjs/src/selection/ListModel.mjs';

/**
 * @summary Selection model of GO.tree.Tree: one node, or with the tree's `multiSelect` several
 * (ExtJS MultiSelectionModel as amd/pms ComponentTreeSelectionModel).
 *
 * A plain click selects only the clicked node. With `multiSelect`, Ctrl / Cmd + click toggles a
 * node and Shift + click adds one (no range, as in classic). While the tree's nodes are dragged
 * (`dragging`) the selection is locked: select and deselect calls do nothing, so the drop gets
 * the nodes the drag started with.
 * @class GO.tree.SelectionModel
 * @extends Neo.selection.ListModel
 */
class SelectionModel extends ListModel {
    static config = {
        /**
         * @member {String} className='GO.tree.SelectionModel'
         * @protected
         */
        className: 'GO.tree.SelectionModel',
        /**
         * @member {String} ntype='selection-go-tree'
         * @protected
         */
        ntype: 'selection-go-tree'
    }

    /**
     * @summary Takes `singleSelect` from the tree's `multiSelect`.
     * @param {GO.tree.Tree} component
     */
    register(component) {
        super.register(component);
        this.singleSelect = !component.multiSelect
    }

    /**
     * @summary The selection is locked while the tree's nodes are dragged.
     * @returns {Boolean}
     * @protected
     */
    isLocked() {
        return !!this.view?.dragging
    }

    /**
     * @summary Plain click selects one node; with `multiSelect` Ctrl / Cmd toggles and Shift adds.
     * @param {Object} data click DOM event (currentTarget, ctrlKey, metaKey, shiftKey)
     * @protected
     */
    onListClick(data) {
        let me     = this,
            {view} = me,
            record = view.store.get(view.getItemRecordId(data.currentTarget));

        if (view.disableSelection || !record || me.isLocked()) {
            return
        }

        const selected = me.isSelected(me.getSelectionItemId(record));

        if (!me.singleSelect && (data.ctrlKey || data.metaKey)) {
            selected ? me.deselect(record) : me.select(record)
        } else if (!me.singleSelect && data.shiftKey && me.items.length) {
            selected || me.select(record)
        } else if (!selected || me.items.length > 1) {
            me.selectOnly(record)
        }
    }

    /**
     * @summary Selects only this item, with one selectionChange (neo's deselectAll() fires its
     * own even when silent).
     * @param {Object|String} item record or item id
     */
    selectOnly(item) {
        let me = this;

        if (me.isLocked()) {
            return
        }

        // already the only one: neo's select() answers noChange
        if (me.items.length === 1 && me.isSelected(me.getSelectionItemId(item))) {
            return
        }

        // the item too: select() of one of several selected would fire noChange and not repaint
        [...me.items].forEach(other => me.deselect(other, true));
        me.select(item)
    }

    /**
     * @summary Ignored while the nodes are dragged.
     * @param {Object|Object[]|String[]} items
     * @param {Object[]|String[]} [itemCollection]
     * @param {String} [selectedCls]
     */
    select(items, itemCollection, selectedCls) {
        this.isLocked() || super.select(items, itemCollection, selectedCls)
    }

    /**
     * @summary Ignored while the nodes are dragged.
     * @param {Object|String} item
     * @param {Boolean} [silent]
     * @param {Object[]|String[]} [itemCollection]
     * @param {String} [selectedCls]
     */
    deselect(item, silent, itemCollection, selectedCls) {
        this.isLocked() || super.deselect(item, silent, itemCollection, selectedCls)
    }

    /**
     * @summary Ignored while the nodes are dragged.
     * @param {Boolean} [silent]
     * @param {Object[]|String[]} [itemCollection]
     */
    deselectAll(silent, itemCollection) {
        this.isLocked() || super.deselectAll(silent, itemCollection)
    }
}

export default Neo.setupClass(SelectionModel);
