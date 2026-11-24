import Base from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';

/**
 * Main thread side of src/history.mjs
 *
 * - replaceRoute(): a new hash without a history entry. neo's Neo.Main.setRoute() assigns
 *   location.hash, which adds one: a hash that is only rewritten (an entity alias, the
 *   "classic/…" hash of a link) would then come back on Back and run again.
 * - openTab(): a new browser tab without window.opener (the classic client, docs/neo-switch.md D3)
 *
 * Loaded per window: await Neo.Main.importAddon({name: 'WS/History', windowId})
 */
class History extends Base {
    static config = {
        className: 'GO.main.addon.History',
        // no library files to load
        preloadFilesDelay: false,
        remote: {
            app: ['openTab', 'replaceRoute']
        }
    }

    /**
     * @param {Object} data
     * @param {String} data.url
     * @returns {Boolean} false: the popup blocker stopped it
     */
    openTab({url}) {
        // with noopener window.open() always answers null, so it can't tell a blocked tab
        window.open(url, '_blank', 'noopener');
        return true
    }

    /**
     * @param {Object} data
     * @param {String} data.value hash without "#"
     * @param {String} [data.ifHash] only when the window's hash (without "#") is still this one: the
     *     App worker decided on an older hash, a route set meanwhile (a click in the module) wins
     * @returns {Boolean} false: not replaced because the hash changed meanwhile
     */
    replaceRoute({value, ifHash}) {
        const oldURL  = location.href,
              current = location.hash.replace(/^#/, '');

        if (ifHash !== undefined && current !== ifHash && safeDecode(current) !== ifHash) {
            return false
        }

        // the page's own path: a bare "#..." resolves against <base href> (go/core/webclient/Neo.php)
        history.replaceState(history.state, '', location.pathname + location.search + '#' + value);
        // neo's HashHistory listens to hashchange, which replaceState() doesn't fire
        window.dispatchEvent(new HashChangeEvent('hashchange', {oldURL, newURL: location.href}));
        return true
    }
}

/**
 * @param {String} value
 * @returns {String}
 */
function safeDecode(value) {
    try {
        return decodeURIComponent(value)
    } catch (e) {
        return value
    }
}

export default Neo.setupClass(History);
