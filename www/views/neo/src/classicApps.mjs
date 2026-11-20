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

/** @type {Object[]} all of the user's classic apps [{package, name, title, route, entities}] */
let all = [];

/** @type {Object[]} the ones without a neo main view: apps menu, module hashes */
let apps = [];

/** load generation: an older answer (other user, earlier login) must not win */
let generation = 0;

// the list belongs to the user: one App worker serves every window
client.on('logout', () => {
    generation++;
    all = apps = []
});

/**
 * Load the list for the logged-in user (after login, again after "login as")
 * @returns {Promise<Object[]>}
 */
export async function loadClassicApps() {
    const current = ++generation,
          userId  = client.user?.id;

    let list = [];

    try {
        ({list = []} = await client.call('core/Webclient/classicApps'))
    } catch (e) {
        // the classic launchers are optional: neo works without them
        console.error('classicApps', e)
    }

    if (current !== generation || client.user?.id !== userId) {
        return apps
    }

    const neo = ModuleRegistry.getAvailable();

    all  = list;
    apps = list.filter(app => !neo.some(m => m.name === app.name && (m.package || 'legacy') === (app.package || 'legacy')));

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

    // all apps: a partly ported module may show some of its entities only in the classic client
    // (resolveRoute() asks neo's routes first)
    return all.some(app => app.entities?.some(e => e.toLowerCase() === lower))
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
