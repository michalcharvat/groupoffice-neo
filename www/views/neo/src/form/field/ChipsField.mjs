import Field from './Field.mjs';
import {t}   from '../../Translate.mjs';

/**
 * GOUI ChipsField: values as chips with a remove button, typed text becomes a chip
 * on Enter, "," or ";". Backspace in the empty input removes the last chip.
 *
 * Value: an array. textInputToValue(text) turns typed text into a value (may return a
 * Promise; null/'' rejects it), chipRenderer(value) gives a chip's text (may return a
 * Promise, e.g. an entity name by id).
 *
 *     {module: ChipsField, name: 'tags', labelText: t('Tags')}
 *     {module: ChipsField, name: 'userIds', textInputToValue: async text => findUserId(text),
 *      chipRenderer: async id => (await client.get('User', [id], ['displayName']))[0]?.displayName}
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
        return this.boxNode.cn[this.boxNode.cn.length - 1]
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

            me.chipTexts.set(ChipsField.key(v), String(text ?? v))
        }));

        !me.isDestroyed && me.renderControl()
    }

    createControl() {
        let me       = this,
            editable = !me.readOnly && !me.disabled;

        return [
            ...(me.value || []).map((v, index) => ({
                cls : ['go-chip'],
                data: {index: String(index)},
                cn  : [
                    {tag: 'span', cls: ['go-chip-text'], text: me.chipTexts.get(ChipsField.key(v)) ?? '…'},
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

    onBoxClick({path}) {
        let me     = this,
            remove = path.find(node => node.cls?.includes('go-chip-remove')),
            chip   = remove && path.find(node => node.cls?.includes('go-chip'));

        if (chip && !me.readOnly && !me.disabled) {
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

        // "," and ";" separate values (also when pasted)
        if (/[,;]/.test(me.inputText)) {
            const parts = me.inputText.split(/[,;]/);

            me.inputText = parts.pop();
            me.addTexts(parts);
            return
        }

        // keep the vnode in sync, or clearing the input later is no change
        me.inputNode.value = me.inputText;
        me.update()
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
