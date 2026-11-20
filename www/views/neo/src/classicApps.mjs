import client         from './jmap/Client.mjs';
import ModuleRegistry from './ModuleRegistry.mjs';

/**
 * Modules the user has in the classic client but not in neo (docs/neo-switch.md, D3)
 *
 * The server lists the user's modules with a classic main panel (`core/Webclient/classicApps`);
 * the ones a neo module shows are left out. The shell offers the rest in its apps menu and
 * sends hashes it can't route (`#<entity>/<id>` of such a module) to the classic client.
 * Inside neo a classic target is the hash `#classic/<classic hash>`, which `MainView` opens in
 * a new browser tab, so links, search results and alerts need nothing of their own.
 */

/** @type {Object[]} [{package, name, title, route, entities}] */
let apps = [];

/**
 * Load the list for the logged-in user (after login, again after "login as")
 * @returns {Promise<Object[]>}
 */
export async function loadClassicApps() {
    try {
        const {list = []} = await client.call('core/Webclient/classicApps'),
              neo         = ModuleRegistry.getAvailable();

        apps = list.filter(app => !neo.some(m => m.name === app.name && (m.package || 'legacy') === (app.package || 'legacy')))
    } catch (e) {
        // the classic launchers are optional: neo works without them
        console.error('classicApps', e);
        apps = []
    }

    return apps
}

/**
 * @returns {Object[]} [{package, name, title, route, entities}]
 */
export function getClassicApps() {
    return apps
}

/**
 * The classic client's app shown at a module hash, e.g. "vessels" or "vessels/…"
 * @param {String} name first part of the hash
 * @returns {Object|null}
 */
export function classicAppByRoute(name) {
    return apps.find(app => app.route === name) || null
}

/**
 * The classic hash of an entity whose module only the classic client has
 * (go.Router's generic "#<entity>/<id>" route)
 * @param {String} entity e.g. "SfToursTour"
 * @param {String|Number} id
 * @returns {String|null} e.g. "sftourstour/5"
 */
export function classicEntityRoute(entity, id) {
    const lower = String(entity || '').toLowerCase();

    if (!lower || id === null || id === undefined || id === '') {
        return null
    }

    return apps.some(app => app.entities?.some(e => e.toLowerCase() === lower))
        ? lower + '/' + encodeURIComponent(String(id))
        : null
}

/**
 * URL of the classic client at a hash, for this page only (?webclient=classic does not
 * change the browser's choice)
 * @param {String} [hash] without "#"
 * @returns {String}
 */
export function classicUrl(hash = '') {
    return client.baseUrl + 'index.php?webclient=classic' + (hash ? '#' + hash : '')
}
