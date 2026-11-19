import Base from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';

/**
 * Main thread side of src/download.mjs: downloads a file through a clicked
 * `<a download>`. Setting location.href instead (Neo.Main.redirectTo) fires
 * beforeunload, and neo then disconnects the window from the shared worker even
 * though the page stays: the window no longer reacts. Loaded per window:
 *     await Neo.Main.importAddon({name: 'WS/Download', windowId})
 */
class Download extends Base {
    static config = {
        className: 'GO.main.addon.Download',
        // no library files to load
        preloadFilesDelay: false,
        remote: {
            app: ['download']
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.url same origin URL that answers with a file (Content-Disposition: attachment)
     */
    download({url}) {
        const a = document.createElement('a');

        a.href     = url;
        a.download = '';
        a.hidden   = true;
        document.body.appendChild(a);
        a.click();
        a.remove()
    }
}

export default Neo.setupClass(Download);
