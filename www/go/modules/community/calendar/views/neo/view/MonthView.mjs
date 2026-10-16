import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import calendarData from '../data.mjs';
import {addDays, dayNames, dayNumber, diffDays, format, startOfDay, weekDay, weekOfYear, weekStart, ymd} from '../util/date.mjs';
import CalendarView from './CalendarView.mjs';

const t = translator('community', 'calendar');

/**
 * Month (and "weeks") view: a row per week, all items as lines (GOUI MonthView)
 */
class MonthView extends CalendarView {
    static config = {
        className: 'GO.calendar.MonthView',
        baseCls  : ['go-cal', 'month']
    }

    /** @member {Number} wdays days per row */
    wdays = 7
    /** @member {Number} fit lines that fit in a week row */
    fit = 3
    /** @member {Number|null} month 0-11 of a month view, null for "weeks" */
    month = null

    get weekNumbers() {
        return calendarData.prefs.showWeekNumbers !== false
    }

    get dayNumbers() {
        return true
    }

    construct(config) {
        super.construct(config);
        this.addDomListeners({resize: this.onResize, scope: this})
    }

    /**
     * @param {Date} date
     * @param {Number} [days] weeks view: number of days from the week of date, else the month of date
     */
    goto(date, days) {
        let me    = this,
            start = startOfDay(date);

        me.selectedDay = start;

        if (days) {
            me.month = null;
            me.day   = weekStart(start);
            me.days  = Math.ceil(days / 7) * 7
        } else {
            me.month = start.getMonth();
            me.day   = weekStart(new Date(start.getFullYear(), start.getMonth(), 1));

            // the weeks that cover the month
            const last = new Date(start.getFullYear(), start.getMonth() + 1, 0);
            me.days = Math.ceil((diffDays(me.day, last) + 1) / 7) * 7
        }

        me.viewModel = [];
        me.render();
        me.adapter.goto(me.day, addDays(me.day, me.days))
    }

    async onResize() {
        let me = this;

        if (!me.mounted || !me.days) {
            return
        }

        const [rect, head] = await me.getDomRect([me.id, me.id + '__head']);

        if (!rect || !head?.height) {
            return
        }

        const remPx  = head.height / 4,
              rows   = me.days / me.wdays,
              rowRem = (rect.height - head.height) / rows / remPx,
              fit    = Math.max(0, Math.floor((rowRem - 3.4) / me.rowHeight));

        if (fit !== me.fit) {
            me.fit = fit;
            me.render()
        }
    }

    render() {
        let me    = this,
            today = dayNumber(new Date()),
            cn    = [me.renderHead()];

        me.viewModel.sort((a, b) => a.start - b.start);
        me.continues = [];
        me.iterator  = 0;

        for (let week = 0; week < me.days / me.wdays; week++) {
            cn.push(me.renderWeek(addDays(me.day, week * me.wdays), today))
        }

        me.vdom.cn = cn;
        me.update()
    }

    renderHead() {
        const now     = new Date(),
              current = this.month !== null && this.month === now.getMonth() && this.day <= now && now < addDays(this.day, this.days);

        return {
            tag: 'ul',
            id : this.id + '__head',
            cn : dayNames().map((name, i) => ({tag: 'li', cls: current && weekDay(now) === i ? ['current'] : [], text: name.substring(0, 2)}))
        }
    }

    /**
     * Lines of the items in one week row (GOUI drawWeek())
     * @param {Date} start
     * @returns {Object[]}
     */
    weekLines(start) {
        let me    = this,
            end   = addDays(start, me.wdays),
            lines = [],
            still = [],
            e;

        me.slots = Array.from({length: me.wdays}, () => ({}));

        while ((e = me.continues.shift())) {
            lines.push(me.eventLine(e, start));
            e.end > end && still.push(e)
        }

        me.continues = still;

        while ((e = me.viewModel[me.iterator]) && e.start < end) {
            if (e.end > start) {
                lines.push(me.eventLine(e, start));
                e.end > end && me.continues.push(e)
            }
            me.iterator++
        }

        return lines
    }

    renderWeek(start, today) {
        let me    = this,
            lines = me.weekLines(start),
            showWeekNumbers = me.weekNumbers,
            days  = [];

        for (let i = 0; i < me.wdays; i++) {
            const day    = addDays(start, i),
                  amount = Object.keys(me.slots[i]).length,
                  more   = amount - me.fit,
                  dn     = dayNumber(day);

            days.push({
                tag        : 'li',
                'data-date': ymd(day),
                cls        : [
                    dn === today ? 'today' : null,
                    dn < today ? 'past' : null,
                    me.month !== null && day.getMonth() !== me.month ? 'other' : null,
                    day.getDay() % 6 === 0 ? 'weekend' : null,
                    more > 0 ? 'showMore' : null
                ].filter(Boolean),
                cn: [
                    i === 0 && showWeekNumbers ? {tag: 'sub', cls: ['weeknb'], 'data-action': 'weekClick', text: t('W') + ' ' + weekOfYear(day)} : null,
                    !me.dayNumbers ? null : {tag: 'span', 'data-action': 'dayClick', cn: [{tag: 'em', text: String(day.getDate())}, {vtype: 'text', text: day.getDate() === 1 ? ' ' + format(day, 'M') : ''}]},
                    {tag: 'div', cls: ['more'], 'data-action': 'dayClick', style: {height: me.rowHeight + 'rem'}, text: t('+ {n} more').replace('{n}', more)}
                ].filter(Boolean)
            })
        }

        return {tag: 'ol', cn: [{tag: 'li', cls: ['events'], 'data-week': ymd(start), 'data-days': String(me.wdays), cn: lines}, ...days]}
    }
}

export default Neo.setupClass(MonthView);
