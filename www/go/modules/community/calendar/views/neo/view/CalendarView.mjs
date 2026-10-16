import Component from '../../../../../../../views/neo/node_modules/neo.mjs/src/component/Base.mjs';
import MenuList  from '../../../../../../../views/neo/src/menu/List.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import CalendarItem from '../CalendarItem.mjs';
import calendarData from '../data.mjs';
import {addDays, addDuration, diffDays, diffDuration, formatTime, parseDate, sameDay, startOfDay, ymd, ymdhis} from '../util/date.mjs';

const t = translator('community', 'calendar');

/**
 * Base of the calendar views (GOUI CalendarView): renders CalendarItems of the adapter as
 * vdom, selects them on click, opens them on double click, has the item and empty-slot
 * context menus. Subclasses implement goto(), populate() and render().
 *
 * Events: dayClick {day}, weekClick {day}, monthClick {day}
 */
class CalendarView extends Component {
    static config = {
        className: 'GO.calendar.CalendarView',
        baseCls  : ['go-cal'],
        /**
         * @member {CalendarAdapter|null} adapter=null
         */
        adapter: null,
        _vdom  : {tabIndex: 0, cn: []}
    }

    /**
     * Calendar a new event goes into (GOUI CalendarView.selectedCalendarId)
     * @member {String|null} selectedCalendarId
     */
    static selectedCalendarId = null

    /** @member {CalendarItem[]} viewModel */
    viewModel = []
    /** @member {Map<String, CalendarItem>} itemsByUid */
    itemsByUid = new Map()
    /** @member {String|null} selectedUid */
    selectedUid = null
    /** @member {Date} day first shown day */
    day = startOfDay(new Date())
    /** @member {Number} days */
    days = 1
    /** @member {CalendarItem|null} currentCreation item being drawn with the mouse */
    currentCreation = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {click      : me.onViewClick,       scope: me},
            {dblclick   : me.onViewDblClick,    scope: me},
            {contextmenu: me.onViewContextMenu, scope: me},
            {keydown    : me.onViewKeyDown,     scope: me},
            {mousedown  : me.onDragDown,        scope: me},
            {mousemove  : {fn: me.onDragMove, scope: me, local: true}},
            {mouseup    : me.onDragUp,          scope: me},
            {mouseleave : me.onDragLeave,       scope: me}
        ])
    }

    onConstructed() {
        super.onConstructed();

        // the browser menu would cover ours
        Neo.main.DomEvents.registerPreventDefaultTargets({name: 'contextmenu', cls: ['go-cal'], windowId: this.windowId})
    }

    get rowHeight() {
        // rem; multi line titles need two lines
        return calendarData.prefs.multiLine ? 3.8 : 2.6
    }

    /**
     * @param {Date} date
     * @param {Number} days
     */
    goto(date, days) {
    }

    /**
     * Items of the adapter changed: rebuild
     */
    refresh() {
        this.isDestroyed || this.populate()
    }

    populate() {
        this.itemsByUid.clear();
        this.viewModel = [...this.adapter.items];
        this.currentCreation && this.viewModel.unshift(this.currentCreation);
        this.render()
    }

    render() {
    }

    /**
     * @param {CalendarItem} item
     */
    registerItem(item) {
        this.itemsByUid.set(item.uid, item)
    }

    /**
     * Item of a DOM event (path through an event node)
     * @param {Object} data dom event
     * @returns {CalendarItem|null}
     */
    itemFromEvent(data) {
        const node = data.path?.find(n => n.data?.uid);
        return node ? this.itemsByUid.get(node.data.uid) || null : null
    }

    /**
     * Value of a data attribute on the event's path, e.g. 'date'
     * @param {Object} data
     * @param {String} key
     * @returns {String|null}
     */
    static dataFromEvent(data, key) {
        return data.path?.find(n => n.data?.[key] !== undefined)?.data[key] ?? null
    }

    /**
     * vdom of an item (GOUI eventHtml())
     * @param {CalendarItem} item
     * @param {Object} opts
     * @param {Object} [opts.style]
     * @param {String} [opts.part] suffix of the node id when the item shows more than once (weeks)
     * @param {Boolean} [opts.withIcons=true]
     * @param {Object[]} [opts.cn] own content instead of the default
     * @param {String[]} [opts.cls]
     * @returns {Object}
     */
    eventNode(item, {style = {}, part = '', withIcons = true, cn = null, cls = []} = {}) {
        let me     = this,
            e      = item.data,
            allDay = !!e.showWithoutTime;

        me.registerItem(item);

        if (!cn) {
            const meta = [
                ...item.categories.map(cat => ({tag: 'i', cls: ['cat'], title: cat.name, style: {color: '#' + cat.color}})),
                ...(withIcons ? item.icons.map(icon => ({tag: 'i', cls: ['go-icon'], text: icon})) : [])
            ];

            if (!allDay) {
                meta.push({tag: 'span', text: formatTime(item.start) + (item.dayLength > 1 ? ' - ' + formatTime(item.end) : '')})
            }

            const location = item.patched.location ? ' @ ' + (/^https?:\/\//.test(item.patched.location) ? 'Web' : item.patched.location) : '';

            cn = [{tag: 'em', text: (item.title || `(${t(e.privacy && e.privacy !== 'public' ? 'Private' : 'Nameless')})`) + location}];

            (!allDay || meta.length) && cn.unshift({tag: 'span', cn: meta})
        }

        const node = {
            tag       : 'div',
            id        : `${me.id}__ev_${item.uid}${part ? '_' + part : ''}`,
            'data-uid': item.uid,
            title     : calendarData.prefs.showTooltips === false ? null : CalendarView.tooltipText(item),
            cls       : [
                ...cls,
                allDay ? 'allday' : null,
                item.isDeclined || item.isCancelled ? 'declined' : null,
                item.needsAction ? 'undecided' : null,
                !allDay && item.dayLength > 1 ? 'multiday' : null,
                item.uid === me.selectedUid || (item.key && item.key === me.selectedKey) ? 'selected' : null,
                item === me.currentCreation ? 'new' : null
            ].filter(Boolean),
            style: {color: '#' + item.color, ...style},
            cn
        };

        // neo would render title="null"
        node.title || delete node.title;

        return node
    }

    /**
     * Plain text for the title attribute
     * @param {CalendarItem} item
     * @returns {String}
     */
    static tooltipText(item) {
        const lines = [item.title, ...item.humanReadableDate().filter(Boolean)];

        item.cal?.name && lines.push(item.cal.name);
        item.patched.location && lines.push(t('Location') + ': ' + item.patched.location);

        return lines.join('\n')
    }

    /**
     * Row in a week for an all day line (GOUI calcRow()), marks the slots used
     * @param {Number} start day index
     * @param {Number} days
     * @returns {Number}
     */
    calcRow(start, days) {
        const end = Math.min(start + days, this.slots.length);

        for (let row = 0; row < 40; row++) {
            let free = true;

            for (let i = start; i < end; i++) {
                if (this.slots[i][row]) {
                    free = false;
                    break
                }
            }

            if (free) {
                for (let i = start; i < end; i++) {
                    this.slots[i][row] = true
                }
                return row
            }
        }

        return 40
    }

    /**
     * Style of a line in a week row (GOUI makestyle())
     * @param {CalendarItem} item
     * @param {Date} weekStart
     * @returns {Object}
     */
    lineStyle(item, weekStart) {
        const days  = diffDays(weekStart, item.start),
              pos   = Math.max(0, days),
              width = item.dayLength + Math.min(0, days),
              slots = this.slots.length,
              row   = this.calcRow(pos, width);

        return {
            width: (Math.min(slots - pos, width) * (100 / slots) - .2).toFixed(2) + '%',
            left : (pos * (100 / slots)).toFixed(2) + '%',
            top  : (row * this.rowHeight).toFixed(2) + 'rem'
        }
    }

    /**
     * vdom of an item as a line in a week row
     * @param {CalendarItem} item
     * @param {Date} weekStart
     * @param {Boolean} withIcons
     * @returns {Object}
     */
    eventLine(item, weekStart, withIcons = true) {
        const node = this.eventNode(item, {style: this.lineStyle(item, weekStart), part: ymd(weekStart), withIcons});

        diffDays(weekStart, item.start) < 0 && node.cls.push('continues');

        return node
    }

    /**
     * @param {CalendarItem|null} item
     */
    selectItem(item) {
        let me = this;

        me.selectedUid = item?.uid || null;
        me.selectedKey = item?.key || null;
        me.render();
        me.fire('selectItem', {item})
    }

    onViewClick(data) {
        let me   = this,
            item = me.itemFromEvent(data);

        if (item) {
            me.selectItem(item);
            return
        }

        const action = CalendarView.dataFromEvent(data, 'action'),
              date   = CalendarView.dataFromEvent(data, 'date') || CalendarView.dataFromEvent(data, 'day');

        if (action && date) {
            me.fire(action, {day: parseDate(date)})
        }
    }

    onViewDblClick(data) {
        const item = this.itemFromEvent(data);

        if (item && item.key && !item.isNew()) {
            item.open()
        }
    }

    onViewKeyDown(data) {
        if (data.key === 'Delete') {
            const item = this.selectedUid && this.itemsByUid.get(this.selectedUid);
            item?.key && !item.readOnly && item.remove()
        }
    }

    onViewContextMenu(data) {
        let me     = this,
            item   = me.itemFromEvent(data),
            target = {x: data.clientX, y: data.clientY, width: 1, height: 1};

        if (item) {
            me.selectItem(item);

            if (!item.key || item.readOnly || item.isNew()) {
                return
            }

            me.showItemMenu(item, target);
            return
        }

        const date = me.contextDate(data);
        date && me.showEmptyMenu(date, target)
    }

    /**
     * Date ("Y-m-d" or with a time) of an empty slot context click
     * @param {Object} data
     * @returns {String|null}
     */
    contextDate(data) {
        return CalendarView.dataFromEvent(data, 'date')
    }

    /**
     * Drag state: {type, item, …} while the mouse button is down
     * @member {Object|null} drag
     */
    drag = null

    /**
     * Node of the event's path with a data attribute
     * @param {Object} data
     * @param {String} key
     * @returns {Object|undefined}
     */
    static nodeWith(data, key) {
        return data.path?.find(n => n.data?.[key] !== undefined)
    }

    onDragDown(data) {
        if (data.button !== 0 || CalendarView.dataFromEvent(data, 'action')) {
            return
        }

        this.dragDown(data)
    }

    /**
     * Starts a drag (GOUI makeDraggableDay()): on an item it moves the item by days, on a day
     * it draws a new event over the days the mouse passes
     * @param {Object} data mousedown
     * @param {Boolean} [withoutTime] new events are all day (week view's all day row)
     * @protected
     */
    dragDown(data, withoutTime = false) {
        let me      = this,
            evNode  = CalendarView.nodeWith(data, 'uid'),
            dayNode = CalendarView.nodeWith(data, 'date');

        if (evNode) {
            const item = me.itemsByUid.get(evNode.data.uid),
                  date = me.dateAt(data);

            if (item && item.mayChange && item.key && date) {
                me.drag = {type: 'moveDay', item, last: date, moved: false}
            }
            return
        }

        if (dayNode) {
            const date   = parseDate(dayNode.data.date),
                  dd     = calendarData.prefs.defaultDuration,
                  allDay = withoutTime || !dd,
                  start  = new Date(date);

            allDay ? start.setHours(0, 0, 0, 0) : start.setHours(new Date().getHours(), 0, 0, 0);

            const item = CalendarView.newItem(start, {showWithoutTime: allDay});

            me.currentCreation = item;
            me.drag = {type: 'createDay', item, anchor: date, withoutTime, moved: false};
            me.addCls('go-cal-dragging');
            me.populate()
        }
    }

    /**
     * Day under the mouse: a day cell, or the column of the events layer of a week row
     * @param {Object} data
     * @returns {Date|null}
     */
    dateAt(data) {
        const day = CalendarView.nodeWith(data, 'date');

        if (day && !CalendarView.nodeWith(data, 'uid')) {
            return parseDate(day.data.date)
        }

        const layer = CalendarView.nodeWith(data, 'week');

        if (layer?.rect) {
            const days  = Number(layer.data.days) || 7,
                  index = Math.max(0, Math.min(days - 1, Math.floor((data.clientX - layer.rect.x) / layer.rect.width * days)));

            return addDays(parseDate(layer.data.week), index)
        }

        return null
    }

    onDragMove(data) {
        let me   = this,
            drag = me.drag;

        if (!drag) {
            return
        }

        if (data.buttons === 0) {
            // released outside the browser window
            me.onDragUp(data);
            return
        }

        me.dragMove(data)
    }

    /**
     * @param {Object} data mousemove
     * @protected
     */
    dragMove(data) {
        let me   = this,
            drag = me.drag,
            date = me.dateAt(data);

        if (!date || (drag.last && sameDay(drag.last, date))) {
            return
        }

        drag.last  = date;
        drag.moved = true;
        me.addCls('go-cal-dragging');

        const item = drag.item;

        if (drag.type === 'moveDay') {
            const start = new Date(item.start);
            start.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());

            item.end   = addDuration(start, diffDuration(item.start, item.end));
            item.start = start
        } else {
            const [from, till] = drag.anchor <= date ? [drag.anchor, date] : [date, drag.anchor],
                  allDay       = !sameDay(from, till) || drag.withoutTime || !calendarData.prefs.defaultDuration;

            item.data.showWithoutTime = allDay;

            if (allDay) {
                item.start = startOfDay(from);
                item.end   = addDays(startOfDay(till), 1)
            } else {
                const start = new Date(from);
                start.setHours(item.start.getHours(), item.start.getMinutes(), 0, 0);
                item.start = start;
                item.end   = addDuration(start, item.data.duration || 'PT1H')
            }
        }

        me.render()
    }

    onDragUp() {
        let me   = this,
            drag = me.drag;

        if (!drag) {
            return
        }

        me.drag = null;
        me.removeCls('go-cal-dragging');
        me.removeCls('resizing');

        if (drag.moved || drag.type.startsWith('create')) {
            drag.item.save(() => {
                // cancelled: back to the stored times
                me.currentCreation = null;
                me.refresh()
            })
        }
    }

    onDragLeave(data) {
        // capture: only leaving the view itself ends the drag
        data.target?.id === this.id && this.drag && this.onDragUp(data)
    }

    showMenu(items, target) {
        MenuList.showAt({
            appName : this.appName,
            windowId: this.windowId,
            target,
            align   : {edgeAlign: 't0-t0', offset: [0, 0]},
            items
        })
    }

    /**
     * GOUI CalendarView.contextMenu
     * @param {CalendarItem} item
     * @param {Object} target
     */
    showItemMenu(item, target) {
        const status = item.calendarPrincipal?.participationStatus,
              rsvp   = !item.isOwner && !!item.calendarPrincipal,
              radio  = value => status === value ? 'radio_button_checked' : 'radio_button_unchecked',
              items  = [];

        item.mayChange && items.push({text: t('Edit'), icon: 'edit', handler: () => item.open()});
        items.push({text: t('Info'), icon: 'info', handler: () => item.info()}, {separator: true});

        if (rsvp) {
            items.push(
                {text: t('Accept'), icon: radio('accepted'), handler: () => item.updateParticipation('accepted')},
                {text: t('Maybe'), icon: radio('tentative'), handler: () => item.updateParticipation('tentative')},
                {text: t('Decline'), icon: radio('declined'), handler: () => item.updateParticipation('declined')},
                {separator: true}
            )
        }

        items.push(
            {text: t('Delete'), icon: 'delete', disabled: !item.mayMove, handler: () => item.remove()},
            {text: t('Cut'), icon: 'content_cut', handler: () => item.cut()},
            {text: t('Copy'), icon: 'content_copy', handler: () => item.copy()},
            {separator: true},
            {text: t('E-mail participants'), icon: 'email', disabled: !item.data.participants, handler: () => {
                const to = Object.values(item.data.participants || {}).map(p => p.email).filter(Boolean).join(', ');
                to && CalendarItem.ui.mailTo(to)
            }},
            {text: t('Download ICS'), icon: 'import_export', handler: () => item.downloadIcs()}
        );

        this.showMenu(items, target)
    }

    /**
     * GOUI CalendarView.contextMenuEmpty
     * @param {String} date "Y-m-d" or "Y-m-dTH:i:s"
     * @param {Object} target
     */
    showEmptyMenu(date, target) {
        const clip = CalendarItem.clipboard;

        this.showMenu([{
            text   : t('Appointment'),
            icon   : 'add',
            handler: () => this.createAt(date)
        }, {separator: true}, {
            text    : clip ? t('Paste') + ' ' + clip.title : t('Paste'),
            icon    : 'content_paste',
            disabled: !clip,
            handler : () => CalendarItem.paste(CalendarView.selectedCalendarId, date)
        }], target)
    }

    /**
     * Opens the editor for a new event at a date (the current hour for a day)
     * @param {String} date
     */
    createAt(date) {
        let start;

        if (date.length > 10) {
            start = parseDate(date)
        } else {
            start = new Date();
            const day = parseDate(date);
            start.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
            start.setMinutes(0, 0, 0)
        }

        CalendarView.newItem(start).save()
    }

    /**
     * A new event with the user's default duration (GOUI "new event" handlers)
     * @param {Date} start
     * @param {Object} [data]
     * @returns {CalendarItem}
     */
    static newItem(start, data = {}) {
        const dd     = calendarData.prefs.defaultDuration,
              allDay = data.showWithoutTime ?? dd == null;

        allDay && (start = startOfDay(start));

        return new CalendarItem({
            key : '',
            data: {
                start          : allDay ? ymd(start) : ymdhis(start),
                title          : t('New event'),
                showWithoutTime: allDay,
                // an all day event lasts days, also with a timed default duration
                duration       : allDay ? 'P1D' : (dd ?? 'PT1H'),
                calendarId     : CalendarView.selectedCalendarId,
                ...data
            }
        })
    }

    /**
     * Days to show the items of: first day and the one after the last
     * @returns {Date[]}
     */
    get range() {
        return [this.day, addDays(this.day, this.days)]
    }
}

export default Neo.setupClass(CalendarView);
