import DateField       from '../../form/field/DateField.mjs';
import FormDemo        from './FormDemo.mjs';
import RecurrenceField from '../../form/field/RecurrenceField.mjs';

/**
 * Dev demo: groupoffice-core RecurrenceField — presets for the start date, "Customize..."
 * dialog; changing the start date updates the presets and the text.
 */
class RecurrenceDemo extends FormDemo {
    static config = {
        className: 'GO.dev.demo.Recurrence',
        intro    : '<p>Value: a JMAP RecurrenceRule. The presets follow the start date (setStartDate()).</p>',
        fields   : [{
            module       : DateField,
            name         : 'start',
            reference    : 'start',
            labelText    : 'Start',
            labelPosition: 'inline',
            value        : '2026-10-16'
        }, {
            module   : RecurrenceField,
            name     : 'recurrenceRule',
            reference: 'rule',
            labelText: 'Repeat',
            startDate: '2026-10-16'
        }],
        sample: {
            start         : '2026-10-30',
            recurrenceRule: {frequency: 'monthly', interval: 2, byDay: [{day: 'fr', nthOfPeriod: -1}], count: 6}
        }
    }

    onConstructed() {
        super.onConstructed();

        let form = this.getReference('form');

        // GO calendar: the rule follows the event start
        form.on('fieldChange', ({component, value}) => {
            component.name === 'start' && value && this.getReference('rule').setStartDate(value)
        })
    }
}

export default Neo.setupClass(RecurrenceDemo);
