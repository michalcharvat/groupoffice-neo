import Component   from '../../../node_modules/neo.mjs/src/component/Base.mjs';
import Container   from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import MonthPicker from '../../component/MonthPicker.mjs';
import WeekPicker  from '../../component/WeekPicker.mjs';
import {toYmd}     from '../../DateUtil.mjs';
import {escapeHtml} from '../../Format.mjs';

/**
 * Dev demo: GOUI DatePickerPage month and week pickers — the selected period filled, the
 * current one outlined, select logs the first day.
 */
class PeriodPickersDemo extends Container {
    static config = {
        className: 'GO.dev.demo.PeriodPickers',
        cls      : ['go-dev-page'],
        layout   : {ntype: 'hbox', align: 'start'},
        items    : [{
            module   : MonthPicker,
            reference: 'month',
            width    : 360,
            value    : new Date(2026, 2, 14)
        }, {
            module   : WeekPicker,
            reference: 'week',
            width    : 460,
            value    : new Date(2026, 10, 19)
        }, {
            module   : Component,
            reference: 'output',
            tag      : 'pre',
            cls      : ['go-dev-output'],
            flex     : 1,
            html     : ''
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        ['month', 'week'].forEach(kind => me.getReference(kind).on('select', ({date}) => me.log(`select ${kind}: ${toYmd(date)}`)))
    }

    log(text) {
        const output = this.getReference('output');
        output.html = escapeHtml(text) + '\n' + output.html
    }
}

export default Neo.setupClass(PeriodPickersDemo);
