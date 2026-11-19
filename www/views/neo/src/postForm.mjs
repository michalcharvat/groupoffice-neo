/**
 * POSTs fields to a URL in a named browser window, see src/main/addon/PostForm.mjs.
 *
 *     await postForm(this.windowId, url, {accessToken}, 'groupoffice_instance')
 */
const ADDON = 'WS/PostForm';

/**
 * @param {String} windowId the window whose document submits the form
 * @param {String} url form action
 * @param {Object} fields name => value
 * @param {String} [target='_blank'] window name
 * @returns {Promise<Boolean>} false: the browser's popup blocker stopped the window, nothing was sent
 */
export async function postForm(windowId, url, fields, target='_blank') {
    // idempotent; not getAddon(): it caches per windowId, a reloaded tab keeps its id but not its addons
    await Neo.Main.importAddon({name: ADDON, windowId});
    return Neo.ns('GO.main.addon.PostForm').post({url, fields, target, windowId})
}
