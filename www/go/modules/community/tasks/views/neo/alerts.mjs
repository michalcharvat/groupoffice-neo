import client from '../../../../../../views/neo/src/jmap/Client.mjs';
import alerts from '../../../../../../views/neo/src/alerts/Alerts.mjs';
import {escapeHtml, formatUserDateTime} from '../../../../../../views/neo/src/Format.mjs';
import {translator} from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'tasks');

/**
 * Alerts of tasks (and support tickets, which are tasks) in the notification area, the
 * go.Alerts "beforeshow" listener of views/extjs3/Module.js:
 * - assigned:      "You were assigned to this task by {assigner}"
 * - createdforyou: "A new task was created in your list by {creator}"
 * - others are the task's reminders, with Snooze
 *
 * @param {Object} args {alert, entity, message}
 * @returns {Promise<Object>} the message
 */
export default async function taskAlert({alert, message}) {
    if (alert.entity !== 'Task' && alert.entity !== 'SupportTicket') {
        return message
    }

    const data = alert.data || {};

    let text = null;

    switch (alert.tag) {
        case 'assigned':
            text = t('You were assigned to this task by {assigner}').replace('{assigner}', await principalName(data.assignedBy));
            break;

        case 'createdforyou':
            text = t('A new task was created in your list by {creator}').replace('{creator}', await principalName(data.createdBy));
            break;

        default:
            message.snooze = seconds => alerts.snooze(alert, seconds)
    }

    if (text) {
        text = formatUserDateTime(alert.triggerAt) + ': ' + text;
        message.html = escapeHtml(text);
        message.text = text
    }

    return message
}

/**
 * @param {String|Number} id Principal id
 * @returns {Promise<String>}
 */
async function principalName(id) {
    try {
        const [principal] = id ? await client.get('Principal', [id], ['id', 'name']) : [];

        if (principal?.name) {
            return principal.name
        }
    } catch (e) {
        // unknown principal
    }

    return t('Unknown user')
}
