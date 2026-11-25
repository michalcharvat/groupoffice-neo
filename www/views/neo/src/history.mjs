/**
 * History helpers of the shell, see src/main/addon/History.mjs
 */
const ADDON = 'WS/History';

async function addon(windowId) {
    // idempotent; not getAddon(): it caches per windowId, a reloaded tab keeps its id but not its addons
    await Neo.Main.importAddon({name: ADDON, windowId});
    return Neo.ns('GO.main.addon.History')
}

/**
 * Set the hash of a window without a new history entry
 * @param {String} windowId
 * @param {String} value hash without "#"
 * @param {Object} [options]
 * @param {String} [options.ifHash] replace only while the window's hash (without "#") is still this one:
 *     a route the window got meanwhile (e.g. a click in a module) wins over a decision made on an older hash
 * @returns {Promise<Boolean>} false: skipped because of ifHash
 */
export async function replaceRoute(windowId, value, {ifHash} = {}) {
    return (await addon(windowId)).replaceRoute({value, windowId, ...ifHash !== undefined && {ifHash}})
}

/**
 * Open a URL in a new browser tab without window.opener
 * @param {String} windowId the window the user clicked in
 * @param {String} url
 * @returns {Promise<Boolean>}
 */
export async function openTab(windowId, url) {
    return (await addon(windowId)).openTab({url, windowId})
}

/**
 * Go to a URL without a history entry: Back doesn't return to the page that sent the user on
 * @param {String} windowId
 * @param {String} url
 * @returns {Promise<void>}
 */
export async function replaceLocation(windowId, url) {
    await (await addon(windowId)).replaceLocation({url, windowId})
}

/**
 * Remove parameters from a window's query (the others, path and hash stay), without a history entry
 * @param {String} windowId
 * @param {String[]} names
 * @returns {Promise<void>}
 */
export async function removeQuery(windowId, names) {
    await (await addon(windowId)).removeQuery({names, windowId})
}
