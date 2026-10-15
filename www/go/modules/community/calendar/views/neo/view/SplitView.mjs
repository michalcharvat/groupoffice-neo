import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import calendarData from '../data.mjs';
import {addDays, dayNumber, format, startOfDay, weekOfYear, weekStart, ymd} from '../util/date.mjs';
import CalendarView from './CalendarView.mjs';
import MonthView    from './MonthView.mjs';

const t = translator('community', 'calendar');

/**
 * One row per shown calendar over the days of a week (GOUI SplitView). A mouse down in a
 * row makes that calendar the one new events go into.
 */
class SplitView extends MonthView {
    static config = {
        className: 'GO.calendar.SplitView',
        baseCls  : ['go-cal', 'split']
    }

    /** @member {Object} calendars id → Calendar, also of calendars that are not subscribed */
    calendars = {}

    get weekNumbers() {
        return false
    }

    get dayNumbers() {
        return false
    }

    construct(config) {
        super.construct(config);
        this.addDomListeners({mousedown: this.onRowMouseDown, scope: this})
    }

    onRowMouseDown(data) {
        const id = CalendarView.dataFromEvent(data, 'calid');
        id && (CalendarView.selectedCalendarId = id)
    }

    goto(date, days) {
        let me = this;

        me.wdays = days || 5;
        me.days  = me.wdays;
        me.month = null;
        me.day   = weekStart(startOfDay(date));
        me.viewModel = [];
        me.render();
        me.adapter.goto(me.day, addDays(me.day, me.wdays))
    }

    async onResize() {
        // every row is one calendar; the rows don't share the height
        this.fit = 99
    }

    get calendarIds() {
        return this.adapter.byType('event').filter.inCalendars || []
    }

    populate() {
        let me      = this,
            ids     = me.calendarIds,
            missing = ids.filter(id => !calendarData.getCalendar(id) && !me.calendars[id]);

        if (missing.length && !me.loadingCalendars) {
            me.loadingCalendars = true;

            client.get('Calendar', missing, ['id', 'name', 'color']).then(list => {
                list.forEach(c => me.calendars[String(c.id)] = c)
            }).catch(e => console.error(e)).finally(() => {
                me.loadingCalendars = false;
                me.isDestroyed || me.render()
            })
        }

        super.populate()
    }

    render() {
        let me    = this,
            today = dayNumber(new Date()),
            heads = [{tag: 'li', cls: ['weeknb'], text: t('Wk') + ' ' + weekOfYear(me.day)}],
            cn;

        for (let i = 0; i < me.wdays; i++) {
            const day = addDays(me.day, i);
            heads.push({tag: 'li', cls: dayNumber(day) === today ? ['today'] : [], cn: [{vtype: 'text', text: format(day, 'D')}, {tag: 'em', text: format(day, 'j')}]})
        }

        cn = [{tag: 'ul', id: me.id + '__head', cn: heads}];

        const all = [...me.viewModel].sort((a, b) => a.start - b.start);

        me.calendarIds.forEach(id => {
            const calendar = calendarData.getCalendar(id) || me.calendars[id];

            if (!calendar) {
                return
            }

            me.viewModel = all.filter(item => String(item.data.calendarId) === String(id));
            me.continues = [];
            me.iterator  = 0;

            const row = me.renderWeek(me.day, today);
            row['data-calid'] = String(id);

            cn.push({tag: 'div', cn: [{tag: 'i', cls: ['go-icon'], style: {color: '#' + calendar.color}, text: 'event'}, {vtype: 'text', text: ' ' + calendar.name}]}, row)
        });

        me.viewModel = all;
        me.vdom.cn = cn;
        me.update()
    }
}

export default Neo.setupClass(SplitView);
