import List         from '../../node_modules/neo.mjs/src/list/Base.mjs';
import {escapeHtml} from '../Format.mjs';

// members of neo's records (data/RecordFactory.mjs): a field of that name would replace them
const RECORD_API = ['constructor', 'get', 'set', 'setSilent', 'setOriginal', 'reset', 'notifyChange', 'isModified', 'isModifiedField', 'isRecord', 'version', 'toJSON'];

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
 *
 * Empty state (GOUI List emptyStateHtml): with `emptyText`, a list whose store has loaded and
 * holds no records shows `emptyIcon` and the text as a non-interactive item (go-list-empty).
 * Not after a failed load, and not in an animated list before neo's animate plugin is there.
 * Off by default: a TextList is also the drop-down of combo boxes.
 *
 *     {module: CheckList, emptyText: t('No items found')}
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
        noDrop: null,
        /**
         * Text shown when the loaded store has no records, null for none
         * @member {String|null} emptyText_=null
         */
        emptyText_: null,
        /**
         * Material symbol above the emptyText, null for none
         * @member {String|null} emptyIcon_='article'
         */
        emptyIcon_: 'article'
    }

    /**
     * neo.mjs 13.4 gives a store config without a model an empty Model: its records drop every
     * data field, string keys included (getKey() undefined, createItem() throws). neo's ComboBox
     * adds a default model to a plain store config, List does not: add one with the key, display
     * and group fields plus the fields of the initial data. Values keep their type. Dotted names
     * become their root field (record.get('a.b') reads into it); the key field is an Integer when
     * every initial id is an integer; names of the record API (get,
     * set, ...) are left out, they would replace its methods. Declare a model for other fields of
     * data loaded later.
     *
     *     {module: CheckList, displayField: 'name', store: {keyProperty: 'id', data: [{id: 'create', name: 'Create'}]}}
     * @param {Object|Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @returns {Neo.data.Store|null}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        if (Neo.typeOf(value) === 'Object' && !value.model && !value.module && !value.ntype) {
            const {data} = value,
                  items  = Array.isArray(data) ? data : (data && typeof data === 'object' ? [data] : []),
                  names  = new Set();

            [value.keyProperty || 'id', this.displayField, this.groupField].forEach(name => {
                typeof name === 'string' && name && names.add(name.split('.')[0])
            });

            // checkedField only when the data has it: declared, it makes neo write the selection into the records
            items.forEach(item => {
                item && typeof item === 'object' && Object.keys(item).forEach(name => names.add(name))
            });

            RECORD_API.forEach(name => names.delete(name));

            // integer ids need an Integer key field: the item ids of the DOM are strings, and
            // store.getCanonicalKey() only turns them back into numbers for an 'int' key type
            // (without it a click finds no record and a CheckList row cannot be checked)
            const key       = value.keyProperty || 'id',
                  intKeys   = items.length > 0 && items.every(item => Number.isInteger(item?.[key]));

            value = {...value, model: {fields: [...names].map(name => name === key && intKeys ? {name, type: 'Integer'} : {name})}}
        }

        return super.beforeSetStore(value, oldValue)
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
     * neo's createItems() plus group headers (groupField) and the empty state (emptyText)
     * @param {Boolean} silent=false
     */
    createItems(silent=false) {
        let me = this;

        // neo renders nothing until the animate plugin is there
        if (me.animate && !me.getPlugin('list-animate')) {
            return super.createItems(silent)
        }

        me.groupField ? me.createGroupedItems() : super.createItems(true);
        me.addEmptyItem();

        !silent && me.promiseUpdate().then(() => {
            me.fire('createItems')
        })
    }

    /**
     * The last load of the store failed: no empty state until the next load
     * @member {Boolean} emptyLoadFailed=false
     */
    emptyLoadFailed = false

    /**
     * neo renders a new store's records only when it has some: the items of the old store or
     * the empty state would stay
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        let me = this;

        super.afterSetStore(value, oldValue);

        oldValue?.un('loadError', me.onEmptyLoadError, me);
        value?.on('loadError', me.onEmptyLoadError, me);

        me.emptyLoadFailed = false;

        // neo's afterSetStore() calls onStoreLoad() when the store has records
        oldValue && value && !(value.getCount() > 0) && me.onStoreLoad()
    }

    /**
     * A failed load leaves the records of the previous one: their empty state is no answer
     * @protected
     */
    onEmptyLoadError() {
        let me = this;

        me.emptyLoadFailed = true;
        me.emptyText && me.store && me.createItems()
    }

    /**
     * @protected
     */
    onStoreLoad(...args) {
        this.emptyLoadFailed = false;
        return super.onStoreLoad(...args)
    }

    /**
     * Triggered after the emptyText config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetEmptyText(value, oldValue) {
        oldValue !== undefined && this.store && this.createItems()
    }

    /**
     * Triggered after the emptyIcon config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetEmptyIcon(value, oldValue) {
        oldValue !== undefined && this.store && this.createItems()
    }

    /**
     * Appends the empty state item to the vdom when the loaded store has no records
     * @protected
     */
    addEmptyItem() {
        let me      = this,
            {store} = me;

        if (!me.emptyText || !store?.isLoaded || store.count > 0 || me.emptyLoadFailed) {
            return
        }

        const content = [{tag: 'p', text: String(me.emptyText)}];

        me.emptyIcon && content.unshift({tag: 'i', cls: ['go-icon'], 'aria-hidden': true, text: String(me.emptyIcon)});

        me.getVdomRoot().cn.push({
            tag : 'li',
            id  : `${me.id}__empty`,
            cls : ['go-list-empty'],
            role: 'presentation',
            cn  : content
        })
    }

    /**
     * Items with a header item above the first item of each group (vdom only, no update)
     * @protected
     */
    createGroupedItems() {
        let me       = this,
            vdom     = me.getVdomRoot(),
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
