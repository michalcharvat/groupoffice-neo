import Field    from './Field.mjs';
import MenuList from '../../menu/List.mjs';
import client   from '../../jmap/Client.mjs';
import {t}      from '../../Translate.mjs';

/** ms after the last key before the suggestions are fetched (GOUI AutocompleteField buffer) */
const BUFFER = 300;

/**
 * GOUI AutocompleteField: a text box that suggests records while typing; picking one sets
 * the value (the record's id, or what pickerRecordToValue returns) and shows its text.
 * The ▾ button lists the suggestions for the current text, Enter picks the first one,
 * clearing the text clears the value.
 *
 * Over a JMAP entity:
 *
 *     {module: AutocompleteField, name: 'noteBookId', entity: 'NoteBook', labelText: t('Note book')}
 *
 * Or any source: fetch(text) returns the records, valueToText(value) the text of a value
 * that was not picked (a loaded form):
 *
 *     {module: AutocompleteField, name: 'country', fetch: async text => COUNTRIES.filter(...),
 *      displayField: 'name', valueProperty: 'code', valueToText: code => NAMES[code]}
 *
 * Events: select ({record}) after a pick, besides change / userChange of the value.
 */
class AutocompleteField extends Field {
    static config = {
        className: 'GO.form.field.AutocompleteField',
        ntype    : 'go-autocompletefield',
        baseCls  : ['go-field', 'go-autocompletefield'],
        /**
         * JMAP entity, e.g. "NoteBook" (when there is no fetch)
         * @member {String|null} entity=null
         */
        entity: null,
        /**
         * Property with the shown text
         * @member {String} displayField='name'
         */
        displayField: 'name',
        /**
         * Property that becomes the value (GOUI valueProperty)
         * @member {String} valueProperty='id'
         */
        valueProperty: 'id',
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
         * Entity/get properties, null: valueProperty and displayField
         * @member {String[]|null} properties=null
         */
        properties: null,
        /**
         * Suggestions shown
         * @member {Number} limit=10
         */
        limit: 10,
        /**
         * async (text) => records, instead of the JMAP entity
         * @member {Function|null} fetch=null
         */
        fetch: null,
        /**
         * (record) => value of a picked record, null: record[valueProperty]
         * @member {Function|null} pickerRecordToValue=null
         */
        pickerRecordToValue: null,
        /**
         * async (value) => text of a value that was not picked (GOUI valueToTextField),
         * null: the entity's displayField, or the value itself
         * @member {Function|null} valueToText=null
         */
        valueToText: null,
        /**
         * @member {String} placeholder=''
         */
        placeholder: ''
    }

    /** Text in the input */
    inputText = ''
    /** bumped by every fetch: only the latest result shows */
    queryGeneration = 0
    /** bumped by value changes: drops pending texts of older values */
    textGeneration = 0
    /** @member {Number|null} bufferTimer=null */
    bufferTimer = null
    /** @member {GO.menu.List|null} menu=null */
    menu = null
    /** the value whose text the input shows, so setting it again keeps what was typed */
    shownValue = undefined

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {input  : me.onInput,   delegate: '.go-autocomplete-input', scope: me},
            {keydown: me.onKeyDown, delegate: '.go-autocomplete-input', scope: me},
            {click  : me.onTriggerClick, delegate: '.go-field-trigger', scope: me}
        ]);

        me.showValueText()
    }

    destroy(...args) {
        clearTimeout(this.bufferTimer);
        this.closeMenu();
        super.destroy(...args)
    }

    afterSetValue(value, oldValue) {
        super.afterSetValue(value, oldValue);
        oldValue !== undefined && this.showValueText()
    }

    /**
     * Shows the text of the value in the input
     * @protected
     */
    async showValueText() {
        let me         = this,
            value      = me.value,
            generation = ++me.textGeneration;

        if (Neo.isEqual(value, me.shownValue)) {
            return
        }

        me.shownValue = value;

        if (value === null || value === undefined || value === '') {
            me.setInputText('');
            return
        }

        let text;

        try {
            text = await me.textOf(value)
        } catch (e) {
            text = null
        }

        !me.isDestroyed && generation === me.textGeneration && me.setInputText(String(text ?? value))
    }

    /**
     * @param {*} value
     * @returns {Promise<String|null>}
     * @protected
     */
    async textOf(value) {
        let me = this;

        if (me.valueToText) {
            return me.valueToText(value)
        }

        if (me.entity && me.valueProperty === 'id') {
            const [record] = await client.get(me.entity, [String(value)], ['id', me.displayField]);
            return record?.[me.displayField] ?? null
        }

        return null
    }

    /**
     * @param {String} text
     * @protected
     */
    setInputText(text) {
        this.inputText = text;
        this.renderControl()
    }

    createControl() {
        let me       = this,
            editable = !me.readOnly && !me.disabled;

        return [{
            tag         : 'input',
            id          : me.id + '__input',
            type        : 'text',
            cls         : ['go-field-input', 'go-autocomplete-input'],
            autocomplete: 'off',
            placeholder : me.placeholder,
            value       : me.inputText,
            ...me.inputFlags()
        }, editable && {
            tag  : 'button',
            type : 'button',
            cls  : ['go-field-trigger'],
            title: t('Show options'),
            cn   : [{tag: 'i', cls: ['go-icon'], text: 'expand_more'}]
        }].filter(Boolean)
    }

    /**
     * @param {String} text
     * @returns {Promise<Object[]>} the suggestions for a text
     * @protected
     */
    async query(text) {
        let me = this;

        if (me.fetch) {
            return (await me.fetch(text)) || []
        }

        let filter = {...me.jmapFilter};

        text && (filter = {operator: 'AND', conditions: [filter, {text}]});

        const {list} = await client.queryGet(me.entity, {
            filter,
            sort      : me.jmapSort,
            limit     : me.limit,
            properties: me.properties || [...new Set(['id', me.valueProperty, me.displayField])]
        });

        return list
    }

    /**
     * @param {Object} record
     * @returns {*} the value of a picked record
     * @protected
     */
    recordToValue(record) {
        return this.pickerRecordToValue ? this.pickerRecordToValue(record) : record[this.valueProperty]
    }

    onInput({value}) {
        let me = this;

        if (me.readOnly || me.disabled) {
            return
        }

        me.inputText = value ?? '';
        // keep the vnode in sync, or setting the picked text later is no change
        me.boxNode.cn[0].value = me.inputText;
        me.update();

        // typing makes pending suggestions, picks and value texts outdated
        clearTimeout(me.bufferTimer);
        me.queryGeneration++;
        me.textGeneration++;

        if (!me.inputText.trim()) {
            me.closeMenu();
            me.queryGeneration++;
            me.shownValue = null;
            me.userChange(null);
            return
        }

        me.bufferTimer = setTimeout(() => me.showMenu(), BUFFER)
    }

    onKeyDown({key}) {
        let me = this;

        if (me.readOnly || me.disabled) {
            return
        }

        if (key === 'Enter' && me.inputText.trim()) {
            clearTimeout(me.bufferTimer);
            me.pickFirst()
        } else if (key === 'Escape') {
            clearTimeout(me.bufferTimer);
            me.queryGeneration++;
            me.closeMenu()
        } else if (key === 'ArrowDown' && !me.menuOpen()) {
            clearTimeout(me.bufferTimer);
            me.showMenu()
        }
    }

    /**
     * Suggestions opened while typing don't take the focus, so they don't close with it:
     * close them when the focus leaves the field and did not go into them
     */
    onFocusLeave(data) {
        super.onFocusLeave?.(data);

        let me = this;

        clearTimeout(me.bufferTimer);

        setTimeout(() => {
            !me.isDestroyed && !me.containsFocus && me.menuOpen() && !me.menu.containsFocus && me.closeMenu()
        }, 200)
    }

    onTriggerClick() {
        this.menuOpen() ? this.closeMenu() : this.showMenu(true)
    }

    /**
     * @returns {Boolean} the suggestions show (a menu destroys itself when it closes)
     * @protected
     */
    menuOpen() {
        return !!this.menu && !this.menu.isDestroyed
    }

    /**
     * Enter: the first suggestion for the text
     * @protected
     */
    async pickFirst() {
        let me         = this,
            generation = ++me.queryGeneration,
            records;

        try {
            records = await me.query(me.inputText.trim())
        } catch (e) {
            console.error('AutocompleteField', e);
            return
        }

        // typing, Escape, a reset or a disable meanwhile drop the answer
        !me.isDestroyed && generation === me.queryGeneration && !me.readOnly && !me.disabled && records[0] && me.pick(records[0])
    }

    /**
     * @param {Object} record
     */
    pick(record) {
        let me    = this,
            value = me.recordToValue(record);

        clearTimeout(me.bufferTimer);
        me.queryGeneration++;
        me.closeMenu();
        me.shownValue = value;
        me.textGeneration++;
        me.setInputText(String(record[me.displayField] ?? value ?? ''));
        me.userChange(value);
        me.fire('select', {record})
    }

    /**
     * The suggestions for the typed text below the box
     * @param {Boolean} [all=false] the ▾ button: all suggestions, not only those of the text
     */
    async showMenu(all = false) {
        let me         = this,
            generation = ++me.queryGeneration,
            text       = all && Neo.isEqual(me.value, me.shownValue) && me.value !== null ? '' : me.inputText.trim(),
            records;

        try {
            records = await me.query(text)
        } catch (e) {
            console.error('AutocompleteField', e);
            return
        }

        if (me.isDestroyed || generation !== me.queryGeneration || me.readOnly || me.disabled) {
            return
        }

        me.closeMenu();

        me.menu = MenuList.showAt({
            appName     : me.appName,
            windowId    : me.windowId,
            target      : me.id,
            align       : {edgeAlign: 't0-b0'},
            // typing goes on in the input
            focusOnMount: false,
            cls     : ['go-menu', 'go-autocomplete-menu'],
            items   : records.length
                ? records.slice(0, me.limit).map(record => ({
                    text   : String(record[me.displayField] ?? ''),
                    handler: () => me.pick(record)
                }))
                : [{text: t('No items to display'), disabled: true}]
        })
    }

    /**
     * Hides the suggestions: the menu destroys itself once unmounted (MenuList.showAt()),
     * also when the close comes from its own item click
     * @protected
     */
    closeMenu() {
        this.menuOpen() && (this.menu.hidden = true);
        this.menu = null
    }

    reset(value = null) {
        let me = this;

        clearTimeout(me.bufferTimer);
        me.queryGeneration++;
        me.closeMenu();
        super.reset(value);
        // also when the value stays: the input shows its text again, not what was typed
        me.shownValue = undefined;
        me.showValueText()
    }
}

export default Neo.setupClass(AutocompleteField);
