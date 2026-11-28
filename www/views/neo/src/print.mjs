/**
 * Prints a rendered component (GOUI Component.print(), ExtJS Ext.Element.print()),
 * see src/main/addon/Print.mjs. Detail panels print their content below the toolbar:
 *
 *     await print(me.getReference('scroller'), {title: note.name})
 *
 * A document by URL (a PDF shown inline):
 *
 *     await printUrl(me.windowId, goUrl(client.apiUrl + 'download.php?blob=' + blobId + '&inline=1'))
 */
const ADDON = 'WS/Print';

/**
 * @param {Neo.component.Base} component a mounted component
 * @param {Object} [options]
 * @param {String} [options.title] document title, the file name when saving as PDF
 * @returns {Promise<Boolean>} false when the component is not mounted
 */
export async function print(component, {title} = {}) {
    const {id, windowId} = component;

    if (!component.mounted) {
        return false
    }

    // idempotent; not getAddon(): it caches per windowId, a reloaded tab keeps its id but not its addons
    await Neo.Main.importAddon({name: ADDON, windowId});
    return Neo.ns('GO.main.addon.Print').print({id, title, windowId})
}

/**
 * @summary Prints a same-origin document by URL, e.g. a PDF shown inline.
 * @param {String} windowId
 * @param {String} url absolute, see goUrl() in src/pdf/PdfViewer.mjs
 * @returns {Promise<Boolean>} false when the URL is not of GO's origin
 */
export async function printUrl(windowId, url) {
    await Neo.Main.importAddon({name: ADDON, windowId});
    return Neo.ns('GO.main.addon.Print').printUrl({url, windowId})
}
