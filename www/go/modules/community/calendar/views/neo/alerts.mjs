import client from '../../../../../../views/neo/src/jmap/Client.mjs';
import alerts from '../../../../../../views/neo/src/alerts/Alerts.mjs';
import notificationCenter from '../../../../../../views/neo/src/alerts/NotificationCenter.mjs';
import {escapeHtml, smartDateTime} from '../../../../../../views/neo/src/Format.mjs';
import {notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import {translator} from '../../../../../../views/neo/src/Translate.mjs';
import CalendarItem from './CalendarItem.mjs';
import calendarData from './data.mjs';
import {withWindowUi} from './ui.mjs';

const t = translator('community', 'calendar');

/**
 * Alerts of the calendar in the notification area (the go.Alerts "beforeshow" listener
 * of views/goui Index.ts):
 * - request: "New invitation from {from}" with Accept / Maybe / Decline
 * - reply:   "Invitation updated by {from}"
 * - created: "New event created by {creator}"
 * - others are the event's reminders: its start, with Snooze
 *
 * @param {Object} args {alert, entity, message}
 * @returns {Promise<Object>} the message
 */
export default async function calendarAlert({alert, entity, message}) {
    if (alert.entity !== 'CalendarEvent' && alert.entity !== 'Calendar') {
        return message
    }

    const data = alert.data || {};

    let text;

    switch (alert.tag) {
        case 'request': text = t('New invitation from {from}').replace('{from}', data.from?.personal || data.from?.email || t('Unknown')); break;
        case 'reply'  : text = t('Invitation updated by {from}').replace('{from}', data.from?.personal || data.from?.email || t('Unknown')); break;
        case 'created': text = t('New event created by {creator}').replace('{creator}', data.creator || t('Unknown')); break;
    }

    if (alert.entity === 'CalendarEvent' && entity) {
        message.title = entity.title || message.title;

        if (!text) {
            // a reminder: when the (occurrence of the) event starts, in the user's zone
            await calendarData.init().catch(() => {});

            const item = new CalendarItem({key: String(entity.id), data: entity, recurrenceId: alert.recurrenceId || undefined});

            text = smartDateTime(item.start, !entity.showWithoutTime);
            message.snooze = seconds => alerts.snooze(alert, seconds)
        }

        if (alert.tag === 'request') {
            message.buttons = ['accepted', 'tentative', 'declined'].map(status => ({
                text   : {accepted: t('Accept'), tentative: t('Maybe'), declined: t('Decline')}[status],
                handler: (msg, view) => reply(alert, entity, status, msg, view)
            }))
        }
    }

    if (text) {
        message.html = escapeHtml(text);
        message.text = text
    }

    return message
}

/**
 * Sets the user's participation status of an invitation, then dismisses the alert
 * @param {Object} alert
 * @param {Object} event CalendarEvent
 * @param {String} status 'accepted', 'tentative' or 'declined'
 * @param {Object} message
 * @param {Neo.component.Base} view the notification area: its window shows the questions
 */
async function reply(alert, event, status, message, view) {
    const base = {appName: view.appName, windowId: view.windowId};

    try {
        await calendarData.init();

        const [current] = await client.get('CalendarEvent', [event.id]),
              item      = new CalendarItem({key: String(event.id), data: current || event, recurrenceId: alert.recurrenceId || undefined});

        // the questions open in this notification area's window, not in a calendar view of another one
        await withWindowUi(base, () => item.updateParticipation(status, () => notificationCenter.dismiss(message.id)))
    } catch (e) {
        notifyError(view, e)
    }
}
