import {escapeHtml} from '../../../../../../../views/neo/src/Format.mjs';
import calendarData from '../data.mjs';
import {addDays, dayNames, dayNumber, formatTime, monthName, weekOfYear, weekStart, ymd} from '../util/date.mjs';
import CalendarView from './CalendarView.mjs';

/**
 * Twelve small months with a dot per item (GOUI YearView). Clicking a month, week or day
 * opens that period.
 */
class YearView extends CalendarView {
    static config = {
        className: 'GO.calendar.YearView',
        baseCls  : ['go-cal', 'yearview']
    }

    goto(date) {
        let me = this;

        me.day  = new Date(date.getFullYear(), 0, 1);
        me.days = 366;
        me.viewModel = [];
        me.render();
        me.adapter.goto(me.day, new Date(date.getFullYear() + 1, 0, 1))
    }

    render() {
        let me     = this,
            months = [];

        me.viewModel.sort((a, b) => a.start - b.start);

        for (let m = 0; m < 12; m++) {
            months.push(me.renderMonth(new Date(me.day.getFullYear(), m, 1)))
        }

        me.vdom.cn = months;
        me.update()
    }

    renderMonth(first) {
        let me       = this,
            now      = new Date(),
            today    = dayNumber(now),
            weekNbs  = calendarData.prefs.showWeekNumbers !== false,
            month    = first.getMonth(),
            rows     = [],
            day      = weekStart(first);

        const header = {tag: 'tr', cn: [weekNbs ? {tag: 'td'} : null, ...dayNames().map(name => ({tag: 'th', text: name[0]}))].filter(Boolean)};

        for (let week = 0; week < 6 && (week === 0 || day.getMonth() === month); week++) {
            const cells = weekNbs ? [{tag: 'td', cls: ['weeknb'], 'data-date': ymd(day), 'data-action': 'weekClick', text: String(weekOfYear(day))}] : [];

            for (let i = 0; i < 7; i++) {
                const dn = dayNumber(day);

                if (day.getMonth() === month) {
                    const dots = me.itemsOn(day).map(item => ({
                        tag  : 'p',
                        title: item.title + (item.data.showWithoutTime ? '' : ' - ' + formatTime(item.start)),
                        style: {backgroundColor: '#' + item.color}
                    }));

                    cells.push({
                        tag          : 'td',
                        'data-date'  : ymd(day),
                        'data-action': 'dayClick',
                        cls          : [dn === today ? 'today' : null, dn < today ? 'past' : null].filter(Boolean),
                        cn           : [{tag: 'span', text: String(day.getDate())}, {tag: 'div', cls: ['events'], cn: dots}]
                    })
                } else {
                    cells.push({tag: 'td'})
                }

                day = addDays(day, 1)
            }

            rows.push({tag: 'tr', cn: cells})
        }

        return {tag: 'div', cn: [{tag: 'table', cn: [
            {
                tag          : 'caption',
                cls          : month === now.getMonth() && first.getFullYear() === now.getFullYear() ? ['current'] : [],
                'data-date'  : ymd(first),
                'data-action': 'monthClick',
                html         : escapeHtml(monthName(month))
            },
            header,
            ...rows
        ]}]}
    }

    /**
     * Items on a day (max 5 dots)
     * @param {Date} day
     * @returns {CalendarItem[]}
     */
    itemsOn(day) {
        const start = day,
              end   = addDays(day, 1);

        return this.viewModel.filter(item => item.start < end && item.end > start).slice(0, 5)
    }
}

export default Neo.setupClass(YearView);
