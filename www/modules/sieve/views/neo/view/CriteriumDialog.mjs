import NumberField      from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Number.mjs';
import TextField        from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import DateField        from '../../../../../views/neo/src/form/field/DateField.mjs';
import LocalCombo       from '../../../../../views/neo/src/form/field/LocalCombo.mjs';
import TextList         from '../../../../../views/neo/src/list/TextList.mjs';
import LegacyFormWindow from '../../../../../views/neo/src/view/LegacyFormWindow.mjs';
import {
    bodyOperators, centered, criteriumFields, dateOperators, field, headerOperators, sizeOperators, sizeUnits, t
} from '../util.mjs';

const KNOWN_HEADERS = ['Subject', 'From', 'To', 'X-Spam-Flag', 'List-Unsubscribe'];

/**
 * Which inputs a field choice shows (ExtJS CriteriumCreatorDialog._transForm)
 * @param {String|null} kind criteriumFields() id
 * @param {String|null} operator header operator
 * @returns {Object} reference → visible
 */
function visibleInputs(kind, operator) {
    const header = ['Subject', 'From', 'To', 'custom'].includes(kind),
          exists = operator === 'exists' || operator === 'notexists';

    return {
        customField   : kind === 'custom',
        operatorField : header,
        bodyOperator  : kind === 'body',
        valueField    : kind === 'body' || (header && !exists),
        sizeOperator  : kind === 'size',
        sizeField     : kind === 'size',
        sizeUnitField : kind === 'size',
        dateOperator  : kind === 'currentdate',
        dateField     : kind === 'currentdate'
    }
}

/**
 * One condition of a sieve rule (ExtJS GO.sieve.CriteriumCreatorDialog). Nothing is saved
 * on the server: `save` fires with the condition as the controller stores it
 * ({test, not, type, arg, arg1, arg2, part}).
 *
 *     const dialog = Neo.create(CriteriumDialog, {appName, windowId, criterium: {...} | null});
 *     dialog.on('save', ({data}) => …)
 */
class CriteriumDialog extends LegacyFormWindow {
    static config = {
        className   : 'GO.sieve.CriteriumDialog',
        cls         : ['go-form-window', 'go-sieve-criterium-dialog'],
        title       : t('Set criterium'),
        wrapperStyle: centered(520, 460),
        /**
         * The condition to edit, null for a new one
         * @member {Object|null} criterium=null
         */
        criterium: null
    }

    construct(config) {
        config.values = CriteriumDialog.toValues(config.criterium);
        super.construct(config)
    }

    /**
     * A stored condition → field values (ExtJS show())
     * @param {Object|null} c
     * @returns {Object}
     */
    static toValues(c) {
        const values = {kind: null, operator: 'contains', bodyOperator: 'contains', value: '', custom: '',
            sizeOperator: 'under', size: null, sizeUnit: 'K', dateOperator: 'is', date: null};

        if (!c) {
            return values
        }

        const not = !!c.not && c.not !== '0' && c.not !== 'false',
              operator = (type => {
                  switch (type) {
                      case 'contains': return not ? 'notcontains' : 'contains';
                      case 'matches':  return not ? 'notmatches' : 'matches';
                      case 'is':       return not ? 'notis' : 'is';
                      default:         return not ? 'notexists' : 'exists'
                  }
              })(c.type);

        switch (c.test) {
            case 'currentdate':
                return {...values, kind: 'currentdate', dateOperator: c.type || 'is', date: c.arg || null};

            case 'size': {
                const match = String(c.arg || '').match(/^(\d+)([KMG]?)$/i);
                return {...values, kind: 'size', sizeOperator: c.type || 'under',
                    size: match ? +match[1] : null, sizeUnit: match && match[2] ? match[2].toUpperCase() : 'B'}
            }

            case 'exists':
                return {...values, kind: KNOWN_HEADERS.includes(c.arg) ? c.arg : 'custom', custom: c.arg || '', operator};

            case 'header':
                return {...values, kind: KNOWN_HEADERS.includes(c.arg1) ? c.arg1 : 'custom', custom: c.arg1 || '', value: c.arg2 || '', operator};

            case 'body':
                return {...values, kind: 'body', value: c.arg || '', bodyOperator: operator};
        }

        return values
    }

    createFormItems() {
        let me    = this,
            combo = (name, label, data, config={}) => field(LocalCombo, name, label, {
                width       : null,
                displayField: 'name',
                valueField  : 'id',
                editable    : false,
                clearable   : false,
                listConfig  : {module: TextList},
                store       : {keyProperty: 'id', data},
                ...config
            });

        return [
            combo('kind', t('Field'), criteriumFields(), {required: true, placeholderText: t('Please make a selection')}),
            field(TextField, 'custom', t('Custom'), {reference: 'customField', hidden: true}),
            combo('operator', t('Operator'), headerOperators(), {reference: 'operatorField', hidden: true}),
            combo('bodyOperator', t('Operator'), bodyOperators(), {reference: 'bodyOperator', hidden: true}),
            combo('sizeOperator', t('Operator'), sizeOperators(), {reference: 'sizeOperator', hidden: true}),
            combo('dateOperator', t('Operator'), dateOperators(), {reference: 'dateOperator', hidden: true}),
            field(TextField, 'value', t('Value'), {reference: 'valueField', hidden: true}),
            {
                ntype    : 'container',
                layout   : {ntype: 'hbox', align: 'end'},
                cls      : ['go-sieve-size-row'],
                flex     : 'none',
                items    : [
                    field(NumberField, 'size', t('size'), {reference: 'sizeField', hidden: true, minValue: 0, stepSize: 1, flex: 1}),
                    combo('sizeUnit', '', sizeUnits(), {reference: 'sizeUnitField', hidden: true, flex: 'none', cls: ['go-sieve-size-unit']})
                ]
            },
            field(DateField, 'date', t('Current Date'), {reference: 'dateField', hidden: true})
        ]
    }

    async onConstructed() {
        await super.onConstructed();

        let me = this;

        me.form.on('fieldChange', ({component}) => {
            ['kind', 'operator'].includes(component?.name) && me.syncInputs()
        });

        await me.readyPromise;
        me.isDestroyed || me.syncInputs()
    }

    /**
     * Shows the inputs of the chosen field and operator; only visible inputs are required
     * @protected
     */
    async syncInputs() {
        let me       = this,
            kind     = (await me.form.getField('kind'))?.getSubmitValue(),
            operator = (await me.form.getField('operator'))?.getSubmitValue();

        if (me.isDestroyed) {
            return
        }

        Object.entries(visibleInputs(kind, operator)).forEach(([ref, visible]) => {
            const cmp = me.getReference(ref);

            if (cmp) {
                cmp.hidden = !visible;
                'required' in cmp && (cmp.required = visible && ref !== 'sizeUnitField')
            }
        })
    }

    /**
     * Field values → the stored condition (ExtJS _prepareValuesForStorage)
     */
    async save(modified, values) {
        const kind     = values.kind,
              operator = values.operator || 'contains',
              not      = ['notexists', 'notcontains', 'notis', 'notmatches'].includes(operator),
              type     = operator.replace(/^not/, ''),
              base     = {test: '', not: false, type: '', arg: '', arg1: '', arg2: '', part: ''};

        let c;

        switch (kind) {
            case 'size':
                c = {...base, test: 'size', type: values.sizeOperator || 'under',
                    arg: String(values.size ?? 0) + (values.sizeUnit && values.sizeUnit !== 'B' ? values.sizeUnit : '')};
                break;

            case 'currentdate':
                c = {...base, test: 'currentdate', type: values.dateOperator || 'is', arg: values.date || '', part: 'date'};
                break;

            case 'body': {
                const bodyOp = values.bodyOperator || 'contains';
                c = {...base, test: 'body', not: bodyOp.startsWith('not'), type: bodyOp.includes('contains') ? 'contains' : 'matches', arg: values.value};
                break;
            }

            case 'X-Spam-Flag':
                // ExtJS: the (hidden) operator stays "contains"
                c = {...base, test: 'header', type: 'contains', arg1: 'X-Spam-Flag', arg2: 'YES'};
                break;

            case 'List-Unsubscribe':
                c = {...base, test: 'exists', arg: 'List-Unsubscribe'};
                break;

            default: {
                const header = kind === 'custom' ? String(values.custom || '').trim() : kind;

                // the controller allows letters, digits, "_" and "-" in a header name
                if (!/^[a-z0-9_-]+$/i.test(header)) {
                    throw new Error(t('The filter contains an invalid value') + ': ' + header)
                }

                c = type === 'exists'
                    ? {...base, test: 'exists', not, arg: header}
                    : {...base, test: 'header', not, type, arg1: header, arg2: values.value}
            }
        }

        return c
    }
}

export default Neo.setupClass(CriteriumDialog);
