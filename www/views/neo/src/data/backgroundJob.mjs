import client from '../jmap/Client.mjs';

/**
 * Entity/export and Entity/import run after the response (PostResponseProcessor) and
 * report through a core Alert of the user: "Exporting" with progress, then "Export
 * finished" whose body links the blob (AbstractConverter notifyStart/notifyEnd). The
 * ExtJS client shows them as notifications; neo has none yet, so the caller waits:
 *
 *     const since = await lastAlertId();
 *     await client.call('Contact/export', {extension: 'csv', ids});
 *     const alert = await waitForFinishedAlert(since);
 *     const url   = alertLink(alert);   // download URL of the export
 */

/**
 * @returns {Promise<Number>} id of the user's newest alert, 0 for none
 */
export async function lastAlertId() {
    const {ids} = await client.call('Alert/query', {
        filter: {userId: client.user.id},
        sort  : [{property: 'id', isAscending: false}],
        limit : 1
    });

    return Number(ids?.[0] || 0)
}

/**
 * Polls the user's alerts newer than sinceId until one is no longer persistent (the
 * converter's final state)
 * @param {Number} sinceId
 * @param {Object} [opts]
 * @param {Number} [opts.interval=2000] ms
 * @param {Number} [opts.timeout=600000] ms
 * @param {Function} [opts.onProgress] (alert) => void, for every unfinished alert seen
 * @returns {Promise<Object>} the alert ({id, data: {title, body, …}})
 */
export async function waitForFinishedAlert(sinceId, {interval = 2000, timeout = 600000, onProgress} = {}) {
    const end = Date.now() + timeout;

    while (Date.now() < end) {
        await new Promise(resolve => setTimeout(resolve, interval));

        const {list} = await client.queryGet('Alert', {
            filter: {userId: client.user.id},
            sort  : [{property: 'id', isAscending: false}],
            limit : 10
        });

        const fresh = list.filter(alert => Number(alert.id) > sinceId);

        for (const alert of fresh) {
            if (alert.data && alert.data.persistent === false) {
                return alert
            }

            onProgress?.(alert)
        }
    }

    throw new Error('Timeout')
}

/**
 * @param {Object} alert
 * @returns {String|null} the first link in the alert body (the export's download URL)
 */
export function alertLink(alert) {
    const match = /href="([^"]+)"/.exec(alert?.data?.body || '');
    return match ? match[1].replace(/&amp;/g, '&') : null
}

/**
 * Removes an alert the caller has shown (the ExtJS notification's dismiss)
 * @param {Object} alert
 * @returns {Promise<void>}
 */
export async function dismissAlert(alert) {
    alert?.id && await client.set('Alert', {destroy: [alert.id]}).catch(() => {})
}
