import client from '../../../../../../views/neo/src/jmap/Client.mjs';
import {notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import CalendarItem from './CalendarItem.mjs';
import calendarData from './data.mjs';
import {openWithWindowUi} from './ui.mjs';
import {ymdhis} from './util/date.mjs';
import ItipPanel from './view/ItipPanel.mjs';

/**
 * The calendar in the e-mail client (GOUI views/goui/script/Index.ts addEmailAction()):
 * invitations in the message view and .ics attachments.
 */

/**
 * emailMessagePanelPlugins onLoad: the invitation part above the body
 * @param {Object} message email/message/view response
 * @returns {Object|null} {parts}
 */
export function onLoad(message) {
    return message?.itip ? {parts: [{module: ItipPanel, itip: message.itip, flex: 'none'}]} : null
}

/**
 * An .ics attachment (GOUI go.openIcs + go.openEventWindow): CalendarEvent/loadICS, then
 * the event in a window
 * @param {Object} attachment {accountId, mailbox, uid, partId, encoding} or {fileId}
 * @param {Neo.component.Base} owner the message view
 */
export async function openIcs({accountId, mailbox, uid, partId, encoding, fileId}, owner) {
    const base = {appName: owner.appName, windowId: owner.windowId};

    try {
        const [response] = await Promise.all([
            client.call('CalendarEvent/loadICS', fileId
                ? {fileId}
                : {account_id: accountId, mailbox, uid, number: partId, encoding}),
            calendarData.init()
        ]);

        const data  = response.data || {},
              prefs = calendarData.user?.calendarPreferences || {};

        const hour = new Date();
        hour.setMinutes(0, 0, 0);

        data.start           ??= ymdhis(hour);
        data.showWithoutTime ??= prefs.defaultDuration == null;
        data.duration        ??= prefs.defaultDuration ?? 'P1D';
        data.calendarId      ??= prefs.defaultCalendarId;

        const item = new CalendarItem({data, key: data.id ? String(data.id) : null});

        // GOUI: the detail window; its edit button opens the editor
        await openWithWindowUi(base, ui => ui.openDetail(item))
    } catch (e) {
        notifyError(base, e)
    }
}
