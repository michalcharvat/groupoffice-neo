import client from '../jmap/Client.mjs';
import {escapeHtml} from '../Format.mjs';
import {resolveRoute, linkType} from '../link/linkTypes.mjs';
import notificationCenter from './NotificationCenter.mjs';

const PREFIX = 'go-reminder-';

/**
 * Popup reminders of the legacy reminders table (go_reminders: the "Reminders" admin module,
 * legacy modules), polled like the ExtJS GO.Checker: reminder/store every
 * $config['checker_interval'] seconds (120 by default), with Snooze (reminder/snooze) and
 * Dismiss (reminder/dismiss). Events and tasks remind through core alerts (Alerts.mjs).
 */
class Reminders {
    #userId = null
    #timer  = null
    #listeners = []
    /** reminder id → JSON of the record last shown */
    #shown  = new Map()

    start() {
        let me = this;

        if (!client.user || me.#userId === client.user.id) {
            return
        }

        me.stop();
        me.#userId = client.user.id;
        me.#listeners.push(client.on('logout', () => me.stop()));

        const seconds = Number(Neo.config.goCheckerInterval) || 120;

        me.#timer = setInterval(() => me.check(), seconds * 1000);
        me.check()
    }

    stop() {
        let me = this;

        clearInterval(me.#timer);
        me.#timer = null;
        me.#listeners.forEach(off => off?.());
        me.#listeners = [];
        me.#userId = null;
        me.#shown.clear();
        notificationCenter.sync(PREFIX, new Set())
    }

    /**
     * Loads the due reminders of the user
     * @returns {Promise<void>}
     */
    async check() {
        let me = this;

        if (!me.#userId || globalThis.navigator?.onLine === false) {
            return
        }

        let results;

        try {
            ({results = []} = await client.legacy('reminder/store'));
        } catch (e) {
            // checked again next time (GO.Checker ignores failures too)
            console.warn('Loading reminders failed', e);
            return
        }

        if (!me.#userId) {
            return
        }

        const keep = new Set();

        results.forEach(record => {
            const id   = PREFIX + record.id,
                  json = JSON.stringify(record);

            keep.add(id);

            if (me.#shown.get(record.id) === json && notificationCenter.get(id)) {
                return
            }

            me.#shown.set(record.id, json);
            notificationCenter.add(me.message(record))
        });

        [...me.#shown.keys()].forEach(rid => keep.has(PREFIX + rid) || me.#shown.delete(rid));
        notificationCenter.sync(PREFIX, keep)
    }

    /**
     * GO.Checker reminder panel: "<time>: <name>" and the text below it
     * @param {Object} record reminder/store record
     * @returns {Object} NotificationCenter message
     */
    message(record) {
        let me   = this,
            text = (record.local_time ? record.local_time + ': ' : '') + (record.name || '');

        record.text && (text += '\n' + record.text);

        return {
            id       : PREFIX + record.id,
            title    : record.type || '',
            html     : escapeHtml(text).replace(/\n/g, '<br>'),
            text,
            icon     : record.entity ? linkType(record.entity).icon : 'notifications',
            time     : record.time ? new Date(record.time * 1000) : new Date(),
            route    : record.entity && record.model_id ? resolveRoute(record.entity, record.model_id) : null,
            // GO.Checker: opening the item keeps the reminder
            dismissOnOpen: false,
            snooze   : seconds => me.#task('reminder/snooze', record.id, {snooze_time: seconds}),
            onDismiss: () => me.#task('reminder/dismiss', record.id)
        }
    }

    async #task(route, id, params = {}) {
        this.#shown.delete(id);
        await client.legacy(route, {reminders: JSON.stringify([id]), ...params})
    }
}

export default new Reminders();
