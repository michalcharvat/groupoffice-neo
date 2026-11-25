/**
 * Focus that code moves (a dialog opening, an overlay giving focus back) is not the user
 * pointing at a button. neo's shared tooltip shows on every focusin of a target, so the
 * header's "Close" tool of a dialog without fields, or the button an overlay returns focus to,
 * would show its tooltip as if hovered.
 */

/**
 * Moves the focus like Neo.main.DomAccess.focus() and hides the tooltip that the focus is
 * about to show. The focusin reaches the App worker before the focus call answers, so the
 * tooltip's pending show is cancelled (or the shown tooltip hidden) right after it.
 * @param {Neo.component.Base} component a component of the window, for its windowId
 * @param {Object} options DomAccess.focus() options: id, children, …
 * @returns {Promise<void>}
 */
export async function focusWithoutTooltip(component, options) {
    const {windowId} = component;

    await Neo.main.DomAccess.focus({...options, windowId}).catch(() => {});

    // Neo.apps is keyed by window id; the window's shared tooltip exists once a component of it used one
    const app = Neo.apps?.[windowId];

    if (!component.isDestroyed && app && Neo.tooltip?.Base) {
        const tooltip = Neo.tooltip.Base.createSingleton(app, windowId);

        // only the tooltip of the node focused here: the user may have moved on meanwhile
        isWithin(tooltip.activeTargetId, options.id) && tooltip.hide()
    }
}

/**
 * Hides the window's shared tooltip, whatever its target. For a native drag and drop (a top-bar tab
 * dragged into the workspace dock): the pointer leaves the target without a mouseleave, and the
 * mousedown focused the dragged button, so its tooltip ("Close") would stay after the drop.
 * @param {Neo.component.Base} component a component of the window, for its windowId
 */
export function hideTooltip(component) {
    const {windowId} = component,
          app        = Neo.apps?.[windowId];

    if (app && Neo.tooltip?.Base) {
        Neo.tooltip.Base.createSingleton(app, windowId).hide()
    }
}

/**
 * @param {String|null} targetId the tooltip's target, a component id
 * @param {String} id the focused node, or the component whose first focusable node got the focus
 * @returns {Boolean}
 */
function isWithin(targetId, id) {
    for (let cmp = targetId && Neo.getComponent(targetId); cmp; cmp = cmp.parentId && Neo.getComponent(cmp.parentId)) {
        if (cmp.id === id) {
            return true
        }
    }

    return false
}
