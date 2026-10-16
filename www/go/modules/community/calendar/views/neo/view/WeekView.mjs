import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import calendarData from '../data.mjs';
import {addDays, addMinutes, dayNumber, diffDays, format, formatTime, minuteOfDay, parseDate, sameDay, startOfDay, weekOfYear, ymd, ymdhis} from '../util/date.mjs';
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

        const oldScroller = me.vdom.cn?.find(node => node?.id === me.scrollerId);

        me.vdom.cn = [
            {tag: 'ul', cn: [{tag: 'li', cls: showNow ? ['current'] : [], 'data-date': ymd(me.day), 'data-action': 'weekClick', text: t('Wk') + ' ' + weekOfYear(me.day)}, ...heads]},
            {tag: 'ul', style: {height: (rows * me.rowHeight + .6) + 'rem'}, cn: [
                {tag: 'li', text: t('All day')},
                {tag: 'li', cls: ['all-days'], 'data-week': ymd(me.day), 'data-days': String(me.days), cn: lines},
                ...fullDays
            ]},
            {
                tag  : 'dl',
                id   : me.scrollerId,
                // neo keeps the synced scroll position on the vdom node: a new node without it scrolls to the top
                scrollTop : oldScroller?.scrollTop,
                scrollLeft: oldScroller?.scrollLeft,
                style: {'--hour-height': gridSize + 'vh'},
                cn   : [{tag: 'dt', cn: [nowBar, {tag: 'em'}, ...hours].filter(Boolean)}, ...cols]
            }
        ];

        me.update()
    }

    /**
     * Right click in a day column: that time; in the all day row: the day
     */
    contextDate(data) {
        const column = CalendarView.nodeWith(data, 'day');

        if (column?.rect) {
            const start = parseDate(column.data.day);
            start.setHours(0, this.minuteAt(data, column), 0, 0);
            return ymdhis(start)
        }

        return super.contextDate(data)
    }

    get snap() {
        return Number(calendarData.prefs.weekViewGridSnap) || 15
    }

    /**
     * Minute of the day under the mouse in a day column, snapped
     * @param {Object} data mouse event
     * @param {Object} column path node of the dd (with rect)
     * @returns {Number}
     */
    minuteAt(data, column) {
        const snap = this.snap,
              m    = (data.clientY - column.rect.y) / column.rect.height * 1440;

        return Math.max(0, Math.min(1440, Math.round(m / snap) * snap))
    }

    /**
     * In a day column: move or resize a timed item, or draw a new one (GOUI makeDraggable());
     * elsewhere (all day row) the day drag of CalendarView
     */
    dragDown(data) {
        let me     = this,
            column = CalendarView.nodeWith(data, 'day');

        if (!column?.rect) {
            super.dragDown(data, true);
            return
        }

        const evNode = CalendarView.nodeWith(data, 'uid'),
              day    = parseDate(column.data.day),
              minute = me.minuteAt(data, column);

        if (evNode) {
            const item = me.itemsByUid.get(evNode.data.uid);

            if (!item || !item.mayChange || !item.key) {
                return
            }

            const offset = data.clientY - evNode.rect.y,
                  startM = sameDay(item.start, day) ? minuteOfDay(item.start) : 0,
                  endM   = sameDay(item.end, day) ? minuteOfDay(item.end) : 1440;

            let type = 'move', anchor = 0;

            // 4 px handles on top and bottom resize
            if (offset < 4) {
                type = 'resize';
                anchor = endM
            } else if (offset > evNode.rect.height - 4) {
                type = 'resize';
                anchor = startM
            }

            type === 'resize' && me.addCls('resizing');

            me.drag = {type, item, day, anchor, grab: minute - startM, last: null, moved: false};
            return
        }

        // a new event from here, resized by dragging
        const start = new Date(day);
        start.setHours(0, minute, 0, 0);

        const item = CalendarView.newItem(start, {
            showWithoutTime: false,
            start          : ymdhis(start),
            duration       : calendarData.prefs.defaultDuration || 'PT1H'
        });

        item.end = addMinutes(start, 60);

        me.currentCreation = item;
        me.dayItems.unshift(item);
        me.drag = {type: 'resize', item, day, anchor: minute, last: null, moved: true, create: true};
        me.addCls('resizing');
        me.render()
    }

    dragMove(data) {
        let me     = this,
            drag   = me.drag,
            column = CalendarView.nodeWith(data, 'day');

        if (!['move', 'resize'].includes(drag.type)) {
            super.dragMove(data);
            return
        }

        if (!column?.rect) {
            return
        }

        const item   = drag.item,
              day    = parseDate(column.data.day),
              minute = me.minuteAt(data, column),
              key    = column.data.day + ':' + minute;

        if (key === drag.last) {
            return
        }

        drag.last = key;

        // another day: the item moves along
        const shift = diffDays(drag.day, day);

        if (shift) {
            item.start = addDays(item.start, shift);
            item.end   = addDays(item.end, shift);
            drag.day   = day;
            drag.moved = true
        }

        let from, till;

        if (drag.type === 'move') {
            const length = (item.end - item.start) / 60000;
            from = minute - drag.grab;
            till = from + length
        } else {
            [from, till] = minute > drag.anchor ? [drag.anchor, minute] : [minute, drag.anchor]
        }

        if (from === till) {
            return
        }

        const start = new Date(day);
        start.setHours(0, from, 0, 0);

        const end = new Date(day);
        end.setHours(0, till, 0, 0);

        if (start.getTime() !== item.start.getTime() || end.getTime() !== item.end.getTime()) {
            item.start = start;
            item.end   = end;
            drag.moved = true;
            me.render()
        }
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
