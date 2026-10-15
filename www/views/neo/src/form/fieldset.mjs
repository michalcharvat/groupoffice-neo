/**
 * A titled group of form items (GOUI fieldset({legend}), ExtJS FieldSet) as a plain
 * container config: legend, then the items stacked.
 *
 *     fieldset(t('Password'), [{module: PasswordField, name: 'password'}], {reference: 'passwordSet'})
 *
 * @param {String} legend
 * @param {Object[]} items
 * @param {Object} [config] extra container config
 * @returns {Object}
 */
export function fieldset(legend, items, config = {}) {
    return {
        ntype : 'container',
        cls   : ['go-fieldset'],
        layout: {ntype: 'vbox', align: 'stretch'},
        flex  : 'none',
        ...config,
        items : [{ntype: 'component', tag: 'h3', cls: ['go-fieldset-legend'], text: legend}, ...items]
    }
}
