/** script URL → Promise of its load */
const loads = new Map();

/**
 * @summary Loads a classic script (one that sets a global) into the page once; a failed load is forgotten so
 * the next call tries again. Main thread only.
 * @param {String} src absolute URL
 * @returns {Promise<void>}
 */
export function loadScript(src) {
    if (!loads.has(src)) {
        loads.set(src, new Promise((resolve, reject) => {
            const script = document.createElement('script');

            script.src     = src;
            script.onload  = () => resolve();
            script.onerror = () => {
                loads.delete(src);
                script.remove();
                reject(new Error('Failed to load ' + src))
            };
            document.head.appendChild(script)
        }))
    }

    return loads.get(src)
}

/**
 * @summary Fetches a same-origin URL (blob download, blob: URL) as an ArrayBuffer with the session cookie.
 * @param {String} url
 * @returns {Promise<ArrayBuffer>}
 */
export async function fetchArrayBuffer(url) {
    const response = await fetch(url, {credentials: 'same-origin'});

    if (!response.ok) {
        throw new Error(response.status + ' ' + response.statusText)
    }

    return response.arrayBuffer()
}
