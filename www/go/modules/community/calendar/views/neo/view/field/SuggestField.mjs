import Field from '../../../../../../../../views/neo/src/form/field/Field.mjs';

/**
 * A field with a text input and suggestions below it while typing (GOUI AutocompleteField).
 * Subclasses implement:
 * - suggest(text): Promise<[{text, sub?, icon?, color?, data}]>
 * - onPick(item): a suggestion was chosen
 * - onFreeText(text): Enter without a suggestion (return true to clear the input)
 * - createValueNodes(): vdom shown above the input (rows, chips)
 */
class SuggestField extends Field {
    static config = {
        className  : 'GO.calendar.field.SuggestField',
        baseCls    : ['go-field', 'go-cal-suggest'],
        /** @member {String} placeholder='' */
        placeholder: '',
        /** @member {Boolean} multiline=false a textarea instead of an input */
        multiline  : false
    }

    /** @member {String} inputText */
    inputText = ''
    /** @member {Object[]} suggestions */
    suggestions = []
    /** @member {Number} active highlighted suggestion */
    active = -1

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {input   : me.onInput,      delegate: '.go-cal-suggest-input', scope: me},
            {keydown : me.onKeyDown,    delegate: '.go-cal-suggest-input', scope: me},
            {focusout: me.onFocusOut,   scope: me},
            {click   : me.onFieldClick, scope: me}
        ])
    }

    destroy(...args) {
        clearTimeout(this.suggestTimer);
        super.destroy(...args)
    }

    get inputId() {
        return this.id + '__input'
    }

    /**
     * @returns {Object[]} vdom above the input
     */
    createValueNodes() {
        return []
    }

    createControl() {
        let me = this;

        return [
            ...me.createValueNodes(),
            {
                tag         : me.multiline ? 'textarea' : 'input',
                id          : me.inputId,
                cls         : ['go-field-input', 'go-cal-suggest-input'],
                placeholder : me.placeholder || null,
                autocomplete: 'off',
                rows        : me.multiline ? 1 : null,
                value       : me.inputText,
                ...me.inputFlags()
            },
            me.suggestions.length ? {
                tag: 'ul',
                cls: ['go-cal-suggestions'],
                cn : me.suggestions.map((s, i) => ({
                    tag         : 'li',
                    cls         : i === me.active ? ['active'] : [],
                    'data-index': String(i),
                    cn          : [
                        s.icon ? {tag: 'i', cls: ['go-icon'], style: s.color ? {color: '#' + s.color} : {}, text: s.icon} : null,
                        {tag: 'span', cn: [{tag: 'b', text: s.text}, s.sub ? {tag: 'small', text: s.sub} : null].filter(Boolean)}
                    ].filter(Boolean)
                }))
            } : null
        ].filter(Boolean)
    }

    onInput(data) {
        let me = this;

        me.inputText = data.value || '';
        clearTimeout(me.suggestTimer);
        me.suggestTimer = setTimeout(() => me.loadSuggestions(), 250)
    }

    async loadSuggestions() {
        let me   = this,
            text = me.inputText.trim();

        if (!text) {
            me.closeSuggestions();
            return
        }

        try {
            const list = await me.suggest(text);

            if (!me.isDestroyed && text === me.inputText.trim()) {
                me.suggestions = list.slice(0, 20);
                me.active = me.suggestions.length ? 0 : -1;
                me.renderControl()
            }
        } catch (e) {
            console.error(e)
        }
    }

    closeSuggestions() {
        if (this.suggestions.length) {
            this.suggestions = [];
            this.active = -1;
            this.renderControl()
        }
    }

    async suggest(text) {
        return []
    }

    onPick(item) {
    }

    onFreeText(text) {
        return false
    }

    pick(index) {
        let me   = this,
            item = me.suggestions[index];

        if (!item) {
            return
        }

        me.inputText = '';
        me.suggestions = [];
        me.active = -1;
        me.onPick(item);
        me.renderControl()
    }

    onKeyDown(data) {
        let me = this;

        switch (data.key) {
            case 'ArrowDown':
            case 'ArrowUp':
                if (me.suggestions.length) {
                    me.active = (me.active + (data.key === 'ArrowDown' ? 1 : -1) + me.suggestions.length) % me.suggestions.length;
                    me.renderControl()
                }
                break;
            case 'Enter':
                if (me.multiline && !me.suggestions.length) {
                    return
                }

                if (me.active > -1) {
                    me.pick(me.active)
                } else if (me.inputText.trim() && me.onFreeText(me.inputText.trim())) {
                    me.inputText = '';
                    me.renderControl()
                }
                break;
            case 'Escape':
                me.closeSuggestions();
                break
        }
    }

    onFieldClick(data) {
        const li = data.path.find(n => n.data?.index !== undefined);
        li && this.pick(Number(li.data.index))
    }

    onFocusOut() {
        // the click on a suggestion comes after the focus left the input
        setTimeout(() => this.isDestroyed || this.closeSuggestions(), 200)
    }
}

export default Neo.setupClass(SuggestField);
