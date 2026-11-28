import Field          from './Field.mjs';
import {resolveRoute} from '../../link/linkTypes.mjs';
import {t}            from '../../Translate.mjs';

/**
 * @summary GOUI ChipsField: values as chips with a remove button, typed text becomes a chip
 * on Enter, "," or ";". Backspace in the empty input removes the last chip.
 *
 * Value: an array. textInputToValue(text) turns typed text into a value (may return a
 * Promise; null/'' rejects it), chipRenderer(value) gives a chip's text (may return a
 * Promise, e.g. an entity name by id).
 *
 *     {module: ChipsField, name: 'tags', labelText: t('Tags')}
 *     {module: ChipsField, name: 'userIds', textInputToValue: async text => findUserId(text),
 *      chipRenderer: async id => (await client.get('User', [id], ['displayName']))[0]?.displayName}
 *
 * clickable: true opens the entity of a chip (chipEntity(value) → {entity, id}) in the module
 * that shows it (ModuleRegistry `routes`, as link chips); the remove button still removes.
 * AutocompleteChips gives chipEntity from its `entity`.
 */
class ChipsField extends Field {
    static config = {
        className: 'GO.form.field.ChipsField',
        ntype    : 'go-chipsfield',
        baseCls  : ['go-field', 'go-chipsfield'],
        /**
         * (value) => String | Promise<String>
         * @member {Function|null} chipRenderer=null
         */
        chipRenderer: null,
        /**
         * (value) => {entity, id} of a chip, null: none
         * @member {Function|null} chipEntity=null
         */
        chipEntity: null,
        /**
         * A click on a chip with an entity opens it
         * @member {Boolean} clickable=false
         */
        clickable: false,
        /**
         * Placeholder of the input
         * @member {String} placeholder=''
         */
        placeholder: '',
        /**
         * (text) => value | Promise<value>; null or '' rejects the text
         * @member {Function|null} textInputToValue=null
         */
        textInputToValue: null,
        /**
         * @member {Array} value=[]
         */
        value: []
    }

    /** Text in the input */
    inputText = ''
    /** bumped by reset() and value changes from outside: drops pending conversions */
    valueGeneration = 0
    /** JSON of a value → chip text */
    chipTexts = new Map()

    get inputNode() {
        // by id: subclasses add buttons after the input (AutocompleteChips, CreateLinkField)
        return this.boxNode.cn.find(node => node.id === this.id + '__input')
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {input  : me.onInput,    delegate: '.go-chips-input', scope: me},
            {keydown: me.onKeyDown,  delegate: '.go-chips-input', scope: me},
            {click  : me.onBoxClick, scope: me}
        ])
    }

    beforeSetValue(value) {
        return Array.isArray(value) ? [...value] : (value === null || value === undefined || value === '' ? [] : [value])
    }

    afterSetValue(value, oldValue) {
        super.afterSetValue(value, oldValue);
        this.resolveTexts()
    }

    getSubmitValue() {
        return [...(this.value || [])]
    }

    get isDirty() {
        return !Neo.isEqual(this.getSubmitValue(), this.originalConfig.value || [])
    }

    /**
     * @param {*} value
     * @returns {String}
     * @protected
     */
    static key(value) {
        return JSON.stringify(value)
    }

    /**
     * Fetches the texts of chips not shown yet (async chipRenderer)
     * @protected
     */
    async resolveTexts() {
        let me      = this,
            missing = (me.value || []).filter(v => !me.chipTexts.has(ChipsField.key(v)));

        if (!missing.length) {
            return
        }

        await Promise.all(missing.map(async v => {
            let text;

            try {
                text = me.chipRenderer ? await me.chipRenderer(v) : v
            } catch (e) {
                text = null
            }

            // the field may be destroyed meanwhile (its dialog saved and closed)
            me.isDestroyed || me.chipTexts.set(ChipsField.key(v), String(text ?? v))
        }));

        !me.isDestroyed && me.renderControl()
    }

    /**
     * @summary Hash of the entity a chip shows, when the field is clickable.
     * @param {*} value
     * @returns {String|null}
     * @protected
     */
    chipRoute(value) {
        const entity = this.clickable && this.chipEntity?.(value);

        return entity?.entity && entity.id != null ? resolveRoute(entity.entity, entity.id) : null
    }

    /**
     * @summary The chips (clickable ones marked go-chip-link) and the input.
     * @returns {Object[]} vdom
     */
    createControl() {
        let me       = this,
            editable = !me.readOnly && !me.disabled;

        return [
            ...(me.value || []).map((v, index) => ({
                cls : me.chipRoute(v) ? ['go-chip', 'go-chip-link'] : ['go-chip'],
                data: {index: String(index)},
                cn  : [
                    // a button opens a clickable chip from the keyboard too
                    me.chipRoute(v)
                        ? {tag: 'button', type: 'button', cls: ['go-chip-text'], text: me.chipTexts.get(ChipsField.key(v)) ?? '…'}
                        : {tag: 'span', cls: ['go-chip-text'], text: me.chipTexts.get(ChipsField.key(v)) ?? '…'},
                    editable && {tag: 'button', type: 'button', cls: ['go-chip-remove'], title: t('Remove'), cn: [{tag: 'i', cls: ['go-icon'], text: 'cancel'}]}
                ].filter(Boolean)
            })),
            {
                tag         : 'input',
                id          : me.id + '__input',
                type        : 'text',
                cls         : ['go-field-input', 'go-chips-input'],
                autocomplete: 'off',
                placeholder : me.value?.length ? '' : me.placeholder,
                value       : me.inputText,
                ...me.inputFlags()
            }
        ]
    }

    /**
     * @summary Removes a chip by its remove button, opens a clickable chip's entity, focuses
     * the input elsewhere.
     * @param {Object} data
     * @param {Object[]} data.path
     */
    onBoxClick({path}) {
        let me     = this,
            remove = path.find(node => node.cls?.includes('go-chip-remove')),
            chip   = path.find(node => node.cls?.includes('go-chip'));

        if (!remove && chip?.cls.includes('go-chip-link')) {
            const route = me.chipRoute(me.value?.[Number(chip.data?.index)]);

            route && Neo.Main.setRoute({value: route, windowId: me.windowId});
            return
        }

        if (remove && chip && !me.readOnly && !me.disabled) {
            const index = Number(chip.data?.index),
                  value = [...me.value];

            value.splice(index, 1);
            me.userChange(value);
            return
        }

        path.some(node => node.cls?.includes('go-field-box')) && !remove && me.focus(me.id + '__input')
    }

    onInput({value}) {
        let me = this;

        if (me.readOnly || me.disabled) {
            return
        }

        me.inputText = value ?? '';

        // keep the vdom and vnode in sync with the DOM, or a later render (clearing the input
        // after a separator or a pick) is no change
        me.syncInputValue(me.inputNode, me.inputText);

        // "," and ";" separate values (also when pasted)
        if (/[,;]/.test(me.inputText)) {
            const parts = me.inputText.split(/[,;]/);

            me.inputText = parts.pop();
            me.addTexts(parts)
        }
    }

    /**
     * Enter turns the typed text into a value: it never submits the form (form/submitOnEnter.mjs)
     * @returns {Boolean}
     */
    ownsEnterKey() {
        return true
    }

    onKeyDown({key}) {
        let me = this;

        if (me.readOnly || me.disabled) {
            return
        }

        if (key === 'Enter' || key === 'Tab') {
            if (me.inputText.trim()) {
                const text = me.inputText;

                me.inputText = '';
                me.addTexts([text])
            }
        } else if (key === 'Backspace' && !me.inputText && me.value?.length) {
            me.userChange(me.value.slice(0, -1))
        }
    }

    /**
     * Typed texts → values (textInputToValue)
     * @param {String[]} texts
     * @protected
     */
    async addTexts(texts) {
        let me         = this,
            generation = me.valueGeneration,
            values     = [];

        for (const text of texts.map(s => s.trim()).filter(Boolean)) {
            let value;

            try {
                value = me.textInputToValue ? await me.textInputToValue(text) : text
            } catch (e) {
                value = null
            }

            if (value !== null && value !== undefined && value !== '') {
                // the typed text is the chip text unless a renderer knows better
                me.chipRenderer || me.chipTexts.set(ChipsField.key(value), String(value));
                values.push(value)
            }
        }

        // destroyed, or reset / loaded with another value meanwhile
        if (me.isDestroyed || generation !== me.valueGeneration) {
            return
        }

        const current = me.value || [],
              added   = values.filter(v => !current.some(c => Neo.isEqual(c, v)));

        if (added.length) {
            me.userChange([...current, ...added])
        }

        // the input shows inputText (what is left after the separator)
        me.renderControl()
    }

    reset(value = []) {
        this.valueGeneration++;
        this.inputText = '';
        super.reset(value)
    }

    set(values, ...args) {
        // setValues() → set({value}): a value from outside replaces pending typed chips
        values && Object.hasOwn(values, 'value') && this.valueGeneration++;
        return super.set(values, ...args)
    }
}

export default Neo.setupClass(ChipsField);
