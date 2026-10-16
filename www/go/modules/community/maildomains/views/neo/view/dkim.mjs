import client from '../../../../../../../views/neo/src/jmap/Client.mjs';

/**
 * The domain's DKIM keys as a MailDomain/set value: per selector only what the
 * client may change (status and DNS are read only, the keys stay on the server)
 * @param {Object} dkim MailDomain.dkim
 * @returns {Object}
 */
export function dkimPatch(dkim) {
    return Object.fromEntries(Object.entries(dkim || {}).map(([selector, key]) => [selector, {selector, enabled: !!key.enabled}]))
}

/**
 * Saves the domain's DKIM map (keys missing in it are deleted, new ones generated)
 * @param {String} domainId
 * @param {Object} dkim
 * @returns {Promise<Object>}
 */
export function saveDkim(domainId, dkim) {
    return client.set('MailDomain', {update: {[domainId]: {dkim}}})
}
