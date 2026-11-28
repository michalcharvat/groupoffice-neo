import Base from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';

/**
 * Main thread side of src/history.mjs
 *
 * - replaceRoute(): a new hash without a history entry. neo's Neo.Main.setRoute() assigns
 *   location.hash, which adds one: a hash that is only rewritten (an entity alias, the
 *   "classic/…" hash of a link) would then come back on Back and run again.
 * - openTab(): a new browser tab without window.opener (the classic client, docs/neo-switch.md D3)
 * - openWindow(): this page at another hash in a new browser window of the size of this one, e.g. a
 *   workspace for a second monitor; it joins the shared App worker as a window of its own
 * - isWindowClosed(): whether a window openWindow() opened was closed (a reload keeps it open)
 * - replaceLocation(): leave the page without a history entry (OAuth authorize after login)
 * - removeQuery(): drop parameters of the page's query, e.g. a mailto: link's ?r=&f= once its
 *   composer is open, so a reload doesn't run it again
 * - route links: a click (or Enter) on `a.go-route-link[data-route]` (src/link/routeLink.mjs) or on
 *   an `a[href^="#"]` sets the hash of this window. A bare "#..." href resolves against
 *   <base href> (go/core/webclient/Neo.php) and would load views/neo/apps/go/ (403); only the main
 *   thread can stop that, an App worker DOM listener comes too late for preventDefault().
 *
 * Loaded per window: await Neo.Main.importAddon({name: 'WS/History', windowId})
 */
class History extends Base {
    static config = {
        className: 'GO.main.addon.History',
        // no library files to load
        preloadFilesDelay: false,
        remote: {
            app: ['isWindowClosed', 'openTab', 'openWindow', 'removeQuery', 'replaceLocation', 'replaceRoute']
        }
    }

    /**
     * key → handle of the windows openWindow() opened with a key
     * @member {Map} windows
     */
    windows = new Map()

    construct(config) {
        super.construct(config);

        const open = this.onRouteLink.bind(this);

        document.addEventListener('click', open);
        document.addEventListener('keydown', open)
    }

    /**
     * Only this page holds the handle: the App worker can't tell a closed window from a reloaded one
     * (both leave with a "disconnect", a reload comes back under a new window id)
     * @param {Object} data
     * @param {String} data.key the key given to openWindow()
     * @returns {Boolean|null} null: not a window of this page (this page was reloaded since)
     */
    isWindowClosed({key}) {
        const win = this.windows.get(key);

        if (!win) {
            return null
        }

        win.closed && this.windows.delete(key);
        return win.closed
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
     * @param {String} data.hash without "#"
     * @param {String} [data.key] keep the window's handle under this key, for isWindowClosed()
     * @param {Object} [data.items] sessionStorage items of the new window (it starts with none)
     * @returns {Boolean} false: the popup blocker stopped it
     */
    openWindow({hash, key, items}) {
        const url      = location.pathname + location.search + '#' + hash,
              // a window, not a tab: with a size; a little offset so it doesn't hide this one
              features = `width=${window.outerWidth},height=${window.outerHeight},left=${window.screenX + 40},top=${window.screenY + 40}`,
              win      = window.open(url, '_blank', features);

        if (!win) {
            return false
        }

        // the browser copies this window's sessionStorage into the new one: it would restore this
        // window's tabs (src/windowStorage.mjs). Still about:blank of this origin, so reachable.
        try {
            win.sessionStorage.clear();
            Object.entries(items || {}).forEach(([name, value]) => win.sessionStorage.setItem(name, value))
        } catch (e) {
            console.warn('openWindow: sessionStorage', e)
        }

        // the new window must not reach back into this one
        win.opener = null;

        if (key) {
            // windows closed without anyone asking
            this.windows.forEach((other, k) => other.closed && this.windows.delete(k));
            this.windows.set(key, win)
        }

        return true
    }

    /**
     * Opens a route link of this window, see the class comment
     * @param {MouseEvent|KeyboardEvent} event
     */
    onRouteLink(event) {
        // shortcut: ctrl/shift/middle click doesn't open a new tab, add it when someone needs it
        if (event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
            return
        }

        const link = event.target.closest?.('a.go-route-link[data-route], a[href^="#"]');

        // in an editor the browser follows no link either; Enter on an href fires a click of its own
        if (!link || link.isContentEditable || (event.type === 'keydown' && (event.key !== 'Enter' || link.hasAttribute('href')))) {
            return
        }

        const route = link.dataset.route ?? link.getAttribute('href').substring(1);

        link.hasAttribute('href') && event.preventDefault();

        if (!route) {
            return
        }

        // e.g. sanitized user html: a new tab at this page's URL, not at <base href>
        if (link.target === '_blank') {
            this.openTab({url: location.pathname + location.search + '#' + route});
            return
        }

        // as Neo.Main.setRoute(): location.hash is relative to the page, not to <base href>
        location.hash = route
    }

    /**
     * @param {Object} data
     * @param {String} data.url
     */
    replaceLocation({url}) {
        location.replace(url)
    }

    /**
     * Removes parameters from the page's query, keeps the others, the path and the hash
     * @param {Object} data
     * @param {String[]} data.names
     */
    removeQuery({names}) {
        const url = new URL(location.href);

        (names || []).forEach(name => url.searchParams.delete(name));

        url.href !== location.href && history.replaceState(history.state, '', url.pathname + url.search + url.hash)
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

        // raw on both sides: neo's HashHistory hands the worker location.hash undecoded
        if (ifHash !== undefined && current !== ifHash) {
            return false
        }

        // the page's own path: a bare "#..." resolves against <base href> (go/core/webclient/Neo.php)
        history.replaceState(history.state, '', location.pathname + location.search + '#' + value);
        // neo's HashHistory listens to hashchange, which replaceState() doesn't fire
        window.dispatchEvent(new HashChangeEvent('hashchange', {oldURL, newURL: location.href}));
        return true
    }
}

export default Neo.setupClass(History);
