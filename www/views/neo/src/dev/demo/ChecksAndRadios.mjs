import BoolCheckBox  from '../../form/field/BoolCheckBox.mjs';
import CheckboxGroup from '../../form/field/CheckboxGroup.mjs';
import Radio         from '../../../node_modules/neo.mjs/src/form/field/Radio.mjs';
import Switch        from '../../../node_modules/neo.mjs/src/form/field/Switch.mjs';
import FormDemo      from './FormDemo.mjs';
import {t}           from '../../Translate.mjs';

/**
 * Radio group: one neo Radio per option with the same name; the form value is the
 * value of the checked one
 * @param {String} name
 * @param {String} label
 * @param {Array[]} options [value, text]
 * @param {Boolean} [vertical=false] options below each other
 * @returns {Object}
 */
function radios(name, label, options, vertical = false) {
    return {
        ntype : 'container',
        layout: {ntype: 'vbox', align: 'start'},
        items : [{ntype: 'component', tag: 'label', style: {fontSize: '1.2rem', opacity: .7}, text: label}, {
            ntype : 'container',
            layout: {ntype: vertical ? 'vbox' : 'hbox', align: 'start'},
            style : {gap: '4px 24px'},
            items : options.map(([value, text], i) => ({
                module    : Radio,
                name,
                value,
                checked   : i === 0,
                hideLabel : true,
                valueLabel: text
            }))
        }]
    }
}

/**
 * Dev demo: GOUI Checks and Radios (goui-docs form/ChecksAndRadios.ts):
 * GO.form.field.BoolCheckBox (value true / false), neo's Switch, GO.form.field.CheckboxGroup
 * (toggle buttons, a field per option) and radio groups of neo Radio fields.
 */
class ChecksAndRadios extends FormDemo {
    static config = {
        className: 'GO.dev.demo.ChecksAndRadios',
        intro    : `<p>${t('You can add checkboxes, radio buttons and switches, and group them. BoolCheckBox is the GO checkbox: its value is true or false, also after setValues() / reset().')}</p>`,
        fields   : [{
            module    : BoolCheckBox,
            name      : 'checkbox',
            valueLabel: t('A checkbox label comes after')
        }, {
            module    : BoolCheckBox,
            name      : 'cbAgree',
            required  : true,
            valueLabel: t('Agree to the terms (required)')
        }, {
            module        : Switch,
            name          : 'cbSwitch',
            hideLabel     : true,
            uncheckedValue: false,
            value         : true,
            valueLabel    : t('Checkbox type switch')
        }, {
            module : CheckboxGroup,
            label  : t('Group'),
            options: [
                {name: 'option1', label: t('Checkbox 1'), checked: true},
                {name: 'option2', label: t('Checkbox 2')},
                {name: 'option3', label: t('Checkbox 3')}
            ]
        },
        radios('radioBox', t('Radio group'), [['option1', t('Option 1')], ['option2', t('Option 2')], ['option3', t('Option 3')]]),
        radios('radioStacked', t('Radio group, stacked vertically'), [[1, t('Option 1')], [2, t('Option 2')], [3, t('Option 3')]], true)
        ],
        sample: {
            checkbox: true, cbAgree: true, cbSwitch: true,
            option1: true, option2: true, option3: false,
            radioBox: 'option2', radioStacked: 3
        }
    }
}

export default Neo.setupClass(ChecksAndRadios);
