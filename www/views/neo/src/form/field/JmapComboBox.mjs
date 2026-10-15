import ComboBox  from '../../../node_modules/neo.mjs/src/form/field/ComboBox.mjs';
import JmapStore from '../../data/JmapStore.mjs';
import TextList  from '../../list/TextList.mjs';
import client    from '../../jmap/Client.mjs';
import {t}       from '../../Translate.mjs';

/**
 * ComboBox over a JMAP entity, like GOUI's ComboBox with a JmapDataSource.
 *
 * - Typing queries the server (`filterName`, default the entity's "text" filter),
 *   50 records at a time; scrolling the list to its end loads the next page.
 * - The value is the entity id: form.setValues({noteBookId: 5}) shows the name
 *   (fetched with Entity/get when the record is not loaded), getSubmitValue() /
 *   form.getValues() return the id.
 * - `field.value` holds the entity object ({id, name, …}) or null.
 *
 *     {module: JmapComboBox, name: 'noteBookId', entity: 'NoteBook',
 *      jmapFilter: {permissionLevel: 30}, labelText: t('Notebook')}
 */
class JmapComboBox extends ComboBox {
    static config = {
        className: 'GO.form.field.JmapComboBox',
        baseCls  : ['go-jmapcombo', 'neo-combobox', 'neo-pickerfield', 'neo-textfield'],
        /**
         * JMAP entity, e.g. "NoteBook"
         * @member {String|null} entity=null
         */
        entity: null,
        /**
         * Extra Entity/query filter, e.g. {permissionLevel: 30}
         * @member {Object} jmapFilter={}
         */
        jmapFilter: {},
        /**
         * Entity/query sort, e.g. [{property: 'name', isAscending: true}]
         * @member {Object[]} jmapSort=[]
         */
        jmapSort: [],
        /**
         * Filter that receives the typed text (GOUI ComboBox.filterName)
         * @member {String} filterName='text'
         */
        filterName: 'text',
        /**
         * Properties for Entity/get, null for all
         * @member {String[]|null} properties=null
         */
        properties: null,
        /**
         * Records per request
         * @member {Number} pageSize=50
         */
        pageSize: 50,
        /**
         * The remote store queries; no local filter on displayField
         * @member {Boolean} useFilter=false
         */
        useFilter: false,
        /**
         * The typeahead hint completes from the loaded page only
         * @member {Boolean} typeAhead=false
         */
        typeAhead: false,
        /**
         * One request per pause in typing
         * @member {Number} filterDelay=300
         */
        filterDelay: 300,
        /**
         * Must stay null: the field builds its JmapStore from entity and jmapFilter
         * @member {Object|null} store=null
         */
        store: null,
        listConfig: {module: TextList},
        errorTextNoMatch: data => t('No match') + ': ' + data.input,
        width: null
    }

    /**
     * Counts doFilter() calls: only the last one opens the picker
     * @member {Number} filterGeneration=0
     */
    filterGeneration = 0
    /**
     * The text the store was last queried with
     * @member {String|undefined} lastQuery
     */
    lastQuery = undefined
    /**
     * Counts value resolutions (Entity/get of a preset id)
     * @member {Number} resolveGeneration=0
     */
    resolveGeneration = 0

    construct(config) {
        super.construct(config);

        let me = this;

        me.store = Neo.create({
            module    : JmapStore,
            entity    : me.entity,
            jmapFilter: {...me.jmapFilter},
            jmapSort  : me.jmapSort,
            keyProperty: me.valueField,
            model     : {
                fields: [
                    {name: me.valueField},
                    {name: me.displayField, type: 'String'}
                ]
            },
            pageSize  : me.pageSize,
            properties: me.properties,
            scrollLoad: true
        });

        // created here: destroyed here
        me.ownJmapStore = me.store
    }

    destroy(...args) {
        const store = this.ownJmapStore;

        super.destroy(...args);
        store && !store.isDestroyed && store.destroy()
    }

    /**
     * Changes the extra query filter (e.g. another address book) and queries again when loaded
     * @param {Object} filter conditions to merge, undefined removes one
     * @returns {Promise<void>}
     */
    async setJmapFilter(filter) {
        let me = this;

        me.jmapFilter = {...me.jmapFilter, ...filter};

        if (me.store.isLoaded) {
            await me.store.setFilter(filter).catch(() => {})
        } else {
            Object.assign(me.store.jmapFilter, filter)
        }
    }

    /**
     * Ids resolve to the loaded record or, until Entity/get answers, to a
     * placeholder that already submits the id.
     * @param {Number|Object|String|null} value
     * @param {Number|Object|String|null} oldValue
     * @returns {Object|null}
     * @protected
     */
    beforeSetValue(value, oldValue) {
        let me = this,
            {displayField, valueField} = me,
            record;

        me.resolveGeneration++;

        if (value === null || value === undefined || value === '') {
            return null
        }

        // record or entity object
        if (typeof value === 'object') {
            return value
        }

        record = me.store?.get(value);

        if (record) {
            return record
        }

        if (!me.store) {
            // construction: the store is created in construct()
            me.pendingValue = value;
            return null
        }

        me.resolveValue(value);

        return {[valueField]: value, [displayField]: ''}
    }

    /**
     * Fetches the display text of a preset id
     * @param {Number|String} id
     * @protected
     */
    async resolveValue(id) {
        let me         = this,
            generation = me.resolveGeneration,
            entity;

        try {
            [entity] = await client.get(me.entity, [id], me.properties);
        } catch (e) {
            console.warn('JmapComboBox: cannot load', me.entity, id, e);
            return
        }

        // destroyed, or the value changed meanwhile
        if (me.isDestroyed || generation !== me.resolveGeneration || me._value?.[me.valueField] !== id) {
            return
        }

        // silent: the value (id) is unchanged, only its text arrived
        me._value = entity || {[me.valueField]: id, [me.displayField]: String(id)};

        me.programmaticValueChange = true;
        me.updateInputValueFromValue(me._value);
        me.programmaticValueChange = false
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        if (me.pendingValue != null) {
            const value = me.pendingValue;
            me.pendingValue = null;
            me.value = value
        }
    }

    /**
     * Queries the server with the typed text, then shows the result
     * @param {String|null} value null: no text filter (picker trigger)
     * @protected
     */
    async doFilter(value) {
        let me         = this,
            {store}    = me,
            generation = ++me.filterGeneration,
            query      = value || undefined;

        if (!store.isLoaded || query !== me.lastQuery) {
            me.lastQuery = query;

            try {
                await store.setFilter({[me.filterName]: query})
            } catch (e) {
                console.warn('JmapComboBox query failed', e);
                return
            }
        }

        // destroyed, typing went on meanwhile, or focus left the field (the picker closed)
        if (me.isDestroyed || generation !== me.filterGeneration || !me.containsFocus) {
            return
        }

        if (me.listStore.getCount()) {
            me.showPicker();
            me.addScrollListener();

            let {list}           = me,
                {selectionModel} = list,
                id               = me.value?.[me.valueField],
                record           = id != null ? me.listStore.get(id) : null,
                index            = record ? me.listStore.indexOf(record) : -1;

            // silent: deselectAll() fires "noChange", which closes the picker (ComboBox)
            selectionModel.suspendEvents = true;
            record ? selectionModel.select(record) : selectionModel.deselectAll();
            selectionModel.suspendEvents = false;

            list._focusIndex = -1; // silent update to ensure afterSetFocusIndex() always gets called
            list.focusIndex  = index > -1 ? index : 0
        } else {
            me.picker?.hide()
        }
    }

    /**
     * The value may be a plain entity object, not a record of the list
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        let me = this;

        me.programmaticValueChange = true;
        // skip ComboBox.afterSetValue(): it selects the value object in the list
        Object.getPrototypeOf(ComboBox.prototype).afterSetValue.call(me, value, oldValue);
        me.programmaticValueChange = false
    }

    /**
     * @returns {Number|String|null}
     */
    getSubmitValue() {
        return this.value?.[this.valueField] ?? null
    }

    /**
     * Next page when the list is scrolled to its end (GOUI scrollLoad)
     * @protected
     */
    addScrollListener() {
        let me = this;

        if (me.scrollListenerAdded || !me.picker) {
            return
        }

        me.scrollListenerAdded = true;
        me.picker.addDomListeners({scroll: me.onPickerScroll, scope: me})
    }

    /**
     * @param {Object} data
     * @protected
     */
    async onPickerScroll(data) {
        let me      = this,
            {store} = me,
            id      = data.target?.id;

        if (!id || !store.hasMore() || store.isLoading) {
            return
        }

        const {clientHeight, scrollHeight} = await Neo.main.DomAccess.getScrollingDimensions({id, windowId: me.windowId});

        if (data.scrollTop + clientHeight >= scrollHeight - 40) {
            store.loadMore().catch(() => {})
        }
    }
}

export default Neo.setupClass(JmapComboBox);
