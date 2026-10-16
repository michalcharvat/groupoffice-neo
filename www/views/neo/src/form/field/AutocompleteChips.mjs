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
         * Entries in the menu
         * @member {Number} limit=50
         */
        limit: 50
    }

    /** @member {GO.menu.List|null} menu=null */
    menu = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.chipRenderer ??= async id => {
            const [record] = await client.get(me.entity, [String(id)], ['id', me.displayField]);
            return record?.[me.displayField] ?? '#' + id
        };

        // Enter / "," : the first entity matching the text
        me.textInputToValue ??= async text => {
            const records = await me.query(text, 1);

            if (!records[0]) {
                return null
            }

            me.chipTexts.set(ChipsField.key(records[0].id), String(records[0][me.displayField] ?? ''));
            return records[0].id
        }
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
            properties: ['id', me.displayField]
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
     * The menu of entities: a click toggles one
     */
    async showMenu() {
        let me         = this,
            generation = ++me.queryGeneration,
            records;

        if (me.readOnly || me.disabled) {
            return
        }

        try {
            records = await me.query(me.inputText.trim(), me.limit)
        } catch (e) {
            console.error('AutocompleteChips', e);
            return
        }

        if (me.isDestroyed || generation !== me.queryGeneration) {
            return
        }

        me.closeMenu();

        const selected = new Set((me.value || []).map(String)),
              items    = records.map(record => {
                  const text = String(record[me.displayField] ?? '');

                  me.chipTexts.set(ChipsField.key(record.id), text);

                  return {
                      text,
                      icon   : selected.has(String(record.id)) ? 'check_box' : 'check_box_outline_blank',
                      handler: () => me.toggle(record.id)
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
     * Adds or removes an id
     * @param {String|Number} id
     */
    toggle(id) {
        let me      = this,
            current = me.value || [],
            exists  = current.some(v => String(v) === String(id));

        me.userChange(exists ? current.filter(v => String(v) !== String(id)) : [...current, id])
    }
}

export default Neo.setupClass(AutocompleteChips);
