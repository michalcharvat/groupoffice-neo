import Base from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';

/** localStorage key of the last user activity, shared by all windows (go.ActivityWatcher) */
const ACTIVITY_KEY = 'lastActivity';

/**
 * Main thread side of GO's notifications (go.Notifier in the ExtJS client) and of the
 * session activity watcher (go.ActivityWatcher), see src/alerts/:
 * - permission(), requestPermission(), notify(), close(): desktop notifications (Notification API)
 * - playSound(): the reminder sound, once the user interacted with the page (autoplay rules)
 * - watchActivity(), idleSeconds(): mouse / key / scroll / touch activity of this window,
 *   written to localStorage so every window of the browser counts
 *
 * Loaded per window: await Neo.Main.importAddon({name: 'WS/Notifications', windowId})
 */
class Notifications extends Base {
    static config = {
        className: 'GO.main.addon.Notifications',
        preloadFilesDelay: false,
        remote: {
            app: [
                'close',
                'idleSeconds',
                'notify',
                'permission',
                'playSound',
                'requestPermission',
                'watchActivity'
            ]
        }
    }

    /**
     * Open desktop notifications by tag
     * @member {Map} notifications
     */
    notifications = new Map()

    /**
     * The user clicked or typed in this page: sounds may play
     * @member {Boolean} interacted=false
     */
    interacted = false

    /**
     * A sound that waits for the first interaction
     * @member {String|null} pendingSound=null
     */
    pendingSound = null

    construct(config) {
        super.construct(config);

        let me = this;

        const onInteraction = () => {
            me.interacted = true;
            ['click', 'keydown'].forEach(name => globalThis.removeEventListener(name, onInteraction, true));

            if (me.pendingSound) {
                me.playSound({url: me.pendingSound});
                me.pendingSound = null
            }
        };

        ['click', 'keydown'].forEach(name => globalThis.addEventListener(name, onInteraction, true))
    }

    /**
     * @returns {String} 'granted', 'denied', 'default' or 'unsupported' (no API or no secure context)
     */
    permission() {
        if (!('Notification' in globalThis) || !globalThis.isSecureContext) {
            return 'unsupported'
        }

        return Notification.permission
    }

    /**
     * Asks the browser for permission. Call it from a click: browsers ignore the question otherwise.
     * @returns {Promise<String>} the new permission
     */
    async requestPermission() {
        if (this.permission() === 'unsupported') {
            return 'unsupported'
        }

        return Notification.requestPermission()
    }

    /**
     * Shows a desktop notification when permitted. A click focuses this window and goes to `route`.
     * @param {Object} data
     * @param {String} data.title
     * @param {String} [data.body]  plain text
     * @param {String} data.tag     replaces an open notification with the same tag
     * @param {String} [data.icon]  URL
     * @param {String} [data.route] hash to open on click, e.g. "notes/note/5"
     * @returns {Boolean} shown
     */
    notify({title, body = '', tag, icon, route}) {
        if (this.permission() !== 'granted') {
            return false
        }

        let me = this,
            notification;

        try {
            notification = new Notification(title, {body, tag, icon})
        } catch (e) {
            // mobile browsers only allow notifications from a service worker
            console.warn('Desktop notification failed', e);
            return false
        }

        me.notifications.get(tag)?.close();
        me.notifications.set(tag, notification);

        notification.addEventListener('click', () => {
            globalThis.focus();
            route && (globalThis.location.hash = route);
            notification.close()
        });

        notification.addEventListener('close', () => {
            me.notifications.get(tag) === notification && me.notifications.delete(tag)
        });

        return true
    }

    /**
     * Closes the desktop notification of a dismissed message
     * @param {Object} data
     * @param {String} data.tag
     */
    close({tag}) {
        this.notifications.get(tag)?.close();
        this.notifications.delete(tag)
    }

    /**
     * @param {Object} data
     * @param {String} data.url mp3
     */
    playSound({url}) {
        let me = this;

        if (!me.interacted) {
            me.pendingSound = url;
            return
        }

        me.audio = me.audio || new Audio();
        me.audio.src = url;
        me.audio.play().catch(e => console.warn('Could not play notifier sound: ' + e.message))
    }

    /**
     * Counts mouse, key, scroll and touch events of this window as activity
     * (go.ActivityWatcher.registerDocument()). Idempotent.
     */
    watchActivity() {
        let me = this;

        if (me.watching) {
            return
        }

        me.watching = true;

        let timer = null;

        const record = () => {
            try {
                localStorage.setItem(ACTIVITY_KEY, String(Math.floor(Date.now() / 1000)))
            } catch (e) {
                // storage disabled
            }
        };

        // a debounced write, like the ExtJS DelayedTask of 1 s
        const onActivity = () => {
            clearTimeout(timer);
            timer = setTimeout(record, 1000)
        };

        record();
        ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'].forEach(name => document.addEventListener(name, onActivity, true))
    }

    /**
     * @returns {Number} seconds since the last activity in any window, 0 when unknown
     */
    idleSeconds() {
        let last = 0;

        try {
            last = Number(localStorage.getItem(ACTIVITY_KEY)) || 0
        } catch (e) {
            // storage disabled
        }

        return last ? Math.floor(Date.now() / 1000) - last : 0
    }
}

export default Neo.setupClass(Notifications);
