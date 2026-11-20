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
 * @returns {Promise<void>}
 */
export async function replaceRoute(windowId, value) {
    return (await addon(windowId)).replaceRoute({value, windowId})
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
