import {escapeHtml}   from '../Format.mjs';
import {resolveRoute} from './linkTypes.mjs';

/**
 * Links to another record inside a component's html. Not an `<a href="#route">`: neo's page has a
 * `<base href>`, so the browser would load the base folder (403) unless the main thread stops it,
 * and an App worker DOM listener can't. The link carries its route in `data-route`; the main
 * thread addon GO.main.addon.History opens it in every window (click, Enter), nothing to wire up.
 */

/**
 * @summary An anchor that opens a hash route when clicked (or Enter on it).
 * @param {String} route e.g. "crew/amdcrewmember/5"
 * @param {String} html the link's content, already escaped
 * @returns {String} HTML
 */
export function routeLink(route, html) {
    return `<a class="go-route-link" role="link" tabindex="0" data-route="${escapeHtml(route)}">${html}</a>`
}

/**
 * @summary A link to an entity's hash (its neo module, else the classic client), plain text
 * without one.
 * @param {String} entity
 * @param {String|Number|null} id
 * @param {String} text
 * @returns {String} HTML
 */
export function entityLink(entity, id, text) {
    const route = id != null && id !== '' ? resolveRoute(entity, id) : null;

    return route ? routeLink(route, escapeHtml(text)) : escapeHtml(text)
}
