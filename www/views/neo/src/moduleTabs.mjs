/**
 * The module tabs of the top bar (apps/go/view/MainView.mjs), docs/neo-core-components.md "Module tabs":
 * only the modules open in the window have a tab, in GO's module order. The window keeps its set in
 * sessionStorage (survives reloads). The user's last set (of any window) is on the server for a new
 * window or the next login, in any browser and in the classic client too: the user's client state
 * 'open-modules' (core/Webclient/saveOpenModules, the session returns it in 'state'). localStorage keeps
 * a copy until the server has it (offline, a failed request).
 *
 * Pure functions, no neo: tests/moduleTabs.test.mjs.
 */

/** sessionStorage key of the window's tabs (src/windowStorage.mjs) */
export const WINDOW_KEY = 'go-module-tabs';

/** src/State.mjs id prefix of the user's last tabs, + user id: {tabs, pending} */
export const LAST_STATE = 'go-module-tabs-last-';

/** The server's client state name of the user's last tabs, shared with the classic client (MainLayout.js) */
export const SERVER_STATE = 'open-modules';

/** A module name the server accepts (go\core\webclient\OpenModules), bookmarks as modules 'bookmarks-<id>' too */
const NAME = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * The user's last tabs as the classic client stores them: Ext.state.Provider.encodeValue() of the list,
 * escape('a:' + escape('s:' + name) joined by '^'). Module names need no escaping of their own.
 * @param {String[]} tabs
 * @returns {String}
 */
export function encodeServerTabs(tabs) {
    return encodeURIComponent('a:' + tabs.map(name => encodeURIComponent('s:' + name)).join('^'))
}

/**
 * The user's last tabs from the server's client state (classic or neo), null when there are none or the
 * value is no list. Items that are no module name are left out.
 * @param {*} value session state 'open-modules'
 * @returns {String[]|null}
 */
export function decodeServerTabs(value) {
    try {
        const list = typeof value === 'string' ? /^a:(.*)$/s.exec(decodeURIComponent(value)) : null;

        if (!list) {
            return null
        }

        return list[1] === '' ? [] : list[1].split('^').map(item => {
            try {
                return /^s:(.*)$/s.exec(decodeURIComponent(item))?.[1]
            } catch (e) {
                return null
            }
        }).filter(name => name && NAME.test(name))
    } catch (e) {
        return null
    }
}

/**
 * The user's last tabs for the server: the window's, plus the stored modules neo has no view of (classic
 * only), which the classic client still opens
 * @param {String[]} tabs the window's
 * @param {String[]|null} server the stored ones (decodeServerTabs())
 * @param {Function} isNeoModule (name) => Boolean
 * @returns {String[]}
 */
export function withClassicOnly(tabs, server, isNeoModule) {
    return [...tabs, ...(server ?? []).filter(name => !isNeoModule(name) && !tabs.includes(name))]
}

/**
 * Which of the user's last tabs a window starts with when it has none of its own: the local copy while
 * it hasn't reached the server (the window stores its tabs again after restoring), else the server's
 * @param {Object} options
 * @param {String[]|null} options.server the server's (decodeServerTabs()), null when none
 * @param {Object} [options.local] the localStorage copy {tabs, pending}
 * @returns {String[]|null}
 */
export function pickLastTabs({server, local}) {
    const localTabs = Array.isArray(local?.tabs) ? local.tabs.filter(name => typeof name === 'string' && NAME.test(name)) : null;

    return localTabs && local.pending ? localTabs : server ?? localTabs
}

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
