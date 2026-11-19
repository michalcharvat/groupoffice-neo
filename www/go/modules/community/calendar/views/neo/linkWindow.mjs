import client       from '../../../../../../views/neo/src/jmap/Client.mjs';
import {translator} from '../../../../../../views/neo/src/Translate.mjs';
import CalendarItem from './CalendarItem.mjs';
import calendarData from './data.mjs';
import {windowUi}   from './ui.mjs';
import {addDays, startOfDay, ymd, ymdhis} from './util/date.mjs';

const t = translator('community', 'calendar');

/**
 * "Add link" → "Event" in another item's detail (GOUI Index.ts linkWindow and
 * EventWindow.addLinkOnSave()): a new event tomorrow at this hour in the user's default
 * calendar, linked to the item once it is saved. The item's name becomes the title and a
 * contact becomes a participant. See ModuleRegistry `linkWindows`.
 *
 * @param {Object} ctx {appName, windowId, entity, entityId, record}
 * @returns {Promise<GO.calendar.EventDialog|undefined>}
 */
export default async function openLinkedEvent({appName, windowId, entity, entityId, record}) {
    await calendarData.init();

    const writable = calendarData.writableCalendars;

    if (!writable.length) {
        throw new Error(t('There are no calendars to add an appointment.'))
    }

    const prefs      = calendarData.prefs,
          allDay     = prefs.defaultDuration == null,
          start      = addDays(new Date(), 1),
          calendarId = writable.find(c => String(c.id) === String(prefs.defaultCalendarId))?.id || writable[0].id;

    start.setMinutes(0, 0, 0);

    const item = new CalendarItem({
        key  : '',
        ownUi: windowUi({appName, windowId}),
        data : {
            start          : allDay ? ymd(startOfDay(start)) : ymdhis(start),
            title          : record?.name ? String(record.name) : t('New event'),
            showWithoutTime: allDay,
            duration       : allDay ? 'P1D' : prefs.defaultDuration,
            calendarId
        }
    });

    // loaded first: the event must not be saveable without its participant
    const [principal] = entity === 'Contact'
        ? await client.get('Principal', ['Contact:' + entityId], ['id', 'name', 'email', 'type']).catch(() => [])
        : [];

    const dialog = await item.open();

    if (!dialog) {
        return
    }

    dialog.addLinkOnSave(entity, entityId);

    if (principal?.email) {
        // after the form got its values, which would replace the participants
        await dialog.readyPromise;
        dialog.isDestroyed || dialog.getReference('participantField').addParticipant(principal)
    }

    return dialog
}
