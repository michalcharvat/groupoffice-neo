import client from '../jmap/Client.mjs';

/**
 * Entity/export and Entity/import run after the response (PostResponseProcessor) and
 * report through a core Alert of the user: "Exporting" with progress, then "Export
 * finished" whose body links the blob (AbstractConverter notifyStart/notifyEnd). The
 * ExtJS client shows them as notifications; neo has none yet, so the caller waits:
 *
 *     const alert  = await runBackgroundJob(() => client.call('Contact/export', {extension: 'csv', ids}));
 *     const blobId = alertBlobId(alert); // the export file, null for an "Export error"
 *
 * Jobs of this worker run one after the other: the first alert created after a job
 * started is that job's alert (the converter updates that same alert until it ends).
 */

let queue = Promise.resolve();

/**
 * Starts a background job and waits for its finished alert
 * @param {Function} start () => Promise, the Entity/export or Entity/import call
 * @param {Object} [opts] see waitForFinishedAlert()
 * @returns {Promise<Object>} the finished alert
 */
export function runBackgroundJob(start, opts) {
    const run = queue.then(async () => {
        const since = await lastAlertId();
        await start();
        return waitForFinishedAlert(since, opts)
    });

    // the next job waits for this one, also when it failed
    queue = run.catch(() => {});
    return run
}

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

        // the job's alert: the oldest one created after it started
        const alert = list.filter(a => Number(a.id) > sinceId).sort((a, b) => Number(a.id) - Number(b.id))[0];

        if (alert) {
            if (alert.data && alert.data.persistent === false) {
                return alert
            }

            onProgress?.(alert)
        }
    }

    throw new Error('Timeout')
}

/**
 * The blob of a finished export. Only the blob id is taken from the alert body (never
 * its URL): callers build the download URL themselves.
 * @param {Object} alert
 * @returns {String|null} blob id (hex)
 */
export function alertBlobId(alert) {
    const match = /download\.php\?blob=([0-9a-f]{40})\b/i.exec(alert?.data?.body || '');
    return match ? match[1] : null
}

/**
 * Removes an alert the caller has shown (the ExtJS notification's dismiss)
 * @param {Object} alert
 * @returns {Promise<void>}
 */
export async function dismissAlert(alert) {
    alert?.id && await client.set('Alert', {destroy: [alert.id]}).catch(() => {})
}
