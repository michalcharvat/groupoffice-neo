/**
 * Writes text to the clipboard from the App worker, see src/main/addon/ClipboardWriter.mjs. Call it from a click
 * handler: browsers only allow it shortly after a user gesture.
 *
 *     await writeText(me.windowId, url) || notify(me, t('Sorry, the text could not be copied to the clipboard'))
 */
const ADDON = 'WS/ClipboardWriter';

/**
 * @summary Writes the text to the clipboard of the window.
 * @param {String} windowId
 * @param {String} text
 * @returns {Promise<Boolean>} false when the browser refused
 */
export async function writeText(windowId, text) {
    // idempotent; not getAddon(): it caches per windowId, a reloaded tab keeps its id but not its addons
    await Neo.Main.importAddon({name: ADDON, windowId});
    return Neo.ns('GO.main.addon.ClipboardWriter').writeText({text, windowId})
}
