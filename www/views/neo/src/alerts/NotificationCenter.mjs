import client from '../jmap/Client.mjs';
import {t} from '../Translate.mjs';

const ADDON = 'WS/Notifications';

/**
 * The messages of the header's notification area (go.Notifier in the ExtJS client),
 * one instance per App worker, so every GO window shows the same messages.
 * Sources add them: core alerts (src/alerts/Alerts.mjs), popup reminders
 * (src/alerts/Reminders.mjs) or any module.
 *
 *     notificationCenter.add({
 *         id        : 'core-alert-5',           // the same id replaces a message
 *         title     : 'Meeting',
 *         html      : 'Today 10:00',            // safe HTML (escape or sanitizeHtml() it)
 *         text      : 'Today 10:00',            // plain text for the desktop notification
 *         icon      : 'event',                  // Material icon
 *         time      : date,                     // shown and sorted by (newest first)
 *         route     : 'calendar/event/5',       // a click on the message goes there and dismisses it
 *         handler   : (message, view) => {},    // or a function instead of a route
 *         dismissOnOpen: true,                  // false: opening it keeps the message
 *         persistent: false,                    // true: no close button, "Dismiss all" keeps it
 *         progress  : null,                     // 0-100: progress bar
 *         buttons   : [{text, icon, handler: (message, view) => {}, menu: [{text, handler}]}],
 *         snooze    : seconds => Promise,       // adds the Snooze menu (src/alerts/snooze.mjs)
 *         onDismiss : () => Promise,            // removes it on the server (close, Dismiss, Dismiss all)
 *         notify    : true,                     // desktop notification + sound, once per id
 *         sound     : 'dialog-question',        // views/neo/resources/sounds/<sound>.mp3, null: silent
 *         muteSound : 'mute_reminder_sound'     // user property that mutes the sound besides mute_sound
 *     });
 *
 * Views listen to 'change'. Desktop notifications and sounds go through one GO main
 * window (main view of the shell), the one that attached last.
 */
class NotificationCenter {
    #messages  = new Map()
    #listeners = new Set()
    /** ids notified on the desktop already */
    #notified  = new Set()
    /** window ids of the attached main views, latest last */
    #windows   = []

    /**
     * @param {Function} fn ({messages}) => void
     * @returns {Function} removes the listener
     */
    onChange(fn) {
        this.#listeners.add(fn);
        return () => this.#listeners.delete(fn)
    }

    /**
     * Messages, newest first
     * @returns {Object[]}
     */
    get messages() {
        return [...this.#messages.values()].sort((a, b) => (b.time?.getTime?.() || 0) - (a.time?.getTime?.() || 0))
    }

    get count() {
        return this.#messages.size
    }

    get(id) {
        return this.#messages.get(id) || null
    }

    /**
     * Adds a message or replaces the one with the same id
     * @param {Object} message see the class comment
     * @returns {Object} the message
     */
    add(message) {
        let me = this;

        message = {persistent: false, progress: null, buttons: [], notify: true, sound: 'dialog-question', muteSound: 'mute_reminder_sound', ...message};
        message.time = message.time ? new Date(message.time) : new Date();

        me.#messages.set(message.id, message);

        if (message.notify && !me.#notified.has(message.id)) {
            me.#notified.add(message.id);
            me.#desktop(message)
        }

        me.#fire();
        return message
    }

    /**
     * Removes a message without dismissing it on the server (its source removed it)
     * @param {String} id
     */
    remove(id) {
        let me = this;

        if (me.#messages.delete(id)) {
            me.#closeDesktop(id);
            me.#fire()
        }
    }

    /**
     * Removes the messages of a source that are not in `keep`
     * @param {String} prefix id prefix of the source, e.g. 'core-alert-'
     * @param {Set<String>} keep ids
     */
    sync(prefix, keep) {
        let me      = this,
            removed = false;

        [...me.#messages.keys()].forEach(id => {
            if (id.startsWith(prefix) && !keep.has(id)) {
                me.#messages.delete(id);
                me.#closeDesktop(id);
                removed = true
            }
        });

        removed && me.#fire()
    }

    /**
     * The user closed a message: its source removes it on the server
     * @param {String} id
     * @returns {Promise<void>}
     */
    async dismiss(id) {
        let me      = this,
            message = me.#messages.get(id);

        if (!message) {
            return
        }

        me.remove(id);

        try {
            await message.onDismiss?.()
        } catch (e) {
            // back in the list: the source would not show it again while it is unchanged
            me.#messages.has(id) || me.add(message);
            console.warn('Dismissing notification failed', e)
        }
    }

    /**
     * "Dismiss all": every message that isn't persistent
     * @returns {Promise<void>}
     */
    async dismissAll() {
        await Promise.all(this.messages.filter(m => !m.persistent).map(m => this.dismiss(m.id)))
    }

    /**
     * Snoozes a message: its source moves it to later
     * @param {String} id
     * @param {Number} seconds
     * @returns {Promise<void>}
     */
    async snooze(id, seconds) {
        let me      = this,
            message = me.#messages.get(id);

        if (!message?.snooze) {
            return
        }

        me.remove(id);
        // shown again later: notify again
        me.#notified.delete(id);

        try {
            await message.snooze(seconds)
        } catch (e) {
            // back as it was, without a second desktop notification
            me.#notified.add(id);
            me.#messages.has(id) || me.add(message);
            throw e
        }
    }

    /**
     * A main view of the shell: desktop notifications and sounds go through its window
     * @param {String} windowId
     */
    attach(windowId) {
        this.detach(windowId);
        this.#windows.push(windowId)
    }

    detach(windowId) {
        this.#windows = this.#windows.filter(id => id !== windowId)
    }

    /**
     * The addon in the notifying window
     * @returns {Promise<{addon: Object, windowId: String}|null>}
     */
    async addon() {
        const windowId = this.#windows[this.#windows.length - 1];

        if (!windowId) {
            return null
        }

        await Neo.Main.importAddon({name: ADDON, windowId});
        return {addon: Neo.ns('GO.main.addon.Notifications'), windowId}
    }

    /**
     * @returns {Promise<String>} the desktop notification permission of the browser
     */
    async permission() {
        try {
            const target = await this.addon();
            return target ? await target.addon.permission({windowId: target.windowId}) : 'unsupported'
        } catch (e) {
            return 'unsupported'
        }
    }

    /**
     * Asks for the permission in a window (from a click in it)
     * @param {String} windowId
     * @returns {Promise<String>}
     */
    async requestPermission(windowId) {
        await Neo.Main.importAddon({name: ADDON, windowId});
        return Neo.ns('GO.main.addon.Notifications').requestPermission({windowId})
    }

    async #desktop(message) {
        try {
            const target = await this.addon();

            if (!target) {
                return
            }

            const {addon, windowId} = target,
                  user = client.user || {};

            addon.notify({
                title: message.title || t('Reminders'),
                body : message.text ?? '',
                tag  : message.id,
                icon : (Neo.config.goBaseUrl || '/') + 'views/neo/resources/images/reminder.png',
                route: message.route || null,
                windowId
            });

            // GO.Notifier.playSound(): the user's "mute all sounds" and e.g. "mute reminder sounds"
            if (message.sound && !user.mute_sound && !(message.muteSound && user[message.muteSound])) {
                addon.playSound({url: (Neo.config.goBaseUrl || '/') + 'views/neo/resources/sounds/' + message.sound + '.mp3', windowId})
            }
        } catch (e) {
            console.warn('Desktop notification failed', e)
        }
    }

    async #closeDesktop(id) {
        try {
            const target = await this.addon();
            target && target.addon.close({tag: id, windowId: target.windowId})
        } catch (e) {
            // window closing
        }
    }

    #fire() {
        const messages = this.messages;

        this.#listeners.forEach(fn => {
            try {
                fn({messages})
            } catch (e) {
                console.error(e)
            }
        })
    }
}

export default new NotificationCenter();
