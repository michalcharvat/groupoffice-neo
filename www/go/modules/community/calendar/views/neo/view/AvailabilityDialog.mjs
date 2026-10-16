import Component    from '../../../../../../../views/neo/node_modules/neo.mjs/src/component/Base.mjs';
import Toolbar      from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button       from '../../../../../../../views/neo/src/button/Button.mjs';
import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import Dialog, {headerTools} from '../../../../../../../views/neo/src/view/Dialog.mjs';
import {addDays, format, minuteOfDay, parseDate, startOfDay, ymd} from '../util/date.mjs';

const t = translator('community', 'calendar');

const SNAP = 5;

/**
 * Free / busy of the participants on a day (GOUI AvailabilityWindow): a row per
 * participant with their busy periods, the free periods that fit the event, and the event.
 * Clicking the timeline moves the event there; "Apply" takes the new time.
 *
 *     Neo.create(AvailabilityDialog, {appName, windowId, principalIds, start, end})
 *
 * Events: changeTime {start, end}
 */
class AvailabilityDialog extends Dialog {
    static config = {
        className   : 'GO.calendar.AvailabilityDialog',
        cls         : ['go-cal-availability-dialog'],
        modal       : true,
        resizable   : false,
        headerConfig: headerTools('close'),
        title       : t('Availability'),
        wrapperStyle: {left: 'calc(50vw - 640px)', top: '10vh', width: '1280px', maxWidth: '96vw'},
        containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}},
        /** @member {String[]} principalIds */
        principalIds: [],
        /** @member {Date|null} start */
        start: null,
        /** @member {Date|null} end */
        end: null
    }

    /** @member {Date} day */
    day = startOfDay(new Date())
    /** @member {Object[]} principals */
    principals = []
    /** @member {Object} busy principal id → [{start, end}] minutes */
    busy = {}

    construct(config) {
        super.construct(config);

        let me = this;

        me.day = startOfDay(me.start || new Date());

        me.items = [{
            module: Toolbar,
            cls   : ['go-border-bottom'],
            flex  : 'none',
            items : [
                {module: Button, icon: 'arrow_back', handler: () => me.setDay(addDays(me.day, -1))},
                {module: Button, icon: 'arrow_forward', handler: () => me.setDay(addDays(me.day, 1))},
                {ntype: 'component', tag: 'h2', reference: 'dayTitle', cls: ['go-cal-av-title'], text: ''}
            ]
        }, {
            module      : Component,
            reference   : 'grid',
            cls         : ['go-cal-availability'],
            flex        : 1,
            vdom        : {cn: []},
            domListeners: [{click: me.onPlanClick, delegate: '.go-cal-av-plan', scope: me}]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : ['->', {module: Button, text: t('Cancel'), handler: () => me.close()}, {
                module : Button,
                ui     : 'primary',
                text   : t('Apply'),
                handler: () => {
                    me.fire('changeTime', {start: me.start, end: me.end});
                    me.close()
                }
            }]
        }]
    }

    async onConstructed() {
        super.onConstructed();

        let me = this;

        try {
            me.principals = await client.get('Principal', me.principalIds, ['id', 'name', 'email', 'type']);
        } catch (e) {
            me.principals = me.principalIds.map(id => ({id, name: id}))
        }

        me.setDay(me.day)
    }

    async setDay(day) {
        let me   = this,
            from = ymd(day),
            till = ymd(addDays(day, 1));

        me.day  = startOfDay(day);
        me.busy = {};
        me.getReference('dayTitle').text = format(day, 'D d F Y');
        me.render();

        await Promise.all(me.principalIds.map(async id => {
            try {
                const r = await client.call('Principal/getAvailability', {start: from, end: till, id});

                me.busy[id] = (r.list || []).map(p => {
                    const s = parseDate(p.utcStart.replace(' ', 'T')),
                          e = parseDate(p.utcEnd.replace(' ', 'T'));

                    // GOUI uses the minute of the day of utcStart/utcEnd as they come
                    return {start: s && ymd(s) === from ? minuteOfDay(s) : 0, end: e && ymd(e) === from ? minuteOfDay(e) : 1440}
                })
            } catch (e) {
                me.busy[id] = []
            }
        }));

        me.isDestroyed || me.render()
    }

    /**
     * Free periods of the day that fit the event (GOUI findTime())
     * @returns {Object[]} [{start, end}] minutes
     */
    freePeriods() {
        let me     = this,
            length = me.start && me.end ? Math.max(SNAP, (me.end - me.start) / 60000) : 60,
            merged = [];

        Object.values(me.busy).flat().sort((a, b) => a.start - b.start).forEach(p => {
            const last = merged[merged.length - 1];
            last && p.start <= last.end ? (last.end = Math.max(last.end, p.end)) : merged.push({...p})
        });

        const free = [];
        let from = 0;

        merged.forEach(p => {
            p.start - from >= length && free.push({start: from, end: p.start});
            from = Math.max(from, p.end)
        });

        1440 - from >= length && free.push({start: from, end: 1440});

        return free
    }

    block(start, end, cls) {
        return {tag: 'div', cls, style: {left: (100 / 1440 * start) + '%', width: (100 / 1440 * (end - start)) + '%'}}
    }

    render() {
        let me   = this,
            grid = me.getReference('grid'),
            day  = me.day,
            plan = me.freePeriods().map(p => me.block(p.start, p.end, ['go-cal-av-free']));

        if (me.start && me.end && me.start < addDays(day, 1) && me.end > day) {
            const s = me.start < day ? 0 : minuteOfDay(me.start),
                  e = me.end >= addDays(day, 1) ? 1440 : minuteOfDay(me.end);

            plan.push(me.block(s, e, ['go-cal-av-event']))
        }

        grid.vdom.cn = [
            {tag: 'ol', cn: [
                {tag: 'li', cn: [{tag: 'em', text: t('Invitees')}]},
                {tag: 'li', cn: Array.from({length: 23}, (_, i) => ({tag: 'em', text: String(i + 1).padStart(2, '0')}))}
            ]},
            {tag: 'dl', cls: ['go-cal-av-row'], cn: [{tag: 'dt', text: t('Event')}, {tag: 'dd', cls: ['go-cal-av-plan'], cn: plan}]},
            ...me.principals.map(p => ({tag: 'dl', cls: ['go-cal-av-row'], cn: [
                {tag: 'dt', cn: [{tag: 'h3', text: p.name || p.email || p.id}, {tag: 'h4', text: String(p.id) === String(client.user.id) ? t('Organizer') : (p.email || '')}]},
                {tag: 'dd', cn: (me.busy[p.id] || []).map(b => me.block(b.start, b.end, ['go-cal-av-busy']))}
            ]}))
        ];

        grid.update()
    }

    /**
     * Moves the event to the clicked time, centred on it, keeping its length
     */
    onPlanClick(data) {
        let me   = this,
            node = data.path.find(n => n.cls?.includes('go-cal-av-plan'));

        if (!node?.rect) {
            return
        }

        const length = me.start && me.end ? (me.end - me.start) / 60000 : 60,
              m      = (data.clientX - node.rect.x) / node.rect.width * 1440 - length / 2,
              startM = Math.max(0, Math.min(1440 - length, Math.round(m / SNAP) * SNAP)),
              start  = new Date(me.day);

        start.setHours(0, startM, 0, 0);

        me.start = start;
        me.end   = new Date(start.getTime() + length * 60000);
        me.render()
    }
}

export default Neo.setupClass(AvailabilityDialog);
