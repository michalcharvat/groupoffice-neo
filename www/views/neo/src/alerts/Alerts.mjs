import client from '../jmap/Client.mjs';
import ModuleRegistry from '../ModuleRegistry.mjs';
import {resolveRoute, linkType} from '../link/linkTypes.mjs';
import {escapeHtml, formatUserDateTime, sanitizeHtml} from '../Format.mjs';
import {t} from '../Translate.mjs';
import notificationCenter from './NotificationCenter.mjs';

const PREFIX = 'core-alert-';

/** ExtJS go.Alerts re-evaluates the store every 60 s: alerts whose triggerAt passed show then */
const INTERVAL = 60000;

/**
 * Core alerts (the "Alert" entity, go.Alerts in go/core/views/extjs3/Alert.js) of the
 * logged-in user in the notification area: reminders of events and tasks, invitations,
 * mentions, background export / import progress.
 *
 * Loaded on login and on every Alert push (SSE); shown once triggerAt has passed.
 * Modules change the message of their alerts with the `alerts` key of their registry entry
 * (the ExtJS "beforeshow" listener of go.Alerts):
 *
 *     ModuleRegistry.register({..., alerts: async ({alert, entity, message}) => {
 *         if (alert.entity !== 'Task') return message;    // not ours
 *         message.html = escapeHtml('...');
 *         return message                                     // false: don't show the alert
 *     }});
 *
 * The message is a NotificationCenter message (see there). Closing it destroys the alert
 * on the server, which calls the entity's dismissAlerts().
 */
class Alerts {
    /** user id the alerts are loaded for */
    #userId    = null
    #timer     = null
    #listeners = []
    /** alert id → JSON of the alert last rendered, rendered message */
    #rendered  = new Map()
    #alerts    = []
    #loading   = null
    #reloadAgain = false

    /**
     * Starts for the logged-in user. Idempotent: every main window calls it.
     */
    start() {
        let me = this;

        if (!client.user || me.#userId === client.user.id) {
            return
        }

        me.stop();
        me.#userId = client.user.id;

        me.#listeners.push(
            client.on('stateChange', ({changed}) => changed?.includes('Alert') && me.reload()),
            client.on('logout', () => me.stop())
        );

        client.watch(['Alert']);
        me.#timer = setInterval(() => me.#show(), INTERVAL);
        me.reload()
    }

    stop() {
        let me = this;

        clearInterval(me.#timer);
        me.#timer = null;
        me.#listeners.forEach(off => off?.());
        me.#listeners = [];
        me.#userId = null;
        me.#alerts = [];
        me.#rendered.clear();
        notificationCenter.sync(PREFIX, new Set())
    }

    /**
     * Loads the user's alerts again. Calls during a load run once more after it.
     * @returns {Promise<void>}
     */
    async reload() {
        let me = this;

        if (me.#loading) {
            me.#reloadAgain = true;
            return me.#loading
        }

        me.#loading = (async () => {
            try {
                do {
                    me.#reloadAgain = false;

                    const {list} = await client.queryGet('Alert', {
                        filter: {userId: client.user.id},
                        sort  : [{property: 'triggerAt', isAscending: false}],
                        limit : 100
                    });

                    me.#alerts = list;
                    await me.#show()
                } while (me.#reloadAgain && me.#userId)
            } catch (e) {
                console.warn('Loading alerts failed', e)
            } finally {
                me.#loading = null
            }
        })();

        return me.#loading
    }

    /**
     * Snoozes an alert: it triggers again after `seconds` (triggerAt moves). An alert that
     * would go stale before that keeps its time to go stale after the new trigger.
     * @param {Object} alert
     * @param {Number} seconds
     * @returns {Promise<void>}
     */
    async snooze(alert, seconds) {
        const triggerAt = new Date(Date.now() + seconds * 1000),
              update    = {triggerAt: isoUtc(triggerAt)};

        if (alert.staleAt && new Date(alert.staleAt) <= triggerAt) {
            const keep = Math.max(new Date(alert.staleAt) - new Date(alert.triggerAt), 3600000);
            update.staleAt = isoUtc(new Date(triggerAt.getTime() + keep))
        }

        await client.set('Alert', {update: {[alert.id]: update}})
    }

    /**
     * Destroys the alert on the server (the ExtJS notification's close)
     * @param {Object} alert
     * @returns {Promise<void>}
     */
    async dismiss(alert) {
        await client.set('Alert', {destroy: [alert.id]})
    }

    async #show() {
        let me   = this,
            now  = Date.now(),
            keep = new Set(),
            due  = me.#alerts.filter(a => !a.triggerAt || new Date(a.triggerAt).getTime() <= now);

        await Promise.all(due.map(async alert => {
            const id   = PREFIX + alert.id,
                  json = JSON.stringify(alert),
                  last = me.#rendered.get(alert.id);

            keep.add(id);

            if (last?.json === json) {
                // still shown, or hidden by a module
                return
            }

            const message = await me.#render(alert);

            // stopped or the alert went away meanwhile
            if (!me.#userId || !me.#alerts.some(a => a.id === alert.id)) {
                return
            }

            me.#rendered.set(alert.id, {json, message});
            message ? notificationCenter.add(message) : notificationCenter.remove(id)
        }));

        [...me.#rendered.keys()].forEach(alertId => keep.has(PREFIX + alertId) || me.#rendered.delete(alertId));
        notificationCenter.sync(PREFIX, keep)
    }

    /**
     * @param {Object} alert
     * @returns {Promise<Object|null>} the message, null to leave it out
     */
    async #render(alert) {
        let me     = this,
            entity = null;

        try {
            [entity] = await client.get(alert.entity, [alert.entityId]);
        } catch (e) {
            // an entity this user can't read or the client can't get: show the alert's own data
            console.warn('Alert of an unknown entity', alert, e)
        }

        if (!entity && alert.entity !== 'Module') {
            // go.Alerts: an alert of a deleted entity isn't shown
            return null
        }

        const data = alert.data || {},
              body = data.body ? sanitizeHtml(String(data.body)).replace(/\n/g, '<br>') : escapeHtml(formatUserDateTime(alert.triggerAt));

        let message = {
            id        : PREFIX + alert.id,
            alert,
            title     : data.title || entity?.name || entity?.title || entity?.description || alert.entity,
            html      : body,
            text      : data.body ? htmlToText(String(data.body)) : formatUserDateTime(alert.triggerAt),
            // background export / import of a module (AbstractConverter)
            icon      : alert.entity === 'Module' ? 'info' : linkType(alert.entity).icon,
            time      : alert.triggerAt ? new Date(alert.triggerAt) : new Date(),
            route     : resolveRoute(alert.entity, alert.entityId),
            progress  : 'progress' in data ? Number(data.progress) || 0 : null,
            persistent: data.persistent === true,
            onDismiss : () => me.dismiss(alert)
        };

        if (alert.entity === 'Comment' && entity) {
            message = await commentMessage(alert, entity, message)
        }

        // modules: the ExtJS "beforeshow" listeners
        for (const renderer of ModuleRegistry.getConfigs('alerts')) {
            try {
                message = await renderer({alert, entity, message});
            } catch (e) {
                console.warn('Alert renderer failed', alert, e)
            }

            if (!message) {
                return null
            }
        }

        return message
    }
}

/**
 * GO's DateTime takes ISO 8601; seconds precision like the server sends
 * @param {Date} date
 * @returns {String}
 */
function isoUtc(date) {
    return date.toISOString().replace(/\.\d+Z$/, 'Z')
}

/**
 * Plain text of an alert body for the desktop notification
 * @param {String} html
 * @returns {String}
 */
function htmlToText(html) {
    return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
}

/**
 * Comments module (views/goui Index.ts): "You were mentioned in a comment by {creator}."
 * A click opens the commented item.
 */
async function commentMessage(alert, comment, message) {
    message.route = resolveRoute(comment.entity, comment.entityId) || message.route;

    if (alert.tag !== 'mention') {
        return message
    }

    let creator = null;

    try {
        [creator] = await client.get('Principal', [alert.createdBy], ['id', 'name']);
    } catch (e) {
        // unknown principal
    }

    const text    = t('You were mentioned in a comment by {creator}.', 'community', 'comments').replace('{creator}', creator?.name || t('Unknown user')),
          excerpt = alert.data?.excerpt || '';

    message.title = t('Comment');
    message.html  = escapeHtml(formatUserDateTime(alert.triggerAt) + ': ' + text) + (excerpt ? '<br><br><i>' + escapeHtml(htmlToText(excerpt)) + '</i>' : '');
    message.text  = formatUserDateTime(alert.triggerAt) + ': ' + text + (excerpt ? '\n\n' + htmlToText(excerpt) : '');
    return message
}

export {htmlToText};
export default new Alerts();
