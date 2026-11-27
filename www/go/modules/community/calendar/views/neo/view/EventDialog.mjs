import TextArea      from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import Button        from '../../../../../../../views/neo/src/button/Button.mjs';
import UploadButton  from '../../../../../../../views/neo/src/component/UploadButton.mjs';
import BoolCheckBox  from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import DateTimeField from '../../../../../../../views/neo/src/form/field/DateTimeField.mjs';
import LocalCombo    from '../../../../../../../views/neo/src/form/field/LocalCombo.mjs';
import RecurrenceField from '../../../../../../../views/neo/src/form/field/RecurrenceField.mjs';
import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import uploader      from '../../../../../../../views/neo/src/jmap/Uploader.mjs';
import ModuleRegistry from '../../../../../../../views/neo/src/ModuleRegistry.mjs';
import TextList      from '../../../../../../../views/neo/src/list/TextList.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';
import FormWindow    from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import CalendarItem  from '../CalendarItem.mjs';
import calendarData  from '../data.mjs';
import {addDays, addDuration, diffDuration, fromUserTime, parseDate, startOfDay, toUserTime, ymd, ymdhis} from '../util/date.mjs';
import AlertField    from './field/AlertField.mjs';
import AttachmentsField from './field/AttachmentsField.mjs';
import CategoryField from './field/CategoryField.mjs';
import LocationField from './field/LocationField.mjs';
import ParticipantField from './field/ParticipantField.mjs';
import SelectField   from '../../../../../../../views/neo/src/form/field/SelectField.mjs';
import {userNow} from '../../../../../../../views/neo/src/DateUtil.mjs';

const t = translator('community', 'calendar');

const row = (items, cls = []) => ({ntype: 'container', cls: ['go-cal-form-row', ...cls], flex: 'none', layout: {ntype: 'hbox', align: 'start'}, items});

/**
 * Create or edit an event (GOUI EventWindow). Saving goes through CalendarItem: it asks
 * whether participants get an e-mail, and for recurring events which occurrences change.
 *
 *     Neo.create(EventDialog, {appName, windowId, item: calendarItem})
 *
 * Events: saved {}, cancel {}
 */
class EventDialog extends FormWindow {
    static config = {
        className : 'GO.calendar.EventDialog',
        cls       : ['go-form-window', 'go-cal-event-dialog'],
        entityName: 'CalendarEvent',
        hasLinks  : true,
        title     : t('Event'),
        wrapperStyle: {height: '85vh', left: 'calc(50vw - 310px)', top: '7vh', width: '620px'},
        /**
         * @member {CalendarItem|null} item
         */
        item: null
    }

    /** @member {Boolean} saved */
    saved = false

    /**
     * @summary Loads an existing event, or seeds a new one with the calendar's reminders, privacy and busy status.
     * @param {Object} config
     */
    construct(config) {
        const item = config.item,
              // the alert came from the event or the copied item, so don't replace it with the calendar's default
              alertChosen = !!(item.key && !item.isNew() && item.data.id) || !!item.data.alerts;

        if (item.key && !item.isNew() && item.data.id) {
            config.entityId = item.data.id
        } else {
            config.values = EventDialog.withEnd({...item.data, calendarId: item.data.calendarId ? String(item.data.calendarId) : null});

            // GOUI: a new event uses the calendar's reminders
            config.values.alerts ??= {};
            config.values.privacy ??= 'public';
            config.values.freeBusyStatus ??= 'busy';
            delete config.values.useDefaultAlerts
        }

        super.construct(config);
        this.alertChosen = alertChosen
    }

    /**
     * The "end" field: start + duration, a full day event ends on its last day
     * @param {Object} data CalendarEvent
     * @returns {Object}
     */
    static withEnd(data) {
        const start  = parseDate(data.start) || userNow(),
              allDay = !!data.showWithoutTime;

        let end = addDuration(start, data.duration || (allDay ? 'P1D' : 'PT1H'));
        allDay && (end = addDays(end, -1));

        return {...data, end: allDay ? ymd(end) : ymdhis(end)}
    }

    createFormItems() {
        let me      = this,
            item    = me.item,
            allDay  = !!item.data.showWithoutTime,
            hour    = userNow().getHours(),
            services = ModuleRegistry.getAvailable().filter(m => m.onlineMeeting).map(m => m.onlineMeeting);

        return [row([{
            module       : TextField,
            name         : 'title',
            reference    : 'titleField',
            labelText    : t('Title'),
            labelPosition: 'inline',
            placeholder  : t('Enter a title, name or place'),
            flex         : 1
        }, {
            module       : LocalCombo,
            name         : 'calendarId',
            reference    : 'calendarField',
            labelText    : t('Calendar'),
            labelPosition: 'inline',
            required     : true,
            width        : 200,
            displayField : 'name',
            valueField   : 'id',
            listConfig   : {module: TextList},
            store        : {keyProperty: 'id', data: me.calendarOptions()}
        }]), row([{
            module        : BoolCheckBox,
            name          : 'showWithoutTime',
            reference     : 'allDayField',
            valueLabel    : t('All day'),
            flex          : 'none'
        }]), row([{
            module      : DateTimeField,
            name        : 'start',
            reference   : 'startField',
            labelText   : t('Start'),
            required    : true,
            withTime    : !allDay,
            withTimeZone: false,
            defaultTime : String(hour).padStart(2, '0') + ':00',
            flex        : 1
        }, {
            module      : DateTimeField,
            name        : 'end',
            reference   : 'endField',
            labelText   : t('End'),
            required    : true,
            withTime    : !allDay,
            withTimeZone: false,
            defaultTime : String((hour + 1) % 24).padStart(2, '0') + ':00',
            flex        : 1,
            validator   : field => me.validateEnd(field)
        }]), row([{
            module   : RecurrenceField,
            name     : 'recurrenceRule',
            reference: 'recurrenceField',
            labelText: t('Repeat'),
            startDate: item.data.start ? ymd(parseDate(item.data.start)) : null,
            flex     : 1
        }, {
            module   : Button,
            reference: 'exceptionsButton',
            text     : t('Exceptions'),
            hidden   : true,
            handler  : () => me.openExceptions()
        }]), row([{
            module   : LocationField,
            reference: 'locationField',
            flex     : 1
        }, {
            module : Button,
            icon   : 'video_call',
            ui     : 'secondary',
            hidden : !services.length,
            tooltip: t('Online meeting'),
            ...(services.length === 1
                ? {handler: () => me.addOnlineMeeting(services[0])}
                : {menu: services.map(s => ({text: s.name, handler: () => me.addOnlineMeeting(s)}))})
        }]), {
            module   : ParticipantField,
            reference: 'participantField',
            labelText: t('Participants'),
            flex     : 'none'
        }, row([{
            module   : Button,
            reference: 'freeBusyButton',
            text     : t('Check availability'),
            hidden   : true,
            handler  : () => me.openAvailability()
        }]), {
            module       : TextArea,
            name         : 'description',
            labelText    : t('Description'),
            labelPosition: 'inline',
            flex         : 'none',
            height       : 120
        }, {
            module   : AlertField,
            reference: 'alertField',
            fullDay  : allDay,
            flex     : 'none'
        }, {
            module    : CategoryField,
            reference : 'categoryField',
            calendarId: item.data.calendarId || null,
            flex      : 'none'
        }, row([{
            module   : SelectField,
            name     : 'freeBusyStatus',
            flex     : 1,
            options  : [{value: 'busy', text: t('Busy')}, {value: 'free', text: t('Free')}]
        }, {
            module   : SelectField,
            name     : 'privacy',
            labelText: t('Visibility'),
            required : true,
            flex     : 1,
            options  : [{value: 'public', text: t('Public')}, {value: 'private', text: t('Private')}, {value: 'secret', text: t('Secret')}]
        }]), {
            module   : AttachmentsField,
            reference: 'attachmentsField',
            labelText: t('Attachments'),
            flex     : 'none'
        }, row([{
            module    : UploadButton,
            buttonText: t('Attach files'),
            listeners : {files: ({files}) => me.attachFiles(files)}
        }])]
    }

    calendarOptions() {
        const list = calendarData.writableCalendars.map(c => ({id: c.id, name: c.name})),
              id   = this.item.data.calendarId && String(this.item.data.calendarId);

        // an event in a calendar the user can't add to (editing an existing one)
        id && !list.some(c => c.id === id) && list.push({id, name: calendarData.getCalendar(id)?.name || this.item.cal?.name || t('Calendar')});

        return list
    }

    /**
     * @summary Wires the field listeners (all day, start / end, calendar, reminder, participants) and loads the form.
     */
    async onConstructed() {
        await super.onConstructed();

        let me = this;

        // the form loads after a tick (FormWindow.onConstructed())
        me.form.on('beforeload', ({data}) => {
            if (data.id) {
                Object.assign(data, EventDialog.withEnd(data));
                data.calendarId = String(data.calendarId);
                data.useDefaultAlerts && (data.alerts = {})
            }
        });

        me.on('close', () => !me.saved && me.fire('cancel', {}));

        me.getReference('allDayField').on('change', () => me.onAllDayChange());
        me.getReference('startField').on('userChange', ({value, oldValue}) => me.onStartChange(value, oldValue));
        me.getReference('endField').on('userChange', ({value, oldValue}) => me.onEndChange(value, oldValue));
        me.getReference('calendarField').on('change', ({value}) => me.onCalendarChange(value));
        me.getReference('alertField').on('userChange', () => me.alertChosen = true);

        const participants = me.getReference('participantField');

        participants.on('beforeAdd', ({empty}) => empty && me.addOrganiser());
        participants.on('change', () => me.onParticipantsChange());
        participants.on('writeEmail', ({email}) => me.item.ui.mailTo(email));

        await me.readyPromise;

        !me.isDestroyed && me.onLoaded()
    }

    /**
     * Form values are in: occurrence values, field modes, default reminder label
     */
    async onLoaded() {
        let me    = this,
            item  = me.item,
            form  = me.form,
            data  = form.entityData || {},
            allDay = !!data.showWithoutTime;

        me.getReference('startField').withTime = !allDay;
        me.getReference('endField').withTime   = !allDay;
        me.getReference('alertField').fullDay  = allDay;
        me.getReference('exceptionsButton').hidden = !data.recurrenceOverrides || !Object.keys(data.recurrenceOverrides).length;

        const values = {};

        // an occurrence: its own times (and override values), in the event's zone like the series
        if (item.recurrenceId) {
            const zone  = data.timeZone || item.data.timeZone,
                  start = allDay ? item.start : fromUserTime(item.start, zone),
                  end   = allDay ? addDays(item.end, -1) : fromUserTime(item.end, zone);

            values.start = allDay ? ymd(start) : ymdhis(start);
            values.end   = allDay ? ymd(end) : ymdhis(end)
        }

        if (item.override) {
            ['title', 'location', 'description', 'freeBusyStatus', 'status', 'participants'].forEach(key => {
                key in item.patched && (values[key] = item.patched[key])
            })
        }

        // pasted (copy / cut): a change, not loaded values
        const pasted = {};

        let pastedAllDay = null;

        if (item.pasteValues) {
            const {start, end, calendarId, showWithoutTime} = item.pasteValues,
                  pasteAllDay = showWithoutTime ?? allDay;

            // pasted on the all day row or a time slot of the week view
            pasteAllDay !== allDay && (pastedAllDay = pasteAllDay);

            pasted.start      = pasteAllDay ? ymd(start) : ymdhis(start);
            pasted.end        = pasteAllDay ? ymd(addDays(end, -1)) : ymdhis(end);
            pasted.calendarId = String(calendarId);
            delete item.pasteValues
        }

        if (Object.keys(values).length) {
            await form.setValues(values);

            // shown as loaded, not as a change (except a paste on a new event)
            if (item.key && !item.isNew()) {
                Object.entries(values).forEach(([path, value]) => form.setOriginalValue(path, value))
            }
        }

        if (pastedAllDay !== null) {
            await form.setValues({showWithoutTime: pastedAllDay});
            me.onAllDayChange()
        }

        Object.keys(pasted).length && await form.setValues(pasted);

        me.getReference('recurrenceField').setStartDate(ymd(parseDate(pasted.start || values.start || data.start) || userNow()));
        me.updateDefaultAlertLabel();
        me.onParticipantsChange();

        me.getReference('categoryField').calendarId = data.calendarId || null;

        // read only for users who can't change it (GOUI opens the detail instead)
        me.getReference('titleField').focus?.()
    }

    get calendar() {
        return calendarData.getCalendar(this.getReference('calendarField').getSubmitValue?.() ?? this.item.data.calendarId)
    }

    /**
     * @summary Shows the calendar's default reminder in the "Default" option and selects it for a new
     * event when no reminder was chosen yet (GOUI applyDefaultAlerts()).
     */
    updateDefaultAlertLabel() {
        const cal    = this.calendar,
              allDay = !!this.getReference('allDayField').checked,
              field  = this.getReference('alertField'),
              alerts = cal && (allDay ? cal.defaultAlertsWithoutTime : cal.defaultAlertsWithTime);

        if (!cal) {
            return
        }

        field.setDefaultLabel(alerts);
        this.alertChosen || (field.value = alerts && Object.keys(alerts).length ? alerts : 'default')
    }

    onAllDayChange() {
        let me     = this,
            allDay = !!me.getReference('allDayField').checked;

        me.getReference('startField').withTime = !allDay;
        me.getReference('endField').withTime   = !allDay;
        me.getReference('alertField').fullDay  = allDay;
        me.updateDefaultAlertLabel()
    }

    /**
     * Start moved: the end keeps the duration (GOUI start field change)
     */
    onStartChange(value, oldValue) {
        let me       = this,
            endField = me.getReference('endField'),
            start    = parseDate(value),
            oldStart = parseDate(oldValue),
            end      = parseDate(endField.value);

        if (!start) {
            return
        }

        me.getReference('recurrenceField').setStartDate(ymd(start));

        if (end && start >= end) {
            const duration = oldStart ? diffDuration(oldStart, end) : (calendarData.prefs.defaultDuration || 'PT1H'),
                  newEnd   = addDuration(start, duration);

            endField.value = endField.withTime ? ymdhis(newEnd) : ymd(newEnd)
        }

        endField.validate(false);
        me.checkAvailability()
    }

    /**
     * End before the start: the start moves along (GOUI end field change)
     */
    onEndChange(value, oldValue) {
        let me         = this,
            startField = me.getReference('startField'),
            end        = parseDate(value),
            oldEnd     = parseDate(oldValue),
            start      = parseDate(startField.value);

        if (end && start && ((startField.withTime && end <= start) || (!startField.withTime && end < start))) {
            const newStart = oldEnd ? addDuration(end, diffDuration(oldEnd, start)) : end;
            startField.value = startField.withTime ? ymdhis(newStart) : ymd(newStart)
        }

        me.checkAvailability()
    }

    validateEnd(field) {
        const start = parseDate(this.getReference('startField')?.value),
              end   = parseDate(field.value);

        if (field.value && !end) {
            return t('Invalid date')
        }

        return !start || !end || !field.withTime || end > start || t('The end time must be greater than the start date')
    }

    async onCalendarChange(value) {
        let me  = this,
            cal = calendarData.getCalendar(value);

        if (!cal) {
            return
        }

        me.item.cal = cal;
        me.getReference('categoryField').calendarId = cal.id;
        me.updateDefaultAlertLabel();

        // a new event with participants: the organizer follows the calendar's owner
        if ((!me.item.key || me.item.isNew()) && Object.keys(me.getReference('participantField').participants).length) {
            await me.addOrganiser()
        }
    }

    async addOrganiser() {
        let me = this;

        try {
            const [p] = await client.get('Principal', [me.item.ownerId], ['id', 'name', 'email', 'type']);
            p && !me.isDestroyed && me.getReference('participantField').addOrganiser(p)
        } catch (e) {
            this.item.ui.error(t('Could not add organizer because the calendar principal could not be read from the server. Do you have permissions?'))
        }
    }

    onParticipantsChange() {
        let me    = this,
            count = Object.keys(me.getReference('participantField').participants).length,
            end   = me.getReference('endField').getValueAsDate();

        me.getReference('freeBusyButton').hidden = !count;
        // the fields show the event's zone (a new event: the user's)
        me.getReference('saveButton').text = t(count && end && toUserTime(end, me.item?.data?.timeZone) > userNow() ? 'Send' : 'Save');
        me.checkAvailability()
    }

    /**
     * Marks participants (users and resources) that are busy in the period (GOUI checkAvailability())
     */
    async checkAvailability() {
        let me     = this,
            field  = me.getReference('participantField'),
            allDay = !!me.getReference('allDayField').checked,
            start  = me.getReference('startField').getValueAsDate(),
            end    = me.getReference('endField').getValueAsDate(),
            orig   = me.form.originalValues?.participants || {};

        // a newer check (other time or participants) wins over a slower older answer
        const generation = me.availabilityGeneration = (me.availabilityGeneration || 0) + 1;

        if (!start || !end) {
            return
        }

        const ids = Object.keys(field.participants).filter(id => !(id in orig) && (id.startsWith('Calendar:') || !isNaN(+id)));

        if (!ids.length) {
            Object.keys(field.busy).length && field.setBusy({});
            return
        }

        const fmt   = d => allDay ? ymd(d) : ymd(d) + ' ' + ymdhis(d).substring(11),
              until = allDay ? addDays(end, 1) : end,
              busy  = {};

        await Promise.all(ids.map(async id => {
            try {
                const r = await client.call('Principal/getAvailability', {start: fmt(start), end: fmt(until), id});
                r.list?.length && (busy[id] = true)
            } catch (e) {
                console.error(e)
            }
        }));

        me.isDestroyed || generation !== me.availabilityGeneration || field.setBusy(busy)
    }

    async addOnlineMeeting(service) {
        let me = this;

        try {
            const url      = await service.create(),
                  location = me.getReference('locationField'),
                  desc     = (await me.form.getFields()).find(f => f.name === 'description'),
                  line     = '--------------------------------';

            location.userChange(url);
            location.inputText = url;
            location.renderControl();

            desc && (desc.value = (desc.value || '') + `\n\n${line}\n${service.joinText?.() || ''}:\n\n${url}\n${line}\n\n`)
        } catch (e) {
            this.item.ui.error(e)
        }
    }

    async attachFiles(files) {
        let me    = this,
            field = me.getReference('attachmentsField');

        me.isLoading = t('Uploading...');

        try {
            // failed uploads are reported, the others are added
            const blobs = await uploader.uploadMany(files, {component: me});

            me.isDestroyed || blobs.forEach(blob => field.addBlob(blob))
        } catch (e) {
            this.item.ui.error(e)
        } finally {
            me.isDestroyed || (me.isLoading = false)
        }
    }

    openAvailability() {
        this.item.ui.openAvailability?.(this)
    }

    openExceptions() {
        this.item.ui.openExceptions?.(this.item, this.form.entityData?.recurrenceOverrides || {})
    }

    /**
     * Start, end and reminders as CalendarEvent properties (GOUI parseSavedData())
     * @param {Object} data form values (modified ones when updating)
     * @returns {Object}
     */
    parseSavedData(data) {
        let me     = this,
            allDay = !!me.getReference('allDayField').checked,
            start  = me.getReference('startField').getValueAsDate(),
            end    = me.getReference('endField').getValueAsDate(),
            alert  = me.getReference('alertField');

        if (allDay) {
            start = startOfDay(start);
            end   = addDays(startOfDay(end), 1);
            data.start && (data.start = ymd(start))
        } else if (data.start) {
            data.start = ymdhis(start)
        }

        if ('alerts' in data || me.form.isNew) {
            data.useDefaultAlerts = alert.useDefault;
            alert.useDefault && delete data.alerts
        }

        if (me.form.isNew) {
            data.timeZone = calendarData.user.timezone || null
        }

        if ('start' in data || 'end' in data || 'showWithoutTime' in data) {
            data.duration = diffDuration(start, end)
        }

        delete data.end;

        return data
    }

    /**
     * Saves through CalendarItem (GOUI onBeforeSubmit()), one save at a time: a second
     * Enter or click while the first one validates does not create the event twice
     */
    async submit() {
        if (this.isSubmitting) {
            return false
        }

        this.isSubmitting = true;

        try {
            return await this.saveItem()
        } finally {
            this.isSubmitting = false
        }
    }

    /**
     * @returns {Promise<false>}
     * @protected
     */
    async saveItem() {
        let me     = this,
            form   = me.form,
            button = me.getReference('saveButton'),
            item   = me.item;

        if (!me.formReady || button.disabled) {
            return false
        }

        if (!await form.validate()) {
            me.focusFirstInvalid();
            return false
        }

        const isNew = form.isNew;
        let data;

        if (isNew) {
            data = {...form.entityData, ...await form.getEntityValues()};
            ['id', 'end', 'uid', 'isOrigin', 'modifier', 'creator'].forEach(key => delete data[key])
        } else {
            data = await form.getModified()
        }

        if (!isNew && !Object.keys(data).length) {
            me.saved = true;
            me.close();
            return false
        }

        data = me.parseSavedData(data);
        delete data.id;

        button.disabled = true;

        const done = () => {
            me.saved = true;
            me.fire('saved', {});
            me.isDestroyed || me.close()
        };

        try {
            if (isNew) {
                // the dialog's item knows the participants for the schedule question
                item.data = {...item.data, ...data};
                const answer = await item.confirmScheduleMessage(data);

                if (answer) {
                    const response = await CalendarItem.set({create: {e: item.data}}, answer.send, item.ui),
                          id       = response.created?.e?.id;

                    // saved outside the form: create the collected links here
                    id && await me.createPendingLinks(id);
                    done()
                }
            } else if (item.isRecurring) {
                await item.patch(data, done)
            } else {
                const answer = await item.confirmScheduleMessage(data);

                if (answer) {
                    await CalendarItem.update(item.data.id, data, answer.send, item.ui);
                    done()
                }
            }
        } catch (e) {
            // CalendarItem.set() showed it
        } finally {
            me.isDestroyed || (button.disabled = false)
        }

        return false
    }
}

export default Neo.setupClass(EventDialog);
