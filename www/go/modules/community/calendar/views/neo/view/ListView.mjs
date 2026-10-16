import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import {addDays, dayNumber, format, formatTime, startOfDay} from '../util/date.mjs';
import CalendarView from './CalendarView.mjs';

const t = translator('community', 'calendar');

/**
 * The days of a month as a list with their items (GOUI ListView). The main view shows the
 * clicked item in a detail panel next to it ('selectItem').
 */
class ListView extends CalendarView {
    static config = {
        className: 'GO.calendar.ListView',
        baseCls  : ['go-cal', 'list']
    }

    goto(date) {
        let me    = this,
            start = new Date(date.getFullYear(), date.getMonth(), 1),
            end   = new Date(date.getFullYear(), date.getMonth() + 1, 1);

        me.day  = start;
        me.days = Math.round((end - start) / 86400000);
        me.viewModel = [];
        me.render();
        me.adapter.goto(start, end)
    }

    render() {
        let me    = this,
            today = dayNumber(new Date()),
            month = me.day.getMonth(),
            items = [...me.viewModel].sort((a, b) => a.start - b.start),
            rows  = [];

        for (let day = startOfDay(me.day); day.getMonth() === month; day = addDays(day, 1)) {
            const next   = addDays(day, 1),
                  nodes  = items.filter(e => e.start < next && e.end > day).map(e => me.itemNode(e, day));

            rows.push({
                tag: 'li',
                cls: [dayNumber(day) === today ? 'today' : null, nodes.length ? null : 'empty'].filter(Boolean),
                cn : [{tag: 'h3', cn: [{tag: 'em', text: format(day, 'j')}, {vtype: 'text', text: format(day, 'M, D')}]}, ...nodes]
            })
        }

        me.vdom.cn = rows;
        me.update()
    }

    itemNode(e, day) {
        return this.eventNode(e, {
            part : String(dayNumber(day)),
            style: {color: '#' + e.color},
            cn   : [
                {tag: 'i', cls: ['go-icon'], text: 'fiber_manual_record'},
                {tag: 'span', text: e.data.showWithoutTime ? t('Full day') : formatTime(e.start) + ' - ' + formatTime(e.end)},
                {tag: 'span', text: e.title}
            ]
        })
    }
}

export default Neo.setupClass(ListView);
