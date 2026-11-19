import client from '../jmap/Client.mjs';

const ADDON = 'WS/Notifications';

/**
 * Logs out after the System settings → General "Logout when inactive" seconds without
 * activity (go.ActivityWatcher, GO.settings.config.logoutWhenInactive). Every window
 * records its mouse / key / scroll / touch events in localStorage (main addon
 * WS/Notifications), so activity in any window of the browser keeps the session.
 */
class ActivityWatcher {
    #windows = new Set()
    #timer   = null
    #checking = false

    /**
     * Counts the activity of a window and starts the check. Without the setting nothing happens.
     * @param {String} windowId
     */
    async register(windowId) {
        let me  = this,
            max = Number(Neo.config.goLogoutWhenInactive) || 0;

        if (max < 1) {
            return
        }

        me.#windows.add(windowId);

        try {
            await Neo.Main.importAddon({name: ADDON, windowId});
            await Neo.ns('GO.main.addon.Notifications').watchActivity({windowId})
        } catch (e) {
            me.#windows.delete(windowId);
            return
        }

        if (!me.#timer) {
            console.log('Enabling logout on inactivity after ' + max + 's');
            me.#timer = setInterval(() => me.#check(max), 5000)
        }
    }

    unregister(windowId) {
        this.#windows.delete(windowId)
    }

    async #check(max) {
        let me = this;

        if (me.#checking || !client.user) {
            return
        }

        me.#checking = true;

        try {
            const windowId = [...me.#windows].pop();

            if (!windowId) {
                return
            }

            const idle = await Neo.ns('GO.main.addon.Notifications').idleSeconds({windowId});

            if (idle > max) {
                console.log('User has been inactive for more than ' + max + ' seconds');
                clearInterval(me.#timer);
                me.#timer = null;
                await client.logout()
            }
        } catch (e) {
            // a window that is closing: the next check takes another one
            const windowId = [...me.#windows].pop();
            windowId && me.#windows.delete(windowId)
        } finally {
            me.#checking = false
        }
    }
}

export default new ActivityWatcher();
