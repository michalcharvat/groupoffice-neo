import client       from './Client.mjs';
import UploadPanel  from '../component/UploadPanel.mjs';
import {fileSize}   from '../Format.mjs';
import {notifyError} from '../Notify.mjs';
import {t}          from '../Translate.mjs';

let nextId = 0;

/**
 * Uploads files as JMAP blobs (go.Uploader in the ExtJS client): a queue that runs at most
 * `maxConcurrentUpload` uploads at once, refuses files over the server's `maxSizeUpload`,
 * lets the user abort them and shows their progress in a GO.component.UploadPanel in the
 * window of the component that started them (only when they take longer than showDelay).
 *
 *     import uploader from '../jmap/Uploader.mjs';
 *
 *     const blob  = await uploader.upload(file, {component: me});       // rejects on failure or abort
 *     const blobs = await uploader.uploadMany(files, {component: me});  // the uploaded ones, failures are notified
 *
 * A promise of an aborted upload rejects with an AbortError: check it with
 * `Uploader.isAbort(e)` and don't report it.
 */
export class Uploader {
    /**
     * ms an upload runs before the progress panel shows (fast uploads don't flash it)
     * @member {Number} showDelay=500
     */
    showDelay = 500
    /**
     * ms the finished panel stays before it closes
     * @member {Number} hideDelay=800
     */
    hideDelay = 800
    /**
     * Class of the progress panel, null for none
     * @member {Function|null} panelClass=GO.component.UploadPanel
     */
    panelClass = UploadPanel

    /** items waiting for a free slot */
    #queue = []
    #running = 0
    /** {windowId: {items, panel, showTimer, hideTimer, appName}} */
    #batches = new Map()

    /**
     * @param {*} error
     * @returns {Boolean} the error is an aborted upload
     */
    static isAbort(error) {
        return error?.name === 'AbortError'
    }

    /**
     * Largest file the server accepts, 0 for no limit
     * @returns {Number}
     */
    get maxSizeUpload() {
        // GO puts the JMAP core limits (go\core\jmap\Capabilities) directly in session.capabilities
        return client.session?.capabilities?.maxSizeUpload || 0
    }

    /**
     * @returns {Number}
     */
    get maxConcurrentUpload() {
        return client.session?.capabilities?.maxConcurrentUpload || 4
    }

    /**
     * Uploads one file
     * @param {File|Blob} file
     * @param {Object} [options]
     * @param {Neo.component.Base} [options.component] shows the progress in its window
     * @returns {Promise<Object>} {blobId, name, size, type}
     */
    upload(file, {component}={}) {
        const max = this.maxSizeUpload;

        if (max && file.size > max) {
            return Promise.reject(new Error((file.name ? file.name + ': ' : '') +
                t('File size exceeds the maximum of {max}.').replace('{max}', fileSize(max))))
        }

        const item = {
            id        : ++nextId,
            file,
            name      : file.name || t('Upload'),
            size      : file.size || 0,
            loaded    : 0,
            status    : 'queued',
            controller: new AbortController()
        };

        item.promise = new Promise((resolve, reject) => {
            item.resolve = resolve;
            item.reject  = reject
        });

        component && this.#addToBatch(item, component);
        this.#queue.push(item);
        this.#next();

        return item.promise
    }

    /**
     * Uploads several files at once. Failures are reported on the component, aborted
     * uploads are left out silently.
     * @param {File[]|FileList} files
     * @param {Object} [options]
     * @param {Neo.component.Base} [options.component]
     * @returns {Promise<Object[]>} the blobs of the files that were uploaded, in order
     */
    async uploadMany(files, {component}={}) {
        const results = await Promise.allSettled([...files].map(file => this.upload(file, {component}))),
              blobs   = [];

        results.forEach(result => {
            if (result.status === 'fulfilled') {
                blobs.push(result.value)
            } else if (!Uploader.isAbort(result.reason)) {
                component ? notifyError(component, result.reason) : console.error(result.reason)
            }
        });

        return blobs
    }

    /**
     * Aborts one upload, queued or running
     * @param {Number} id
     */
    abort(id) {
        for (const batch of this.#batches.values()) {
            const item = batch.items.find(i => i.id === id);

            if (item) {
                this.#abortItem(item);
                return
            }
        }
    }

    /**
     * Aborts all uploads that show in a window
     * @param {String} windowId
     */
    abortAll(windowId) {
        [...this.#batches.get(windowId)?.items || []].forEach(item => this.#abortItem(item))
    }

    /**
     * The uploads of a window, for the progress panel
     * @param {String} windowId
     * @returns {Object[]} items {id, name, size, loaded, status: queued|uploading|done|failed|aborted}
     */
    getItems(windowId) {
        return this.#batches.get(windowId)?.items || []
    }

    #abortItem(item) {
        if (item.status === 'queued') {
            this.#queue = this.#queue.filter(i => i !== item);
            this.#settle(item, 'aborted', null, new DOMException('Upload aborted', 'AbortError'))
        } else if (item.status === 'uploading') {
            item.controller.abort()
        }
    }

    #addToBatch(item, component) {
        const {windowId, appName} = component;

        let batch = this.#batches.get(windowId);

        if (!batch) {
            batch = {items: [], panel: null, showTimer: null, hideTimer: null, appName};
            this.#batches.set(windowId, batch)
        }

        item.windowId = windowId;
        batch.items.push(item);

        clearTimeout(batch.hideTimer);
        batch.hideTimer = null;

        if (batch.panel) {
            this.#refresh(batch)
        } else if (!batch.showTimer) {
            batch.showTimer = setTimeout(() => {
                batch.showTimer = null;
                this.#showPanel(windowId, batch)
            }, this.showDelay)
        }
    }

    #showPanel(windowId, batch) {
        if (!this.panelClass || batch.items.every(i => i.status !== 'queued' && i.status !== 'uploading')) {
            return
        }

        batch.panel = Neo.create(this.panelClass, {appName: batch.appName, windowId, uploader: this});
        batch.panel.initVnode(true)
    }

    #refresh(batch) {
        if (batch.panel && !batch.panel.isDestroyed && !batch.refreshScheduled) {
            // progress events come every few ms: one vdom update per frame is enough
            batch.refreshScheduled = true;

            setTimeout(() => {
                batch.refreshScheduled = false;
                batch.panel && !batch.panel.isDestroyed && batch.panel.refresh()
            }, 100)
        }
    }

    #next() {
        while (this.#running < this.maxConcurrentUpload && this.#queue.length) {
            this.#start(this.#queue.shift())
        }
    }

    async #start(item) {
        const batch = this.#batches.get(item.windowId);

        this.#running++;
        item.status = 'uploading';
        batch && this.#refresh(batch);

        try {
            const blob = await client.upload(item.file, {
                signal    : item.controller.signal,
                onProgress: loaded => {
                    item.loaded = loaded;
                    batch && this.#refresh(batch)
                }
            });

            this.#settle(item, 'done', blob)
        } catch (e) {
            this.#settle(item, Uploader.isAbort(e) ? 'aborted' : 'failed', null, e)
        } finally {
            this.#running--;
            this.#next()
        }
    }

    #settle(item, status, blob, error) {
        item.status = status;
        item.file   = null;
        status === 'done' && (item.loaded = item.size);
        error ? item.reject(error) : item.resolve(blob);

        const batch = this.#batches.get(item.windowId);

        if (!batch) {
            return
        }

        this.#refresh(batch);

        if (batch.items.some(i => i.status === 'queued' || i.status === 'uploading')) {
            return
        }

        // all done: show 100% a moment, then close and start the next batch from 0
        clearTimeout(batch.showTimer);
        batch.showTimer = null;

        const close = () => {
            batch.panel?.destroy(true);
            this.#batches.get(item.windowId) === batch && this.#batches.delete(item.windowId)
        };

        batch.panel ? (batch.hideTimer = setTimeout(close, this.hideDelay)) : close()
    }
}

export default new Uploader();
