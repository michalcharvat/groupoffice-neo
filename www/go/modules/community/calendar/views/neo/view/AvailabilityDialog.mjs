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
 * Dragging the event (or pressing anywhere on its row) moves it in steps of 5 minutes;
 * "Apply" takes the new time.
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
    /** @member {Object|null} drag {left, width, grab} of the event row, set while the event is dragged */
    drag = null

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
            domListeners: [
                {mousedown : me.onDragDown, delegate: '.go-cal-av-plan', scope: me},
                {mousemove : {fn: me.onDragMove, scope: me, local: true}},
                {mouseup   : me.onDragUp,   scope: me},
                {mouseleave: me.onDragLeave, scope: me}
            ]
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
            plan = me.freePeriods().map(p => me.block(p.start, p.end, ['go-cal-av-free']));

        const event = me.eventMinutes();

        event && plan.push(me.block(event.start, event.end, ['go-cal-av-event']));

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
     * The part of the event on the shown day
     * @returns {Object|null} {start, end} minutes
     */
    eventMinutes() {
        let me  = this,
            day = me.day,
            end = addDays(day, 1);

        if (!(me.start && me.end && me.start < end && me.end > day)) {
            return null
        }

        return {start: me.start < day ? 0 : minuteOfDay(me.start), end: me.end >= end ? 1440 : minuteOfDay(me.end)}
    }

    /**
     * Length of the event in minutes
     * @returns {Number}
     */
    eventLength() {
        return this.start && this.end ? (this.end - this.start) / 60000 : 60
    }

    /**
     * Starts dragging the event (GOUI makeDraggable()): pressed on the event, the event keeps
     * the point it was grabbed at; elsewhere on the row, it is centred on the mouse
     * @param {Object} data mousedown
     */
    onDragDown(data) {
        let me   = this,
            plan = data.path.find(n => n.cls?.includes('go-cal-av-plan'));

        if (data.button !== 0 || !plan?.rect) {
            return
        }

        // the blocks don't take the mouse (pointer-events: none), so a press on the event is found by its minutes
        const minute = (data.clientX - plan.rect.x) / plan.rect.width * 1440,
              event  = me.eventMinutes(),
              onIt   = event && minute >= event.start && minute <= event.end;

        // the row is measured once: the mouse may leave it while dragging. The grab point is measured from the
        // real start, which lies on the day before for an event shown on its second day
        me.drag = {
            left : plan.rect.x,
            width: plan.rect.width,
            grab : onIt ? minute - (me.start - me.day) / 60000 : me.eventLength() / 2
        };

        me.addCls('go-cal-av-dragging');
        // pressed on the event, it stays until the mouse moves; elsewhere it jumps to the mouse
        onIt || me.moveTo(data.clientX)
    }

    onDragMove(data) {
        const me = this;

        if (!me.drag) {
            return
        }

        // released outside the browser window
        data.buttons === 0 ? me.onDragUp() : me.moveTo(data.clientX)
    }

    onDragUp() {
        if (this.drag) {
            this.drag = null;
            this.removeCls('go-cal-av-dragging')
        }
    }

    onDragLeave(data) {
        const me = this;

        // capture: only leaving the grid itself ends the drag, at the point where the mouse left
        // (a fast move skips the last part of the row: the event then still reaches the start or end of the day)
        if (me.drag && data.target?.id === me.getReference('grid').id) {
            typeof data.clientX === 'number' && me.moveTo(data.clientX);
            me.onDragUp()
        }
    }

    /**
     * Moves the event to the mouse position, keeping its length, within the day
     * @param {Number} clientX
     */
    moveTo(clientX) {
        let me     = this,
            drag   = me.drag,
            length = me.eventLength(),
            m      = (clientX - drag.left) / drag.width * 1440 - drag.grab,
            startM = Math.max(0, Math.min(1440 - length, Math.round(m / SNAP) * SNAP)),
            start  = new Date(me.day);

        start.setHours(0, startM, 0, 0);

        if (me.start?.getTime() === start.getTime()) {
            return
        }

        me.start = start;
        me.end   = new Date(start.getTime() + length * 60000);
        me.render()
    }
}

export default Neo.setupClass(AvailabilityDialog);
