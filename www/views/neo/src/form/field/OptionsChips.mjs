import AutocompleteChips from './AutocompleteChips.mjs';

/**
 * AutocompleteChips over fixed options instead of a JMAP entity: the value is an array of
 * option values shown as chips with their texts. The ▾ button lists the options matching
 * the typed text; Enter adds the first match.
 *
 *     {module: OptionsChips, options: [{value: true, text: t('Yes')}, {value: false, text: t('No')}]}
 */
class OptionsChips extends AutocompleteChips {
    static config = {
        className   : 'GO.form.field.OptionsChips',
        ntype       : 'go-optionschips',
        displayField: 'text',
        /**
         * @member {Object[]} options=[] {value, text}
         */
        options: []
    }

    construct(config) {
        // the option's text, not an Entity/get
        config = {chipRenderer: value => this.findOption(value)?.text ?? String(value), ...config};
        super.construct(config)
    }

    /**
     * @param {*} value
     * @returns {Object|undefined} the option of a value, compared as strings like the chips
     */
    findOption(value) {
        return this.options.find(o => this.valueKey(o.value) === this.valueKey(value))
    }

    /**
     * Options whose text contains the typed text
     * @param {String} text
     * @param {Number} limit
     * @returns {Promise<Object[]>}
     * @protected
     */
    async query(text, limit) {
        const lower = String(text || '').toLowerCase();

        return this.options
            .filter(o => !lower || String(o.text).toLowerCase().includes(lower))
            .slice(0, limit)
            .map(o => ({id: o.value, text: o.text}))
    }
}

export default Neo.setupClass(OptionsChips);
