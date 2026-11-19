import CheckboxGroup from '../../form/field/CheckboxGroup.mjs';
import FormDemo      from './FormDemo.mjs';

/**
 * Dev demo: GOUI CheckboxGroup (form/ChecksAndRadios) — weekdays as toggle buttons, every
 * day a field of its own.
 */
class CheckboxGroupDemo extends FormDemo {
    static config = {
        className: 'GO.dev.demo.CheckboxGroup',
        intro    : '<p>A legend above checkboxes that look like toggle buttons. Each option is a field: getValues() lists every name.</p>',
        fields   : [{
            module : CheckboxGroup,
            label  : 'Working days',
            options: [
                {name: 'mo', label: 'Mon'}, {name: 'tu', label: 'Tue'}, {name: 'we', label: 'Wed'},
                {name: 'th', label: 'Thu'}, {name: 'fr', label: 'Fri'}, {name: 'sa', label: 'Sat'},
                {name: 'su', label: 'Sun', disabled: true}
            ]
        }],
        sample: {mo: true, tu: true, we: false, th: true, fr: true, sa: false, su: false}
    }
}

export default Neo.setupClass(CheckboxGroupDemo);
