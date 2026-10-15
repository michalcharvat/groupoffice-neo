import DateField      from '../../form/field/DateField.mjs';
import DateRangeField from '../../form/field/DateRangeField.mjs';
import DateTimeField  from '../../form/field/DateTimeField.mjs';
import DurationField  from '../../form/field/DurationField.mjs';
import FormDemo       from './FormDemo.mjs';

/**
 * Dev demo: GOUI form/DateTimePage — DateField, DateTimeField (with and without time
 * zone, date only), DateRangeField, DurationField (h:I, minutes, ISO).
 */
class DateTimeDemo extends FormDemo {
    static config = {
        className: 'GO.dev.demo.DateTime',
        intro    : '<p>Date values are "Y-m-d"; DateTimeField with time zone gives ISO 8601 with the local offset, ' +
                   'without it local "Y-m-dTH:i:s". DateRangeField gives GO date filters ("a..b", ">=a", "&lt;b").</p>',
        fields   : [{
            module       : DateField,
            name         : 'date',
            labelText    : 'DateField',
            labelPosition: 'inline',
            minValue     : '2020-01-01'
        }, {
            module   : DateTimeField,
            name     : 'start',
            labelText: 'DateTimeField (time zone)',
            required : true,
            hint     : 'Required, not later than 2030'
        }, {
            module      : DateTimeField,
            name        : 'localStart',
            labelText   : 'DateTimeField (no time zone)',
            withTimeZone: false,
            defaultTime : '09:00',
            maxValue    : '2030-12-31T23:59:00'
        }, {
            module   : DateTimeField,
            name     : 'dateOnly',
            labelText: 'DateTimeField (withTime: false)',
            withTime : false
        }, {
            module   : DateRangeField,
            name     : 'range',
            labelText: 'DateRangeField'
        }, {
            module   : DurationField,
            name     : 'duration',
            labelText: 'DurationField (h:I)',
            maxValue : 24 * 60,
            hint     : 'At most 24:00'
        }, {
            module      : DurationField,
            name        : 'minutes',
            labelText   : 'DurationField (minutes)',
            outputFormat: 'j'
        }, {
            module      : DurationField,
            name        : 'isoDuration',
            labelText   : 'DurationField (ISO 8601)',
            outputFormat: 'iso'
        }],
        sample: {
            date       : '2026-10-16',
            start      : '2026-10-16T08:30:00Z',
            localStart : '2026-10-16T14:00:00',
            dateOnly   : '2026-12-24',
            range      : '2026-10-01..2026-10-31',
            duration   : '1:30',
            minutes    : 95,
            isoDuration: 'PT2H15M'
        }
    }
}

export default Neo.setupClass(DateTimeDemo);
