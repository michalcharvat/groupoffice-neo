import ClassSystemUtil from '../../../node_modules/neo.mjs/src/util/ClassSystem.mjs';
import Store           from '../../../node_modules/neo.mjs/src/data/Store.mjs';
import Field           from './Field.mjs';
import MenuList        from '../../menu/List.mjs';
import {escapeHtml}    from '../../Format.mjs';
import {t}             from '../../Translate.mjs';

/**
 * GOUI ListField: the box shows the value as HTML (renderValue), the ▾ button or a click
 * on the box opens the records of a store in a menu; picking one sets the value (the
 * record's valueProperty, or what pickerRecordToValue returns). A JMAP store loads when
 * the menu opens.
 *
 *     {module: ListField, name: 'noteBookId', labelText: t('Note book'),
 *      store: {module: JmapStore, entity: 'NoteBook', model: NoteBookModel},
 *      renderValue: async id => escapeHtml((await client.get('NoteBook', [id], ['name']))[0]?.name ?? '')}
 *
 * Without renderValue the box shows the displayField of the store's record with that value
 * (escaped), or the value itself. listItemText(record) is the text of a menu item.
 *
 * Events: select ({record}) after a pick, besides change / userChange of the value.
 */
class ListField extends Field {
    static config = {
        className: 'GO.form.field.ListField',
        ntype    : 'go-listfield',
        baseCls  : ['go-field', 'go-listfield'],
        /**
         * Store (config) with the records to pick from
         * @member {Neo.data.Store|Object|null} store_=null
         */
        store_: null,
        /**
         * Property with the text of a record
         * @member {String} displayField='name'
         */
        displayField: 'name',
        /**
         * Property that becomes the value (GOUI valueProperty)
         * @member {String} valueProperty='id'
         */
        valueProperty: 'id',
        /**
         * (record) => value of a picked record, null: record[valueProperty]
         * @member {Function|null} pickerRecordToValue=null
         */
        pickerRecordToValue: null,
        /**
         * async (value) => HTML shown in the box (GOUI renderValue)
         * @member {Function|null} renderValue=null
         */
        renderValue: null,
        /**
         * (record) => text of a menu item, null: the displayField
         * @member {Function|null} listItemText=null
         */
        listItemText: null,
        /**
         * Shown while there is no value
         * @member {String} placeholder=''
         */
        placeholder: ''
    }

    /** the field created the store from a config, so it destroys it (a passed instance may be shared) */
    ownsStore = false
    /** HTML of the value in the box */
    valueHtml = ''
    /** bumped by value changes: drops pending renders of older values */
    renderGeneration = 0
    /** @member {GO.menu.List|null} menu=null */
    menu = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([{click: me.onBoxClick, delegate: '.go-field-box', scope: me}]);
        me.renderValueHtml()
    }

    beforeSetStore(value, oldValue) {
        let me = this;

        if (oldValue) {
            oldValue.un('load', me.onStoreLoad, me);
            me.ownsStore && oldValue.destroy()
        }

        // a config (or none: beforeSetInstance() creates an empty store) is ours, an instance is not
        me.ownsStore = Neo.typeOf(value) !== 'NeoInstance';
        return ClassSystemUtil.beforeSetInstance(value, Store)
    }

    afterSetStore(value, oldValue) {
        let me = this;

        // the displayField of a loaded record replaces the raw value
        value?.on('load', me.onStoreLoad, me);
        oldValue !== undefined && me.renderValueHtml()
    }

    /** @protected */
    onStoreLoad() {
        this.renderValue || this.renderValueHtml()
    }

    destroy(...args) {
        let me = this;

        me.closeMenu();
        me.store?.un('load', me.onStoreLoad, me);
        me.ownsStore && me.store?.destroy();
        super.destroy(...args)
    }

    afterSetValue(value, oldValue) {
        super.afterSetValue(value, oldValue);
        oldValue !== undefined && this.renderValueHtml()
    }

    /**
     * @returns {Neo.data.Record|null} the store's record of the value
     * @protected
     */
    recordOfValue(value) {
        let me = this;

        return me.store?.items.find(record => Neo.isEqual(me.recordToValue(record), value)) || null
    }

    /**
     * Renders the value into the box
     * @protected
     */
    async renderValueHtml() {
        let me         = this,
            value      = me.value,
            generation = ++me.renderGeneration,
            html;

        if (value === null || value === undefined || value === '') {
            html = ''
        } else if (me.renderValue) {
            try {
                html = await me.renderValue(value)
            } catch (e) {
                console.error('ListField', e);
                html = escapeHtml(String(value))
            }
        } else {
            const record = me.recordOfValue(value);
            html = escapeHtml(String(record ? record[me.displayField] ?? value : value))
        }

        if (!me.isDestroyed && generation === me.renderGeneration) {
            me.valueHtml = html ?? '';
            me.renderControl()
        }
    }

    createControl() {
        let me       = this,
            editable = !me.readOnly && !me.disabled;

        return [{
            cls : ['go-listfield-value', me.valueHtml ? '' : 'go-listfield-empty'].filter(Boolean),
            html: me.valueHtml || escapeHtml(me.placeholder)
        }, editable && {
            tag  : 'button',
            type : 'button',
            cls  : ['go-field-trigger'],
            title: t('Show options'),
            cn   : [{tag: 'i', cls: ['go-icon'], text: 'expand_more'}]
        }].filter(Boolean)
    }

    /**
     * @param {Object} record
     * @returns {*} the value of a picked record
     * @protected
     */
    recordToValue(record) {
        return this.pickerRecordToValue ? this.pickerRecordToValue(record) : record[this.valueProperty]
    }

    onBoxClick() {
        let me = this;

        if (!me.readOnly && !me.disabled) {
            me.menuOpen() ? me.closeMenu() : me.showMenu()
        }
    }

    /**
     * @returns {Boolean} the menu shows (it destroys itself when it closes)
     * @protected
     */
    menuOpen() {
        return !!this.menu && !this.menu.isDestroyed
    }

    /**
     * The records of the store below the box (GOUI ListField menuButton)
     */
    async showMenu() {
        let me    = this,
            store = me.store;

        if (!store) {
            return
        }

        // a JMAP store loads on open, a local one has its data
        if (store.entity) {
            try {
                await store.load()
            } catch (e) {
                console.error('ListField', e);
                return
            }
        }

        if (me.isDestroyed) {
            return
        }

        me.closeMenu();

        const records = [...store.items];

        me.menu = MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : me.id,
            align   : {edgeAlign: 't0-b0'},
            items   : records.length
                ? records.map(record => ({
                    text   : String(me.listItemText ? me.listItemText(record) : record[me.displayField] ?? ''),
                    icon   : Neo.isEqual(me.recordToValue(record), me.value) ? 'check' : null,
                    handler: () => me.pick(record)
                }))
                : [{text: t('No items to display'), disabled: true}]
        })
    }

    /**
     * @param {Object} record
     */
    pick(record) {
        let me = this;

        me.closeMenu();
        me.userChange(me.recordToValue(record));
        me.fire('select', {record})
    }

    /**
     * Hides the menu: it destroys itself once unmounted (MenuList.showAt())
     * @protected
     */
    closeMenu() {
        this.menuOpen() && (this.menu.hidden = true);
        this.menu = null
    }
}

export default Neo.setupClass(ListField);
