import Container from '../../node_modules/neo.mjs/src/container/Base.mjs';
import {escapeHtml} from '../Format.mjs';
import customFields, {matchesFilter} from './customFields.mjs';
import {conditionFieldNames, evaluateCondition, parseCondition} from './conditions.mjs';
import {createFormItem, getType} from './types.mjs';

/**
 * The fields of one custom field set in a form (GOUI customfields/FormFieldset.ts):
 * a legend, the description and the fields in `fieldSet.columns` columns.
 *
 * applyFilter(values) shows the fieldset only for entities matching its filter
 * (e.g. some note books); a hidden fieldset's fields are not required.
 * applyConditions() makes fields required or hidden by their relatedFieldCondition.
 *
 * Field sets whose parentFieldSetId is this set (a tab) are added below its fields
 * (ExtJS FormFieldSet), each with its own filter, conditions and read-only values.
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
        isCard: false,
        /**
         * Ids of the enclosing field sets, so a broken parent chain can't nest forever
         * @member {String[]} ancestorIds=[]
         */
        ancestorIds: []
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
            ancestors  = [...me.ancestorIds, String(fieldSet.id)],
            children   = getChildFieldSets(fieldSet).filter(fs => !ancestors.includes(String(fs.id))),
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

        children.forEach(child => items.push({
            module     : FormFieldset,
            cls        : ['go-cf-nested'],
            fieldSet   : child,
            ancestorIds: ancestors,
            flex       : 'none'
        }));

        me.items = items
    }

    /**
     * Field sets nested in this one (parentFieldSetId)
     * @returns {FormFieldset[]}
     */
    getChildFieldsets() {
        return this.items.filter(item => item instanceof FormFieldset)
    }

    /**
     * Form fields and read-only displays of this fieldset, without those of nested sets
     * @returns {Neo.component.Base[]}
     */
    getCustomFieldComponents() {
        const result = [],
              walk   = cmp => (cmp.items || []).forEach(item => {
                  item.goCustomField && result.push(item);
                  item.items && !(item instanceof FormFieldset) && walk(item)
              });

        walk(this);

        return result
    }

    /**
     * Shows or hides the fieldset for the entity values. Required fields of a hidden
     * fieldset stop being required (ExtJS disables them), and come back when shown.
     * @param {Object} values entity values
     * @param {Boolean} [parentVisible=true] false: the enclosing set is hidden
     * @returns {Boolean} visible
     */
    applyFilter(values, parentVisible = true) {
        let me      = this,
            visible = parentVisible && matchesFilter(me.fieldSet, values);

        if (visible !== me.filterVisible) {
            me.filterVisible = visible;
            me.isCard || (me.hidden = !visible);

            me.getCustomFieldComponents().forEach(cmp => me.syncField(cmp))
        }

        // a nested set has its own filter
        me.getChildFieldsets().forEach(child => child.applyFilter(values, visible));

        return visible
    }

    /**
     * Evaluates the fields' conditions (relatedFieldCondition): a conditionally
     * required field is required while its condition matches, a conditionally hidden
     * one hidden.
     * @param {Function} getValue field name → {value, texts}, see evaluateCondition()
     */
    applyConditions(getValue) {
        this.getChildFieldsets().forEach(child => child.applyConditions(getValue));

        this.getCustomFieldComponents().forEach(cmp => {
            const tree = conditionOf(cmp);

            if (tree === null) {
                return
            }

            const matches = evaluateCondition(tree, getValue);

            if (matches !== cmp.goConditionMatches) {
                cmp.goConditionMatches = matches;
                this.syncField(cmp)
            }
        })
    }

    /**
     * Sets `hidden` and `required` of a field from its definition, its condition and
     * the fieldset filter: a field that can't be seen is never required
     * @param {Neo.component.Base} cmp
     * @protected
     */
    syncField(cmp) {
        const field   = cmp.goCustomField,
              matches = !!cmp.goConditionMatches,
              hidden  = !!field.conditionallyHidden && matches;

        if (field.conditionallyHidden) {
            // a read-only display also stays hidden without a value (showReadOnlyValues())
            const hide = hidden || (!!cmp.goReadOnly && !cmp.html);

            cmp.hidden !== hide && (cmp.hidden = hide)
        }

        if ('required' in cmp) {
            const required = this.filterVisible && !hidden && (!!field.required || (!!field.conditionallyRequired && matches));

            cmp.required !== required && (cmp.required = required)
        }
    }

    /**
     * Names of the fields the conditions of this fieldset read
     * @returns {String[]}
     */
    getConditionFieldNames() {
        const names = new Set();

        this.getCustomFieldComponents().forEach(cmp => conditionFieldNames(conditionOf(cmp)).forEach(n => names.add(n)));
        this.getChildFieldsets().forEach(child => child.getConditionFieldNames().forEach(n => names.add(n)));

        return [...names]
    }

    /**
     * Fills the read-only displays (types without an editor)
     * @param {Object} customFieldValues the entity's customFields
     */
    async showReadOnlyValues(customFieldValues = {}) {
        await Promise.all(this.getChildFieldsets().map(child => child.showReadOnlyValues(customFieldValues)));

        for (const cmp of this.getCustomFieldComponents()) {
            if (cmp.goReadOnly) {
                const field = cmp.goCustomField,
                      html  = await getType(field).detailHtml(field, customFieldValues?.[field.databaseName]);

                if (!cmp.isDestroyed) {
                    cmp.html   = html ? `<label>${escapeHtml(field.name)}</label><div>${html}</div>` : '';
                    cmp.hidden = !html || (!!field.conditionallyHidden && !!cmp.goConditionMatches)
                }
            }
        }
    }
}

/**
 * Field sets of the same entity nested in a field set (ExtJS FormFieldSet)
 * @param {Object} fieldSet
 * @returns {Object[]}
 */
export function getChildFieldSets(fieldSet) {
    // eslint-disable-next-line eqeqeq
    return customFields.getFieldSets(fieldSet.entity).filter(fs => fs.parentFieldSetId && fs.parentFieldSetId == fieldSet.id)
}

/**
 * The parsed condition of a field that has an effect, cached on the component
 * @param {Neo.component.Base} cmp
 * @returns {Object|null} null without condition or when it doesn't parse
 */
function conditionOf(cmp) {
    if (cmp.goCondition === undefined) {
        const field = cmp.goCustomField;

        cmp.goCondition = null;

        if (field.relatedFieldCondition && (field.conditionallyRequired || field.conditionallyHidden)) {
            try {
                cmp.goCondition = parseCondition(field.relatedFieldCondition)
            } catch (e) {
                console.error(`Condition "${field.relatedFieldCondition}" of custom field ${field.databaseName}: ${e.message}`)
            }
        }
    }

    return cmp.goCondition
}

const FormFieldsetClass = Neo.setupClass(FormFieldset);

export default FormFieldsetClass;
