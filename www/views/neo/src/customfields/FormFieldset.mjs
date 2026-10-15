import Container from '../../node_modules/neo.mjs/src/container/Base.mjs';
import {escapeHtml} from '../Format.mjs';
import customFields, {matchesFilter} from './customFields.mjs';
import {createFormItem, getType} from './types.mjs';

/**
 * The fields of one custom field set in a form (GOUI customfields/FormFieldset.ts):
 * a legend, the description and the fields in `fieldSet.columns` columns.
 *
 * applyFilter(values) shows the fieldset only for entities matching its filter
 * (e.g. some note books); a hidden fieldset's fields are not required.
 */
class FormFieldset extends Container {
    static config = {
        className: 'GO.customfields.FormFieldset',
        baseCls  : ['go-cf-fieldset', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * GO FieldSet entity
         * @member {Object|null} fieldSet=null
         */
        fieldSet: null,
        /**
         * No legend: the fieldset is a card of its own with the name as tab title
         * @member {Boolean} isCard=false
         */
        isCard: false
    }

    /**
     * Filter result: false hides the fieldset
     * @member {Boolean} filterVisible=true
     */
    filterVisible = true

    construct(config) {
        super.construct(config);

        let me         = this,
            {fieldSet} = me,
            columns    = Math.max(1, Math.min(4, Number(fieldSet.columns) || 1)),
            fields     = customFields.getFields(fieldSet).map(createFormItem).filter(Boolean),
            items      = [];

        me.isCard || items.push({ntype: 'component', tag: 'h4', cls: ['go-cf-legend'], flex: 'none', text: fieldSet.name});

        fieldSet.description && items.push({
            ntype: 'component',
            cls  : ['go-cf-description'],
            flex : 'none',
            html : escapeHtml(fieldSet.description).replace(/\n/g, '<br>')
        });

        if (columns === 1) {
            items.push({
                ntype : 'container',
                cls   : ['go-cf-fields'],
                flex  : 'none',
                layout: {ntype: 'vbox', align: 'stretch'},
                items : fields
            })
        } else {
            // GOUI addInColumns(): the first column takes the remainder
            const perColumn = Math.floor(fields.length / columns),
                  first     = perColumn + fields.length % columns,
                  rest      = [...fields];

            items.push({
                ntype : 'container',
                cls   : ['go-cf-fields', 'go-cf-columns'],
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'start'},
                items : Array.from({length: columns}, (v, i) => ({
                    ntype : 'container',
                    cls   : ['go-cf-column'],
                    flex  : 1,
                    layout: {ntype: 'vbox', align: 'stretch'},
                    items : rest.splice(0, i === 0 ? first : perColumn)
                }))
            })
        }

        me.items = items
    }

    /**
     * Form fields and read-only displays of this fieldset
     * @returns {Neo.component.Base[]}
     */
    getCustomFieldComponents() {
        const result = [],
              walk   = cmp => (cmp.items || []).forEach(item => {
                  item.goCustomField && result.push(item);
                  item.items && walk(item)
              });

        walk(this);

        return result
    }

    /**
     * Shows or hides the fieldset for the entity values. Required fields of a hidden
     * fieldset stop being required (ExtJS disables them), and come back when shown.
     * @param {Object} values entity values
     * @returns {Boolean} visible
     */
    applyFilter(values) {
        let me      = this,
            visible = matchesFilter(me.fieldSet, values);

        if (visible === me.filterVisible) {
            return visible
        }

        me.filterVisible = visible;
        me.isCard || (me.hidden = !visible);

        me.getCustomFieldComponents().forEach(cmp => {
            if (!('required' in cmp)) {
                return
            }

            if (!visible) {
                cmp.goWasRequired = cmp.required;
                cmp.required      = false
            } else if (cmp.goWasRequired !== undefined) {
                cmp.required = cmp.goWasRequired;
                delete cmp.goWasRequired
            }
        });

        return visible
    }

    /**
     * Fills the read-only displays (types without an editor)
     * @param {Object} customFieldValues the entity's customFields
     */
    async showReadOnlyValues(customFieldValues = {}) {
        for (const cmp of this.getCustomFieldComponents()) {
            if (cmp.goReadOnly) {
                const field = cmp.goCustomField,
                      html  = await getType(field).detailHtml(field, customFieldValues?.[field.databaseName]);

                if (!cmp.isDestroyed) {
                    cmp.html   = html ? `<label>${escapeHtml(field.name)}</label><div>${html}</div>` : '';
                    cmp.hidden = !html
                }
            }
        }
    }
}

export default Neo.setupClass(FormFieldset);
