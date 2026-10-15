/**
 * Component state in the browser's localStorage, compatible with GOUI's State
 * (key "state-<id>", JSON): GOUI and neo share e.g. panel widths on one origin.
 *
 * The App worker has no localStorage: it goes through neo's LocalStorage main thread addon.
 */
const prefix = 'state-';

async function storage(windowId) {
    return Neo.worker.App.getAddon('LocalStorage', windowId)
}

/**
 * @param {String} id
 * @param {String} windowId
 * @returns {Promise<Object>} {} when nothing is stored
 */
export async function getState(id, windowId) {
    try {
        const {value} = await (await storage(windowId)).readLocalStorageItem({key: prefix + id, windowId});

        return value ? JSON.parse(value) : {}
    } catch (e) {
        // blocked storage or invalid JSON: behave as if nothing was stored
        return {}
    }
}

/**
 * @param {String} id
 * @param {Object} state
 * @param {String} windowId
 */
export async function setState(id, state, windowId) {
    try {
        await (await storage(windowId)).updateLocalStorageItem({key: prefix + id, value: JSON.stringify(state), windowId})
    } catch (e) {
        console.warn('Could not save state', id, e)
    }
}

/**
 * GOUI sizes are in dp: 1dp = .1rem and <html> font-size is --density (8.64px on desktop;
 * the mobile density only applies to the card layout, which has no splitters)
 * @param {String} windowId
 * @returns {Promise<Number>} px per dp
 */
export async function dpSize(windowId) {
    const style   = await Neo.main.DomAccess.getComputedStyle({id: 'document.body', style: '--density', windowId}),
          density = parseFloat(style['--density']);

    return (density || 8.64) / 10
}
