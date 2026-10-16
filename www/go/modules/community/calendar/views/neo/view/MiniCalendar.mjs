import Component    from '../../../../../../../views/neo/node_modules/neo.mjs/src/component/Base.mjs';
import {t}          from '../../../../../../../views/neo/src/Translate.mjs';
import {addDays, addMonths, dayNames, dayNumber, monthName, parseDate, startOfDay, weekOfYear, weekStart, ymd} from '../util/date.mjs';

/**
 * Month picker of the sidebar (GOUI datepicker with enableRangeSelect): a click picks a
 * day, dragging over days picks a range. Shows the period of the calendar view.
 *
 * Events: select {date}, selectRange {start, end}
 */
class MiniCalendar extends Component {
    static config = {
        className: 'GO.calendar.MiniCalendar',
        baseCls  : ['go-cal-mini'],
        _vdom    : {cn: []}
    }

    /** @member {Date} month first day of the shown month */
    month = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    /** @member {Date|null} start */
    start = null
    /** @member {Date|null} end */
    end = null
    /** @member {Date|null} anchor day where a drag started */
    anchor = null
    /** @member {Date|null} hover day under the mouse while dragging */
    hover = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {click     : me.onNavClick,  delegate: '.go-cal-mini-nav', scope: me},
            {mousedown : me.onDayDown,   scope: me},
            {mouseenter: me.onDayEnter,  delegate: '.go-cal-mini-day', scope: me},
            {mouseup   : me.onDayUp,     scope: me},
            {mouseleave: me.onLeave,     scope: me}
        ]);

        me.render()
    }

    /**
     * @param {Date} start
     * @param {Date|null} [end] inclusive
     */
    setValue(start, end = null) {
        let me = this;

        me.start = startOfDay(start);
        me.end   = end ? startOfDay(end) : null;
        me.month = new Date(start.getFullYear(), start.getMonth(), 1);
        me.render()
    }

    onNavClick(data) {
        const step = Number(data.path.find(n => n.data?.step)?.data.step || 0);

        if (step) {
            this.month = addMonths(this.month, step);
            this.render()
        } else {
            // the title: today
            this.fire('select', {date: startOfDay(new Date())})
        }
    }

    static dayOf(data) {
        const date = data.path?.find(n => n.data?.date)?.data.date;
        return date ? parseDate(date) : null
    }

    onDayDown(data) {
        const day = MiniCalendar.dayOf(data);

        if (day && data.button === 0) {
            this.anchor = day;
            this.hover  = day;
            this.render()
        }
    }

    onDayEnter(data) {
        const day = MiniCalendar.dayOf(data);

        if (this.anchor && day && dayNumber(day) !== dayNumber(this.hover)) {
            this.hover = day;
            this.render()
        }
    }

    onDayUp(data) {
        let me  = this,
            day = MiniCalendar.dayOf(data) || me.hover;

        if (!me.anchor) {
            return
        }

        const [start, end] = me.anchor <= day ? [me.anchor, day] : [day, me.anchor];

        me.anchor = me.hover = null;

        if (dayNumber(start) === dayNumber(end)) {
            me.fire('select', {date: start})
        } else {
            me.fire('selectRange', {start, end})
        }
    }

    onLeave(data) {
        // neo listens with capture: leaving a cell fires too, only leaving the picker counts
        if (this.anchor && data.target?.id === this.id) {
            this.anchor = this.hover = null;
            this.render()
        }
    }

    render() {
        let me    = this,
            today = dayNumber(new Date()),
            month = me.month.getMonth(),
            [from, to] = me.anchor
                ? (me.anchor <= me.hover ? [me.anchor, me.hover] : [me.hover, me.anchor])
                : [me.start, me.end || me.start],
            day   = weekStart(me.month),
            rows  = [];

        for (let week = 0; week < 6; week++) {
            const cells = [{tag: 'td', cls: ['go-cal-mini-week'], text: String(weekOfYear(day))}];

            for (let i = 0; i < 7; i++) {
                const dn = dayNumber(day);

                cells.push({
                    tag        : 'td',
                    'data-date': ymd(day),
                    cls        : ['go-cal-mini-day',
                        day.getMonth() !== month ? 'other' : null,
                        dn === today ? 'today' : null,
                        from && dn >= dayNumber(from) && dn <= dayNumber(to) ? 'selected' : null
                    ].filter(Boolean),
                    text: String(day.getDate())
                });

                day = addDays(day, 1)
            }

            rows.push({tag: 'tr', cn: cells})
        }

        me.vdom.cn = [{
            cls: ['go-cal-mini-header'],
            cn : [
                {tag: 'button', cls: ['go-cal-mini-nav', 'go-icon'], 'data-step': '-1', title: t('Previous'), text: 'chevron_left'},
                {tag: 'button', cls: ['go-cal-mini-nav', 'go-cal-mini-title'], title: t('Today'), text: `${monthName(month)} ${me.month.getFullYear()}`},
                {tag: 'button', cls: ['go-cal-mini-nav', 'go-icon'], 'data-step': '1', title: t('Next'), text: 'chevron_right'}
            ]
        }, {
            tag: 'table',
            cn : [{tag: 'tr', cn: [{tag: 'th'}, ...dayNames(true).map(name => ({tag: 'th', text: name.substring(0, 2)}))]}, ...rows]
        }];

        me.update()
    }
}

export default Neo.setupClass(MiniCalendar);
