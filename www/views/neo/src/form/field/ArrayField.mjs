import Button           from '../../button/Button.mjs';
import ComponentManager from '../../../node_modules/neo.mjs/src/manager/Component.mjs';
import ContainerField   from './ContainerField.mjs';
import {dropIndex, enableDragDrop} from '../../component/dragDrop.mjs';
import {isFormField}    from '../nestedFields.mjs';
import {t}              from '../../Translate.mjs';

/**
 * @summary GOUI ArrayField: a list of values, one row field per value (e-mail addresses,
 * phone numbers). buildField(value) returns the row's field config, usually a
 * ContainerField with a remove button (ArrayField.removeButton()).
 *
 *     {module: ArrayField, name: 'emailAddresses', buildField: () => ({
 *         module: ContainerField, items: [
 *             {module: TextField, name: 'type', width: 120},
 *             {module: TextField, name: 'email', flex: 1},
 *             ArrayField.removeButton()
 *         ]
 *     })}
 *     arrayField.addValue({type: 'work', email: ''})
 *
 * Value: rows' values in order. The form sees the ArrayField only (nestedFields.mjs).
 *
 * sortable: true lets the user drag a row by its handle (ArrayField.dragHandle() in the row)
 * before or after another row of the same ArrayField; the order is the value. An ArrayField
 * in a row of another sorts its own rows only.
 *
 *     {module: ArrayField, name: 'steps', sortable: true, buildField: () => ({
 *         module: ContainerField, items: [ArrayField.dragHandle(), {module: TextField, name: 'name', flex: 1}]
 *     })}
 */
class ArrayField extends ContainerField {
    static config = {
        className: 'GO.form.field.ArrayField',
        ntype    : 'go-arrayfield',
        baseCls  : ['go-arrayfield', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * (value) => row field config
         * @member {Function|null} buildField=null
         */
        buildField: null,
        /**
         * Rows can be dragged by their handle (ArrayField.dragHandle()) to another place
         * @member {Boolean} sortable=false
         */
        sortable: false
    }

    /** value at the last reset (isDirty) */
    originalValue = []

    /**
     * Config of a button that removes its row
     * @param {Object} [config]
     * @returns {Object}
     */
    static removeButton(config = {}) {
        return {
            module : Button,
            icon   : 'delete',
            tooltip: t('Delete'),
            cls    : ['go-arrayfield-remove'],
            handler(data) {
                const button = data?.component || this,
                      row    = ArrayField.rowOf(button);

                row && ComponentManager.get(row.parentId)?.removeRow(row)
            },
            ...config
        }
    }

    /**
     * @summary Config of the handle a row of a sortable ArrayField is dragged by.
     * @param {Object} [config]
     * @returns {Object}
     */
    static dragHandle(config = {}) {
        return {
            ntype: 'component',
            tag  : 'i',
            cls  : ['go-icon', 'go-arrayfield-handle'],
            text : 'drag_indicator',
            flex : 'none',
            ...config
        }
    }

    /**
     * @summary Makes the rows draggable by their handle when sortable.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        if (me.sortable) {
            // the direct rows only: an ArrayField in a row sorts its own (its own group too)
            // an attribute selector: an id may hold characters that a #id selector can't
            const rows = `[id="${me.id}"] > .go-arrayfield-row`;

            enableDragDrop(me, {
                drag    : rows,
                drop    : rows,
                handle  : '.go-arrayfield-handle',
                group   : me.id,
                position: 'between',
                onDrop  : ({source, targetId, position}) => source && me.onRowDrop(source.itemId, targetId, position)
            }).catch(e => console.error('ArrayField drag and drop', e))
        }
    }

    /**
     * @summary Moves the dragged row before or after the row it was dropped on.
     * @param {String} sourceId DOM id of the dragged row
     * @param {String} targetId DOM id of the row it was dropped on
     * @param {String} position before or after
     * @protected
     */
    onRowDrop(sourceId, targetId, position) {
        let me   = this,
            rows = me.getRows(),
            // a field's DOM root can be its wrapper node
            find = id => rows.findIndex(row => row.id === id || row.vdom.id === id),
            from = find(sourceId);

        me.moveRow(from, dropIndex(from, find(targetId), position))
    }

    /**
     * @summary Moves a row to the place of another row and fires the change (the field turns
     * dirty). Indexes count rows only, so other items never make a move that keeps the row order.
     * @param {Number} fromIndex index in getRows()
     * @param {Number} toIndex index in getRows(), -1: no move
     */
    moveRow(fromIndex, toIndex) {
        let me   = this,
            rows = me.getRows();

        if (!rows[fromIndex] || !rows[toIndex] || fromIndex === toIndex) {
            return
        }

        me.moveTo(me.items.indexOf(rows[fromIndex]), me.items.indexOf(rows[toIndex]));
        me.fireChange()
    }

    /**
     * The ArrayField row a component is in
     * @param {Neo.component.Base} component
     * @returns {Neo.component.Base|null}
     */
    static rowOf(component) {
        let child = component;

        for (const parent of ComponentManager.getParents(component)) {
            if (parent instanceof ArrayField) {
                return child
            }

            child = parent
        }

        return null
    }

    /**
     * @returns {Neo.component.Base[]} row fields
     */
    getRows() {
        return (this.items || []).filter(isFormField)
    }

    getChildFields() {
        return this.getRows()
    }

    getSubmitValue() {
        return this.getRows().map(row => row.getSubmitValue())
    }

    applyValue(value, reset = false) {
        let me = this;

        me.suspendChange = true;

        me.getRows().forEach(row => me.remove(row, true, true));
        (Array.isArray(value) ? value : []).forEach(v => me.addRow(v, reset));
        me.update();

        if (reset) {
            me.originalValue = Neo.clone(me.getSubmitValue(), true)
        }

        me.suspendChange = false
    }

    /**
     * @summary Adds the field of a row (the drag class too when sortable).
     * @param {*} value
     * @param {Boolean} reset
     * @returns {Neo.component.Base}
     * @protected
     */
    addRow(value, reset) {
        let me  = this,
            row = me.add({...me.buildField(value), ...(reset ? {} : {value})}, true);

        // the drag selector of a sortable ArrayField
        me.sortable && row.addWrapperCls('go-arrayfield-row');
        reset && row.reset(value);

        return row
    }

    /**
     * Adds a row (GOUI addValue())
     * @param {*} value
     * @returns {Neo.component.Base} the row field
     */
    addValue(value) {
        let me  = this,
            row = me.addRow(value, false);

        me.update();
        me.fireChange();

        return row
    }

    /**
     * @param {Neo.component.Base} row
     */
    removeRow(row) {
        let me = this;

        if (me.getRows().includes(row)) {
            me.remove(row, true);
            me.fireChange()
        }
    }

    /** @protected */
    fireChange() {
        let me    = this,
            value = me.getSubmitValue();

        me.fire('change', {component: me, value});
        // as a field: the surrounding forms hear it
        ComponentManager.getParents(me).forEach(parent => {
            Neo.form?.Container && parent instanceof Neo.form.Container && parent.fire('fieldChange', {component: me, value})
        })
    }

    reset(value = []) {
        super.reset(value)
    }

    get clean() {
        return Neo.isEqual(this.getSubmitValue(), this.originalValue)
    }

    set clean(value) {}

    get isDirty() {
        return !Neo.isEqual(this.getSubmitValue(), this.originalValue)
    }

    isEmptyAndRequired() {
        return this.required && !this.getRows().length
    }

    isValid() {
        return !this.isEmptyAndRequired() && super.isValid()
    }

    validate(silent = true) {
        const rowsValid = super.validate(silent);
        return !this.isEmptyAndRequired() && rowsValid
    }
}

export default Neo.setupClass(ArrayField);
