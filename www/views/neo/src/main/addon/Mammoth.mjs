import Base from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';
import {fetchArrayBuffer, loadScript} from '../loadScript.mjs';

/**
 * Main thread side of the docx preview and import (src/preview/officePreviews.mjs): mammoth (views/neo/lib/mammoth,
 * the classic client has its own copy in amd/libs) converts a docx file to HTML. The App worker sanitises it.
 *
 * Loaded per window: await Neo.Main.importAddon({name: 'WS/Mammoth', windowId})
 * @summary Converts a docx file to HTML with mammoth.
 * @class GO.main.addon.Mammoth
 * @extends Neo.main.addon.Base
 */
class Mammoth extends Base {
    static config = {
        className: 'GO.main.addon.Mammoth',
        // the library is loaded on the first convertToHtml()
        preloadFilesDelay: false,
        remote: {
            app: ['convertToHtml']
        }
    }

    /**
     * @summary The unsanitised HTML of a docx file; images are inline data URLs.
     * @param {Object} data
     * @param {String} data.url       absolute same-origin URL of the file (also a blob: URL of this page)
     * @param {String} data.scriptUrl absolute URL of mammoth.browser.min.js
     * @returns {Promise<String>}
     */
    async convertToHtml({url, scriptUrl}) {
        const [arrayBuffer] = await Promise.all([fetchArrayBuffer(url), loadScript(scriptUrl)]);

        return (await globalThis.mammoth.convertToHtml({arrayBuffer})).value
    }
}

export default Neo.setupClass(Mammoth);
