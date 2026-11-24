import Base from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';

/**
 * Main thread side of src/windowStorage.mjs: the browser window's sessionStorage.
 *
 * sessionStorage belongs to one browser window (tab) and survives its reloads, unlike
 * localStorage (origin wide, src/State.mjs). The App worker has neither.
 *
 * Loaded per window: await Neo.Main.importAddon({name: 'WS/WindowStorage', windowId})
 */
class WindowStorage extends Base {
    static config = {
        className: 'GO.main.addon.WindowStorage',
        // no library files to load
        preloadFilesDelay: false,
        remote: {
            app: ['getItem', 'setItem']
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.key
     * @returns {String|null}
     */
    getItem({key}) {
        try {
            return sessionStorage.getItem(key)
        } catch (e) {
            // blocked storage
            return null
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.key
     * @param {String|null} data.value null removes the item
     */
    setItem({key, value}) {
        try {
            value === null ? sessionStorage.removeItem(key) : sessionStorage.setItem(key, value)
        } catch (e) {
            // blocked storage: the window keeps its workspace until it reloads
        }
    }
}

export default Neo.setupClass(WindowStorage);
