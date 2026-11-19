/**
 * App worker side of the user's look & feel, see src/main/addon/Preferences.mjs.
 */
const ADDON = 'WS/Preferences';

const addon = () => Neo.ns('GO.main.addon.Preferences');

/**
 * @param {String} windowId
 * @returns {Promise<Object>} the addon's remote methods
 */
async function load(windowId) {
    // idempotent; not getAddon(): it caches per windowId, a reloaded tab keeps its id but not its addons
    await Neo.Main.importAddon({name: ADDON, windowId});
    return addon()
}

/** Callbacks of onThemeChange() */
const themeListeners = new Set();

/**
 * Calls fn(windowIds) after applyTheme() changed the theme of windows, e.g. to measure
 * the density again (GO.grid.Grid row heights)
 * @param {Function} fn
 * @returns {Function} removes the listener
 */
export function onThemeChange(fn) {
    themeListeners.add(fn);
    return () => themeListeners.delete(fn)
}

/**
 * px of dp(1) in a window: the html font-size is dp(10), it follows the theme
 * (Paper 8.64px, Compact 7.125px) and the device (--mobile-density)
 * @param {String} windowId
 * @returns {Promise<Number>} 0 when the window can't be measured
 */
export async function dpPixels(windowId) {
    try {
        return (await (await load(windowId)).rootFontSize({windowId})) / 10
    } catch (e) {
        // a window that is closing
        return 0
    }
}

/**
 * Applies the theme in windows of this App worker
 * @param {Object} data
 * @param {String} [data.theme]       'Paper' or 'Compact'
 * @param {String} [data.colorScheme] 'light', 'dark' or 'system'
 * @param {String[]} [windowIds] default: every window
 * @returns {Promise<void>}
 */
export async function applyTheme({theme, colorScheme}, windowIds = Object.keys(Neo.apps || {})) {
    await Promise.all(windowIds.map(async windowId => {
        try {
            await (await load(windowId)).applyTheme({theme, colorScheme, windowId})
        } catch (e) {
            // a window that is closing
            console.warn('applyTheme', windowId, e)
        }
    }));

    theme && themeListeners.forEach(fn => fn(windowIds))
}

/**
 * Removes the stored component state (grid columns, panel widths) of this origin
 * @param {String} windowId
 * @returns {Promise<Number>} removed entries
 */
export async function clearState(windowId) {
    return (await load(windowId)).clearState({windowId})
}

/**
 * Sets CSS variables on <body> (null removes one), e.g. a colour preview
 * @param {Object} props CSS property → value
 * @param {String|null} [scheme] 'light' or 'dark': only windows showing that colour scheme
 * @param {String[]} [windowIds] default: every window
 * @returns {Promise<void>}
 */
export async function setBodyStyle(props, scheme = null, windowIds = Object.keys(Neo.apps || {})) {
    await Promise.all(windowIds.map(async windowId => {
        try {
            await (await load(windowId)).setBodyStyle({props, scheme, windowId})
        } catch (e) {
            console.warn('setBodyStyle', windowId, e)
        }
    }))
}
