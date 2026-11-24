import NeoNumberField from '../../../node_modules/neo.mjs/src/form/field/Number.mjs';
import RangeField     from '../../../node_modules/neo.mjs/src/form/field/Range.mjs';
import FormDemo, {option, optionRow} from './FormDemo.mjs';
import {t}            from '../../Translate.mjs';

/**
 * Applies a config to the demo's number field and validates it again
 * @param {GO.dev.demo.FormDemo} demo
 * @param {Object} config
 */
function setNumber(demo, config) {
    const field = demo?.getReference('number');

    // the controls fire change while they are created, before they are in the demo
    if (!field) {
        return
    }

    field.set(config);
    field.validate?.(false)
}

/**
 * Dev demo: GOUI NumberField (goui-docs form/NumberFieldPage.ts) with neo's Number and
 * Range fields in the GO look: min / max, step size, states toggled live.
 */
class NumberFieldDemo extends FormDemo {
    static config = {
        className: 'GO.dev.demo.NumberField',
        intro    : `<p>${t('For numeric input there is a number field and a range field. The number field allows -10000 to 10000 in steps of 0.01.')}</p>`,
        fields   : [{
            module       : NeoNumberField,
            reference    : 'number',
            name         : 'number',
            labelText    : t('Number'),
            labelPosition: 'inline',
            minValue     : -10000,
            maxValue     : 10000,
            stepSize     : 0.01,
            value        : 6003.35
        }, {
            module   : RangeField,
            name     : 'range',
            labelText: t('Range'),
            minValue : 0,
            maxValue : 100,
            stepSize : 1,
            value    : 30
        }],
        sample: {number: 42, range: 75},
        extra : [
            optionRow([
                option(t('Disabled'), (demo, checked) => setNumber(demo, {disabled: checked})),
                option(t('Read only'), (demo, checked) => setNumber(demo, {readOnly: checked})),
                option(t('Required'), (demo, checked) => setNumber(demo, {required: checked})),
                option(t('Clear button'), (demo, checked) => setNumber(demo, {clearable: checked}), {checked: true}),
                option(t('Spin buttons'), (demo, checked) => setNumber(demo, {useSpinButtons: checked}), {checked: true})
            ]),
            optionRow([{
                module       : NeoNumberField,
                labelText    : t('Step size'),
                labelPosition: 'inline',
                width        : 160,
                minValue     : 0.01,
                stepSize     : 0.01,
                value        : 0.01,
                listeners    : {change: ({component, value}) => setNumber(component.up({className: 'GO.dev.demo.NumberField'}), {stepSize: value || 1})}
            }])
        ]
    }
}

export default Neo.setupClass(NumberFieldDemo);
