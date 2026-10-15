/**
 * View model of one item in the calendar views (GOUI CalendarItem). A CalendarEvent gives
 * one item, or one per occurrence when it recurs; holidays, tasks and birthdays come as
 * items too (CalendarAdapter providers).
 *
 * The dialogs it opens (editor, detail, "this event / all events" questions) come from
 * CalendarItem.ui, set by the calendar main view.
 */
import client     from '../../../../../../views/neo/src/jmap/Client.mjs';
import {escapeHtml, smartDateTime} from '../../../../../../views/neo/src/Format.mjs';
import RecurrenceField from '../../../../../../views/neo/src/form/field/RecurrenceField.mjs';
import {translator} from '../../../../../../views/neo/src/Translate.mjs';
import calendarData from './data.mjs';
import Recurrence   from './util/Recurrence.mjs';
import {addDays, addDuration, diffDays, diffDuration, format, formatTime, parseDate, sameDay, toUserTime, ymd, ymdhis} from './util/date.mjs';

const t = translator('community', 'calendar');

/** participationStatus → [icon, text, colour class] */
export const statusIcons = () => ({
    'accepted'    : ['check_circle', t('Accepted'), 'green'],
    'tentative'   : ['help', t('Maybe'), 'orange'],
    'declined'    : ['block', t('Declined'), 'red'],
    'needs-action': ['schedule', t('Awaiting reply'), 'orange']
});

/**
 * @param {Object} p Participant
 * @returns {String[]} [icon, text, colour class]
 */
export function participantStatusIcon(p) {
    if (p.scheduleStatus) {
        if (p.scheduleStatus === '1.0') {
            return ['pending', t('Invite not send yet'), 'orange']
        }

        if (String(p.scheduleStatus)[0] !== '1') {
            return ['error', p.scheduleStatus, 'danger']
        }
    }

    const icons = statusIcons();
    return icons[p.participationStatus] || icons['needs-action']
}

/**
 * JMAP patch ("participants/u1/participationStatus": "accepted") applied to an object
 * @param {Object} target changed in place
 * @param {Object|null} patch
 * @returns {Object} target
 */
export function applyPatch(target, patch) {
    Object.entries(patch || {}).forEach(([path, value]) => {
        const keys = path.split('/'),
              last = keys.pop();
        let obj = target;

        for (const key of keys) {
            if (obj[key] === null || typeof obj[key] !== 'object') {
                obj[key] = {}
            }
            obj = obj[key]
        }

        value === null ? delete obj[last] : (obj[last] = value)
    });

    return target
}

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

let tempId = 0;

export default class CalendarItem {
    /** @member {CalendarItem|null} clipboard cut/copied item */
    static clipboard = null

    /**
     * Dialogs and messages, set by the calendar main view:
     * {openEditor(item, {onCancel}), openDetail(item), choose({title, text, icon, buttons}), confirm(text),
     *  error(e), mask(), unmask(), noWritableCalendar()}
     * @member {Object} ui
     */
    static ui = null

    /**
     * Provider of the item: 'event', 'holiday', 'task', 'birthday'
     * @member {String} provider
     */
    provider = 'event'

    /**
     * @param {Object} config
     * @param {String|null} config.key id, id/recurrenceId, '' for a new event, null for one from an invitation
     * @param {Object} config.data CalendarEvent (or what a provider makes of its record)
     * @param {String} [config.recurrenceId]
     * @param {Object} [config.override] recurrence override patch
     * @param {Date} [config.start] start, else from data
     * @param {String[]} [config.extraIcons]
     * @param {String} [config.defaultColor]
     * @param {Object} [config.cal] calendar, else found by data.calendarId
     * @param {Function} [config.open] replaces open() (tasks, birthdays)
     */
    constructor(config) {
        let me = this;

        Object.assign(me, config);

        me.uid      = 'ci' + (++tempId);
        me.patched  = applyPatch(clone(config.data) || {}, config.override);

        if (config.recurrenceId && !config.override?.start) {
            me.patched.start = config.recurrenceId
        }

        const allDay = !!me.data.showWithoutTime;

        if (!config.start) {
            me.start = parseDate(me.patched.start) || new Date();
            allDay && me.start.setHours(0, 0, 0, 0);

            // the stored zone is the event's, show the user's wall time
            if (me.data.timeZone && !allDay) {
                me.start = toUserTime(me.start, me.data.timeZone)
            }
        } else {
            me.start = new Date(config.start)
        }

        me.end = config.end ? new Date(config.end) : addDuration(me.start, me.patched.duration || 'PT1H');

        me.calendarIds = {[me.patched.calendarId]: true};

        if (!me.cal) {
            me.cal = calendarData.getCalendar(me.patched.calendarId);

            if (!me.cal) {
                // not subscribed: read only
                me.readOnly = true;
                me.cal      = {id: me.patched.calendarId, isVisible: true, myRights: {}}
            }
        }

        me.categories = (me.patched.categoryIds || []).map(id => calendarData.getCategory(id)).filter(Boolean);

        me.initStart = ymdhis(me.start);
        me.initEnd   = ymdhis(me.end);

        me.title      ??= me.patched.title || '';
        me.extraIcons = [...(config.extraIcons || [])];

        // "L…": an event from a linked calendar, not movable
        if (config.key && config.key[0] === 'L') {
            me.extraIcons.push('logout');
            me.readOnly = true;
            me.open = async () => {}
        }
    }

    /**
     * A CalendarEvent's items between from and until (GOUI CalendarItem.expand())
     * @param {Object} e CalendarEvent
     * @param {Date} from
     * @param {Date} until
     * @returns {Generator<CalendarItem>}
     */
    static *expand(e, from, until) {
        const start = parseDate(e.start),
              end   = addDuration(start, e.duration || 'PT1H');

        if (e.recurrenceRule) {
            const overrides = e.recurrenceOverrides || {};

            for (const recurrenceId in overrides) {
                const o = overrides[recurrenceId];

                if (o.excluded) {
                    continue
                }

                const oStart = parseDate(o.start ?? recurrenceId);

                if (oStart < until && addDuration(oStart, o.duration ?? e.duration) > from) {
                    yield new CalendarItem({key: e.id + '/' + recurrenceId, recurrenceId, override: o, data: e})
                }
            }

            // a day of margin: the zone conversion may move occurrences across the range edges
            const r = new Recurrence({dtstart: start, rule: e.recurrenceRule});

            for (const date of r.loop(addDays(from, -1 - Math.max(0, diffDays(start, end))), addDays(until, 1))) {
                // GO's recurrence ids always carry a time, also for all day events
                const recurrenceId = ymdhis(date);

                if (!(recurrenceId in overrides)) {
                    const item = new CalendarItem({key: e.id + '/' + recurrenceId, recurrenceId, data: e});

                    if (item.end > from && item.start < until) {
                        yield item
                    }
                }
            }
        } else if (end > from && start < until) {
            yield new CalendarItem({key: String(e.id), data: e})
        }
    }

    isNew() {
        return this.key === ''
    }

    isTimeModified() {
        return this.isNew() || this.initStart !== ymdhis(this.start) || this.initEnd !== ymdhis(this.end)
    }

    /**
     * Item of one override (invitation for an occurrence)
     * @param {String} recurrenceId
     * @returns {CalendarItem}
     */
    patchedInstance(recurrenceId) {
        const o = this.data.recurrenceOverrides?.[recurrenceId];

        if (!this.data.recurrenceRule || !o || o.excluded) {
            throw new Error('Not found')
        }

        return new CalendarItem({key: this.data.id + '/' + recurrenceId, recurrenceId, override: o, data: this.data})
    }

    get isRecurring() {
        return !!((this.key && this.key.includes('/')) || this.data.recurrenceRule)
    }

    get isOverride() {
        return !!(this.recurrenceId && this.data.recurrenceOverrides && this.recurrenceId in this.data.recurrenceOverrides)
    }

    get isDeclined() {
        return this.calendarPrincipal?.participationStatus === 'declined'
    }

    get isCancelled() {
        return this.patched.status === 'cancelled'
    }

    get isTentative() {
        return this.calendarPrincipal?.participationStatus === 'tentative'
    }

    get needsAction() {
        return this.calendarPrincipal?.participationStatus === 'needs-action' && !this.isOwner
    }

    /**
     * @returns {String} hex colour without #
     */
    get color() {
        return this.cal?.color || this.defaultColor || '356772'
    }

    get participants() {
        return this.patched.participants
    }

    get owner() {
        return Object.values(this.participants || {}).find(p => p.roles?.owner)
    }

    /**
     * Days the item spans (an end at 00:00 does not count)
     * @returns {Number}
     */
    get dayLength() {
        return 1 + diffDays(this.start, new Date(this.end.getTime() - 1000))
    }

    /**
     * Material icons shown with the title
     * @returns {String[]}
     */
    get icons() {
        const e     = this.data,
              icons = [...this.extraIcons];

        e.links && Object.keys(e.links).length && icons.push('attachment');
        e.alerts && Object.keys(e.alerts).length && icons.push('notifications');
        this.isTentative && icons.push('question_mark');
        e.participants && Object.keys(e.participants).length && icons.push('group');
        e.privacy && e.privacy !== 'public' && icons.push('lock');

        return icons
    }

    get isOwner() {
        if (!this.participants) {
            return true
        }

        const hasOwner = Object.values(this.participants).some(p => p.roles?.owner);
        return !hasOwner || !!this.calendarPrincipal?.roles?.owner
    }

    get mayChange() {
        return (this.isNew() || (!!this.cal.myRights?.mayWriteOwn && this.isOwner)) && !this.readOnly
    }

    /**
     * Change the calendar, delete one occurrence or the series
     * @returns {Boolean}
     */
    get mayMove() {
        return !!this.cal.myRights?.mayWriteAll && !this.readOnly
    }

    /**
     * The participant that is the calendar's owner (or the resource of a resource calendar)
     * @returns {Object|undefined}
     */
    get calendarPrincipal() {
        let me = this;

        if (me._calendarPrincipal) {
            return me._calendarPrincipal
        }

        const aliases = me.ownerAliases.map(a => String(a).toLowerCase());

        for (const id in me.participants || {}) {
            const p = me.participants[id];

            if (me.cal.groupId) {
                if (p.kind === 'resource' && id.slice('Calendar:'.length) == me.cal.id) {
                    return me._calendarPrincipal = p
                }
            } else if (p.kind !== 'resource' && p.email && aliases.includes(p.email.toLowerCase())) {
                return me._calendarPrincipal = p
            }
        }

        return undefined
    }

    /**
     * Owner of the calendar, the current user for shared calendars
     * @returns {String}
     */
    get ownerId() {
        return String(this.cal?.ownerId || client.user.id)
    }

    /**
     * @returns {String[]} e-mail addresses of the calendar owner
     */
    get ownerAliases() {
        const aliases = this.cal?.owner ? this.cal.owner.emailAliases : calendarData.user.emailAliases;
        return aliases?.length ? aliases : [calendarData.user.email].filter(Boolean)
    }

    /**
     * Tooltip / quick info as HTML (GOUI quickText)
     * @returns {String}
     */
    get quickText() {
        let me    = this,
            cal   = me.cal?.name ? `<sup style="color:#${escapeHtml(me.cal.color)}">${escapeHtml(me.cal.name)}</sup>` : '',
            lines = [`<h2 class="go-cal-quick-title">${escapeHtml(me.title)}</h2>${cal}`, ...me.humanReadableDate().filter(Boolean).map(escapeHtml)];

        if (me.isRecurring && me.data.recurrenceRule) {
            lines.push(escapeHtml(RecurrenceField.toText(me.data.recurrenceRule, me.start)))
        }

        if (me.participants) {
            lines.push('<hr>' + escapeHtml(t('Participants')));

            Object.values(me.participants).forEach(p => {
                const [icon, text, cls] = participantStatusIcon(p);
                lines.push(`<i class="go-icon ${cls}" title="${escapeHtml(text)}">${icon}</i> ${escapeHtml(p.name || p.email)}`)
            })
        }

        if (me.patched.location) {
            lines.push(`<div class="go-cal-pre">${escapeHtml(t('Location'))}: ${escapeHtml(me.patched.location)}</div>`)
        }

        if (me.patched.description) {
            lines.push(`<p class="go-cal-quick-desc">${escapeHtml(me.patched.description).replace(/\n/g, '<br>')}</p>`)
        }

        if (me.data.createdAt) {
            lines.push('<hr>' + escapeHtml(t('Created at') + ': ' + smartDateTime(me.data.createdAt)));
            me.data.modifiedAt && lines.push(escapeHtml(t('Modified at') + ': ' + smartDateTime(me.data.modifiedAt)))
        }

        return lines.join('<br>')
    }

    /**
     * Two lines: the date(s) and the time(s)
     * @returns {String[]}
     */
    humanReadableDate() {
        const start   = this.start,
              end     = new Date(this.end),
              allDay  = !!this.data.showWithoutTime,
              fullDay = this.data.duration === 'P1D',
              oneDay  = fullDay || sameDay(start, end) || (allDay && this.dayLength === 1);

        let line1 = format(start, 'l j F Y'),
            line2;

        if (!oneDay) {
            !allDay && (line1 += ', ' + formatTime(start));
            line1 += ' ' + t('until')
        }

        if (fullDay || (allDay && oneDay)) {
            line2 = t('All day')
        } else if (oneDay) {
            line2 = `${formatTime(start)} - ${formatTime(end)}`
        } else {
            allDay && end.setSeconds(end.getSeconds() - 1);
            line2 = format(end, 'l j F Y') + (allDay ? '' : ', ' + formatTime(end))
        }

        return [line1, line2]
    }

    /**
     * The event (or series) has ended
     * @returns {Boolean}
     */
    get isInPast() {
        let last = this.end;
        const e = this.data;

        if (this.isRecurring && e.recurrenceRule) {
            if (e.recurrenceRule.count) {
                const r = new Recurrence({dtstart: parseDate(e.start), rule: e.recurrenceRule});
                let lastDate = null;

                for (const date of r.all()) {
                    lastDate = date
                }

                lastDate && (last = addDuration(lastDate, e.duration))
            } else if (e.recurrenceRule.until) {
                last = parseDate(e.recurrenceRule.until);
                String(e.recurrenceRule.until).length === 10 && (last = addDays(last, 1));
                last = addDuration(last, e.duration)
            } else {
                return false
            }
        }

        return last < new Date()
    }

    /**
     * Saves a changed time (drag & drop), opens the editor for a new event
     * @param {Function} [onCancel]
     */
    save(onCancel) {
        let me = this;

        const f        = me.data.showWithoutTime ? ymd : ymdhis,
              start    = f(me.start),
              duration = diffDuration(me.start, me.end);

        if (!me.isTimeModified()) {
            return
        }

        if (me.data.id) {
            me.patch({start, duration}, undefined, onCancel)
        } else {
            me.data.start    = start;
            me.data.duration = duration;
            me.open(onCancel);

            // the new event goes into a hidden calendar: show it
            if (me.cal && me.cal.isVisible === false && me.cal.id) {
                client.set('Calendar', {update: {[me.cal.id]: {isVisible: true}}}).catch(e => console.error(e))
            }
        }
    }

    info() {
        return CalendarItem.ui.openDetail(this)
    }

    /**
     * Editor for events the user may change, else the detail
     * @param {Function} [onCancel]
     * @param {Boolean} [forceWrite]
     */
    async open(onCancel, forceWrite) {
        let me = this,
            ui = CalendarItem.ui;

        if (!forceWrite && !me.mayChange) {
            return ui.openDetail(me)
        }

        if (!calendarData.writableCalendars.length) {
            const calendar = await ui.noWritableCalendar();

            if (!calendar) {
                onCancel?.();
                return
            }

            me.cal = calendar;
            me.data.calendarId = calendar.id;
            me.readOnly = false
        } else if (!me.data.calendarId) {
            me.data.calendarId = calendarData.prefs.defaultCalendarId || calendarData.writableCalendars[0].id
        }

        return ui.openEditor(me, {onCancel})
    }

    downloadIcs() {
        const name = `${this.cal.name || 'calendar'}_${format(this.start, 'Y-m-d\\THi')}_${this.title}.ics`;
        CalendarItem.ui.download('community/calendar/ics/' + this.key, name)
    }

    /**
     * 'new' | 'update' | 'cancel' | 'delete' | 'status' when participants get an e-mail
     * @param {Object|false} modified false: deleting
     * @returns {String|undefined}
     */
    shouldSchedule(modified) {
        if (modified === false) {
            if (this.participants && Object.keys(this.participants).length && !this.isCancelled) {
                return this.isOwner ? 'cancel' : 'delete'
            }
            return undefined
        }

        if (!this.isOwner && Object.keys(modified).some(k => k.startsWith('participants'))) {
            return 'status'
        }

        if ((modified.participants && Object.keys(modified.participants).length) || (this.participants && Object.keys(this.participants).length)) {
            if (!this.key) {
                return 'new'
            }

            if (['start', 'duration', 'end', 'description', 'title', 'showWithoutTime', 'location', 'participants', 'recurrenceRule']
                .some(k => Object.prototype.hasOwnProperty.call(modified, k))) {
                return 'update'
            }
        }

        return undefined
    }

    /**
     * Asks whether participants get an e-mail ("Send" / "Save only"), or confirms a delete
     * @param {Object|false} modified false: deleting
     * @returns {Promise<{send: Boolean}|null>} null: cancelled
     */
    async confirmScheduleMessage(modified) {
        let me   = this,
            ui   = CalendarItem.ui,
            type = me.shouldSchedule(modified);

        if (type) {
            const choice = await ui.choose({
                title  : t(type + 'ScheduleTitle'),
                icon   : 'email',
                text   : t(type + 'ScheduleText'),
                warning: me.isInPast ? t('This event is in the past!') : null,
                buttons: [
                    {text: t('Cancel'), value: null},
                    '->',
                    {text: t('Save only'), value: 'save'},
                    {text: t('Send'), value: 'send', primary: true}
                ]
            });

            if (!choice) {
                return null
            }

            modified && Object.assign(me.data, modified);
            return {send: choice === 'send'}
        }

        if (modified) {
            Object.assign(me.data, modified);
            return {send: false}
        }

        return await ui.confirm(t('Are you sure you want to delete the selected item?')) ? {send: false} : null
    }

    /**
     * CalendarEvent/set
     * @param {Object} args {create, update, destroy}
     * @param {Boolean} send sendSchedulingMessages
     * @returns {Promise<Object>}
     */
    static async set(args, send = false) {
        const ui = CalendarItem.ui;

        ui?.mask();

        try {
            const response = await client.call('CalendarEvent/set', {...args, ...(send ? {sendSchedulingMessages: true} : {})}),
                  errors   = {...response.notCreated, ...response.notUpdated, ...response.notDestroyed},
                  first    = Object.values(errors)[0];

            if (first) {
                throw new Error(client.constructor.describeSetError(first))
            }

            return response
        } catch (e) {
            ui?.error(e);
            throw e
        } finally {
            ui?.unmask()
        }
    }

    static update(id, changes, send) {
        return CalendarItem.set({update: {[id]: changes}}, send)
    }

    /**
     * Saves changes, asking for recurring events which occurrences change (GOUI patch())
     * @param {Object} modified
     * @param {Function} [onFinish]
     * @param {Function} [onCancel]
     * @param {Boolean} [skipAsk] change the whole series without asking
     */
    async patch(modified, onFinish, onCancel, skipAsk = false) {
        let me = this;

        if (!me.isRecurring) {
            const answer = await me.confirmScheduleMessage(modified);

            if (!answer) {
                onCancel?.();
                return
            }

            await CalendarItem.update(me.data.id, modified, answer.send).then(() => onFinish?.(), () => onCancel?.())
        } else if (me.isOverride) {
            await me.patchOccurrence(modified, onFinish, onCancel)
        } else if (skipAsk || !me.recurrenceId) {
            await me.patchSeries(modified, onFinish, onCancel)
        } else {
            const isFirstInSeries = me.data.start == me.recurrenceId,
                  choice          = await CalendarItem.ui.choose({
                      title  : t('Do you want to edit a recurring event?'),
                      icon   : 'event_repeat',
                      text   : t('You will be editing a recurring event. Do you want to edit this occurrence only or all future occurrences?'),
                      buttons: ['->',
                          // the rule or privacy can only change for the series (from here on)
                          {text: t('This event'), value: 'this', primary: true, hidden: !!(modified.recurrenceRule || modified.privacy)},
                          {text: t('This and future events'), value: 'future', hidden: isFirstInSeries || !me.isOwner},
                          {text: t('All events'), value: 'all', hidden: !isFirstInSeries && me.isOwner}
                      ]
                  });

            switch (choice) {
                case 'this'  : await me.patchOccurrence(modified, onFinish, onCancel); break;
                case 'future': await me.patchThisAndFuture(modified, onFinish, onCancel); break;
                case 'all'   : await me.patchSeries(modified, onFinish, onCancel); break;
                default      : onCancel?.()
            }
        }
    }

    async patchSeries(modified, onFinish, onCancel) {
        const answer = await this.confirmScheduleMessage(modified);

        if (!answer) {
            onCancel?.();
            return
        }

        await CalendarItem.update(this.data.id, modified, answer.send).then(() => onFinish?.(), () => onCancel?.())
    }

    /**
     * Saves the changes of one occurrence as a recurrence override
     */
    async patchOccurrence(modified, onFinish, onCancel) {
        let me    = this,
            patch = me.isOverride ? {...me.data.recurrenceOverrides[me.recurrenceId]} : {};

        let original;

        try {
            [original] = await client.get('CalendarEvent', [me.data.id]);
        } catch (e) {
            CalendarItem.ui.error(e);
            onCancel?.();
            return
        }

        if (!original) {
            onCancel?.();
            return
        }

        const answer = await me.confirmScheduleMessage(modified);

        if (!answer) {
            onCancel?.();
            return
        }

        for (const name of ['start', 'duration', 'title', 'freeBusyStatus', 'location', 'status', 'description']) {
            // only what differs from the series
            if (name in modified && modified[name] != original[name]) {
                patch[name] = modified[name]
            }
        }

        if (modified.participants) {
            // the participant part of the patch is rebuilt completely
            Object.keys(patch).forEach(key => key.startsWith('participants/') && delete patch[key]);

            for (const key in modified.participants) {
                const p = modified.participants[key],
                      o = original.participants?.[key];

                if (o) {
                    for (const prop in p) {
                        if (prop === 'roles') {
                            if (p.roles?.optional != o.roles?.optional) {
                                patch[`participants/${key}/${prop}`] = p[prop]
                            }
                        } else if (p[prop] != o[prop]) {
                            patch[`participants/${key}/${prop}`] = p[prop]
                        }
                    }
                } else {
                    patch['participants/' + key] = p
                }
            }

            Object.keys(original.participants || {}).forEach(key => {
                key in modified.participants || (patch['participants/' + key] = null)
            })
        }

        const data = me.data.recurrenceOverrides
            ? {['recurrenceOverrides/' + me.recurrenceId]: patch}
            : {recurrenceOverrides: {[me.recurrenceId]: patch}};

        await CalendarItem.update(me.data.id, data, answer.send).then(() => onFinish?.(), () => onCancel?.())
    }

    /**
     * Overrides before `until` (the rest is dropped for "this and future")
     * @param {Date} until
     * @returns {Object}
     */
    removeFutureOverrides(until) {
        const result = {};

        Object.entries(this.data.recurrenceOverrides || {}).forEach(([recurrenceId, o]) => {
            parseDate(recurrenceId) < until && (result[recurrenceId] = o)
        });

        return result
    }

    /**
     * Ends the series the day before this occurrence and creates a new series from here
     * with the changes (JMAP calendars: splitting an event)
     */
    async patchThisAndFuture(modified, onFinish, onCancel) {
        let me    = this,
            rule  = clone(me.data.recurrenceRule),
            until = addDays(parseDate(me.recurrenceId), -1);

        rule.until = ymd(until);
        delete rule.count;

        const answer = await me.confirmScheduleMessage(modified);

        if (!answer) {
            onCancel?.();
            return
        }

        const update    = {recurrenceRule: rule},
              overrides = me.removeFutureOverrides(until);

        if (Object.keys(overrides).length !== Object.keys(me.data.recurrenceOverrides || {}).length) {
            update.recurrenceOverrides = overrides
        }

        const next = {...me.data, start: me.recurrenceId, ...modified};

        ['modifier', 'creator', 'id', 'uid', 'recurrenceOverrides', 'createdAt', 'modifiedAt', 'createdBy', 'modifiedBy', 'isOrigin']
            .forEach(key => delete next[key]);

        await CalendarItem.set({update: {[me.data.id]: update}, create: {next}}, answer.send).then(() => onFinish?.(), () => onCancel?.())
    }

    /**
     * Sets the user's participation status (Accept / Maybe / Decline)
     * @param {'accepted'|'tentative'|'declined'} status
     * @param {Function} [onFinish]
     */
    async updateParticipation(status, onFinish) {
        let me        = this,
            principal = me.calendarPrincipal;

        if (!principal) {
            throw new Error('Not a participant')
        }

        const oldStatus = principal.participationStatus;
        principal.participationStatus = status;

        await me.patch({participants: me.participants}, onFinish, () => principal.participationStatus = oldStatus, false)
    }

    cut() {
        CalendarItem.clipboard = this
    }

    copy() {
        const data = {},
              keys = ['alerts', 'categoryIds', 'duration', 'description', 'freeBusyStatus', 'location', 'participants', 'privacy',
                      'showWithoutTime', 'start', 'status', 'timeZone', 'title', 'useDefaultAlerts', 'calendarId'];

        keys.forEach(key => {
            this.data[key] !== undefined && (data[key] = clone(this.data[key]))
        });

        CalendarItem.clipboard = new CalendarItem({data, key: ''})
    }

    /**
     * Opens the clipboard item in the editor at another date
     * @param {String} calendarId
     * @param {String} date "Y-m-d" (keeps the time) or "Y-m-dTH:i…"
     */
    static async paste(calendarId, date) {
        const item = CalendarItem.clipboard;

        if (!item) {
            return
        }

        const withoutTime = date.length === 10;
        let start = new Date(item.start);

        if (withoutTime) {
            const day = parseDate(date);
            start.setFullYear(day.getFullYear(), day.getMonth(), day.getDate())
        } else {
            start = parseDate(date)
        }

        const end = addDuration(start, item.data.duration || 'PT1H');

        item.data.calendarId = calendarId || item.data.calendarId;
        item.pasteValues     = {start, end, calendarId: item.data.calendarId};

        await item.open()
    }

    /**
     * Delete (with the recurring questions), or decline an invitation
     */
    async remove() {
        let me = this,
            ui = CalendarItem.ui;

        if (!me.mayChange && !me.mayMove) {
            if (me.cal.myRights?.mayWriteAll && !me.isOwner) {
                await me.updateParticipation('declined')
            }
            return
        }

        if (!me.isOwner && me.mayMove && me.isRecurring) {
            const choice = await ui.choose({
                title  : t('This event is part of a recurring invite'),
                text   : t('Do you want to decline this occurrence or remove the entire series from your calendar?'),
                buttons: [
                    {text: t('Decline this instance'), value: 'decline', primary: true},
                    '->',
                    {text: t('Remove entire series'), value: 'series'}
                ]
            });

            if (choice === 'decline') {
                me.calendarPrincipal && (me.calendarPrincipal.participationStatus = 'declined');
                await me.patchOccurrence({participants: me.participants})
            } else if (choice === 'series') {
                await me.removeSeries()
            }
            return
        }

        if (!me.isRecurring) {
            const answer = await me.confirmScheduleMessage(false);
            answer && await CalendarItem.set({destroy: [me.data.id]}, answer.send).then(() => me.onRemoved?.(), () => {})
        } else if (me.mayChange) {
            const isFirstInSeries = me.data.start == me.recurrenceId,
                  choice          = await ui.choose({
                      title  : t('Do you want to delete a recurring event?'),
                      text   : t('You will be deleting a recurring event. Do you want to delete this occurrence only or all future occurrences?'),
                      buttons: [
                          {text: t('This event'), value: 'this', primary: true},
                          // not for recurring invitations
                          {text: t('This and future events'), value: 'future', hidden: isFirstInSeries || !me.isOwner},
                          '->',
                          {text: t('All events'), value: 'all'}
                      ]
                  });

            switch (choice) {
                case 'this'  : await me.removeOccurrence(); break;
                case 'future': await me.removeFutureEvents(); break;
                case 'all'   : await me.removeSeries(); break
            }
        }
    }

    async removeFutureEvents() {
        const answer = await this.confirmScheduleMessage(false);

        if (answer) {
            const rule = {...this.data.recurrenceRule, until: ymd(addDays(parseDate(this.recurrenceId), -1))};
            delete rule.count;
            await CalendarItem.update(this.data.id, {recurrenceRule: rule}, answer.send).catch(() => {})
        }
    }

    async removeOccurrence() {
        const answer = await this.confirmScheduleMessage(false);

        if (answer) {
            await CalendarItem.update(this.data.id, {['recurrenceOverrides/' + this.recurrenceId]: {excluded: true}}, answer.send).catch(() => {})
        }
    }

    async removeSeries() {
        const answer = await this.confirmScheduleMessage(false);
        answer && await CalendarItem.set({destroy: [this.data.id]}, answer.send).catch(() => {})
    }

    /**
     * Removes an exception (override or excluded occurrence)
     * @param {String} recurrenceId
     */
    undoException(recurrenceId) {
        delete this.data.recurrenceOverrides?.[recurrenceId];
        return CalendarItem.update(this.data.id, {['recurrenceOverrides/' + recurrenceId]: null})
    }
}
