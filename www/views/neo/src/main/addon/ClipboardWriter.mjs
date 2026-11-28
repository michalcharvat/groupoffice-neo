import Base from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';

/**
 * @summary Main thread side of src/clipboard.mjs: writes text to the clipboard, which the App worker cannot reach.
 * Not named Clipboard: Neo.Main keys its addons by class name and neo has a Neo.main.addon.Clipboard.
 *
 * Loaded per window: await Neo.Main.importAddon({name: 'WS/ClipboardWriter', windowId})
 * @class GO.main.addon.ClipboardWriter
 * @extends Neo.main.addon.Base
 */
class ClipboardWriter extends Base {
    static config = {
        className: 'GO.main.addon.ClipboardWriter',
        // no library files to load
        preloadFilesDelay: false,
        remote: {
            app: ['writeText']
        }
    }

    /**
     * @summary Writes the text with the Clipboard API, or through a hidden text area and execCommand('copy') where
     * the API is missing (a page over plain http) or refuses. Both need the click that asked for it to be recent.
     * @param {Object} data
     * @param {String} data.text
     * @returns {Promise<Boolean>} false when the browser refused
     */
    async writeText({text}) {
        try {
            await navigator.clipboard.writeText(text);
            return true
        } catch (e) {
            return this.execCopy(text)
        }
    }

    /**
     * @summary Copies the text through a temporary off-screen text area.
     * @param {String} text
     * @returns {Boolean}
     * @protected
     */
    execCopy(text) {
        const area      = document.createElement('textarea'),
              active    = document.activeElement,
              selection = document.getSelection(),
              ranges    = [];

        for (let i = 0; i < selection.rangeCount; i++) {
            ranges.push(selection.getRangeAt(i))
        }

        area.value = text;
        area.setAttribute('readonly', '');
        area.style.cssText = 'position:fixed;left:-10000px;top:0;opacity:0;';
        document.body.appendChild(area);
        area.select();

        try {
            return document.execCommand('copy')
        } catch (e) {
            return false
        } finally {
            area.remove();
            active?.focus?.({preventScroll: true});
            // the user's selected text, which select() replaced
            selection.removeAllRanges();
            ranges.forEach(range => selection.addRange(range))
        }
    }
}

export default Neo.setupClass(ClipboardWriter);
