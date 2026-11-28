import ChipsField from './ChipsField.mjs';
import MenuList   from '../../menu/List.mjs';
import client     from '../../jmap/Client.mjs';
import {t}        from '../../Translate.mjs';

/**
 * GOUI AutocompleteChips over a JMAP entity: the value is an array of entity ids shown
 * as chips with their names. The ▾ button lists the entities (filtered by the typed
 * text) in a menu; a click adds or removes one. Enter adds the first match of the text.
 *
 *     {module: AutocompleteChips, name: 'categories', entity: 'TaskCategory', labelText: t('Categories')}
 *
 * setJmapFilter() changes the offered entities (e.g. the categories of the chosen list).
 */
class AutocompleteChips extends ChipsField {
    static config = {
        className: 'GO.form.field.AutocompleteChips',
        ntype    : 'go-autocompletechips',
        baseCls  : ['go-field', 'go-chipsfield', 'go-autocompletechips'],
        /**
         * JMAP entity, e.g. "TaskCategory"
         * @member {String|null} entity=null
         */
        entity: null,
        /**
         * Property with the chip text
         * @member {String} displayField='name'
         */
        displayField: 'name',
        /**
         * Extra Entity/query filter
         * @member {Object} jmapFilter={}
         */
        jmapFilter: {},
        /**
         * @member {Object[]} jmapSort=[]
         */
        jmapSort: [],
        /**
         * Entity/get properties, null: id and displayField (an AclItemEntity such as Contact
         * also needs the property its permissions come from, e.g. addressBookId)
         * @member {String[]|null} properties=null
         */
        properties: null,
        /**
         * Entries in the menu
         * @member {Number} limit=50
         */
        limit: 50,
        /**
         * (record) => value of a picked entity, null: its id (GOUI pickerRecordToValue)
         * @member {Function|null} pickerRecordToValue=null
         */
        pickerRecordToValue: null,
        /**
         * async (records) => muted text per menu entry, e.g. the address book of each
         * organization so equal names can be told apart; null: none
         * @member {Function|null} recordDetails=null
         */
        recordDetails: null
    }

    /** @member {GO.menu.List|null} menu=null */
    menu = null

    /**
     * @summary Defaults of chipEntity, chipRenderer and textInputToValue from the entity.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        // clickable: a chip opens its entity (a picked value other than the id brings its own)
        me.chipEntity ??= id => id !== null && typeof id !== 'object' ? {entity: me.entity, id} : null;

        me.chipRenderer ??= async id => {
            const [record] = await client.get(me.entity, [String(id)], me.properties || ['id', me.displayField]);
            return record?.[me.displayField] ?? '#' + id
        };

        // Enter / "," : the first entity matching the text
        me.textInputToValue ??= async text => {
            const records = await me.query(text, 1);

            if (!records[0]) {
                return null
            }

            const value = me.recordToValue(records[0]);

            me.chipTexts.set(ChipsField.key(value), String(records[0][me.displayField] ?? ''));
            return value
        }
    }

    /**
     * @param {Object} record
     * @returns {*} the value of a picked entity
     * @protected
     */
    recordToValue(record) {
        return this.pickerRecordToValue ? this.pickerRecordToValue(record) : record.id
    }

    /** bumped by setJmapFilter() and every showMenu(): only the latest query shows */
    queryGeneration = 0

    destroy(...args) {
        this.closeMenu();
        super.destroy(...args)
    }

    /**
     * @param {Object} filter replaces jmapFilter
     */
    setJmapFilter(filter) {
        this.jmapFilter = {...filter};
        // a pending or open menu shows entities of the old filter
        this.queryGeneration++;
        this.closeMenu()
    }

    /**
     * isDestroyed is undefined on live neo instances: test for truthy
     * @protected
     */
    closeMenu() {
        this.menu && !this.menu.isDestroyed && this.menu.destroy();
        this.menu = null
    }

    /**
     * @param {String} text
     * @param {Number} limit
     * @returns {Promise<Object[]>}
     * @protected
     */
    async query(text, limit) {
        let me     = this,
            filter = {...me.jmapFilter};

        text && (filter = {operator: 'AND', conditions: [filter, {text}]});

        const {list} = await client.queryGet(me.entity, {
            filter,
            sort      : me.jmapSort,
            limit,
            properties: me.properties || ['id', me.displayField]
        });

        return list
    }

    createControl() {
        let me      = this,
            control = super.createControl();

        if (!me.readOnly && !me.disabled) {
            control.push({
                tag  : 'button',
                type : 'button',
                cls  : ['go-chips-trigger'],
                title: t('Show options'),
                cn   : [{tag: 'i', cls: ['go-icon'], text: 'expand_more'}]
            })
        }

        return control
    }

    onBoxClick(data) {
        if (data.path.some(node => node.cls?.includes('go-chips-trigger'))) {
            this.showMenu();
            return
        }

        super.onBoxClick(data)
    }

    /**
     * @summary Shows the menu of entities: a click toggles one.
     */
    async showMenu() {
        let me         = this,
            generation = ++me.queryGeneration,
            records, details;

        if (me.readOnly || me.disabled) {
            return
        }

        try {
            records = await me.query(me.inputText.trim(), me.limit)
        } catch (e) {
            console.error('AutocompleteChips', e);
            return
        }

        // the details are extra: the menu shows without them when they fail
        try {
            details = (me.recordDetails && await me.recordDetails(records)) || []
        } catch (e) {
            console.error('AutocompleteChips details', e);
            details = []
        }

        if (me.isDestroyed || generation !== me.queryGeneration) {
            return
        }

        me.closeMenu();

        const selected = new Set((me.value || []).map(v => me.valueKey(v))),
              items    = records.map((record, index) => {
                  const text  = String(record[me.displayField] ?? ''),
                        value = me.recordToValue(record);

                  me.chipTexts.set(ChipsField.key(value), text);

                  return {
                      text,
                      detail : details[index] || null,
                      icon   : selected.has(me.valueKey(value)) ? 'check_box' : 'check_box_outline_blank',
                      handler: () => me.toggle(value)
                  }
              });

        me.menu = MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : me.id,
            align   : {edgeAlign: 't0-b0'},
            items   : items.length ? items : [{text: t('No items to display'), disabled: true}]
        })
    }

    /**
     * Compare key of a value: ids as strings, objects as JSON
     * @param {*} value
     * @returns {String}
     * @protected
     */
    valueKey(value) {
        return value !== null && typeof value === 'object' ? ChipsField.key(value) : String(value)
    }

    /**
     * Adds or removes a value (an id, or what pickerRecordToValue returns)
     * @param {*} value
     */
    toggle(value) {
        let me      = this,
            current = me.value || [],
            key     = me.valueKey(value),
            exists  = current.some(v => me.valueKey(v) === key);

        me.userChange(exists ? current.filter(v => me.valueKey(v) !== key) : [...current, value])
    }
}

export default Neo.setupClass(AutocompleteChips);
