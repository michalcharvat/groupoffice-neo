/**
 * Per browser window storage (sessionStorage), see src/main/addon/WindowStorage.mjs
 */
const ADDON = 'WS/WindowStorage';

async function addon(windowId) {
    // idempotent; not getAddon(): it caches per windowId, a reloaded tab keeps its id but not its addons
    await Neo.Main.importAddon({name: ADDON, windowId});
    return Neo.ns('GO.main.addon.WindowStorage')
}

/**
 * @param {String} windowId
 * @param {String} key
 * @returns {Promise<String|null>}
 */
export async function getWindowItem(windowId, key) {
    try {
        return await (await addon(windowId)).getItem({key, windowId})
    } catch (e) {
        return null
    }
}

/**
 * @param {String} windowId
 * @param {String} key
 * @param {String|null} value null removes it
 * @returns {Promise<void>}
 */
export async function setWindowItem(windowId, key, value) {
    try {
        await (await addon(windowId)).setItem({key, value, windowId})
    } catch (e) {
        console.warn('Could not store', key, e)
    }
}
