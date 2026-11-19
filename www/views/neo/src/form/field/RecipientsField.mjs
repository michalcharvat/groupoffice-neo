import ChipsField from './ChipsField.mjs';
import client     from '../../jmap/Client.mjs';
import {t}        from '../../Translate.mjs';

/** "user@example.com" */
const EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

/** ms after the last key before suggestions are looked up */
const SUGGEST_DELAY = 250;

/**
 * E-mail recipients as chips (GOUI goui-docs RecipientsField, an AutocompleteChips): typing
 * suggests users and contacts (Principal) with an e-mail address; arrow keys and Enter or a
 * click pick one. Typed addresses ("john@example.com", "John Doe <john@example.com>") become
 * chips on Enter, "," or ";". The trigger button opens GO.view.RecipientPicker.
 *
 * Value: [{name, email}]. A chip that is no valid address is shown in red and makes the field invalid.
 *
 *     {module: RecipientsField, name: 'to', labelText: t('To')}
 */
class RecipientsField extends ChipsField {
    static config = {
        className: 'GO.form.field.RecipientsField',
        ntype    : 'go-recipientsfield',
        baseCls  : ['go-field', 'go-chipsfield', 'go-recipientsfield'],
        /**
         * Suggestions while typing
         * @member {Number} limit=10
         */
        limit: 10,
        /**
         * Show the button that opens GO.view.RecipientPicker
         * @member {Boolean} picker=true
         */
        picker: true
    }

    /** suggestions {name, email, entity} shown below the input */
    suggestions = []
    /** highlighted suggestion */
    active = -1
    /** bumped per lookup: only the latest answer shows */
    suggestGeneration = 0

    /**
     * The input is not the last control node: the picker button and the suggestions follow it
     * @returns {Object}
     */
    get inputNode() {
        return this.boxNode.cn.find(node => node.id === this.id + '__input')
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.chipRenderer = v => v?.name ? v.name : (v?.email ?? '');
        me.textInputToValue = text => RecipientsField.parse(text);

        me.addDomListeners([
            {focusout: me.onFocusOut, scope: me}
        ])
    }

    destroy(...args) {
        clearTimeout(this.suggestTimer);
        super.destroy(...args)
    }

    /**
     * "John Doe <john@example.com>", "<john@example.com>" or "john@example.com" → {name, email}
     * @param {String} text
     * @returns {Object|null} null for empty text
     */
    static parse(text) {
        const value = String(text ?? '').trim();

        if (!value) {
            return null
        }

        const match = /^(.*?)\s*<([^<>]+)>$/.exec(value);

        if (match) {
            return {name: match[1].replace(/^"(.*)"$/, '$1').trim(), email: match[2].trim()}
        }

        return {name: '', email: value}
    }

    /**
     * @param {Object} recipient
     * @returns {Boolean}
     */
    static isValidRecipient(recipient) {
        return EMAIL.test(recipient?.email || '')
    }

    beforeSetValue(value) {
        // plain addresses from outside (e.g. "a@example.com") become {name, email}
        return super.beforeSetValue(value).map(v => typeof v === 'string' ? RecipientsField.parse(v) : v).filter(Boolean)
    }

    /**
     * Compare key: the address, case-insensitive
     * @param {Object} v
     * @returns {String}
     */
    static emailKey(v) {
        return String(v?.email || '').toLowerCase()
    }

    getError() {
        const error = super.getError();

        if (error) {
            return error
        }

        const invalid = (this.value || []).find(v => !RecipientsField.isValidRecipient(v));

        return invalid ? t('Please enter a valid e-mail address') + ': ' + (invalid.email || '') : null
    }

    createControl() {
        let me       = this,
            control  = super.createControl(),
            values   = me.value || [],
            editable = !me.readOnly && !me.disabled;

        // chips: the address as tooltip, invalid ones marked
        values.forEach((v, index) => {
            const chip = control[index];

            if (chip) {
                chip.title = v.name ? `${v.name} <${v.email}>` : v.email;
                RecipientsField.isValidRecipient(v) || chip.cls.push('go-chip-invalid')
            }
        });

        // aria for the suggestion list
        const input = control.find(node => node.id === me.id + '__input');

        Object.assign(input, {
            role                   : 'combobox',
            'aria-autocomplete'    : 'list',
            'aria-expanded'        : String(me.suggestions.length > 0),
            'aria-controls'        : me.id + '__suggestions',
            'aria-activedescendant': me.active > -1 ? me.id + '__suggestion_' + me.active : null
        });

        if (editable && me.picker) {
            control.push({
                tag  : 'button',
                type : 'button',
                cls  : ['go-chips-trigger', 'go-recipients-picker-btn'],
                title: t('Select people'),
                cn   : [{tag: 'i', cls: ['go-icon'], text: 'person_add'}]
            })
        }

        if (me.suggestions.length) {
            control.push({
                tag : 'ul',
                id  : me.id + '__suggestions',
                cls : ['go-recipients-suggestions'],
                role: 'listbox',
                cn  : me.suggestions.map((s, i) => ({
                    tag            : 'li',
                    id             : me.id + '__suggestion_' + i,
                    role           : 'option',
                    cls            : i === me.active ? ['active'] : [],
                    'aria-selected': String(i === me.active),
                    'data-index'   : String(i),
                    cn             : [
                        {tag: 'i', cls: ['go-icon'], text: s.entity === 'User' ? 'person' : 'contact_mail'},
                        {tag: 'span', cn: [{tag: 'b', text: s.name || s.email}, s.name ? {tag: 'small', text: s.email} : null].filter(Boolean)}
                    ]
                }))
            })
        }

        return control
    }

    onBoxClick(data) {
        let me = this,
            li = data.path.find(n => n.id?.startsWith(me.id + '__suggestion_'));

        if (data.path.some(node => node.cls?.includes('go-recipients-picker-btn'))) {
            me.openPicker();
            return
        }

        if (li) {
            me.pick(Number(li.id.slice((me.id + '__suggestion_').length)));
            return
        }

        super.onBoxClick(data)
    }

    onInput(data) {
        let me = this;

        super.onInput(data);

        clearTimeout(me.suggestTimer);
        me.suggestTimer = setTimeout(() => me.loadSuggestions(), SUGGEST_DELAY)
    }

    onKeyDown(data) {
        let me    = this,
            count = me.suggestions.length;

        if (count) {
            switch (data.key) {
                case 'ArrowDown':
                case 'ArrowUp':
                    me.active = (me.active + (data.key === 'ArrowDown' ? 1 : -1) + count) % count;
                    me.renderControl();
                    return;
                case 'Enter':
                case 'Tab':
                    if (me.active > -1) {
                        me.pick(me.active);
                        return
                    }
                    break;
                case 'Escape':
                    me.closeSuggestions();
                    return
            }
        }

        super.onKeyDown(data)
    }

    onFocusOut() {
        // a click on a suggestion comes after the focus left the input
        setTimeout(() => this.isDestroyed || this.closeSuggestions(), 200)
    }

    closeSuggestions() {
        let me = this;

        me.suggestGeneration++;

        if (me.suggestions.length) {
            me.suggestions = [];
            me.active = -1;
            me.renderControl()
        }
    }

    /**
     * Users and contacts matching the typed text
     * @param {String} text
     * @returns {Promise<Object[]>} [{name, email, entity}]
     */
    async suggest(text) {
        const {list} = await client.queryGet('Principal', {
            filter    : {text, type: 'individual', preferUser: true},
            limit     : this.limit,
            // no "entity": Principal/get answers an unknown property with all ids notFound
            properties: ['id', 'name', 'email']
        });

        const seen = new Set();

        // users first (preferUser): a user's own contact with the same address is left out
        return list.filter(p => {
            const key = String(p.email || '').toLowerCase();
            return key && !seen.has(key) && seen.add(key)
        }).map(p => ({
            name  : p.name || '',
            email : p.email,
            // user ids are numbers, other principals "Contact:12"
            entity: /^\d+$/.test(String(p.id)) ? 'User' : String(p.id).split(':')[0]
        }))
    }

    async loadSuggestions() {
        let me         = this,
            text       = me.inputText.trim(),
            generation = ++me.suggestGeneration;

        if (!text || me.readOnly || me.disabled) {
            me.closeSuggestions();
            return
        }

        let list;

        try {
            list = await me.suggest(text)
        } catch (e) {
            console.error('RecipientsField', e);
            return
        }

        if (me.isDestroyed || generation !== me.suggestGeneration || text !== me.inputText.trim()) {
            return
        }

        const chosen = new Set((me.value || []).map(RecipientsField.emailKey));

        me.suggestions = list.filter(s => !chosen.has(RecipientsField.emailKey(s)));
        me.active      = me.suggestions.length ? 0 : -1;
        me.renderControl()
    }

    /**
     * @param {Number} index of a suggestion
     */
    pick(index) {
        let me = this,
            s  = me.suggestions[index];

        if (!s) {
            return
        }

        me.inputText   = '';
        me.suggestions = [];
        me.active      = -1;
        me.suggestGeneration++;
        me.addRecipients([{name: s.name, email: s.email}]);
        me.renderControl();
        me.focus(me.id + '__input')
    }

    /**
     * Adds recipients that are not in the field yet (same address)
     * @param {Object[]} recipients [{name, email}]
     */
    addRecipients(recipients) {
        let me      = this,
            current = me.value || [],
            keys    = new Set(current.map(RecipientsField.emailKey)),
            added   = [];

        recipients.forEach(r => {
            const key = RecipientsField.emailKey(r);

            if (key && !keys.has(key)) {
                keys.add(key);
                added.push({name: r.name || '', email: r.email})
            }
        });

        added.length && me.userChange([...current, ...added])
    }

    async addTexts(texts) {
        // a typed address that is already a chip is not added twice
        let me   = this,
            keys = new Set((me.value || []).map(RecipientsField.emailKey));

        me.closeSuggestions();

        return super.addTexts(texts.filter(text => {
            const key = RecipientsField.emailKey(RecipientsField.parse(text));
            return key && !keys.has(key) && keys.add(key)
        }))
    }

    /**
     * GO.view.RecipientPicker; people without an e-mail address are skipped
     */
    async openPicker() {
        let me = this;

        me.closeSuggestions();

        const {default: RecipientPicker} = await import('../../view/RecipientPicker.mjs');

        if (me.isDestroyed) {
            return
        }

        Neo.create(RecipientPicker, {
            appName  : me.appName,
            windowId : me.windowId,
            listeners: {
                select: ({recipients}) => me.isDestroyed || me.addRecipients(recipients.filter(r => r.email))
            }
        })
    }
}

export default Neo.setupClass(RecipientsField);
