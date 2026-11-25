/**
 * The module tabs of the top bar (apps/go/view/MainView.mjs), docs/neo-core-components.md "Module tabs":
 * only the modules open in the window have a tab, in GO's module order. The window keeps its set in
 * sessionStorage (survives reloads), the user's last set (of any window) is in localStorage for a new
 * window or the next login.
 *
 * Pure functions, no neo: tests/moduleTabs.test.mjs.
 */

/** sessionStorage key of the window's tabs (src/windowStorage.mjs) */
export const WINDOW_KEY = 'go-module-tabs';

/** src/State.mjs id prefix of the user's last tabs, + user id */
export const LAST_STATE = 'go-module-tabs-last-';

/**
 * The tabs a window starts with
 * @param {Object} options
 * @param {String[]|null} options.windowTabs the window's stored tabs, null when it has none (new window, login)
 * @param {String[]|null} options.lastTabs the user's last tabs, null when none are stored
 * @param {String[]} options.available the available modules, in GO's module order
 * @param {String[]} [options.claimed=[]] modules an extension holds (workspace panels): no tab
 * @param {String[]} [options.open=[]] modules opened already (the window's address while it restored)
 * @returns {String[]} in GO's module order
 */
export function restoredTabs({windowTabs, lastTabs, available, claimed = [], open = []}) {
    const stored = new Set([...(windowTabs ?? lastTabs ?? []), ...open]);

    return available.filter(name => stored.has(name) && !claimed.includes(name))
}

/**
 * The stored value of a window's tabs
 * @param {String[]} tabs
 * @param {Number|String} userId
 * @returns {String}
 */
export function serializeWindowTabs(tabs, userId) {
    return JSON.stringify({userId, tabs})
}

/**
 * A window's stored tabs, null when there are none, they are invalid or another user's (logged in in
 * the same window after a session ended without "Logout")
 * @param {String|null} value
 * @param {Number|String} userId
 * @returns {String[]|null}
 */
export function parseWindowTabs(value, userId) {
    try {
        const data = value ? JSON.parse(value) : null;

        return data && data.userId === userId && Array.isArray(data.tabs) ? data.tabs.filter(name => typeof name === 'string') : null
    } catch (e) {
        return null
    }
}
