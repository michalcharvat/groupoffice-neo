/**
 * Move a component into its own browser window.
 *
 * All GO windows share one App worker (Neo.config.useSharedWorkers), so a
 * component instance, with its state and listeners, can be unmounted in one
 * window and mounted in another. openPopup() opens the GO page with
 * ?neoPopup=<id>; that window starts GO.view.PopupView, which calls adopt(id).
 */

/** popup id → {onAdopt, onClose, timer} */
const pending = new Map();

/** ms a popup has to boot and adopt its component */
const ADOPT_TIMEOUT = 30000;

/**
 * @param {Object}   options
 * @param {String}   options.id             unique id (the component id)
 * @param {String}   options.windowId       opener window
 * @param {Object}   options.rect           screen area in the opener: {x, y, width, height} (page CSS px)
 * @param {Function} options.onAdopt        (popupView) => void, move the component into popupView's window
 * @param {Function} options.onClose        (popupView) => void, the popup window is closing
 * @param {Function} options.onFailed       () => void, the popup did not adopt in time (closed early,
 *                                          failed to boot, or joined a newer build's worker)
 * @returns {Promise<String|null>} window name (for closePopup()), null when the browser blocked the popup
 */
export async function openPopup({id, windowId, rect, onAdopt, onClose, onFailed}) {
    const win       = await Neo.Main.getWindowData({windowId}),
          // browser chrome above the page
          chromeTop = win.outerHeight - win.innerHeight,
          url       = new URL(Neo.config.goBaseUrl || '/', globalThis.location.href),
          name      = 'go-popup-' + id;

    url.searchParams.set('neoPopup', id);
    // join this worker even if the UI sources changed since it started (Neo.php)
    Neo.config.goBuild && url.searchParams.set('neoBuild', Neo.config.goBuild);

    const entry = {onAdopt, onClose};
    pending.set(id, entry);

    const opened = await Neo.Main.windowOpen({
        url           : url.href,
        windowFeatures: [
            'left='   + Math.round(win.screenLeft + rect.x),
            'top='    + Math.round(win.screenTop + chromeTop + rect.y),
            'width='  + Math.round(rect.width),
            'height=' + Math.round(rect.height)
        ].join(','),
        windowId,
        windowName    : name
    });

    if (!opened) {
        pending.delete(id);
        return null
    }

    entry.timer = setTimeout(() => {
        if (pending.get(id) === entry) {
            pending.delete(id);
            closePopup(name, windowId);
            onFailed?.()
        }
    }, ADOPT_TIMEOUT);

    return name
}

/**
 * Called by GO.view.PopupView once mounted
 * @param {String} id
 * @param {GO.view.PopupView} popupView
 * @returns {Object|null} {onClose} to call when the window closes, null for an unknown id (e.g. a reloaded popup)
 */
export function adopt(id, popupView) {
    const entry = pending.get(id);

    pending.delete(id);
    clearTimeout(entry?.timer);
    entry?.onAdopt(popupView);

    return entry || null
}

/**
 * Closes a popup opened by openPopup(); the opener owns the window handle
 * @param {String} name
 * @param {String} openerWindowId
 */
export function closePopup(name, openerWindowId) {
    Neo.Main.windowClose({names: name, windowId: openerWindowId})
}
