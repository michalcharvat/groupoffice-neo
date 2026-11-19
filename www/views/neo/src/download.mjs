/**
 * Downloads a file in a window without leaving the page, see src/main/addon/Download.mjs.
 * Use it instead of Neo.Main.redirectTo() for attachment URLs (download.php, vCards).
 *
 *     await download(this.windowId, client.baseUrl + 'api/download.php?blob=' + encodeURIComponent(blobId))
 */
const ADDON = 'WS/Download';

/**
 * @param {String} windowId
 * @param {String} url
 * @returns {Promise<void>}
 */
export async function download(windowId, url) {
    // idempotent; not getAddon(): it caches per windowId, a reloaded tab keeps its id but not its addons
    await Neo.Main.importAddon({name: ADDON, windowId});
    await Neo.ns('GO.main.addon.Download').download({url, windowId})
}
