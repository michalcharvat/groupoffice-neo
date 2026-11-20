import List         from '../../node_modules/neo.mjs/src/list/Base.mjs';
import {escapeHtml} from '../Format.mjs';

/**
 * neo's List renders displayField as HTML. GO data (note book names etc.) is
 * text: escape it. Use as List, or in a ComboBox as listConfig: {module: TextList}.
 *
 * Group headers (ExtJS GroupingView, e.g. the task lists by grouping): with `groupField`, a
 * header is rendered above the first item of each run of the same value. Sort the store by that
 * field first. `groupRenderer({value, record})` returns the header's HTML, or null / '' for no
 * header (default: the escaped value, none for an empty value). Headers are not store records:
 * selection, keyboard navigation and clicks skip them (neo-list-header).
 *
 *     {module: CheckList, groupField: 'groupingId', groupRenderer: ({value}) => escapeHtml(name(value))}
 */
class TextList extends List {
    static config = {
        className: 'GO.list.TextList',
        /**
         * Field whose value starts a new group, null for no headers
         * @member {String|null} groupField=null
         */
        groupField: null,
        /**
         * HTML of a group header: ({value, record}) => String|null
         * @member {Function|null} groupRenderer=null
         */
        groupRenderer: null,
        /**
         * Drop targets of enableDragDrop() (drop: '.neo-list-item'): record => true when the
         * item refuses drops (class go-no-drop: not highlighted while dragging), null for none
         * @member {Function|null} noDrop=null
         */
        noDrop: null
    }

    createItem(record, index, poolIndex=index) {
        const item = super.createItem(record, index, poolIndex);

        item && this.noDrop?.(record) && item.cls.push('go-no-drop');

        return item
    }

    createItemContent(record) {
        return escapeHtml(String(record[this.displayField] ?? ''))
    }

    /**
     * @param {Object} record first record of a group
     * @returns {String|null} HTML
     * @protected
     */
    renderGroup(record) {
        const value = record[this.groupField];

        if (this.groupRenderer) {
            return this.groupRenderer({value, record})
        }

        return value === null || value === undefined || value === '' ? null : escapeHtml(value)
    }

    /**
     * neo's createItems() plus a header item above the first item of each group
     * @param {Boolean} silent=false
     */
    createItems(silent=false) {
        let me = this;

        if (!me.groupField || (me.animate && !me.getPlugin('list-animate'))) {
            return super.createItems(silent)
        }

        let vdom     = me.getVdomRoot(),
            previous = Symbol('none');

        vdom.cn = [];

        me.seedCheckedSelection();

        me.store.forEach((record, index) => {
            const value = record[me.groupField] ?? null;

            if (value !== previous) {
                const html = me.renderGroup(record);

                html && vdom.cn.push({
                    tag : 'li',
                    id  : `${me.id}__group-${index}`,
                    cls : ['neo-list-header', 'go-list-group-header'],
                    role: 'presentation',
                    html
                });

                previous = value
            }

            const item = me.createItem(record, index);
            item && vdom.cn.push(item)
        });

        !silent && me.promiseUpdate().then(() => {
            me.fire('createItems')
        })
    }

    /**
     * Grouped: the vdom index of an item is not its store index, render all items again
     * @param {Object} data
     */
    onStoreRecordChange(data) {
        let me = this;

        if (!me.groupField) {
            return super.onStoreRecordChange(data)
        }

        // the checked state follows like in neo's List
        const {fields, record} = data;

        if (me.store.indexOf(record) > -1 && me.hasCheckedField(record) && fields?.some(field => field.name === me.checkedField)) {
            const itemId = me.getItemId(me.getRecordId(record));

            if (!me.disableSelection && me.selectionModel) {
                record[me.checkedField] ? me.selectionModel.select(itemId) : me.selectionModel.deselect(itemId)
            }
        }

        me.createItems()
    }
}

export default Neo.setupClass(TextList);
