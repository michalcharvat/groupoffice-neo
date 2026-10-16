import client       from '../../../../../../views/neo/src/jmap/Client.mjs';
import {translator} from '../../../../../../views/neo/src/Translate.mjs';

export const t = translator('community', 'bookmarks');

/**
 * Download URL of a logo blob (GOUI client.downloadUrl())
 * @param {String|null} blobId
 * @returns {String|null}
 */
export function logoUrl(blobId) {
    return blobId ? client.apiUrl + 'download.php?blob=' + encodeURIComponent(blobId) : null
}

/**
 * The bookmark's URL if it is a web address. Bookmarks are written by other users:
 * a "javascript:" URL in a link or an iframe would run in GO's origin.
 * @param {String|null} url
 * @returns {String|null}
 */
export function safeUrl(url) {
    try {
        const {protocol} = new URL(url);
        return ['http:', 'https:'].includes(protocol) ? url : null
    } catch (e) {
        return null
    }
}

/**
 * The module rights of the logged-in user, e.g. {mayRead: true, mayManage: false}
 * @returns {Object}
 */
export function moduleRights() {
    const capability = client.session?.capabilities?.['go:community:bookmarks'];
    return capability && typeof capability === 'object' ? capability : {}
}
