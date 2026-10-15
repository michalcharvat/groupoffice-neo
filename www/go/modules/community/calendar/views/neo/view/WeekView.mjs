import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import calendarData from '../data.mjs';
import {addDays, dayNumber, diffDays, format, formatTime, minuteOfDay, startOfDay, weekOfYear, ymd} from '../util/date.mjs';
import CalendarView from './CalendarView.mjs';

const t = translator('community', 'calendar');

/**
 * Day, days and week view: all day items on top, the timed ones in day columns with an
 * hour grid and a "now" line (GOUI WeekView)
 */
class WeekView extends CalendarView {
    static config = {
        className: 'GO.calendar.WeekView',
        baseCls  : ['go-cal', 'week']
    }

    /** @member {CalendarItem[]} dayItems timed items */
    dayItems = []

    construct(config) {
        super.construct(config);

        // the now line moves every minute
        this.nowTimer = setInterval(() => this.mounted && this.isToday() && this.render(), 60000)
    }

    destroy(...args) {
        clearInterval(this.nowTimer);
        super.destroy(...args)
    }

    get scrollerId() {
        return this.id + '__scroller'
    }

    isToday() {
        const now = new Date();
        return this.day <= now && now < addDays(this.day, this.days)
    }

    goto(date, days) {
        let me = this;

        me.days = days || 7;
        me.day  = startOfDay(date);
        me.viewModel = [];
        me.dayItems  = [];
        me.render();
        me.adapter.goto(me.day, addDays(me.day, me.days));

        // GOUI: 6 hours down (a quarter of the day), once
        if (!me.scrolled) {
            me.scrolled = true;
            me.scrollToMorning()
        }
    }

    async scrollToMorning() {
        let me = this;

        await me.timeout(50);

        if (me.isDestroyed || !me.mounted) {
            me.scrolled = false;
            return
        }

        try {
            const dims = await Neo.main.DomAccess.getScrollingDimensions({id: me.scrollerId, windowId: me.windowId});
            dims?.scrollHeight && Neo.main.DomAccess.scrollTo({id: me.scrollerId, value: Math.round(dims.scrollHeight / 4), windowId: me.windowId})
        } catch (e) {
            me.scrolled = false
        }
    }

    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        value && !this.scrolled && this.days && (this.scrolled = true, this.scrollToMorning())
    }

    populate() {
        let me      = this,
            allDay  = [],
            timed   = [];

        me.itemsByUid.clear();

        for (const item of me.adapter.items) {
            (item.data?.showWithoutTime ? allDay : timed).push(item)
        }

        me.currentCreation && !me.currentCreation.data.showWithoutTime && timed.unshift(me.currentCreation);
        me.currentCreation && me.currentCreation.data.showWithoutTime && allDay.unshift(me.currentCreation);

        me.viewModel = allDay.sort((a, b) => a.start - b.start);
        me.dayItems  = timed;
        me.render()
    }

    render() {
        let me       = this,
            now      = new Date(),
            today    = dayNumber(now),
            gridSize = calendarData.prefs.weekViewGridSize ?? 8,
            heads    = [],
            fullDays = [],
            cols     = [],
            hours    = [],
            showNow  = false;

        for (let hour = 1; hour < 24; hour++) {
            hours.push({tag: 'em', text: formatTime(new Date(2000, 0, 1, hour))})
        }

        me.dayItems.sort((a, b) => a.start - b.start);
        me.iter      = 0;
        me.continues = [];

        for (let i = 0; i < me.days; i++) {
            const day     = addDays(me.day, i),
                  dn      = dayNumber(day),
                  weekend = day.getDay() % 6 === 0;

            heads.push({
                tag        : 'li',
                cls        : [dn < today ? 'past' : null, dn === today ? 'today' : null].filter(Boolean),
                'data-date': ymd(day),
                'data-action': 'dayClick',
                cn         : [{vtype: 'text', text: format(day, 'D')}, {tag: 'em', text: String(day.getDate())}]
            });

            fullDays.push({tag: 'li', cls: weekend ? ['weekend'] : [], 'data-date': ymd(day)});
            cols.push({tag: 'dd', cls: weekend ? ['weekend'] : [], 'data-day': ymd(day), cn: me.drawDay(day)});

            dn === today && (showNow = true)
        }

        // all day lines
        me.slots = Array.from({length: me.days}, () => ({}));
        const lines = me.viewModel.map(item => me.eventLine(item, me.day)),
              rows  = Math.max(1, ...me.slots.map(s => Object.keys(s).length));

        let nowBar = null;

        if (showNow) {
            const left = 100 / me.days * diffDays(me.day, now);

            nowBar = {tag: 'div', cls: ['now'], style: {top: `calc(var(--hour-height) * ${minuteOfDay(now) / 60})`}, cn: [
                {tag: 'hr'},
                {tag: 'b', style: {left: left + '%'}},
                {tag: 'span', text: formatTime(now)}
            ]}
        }

        me.vdom.cn = [
            {tag: 'ul', cn: [{tag: 'li', cls: showNow ? ['current'] : [], 'data-date': ymd(me.day), 'data-action': 'weekClick', text: t('Wk') + ' ' + weekOfYear(me.day)}, ...heads]},
            {tag: 'ul', style: {height: (rows * me.rowHeight + .6) + 'rem'}, cn: [
                {tag: 'li', text: t('All day')},
                {tag: 'li', cls: ['all-days'], cn: lines},
                ...fullDays
            ]},
            {
                tag  : 'dl',
                id   : me.scrollerId,
                style: {'--hour-height': gridSize + 'vh'},
                cn   : [{tag: 'dt', cn: [nowBar, {tag: 'em'}, ...hours].filter(Boolean)}, ...cols]
            }
        ];

        me.update()
    }

    /**
     * Timed items of one day column (GOUI drawDay()): items with the same uid at the same
     * time (one event in more calendars) stack into one
     * @param {Date} dayStart
     * @returns {Object[]}
     */
    drawDay(dayStart) {
        let me    = this,
            end   = addDays(dayStart, 1),
            still = [],
            nodes = [],
            e;

        outer: while ((e = me.dayItems[me.iter]) && e.start < end) {
            me.iter++;

            for (let prev = me.continues.length - 1; prev >= 0 && e.start.getTime() === me.continues[prev].start.getTime(); prev--) {
                if (e.data.uid && e.data.uid === me.continues[prev].data.uid) {
                    me.continues[prev].calendarIds[e.data.calendarId] = true;
                    continue outer
                }
            }

            e.end > dayStart && me.continues.push(e)
        }

        me.continues.length && WeekView.calculateOverlap(me.continues, dayStart);

        while ((e = me.continues.shift())) {
            nodes.push(me.dayEventNode(e, dayStart));
            e.end > end && still.push(e)
        }

        me.continues = still;

        return nodes
    }

    /**
     * Lanes of overlapping items (GOUI calculateOverlap(), unchanged)
     * @param {CalendarItem[]} events sorted by start
     * @param {Date} dayStart
     */
    static calculateOverlap(events, dayStart) {
        let highestEnd = 0,
            blockStart = 0,
            blockLanes = 1;

        const day = dayNumber(dayStart);

        for (let i = 0; i < events.length; i++) {
            const a = events[i];

            a.startM = dayNumber(a.start) < day ? 0 : minuteOfDay(a.start);
            a.endM   = dayNumber(a.end) > day ? 1440 : minuteOfDay(a.end);
            a.pos    = 0;

            if (a.startM >= highestEnd) {
                blockStart = i;
                blockLanes = 1
            }

            for (let j = blockStart; j < i; j++) {
                const b = events[j];

                if (a.endM > b.startM && a.startM < b.endM && a.pos === b.pos) {
                    a.pos++;
                    blockLanes = Math.max(blockLanes, a.pos + 1);
                    j = blockStart - 1 // restart from blockstart
                }

                b.lanes = blockLanes
            }

            a.lanes    = blockLanes;
            highestEnd = Math.max(highestEnd, a.endM)
        }
    }

    dayEventNode(e, dayStart) {
        const [backgroundImage, paddingLeft] = this.stackedCalendars(e);

        return this.eventNode(e, {
            part : ymd(dayStart),
            style: {
                top   : (100 / 1440 * e.startM) + '%',
                left  : (e.pos * (100 / e.lanes)) + '%',
                width : `calc(${100 / e.lanes}% - 1px)`,
                height: `calc(${100 / 1440 * Math.max(e.endM - e.startM, 15)}% - 1px)`,
                backgroundImage,
                paddingLeft,
                borderLeft: '0'
            }
        })
    }

    /**
     * Coloured stripes on the left: one per calendar the event is in
     * @param {CalendarItem} e
     * @returns {String[]} [backgroundImage, paddingLeft]
     */
    stackedCalendars(e) {
        let backgroundImage = 'linear-gradient(to right, ',
            padding         = 0;

        for (const key in e.calendarIds) {
            if (key != e.data.calendarId) {
                const cal = calendarData.getCalendar(key);

                if (cal) {
                    backgroundImage += `#${cal.color} ${padding / 10}rem ${(padding += 6) / 10}rem, `
                }
            }
        }

        padding += 6;
        backgroundImage += `currentColor ${(padding - 6) / 10}rem ${padding / 10}rem, transparent ${padding / 10}rem 100%)`;

        return [backgroundImage, ((padding + 6) / 10) + 'rem']
    }
}

export default Neo.setupClass(WeekView);
