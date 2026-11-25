import DragZone from '../../node_modules/neo.mjs/src/draggable/DragZone.mjs';

/**
 * Header drag of a GO dialog that can leave the browser window: when less than half of the dialog
 * is still inside the page and the drag keeps moving it out, the dialog moves into its own browser
 * window (GO.view.Dialog.popOut()) at the point where it left, and that window follows the pointer
 * until the button is released (neo's main DragDrop addon, startWindowDrag()). One way only: the
 * window does not return into the page when dragged back.
 *
 * Only for a dialog with the "Open in new window" tool (one shared App worker, src/Popup.mjs);
 * any other dialog stops at the edge of the page as before.
 *
 * Modelled on neo.mjs src/desktop/WindowDragZone.mjs (the webdesktop's tear-out).
 *
 * @class GO.view.DialogDragZone
 * @extends Neo.draggable.DragZone
 */
class DialogDragZone extends DragZone {
    static config = {
        className: 'GO.view.DialogDragZone'
    }

    /**
     * The fraction of the dialog that a rectangle contains
     * @param {Object} boundary client rect of the page
     * @param {Number} x dialog left (client coordinates)
     * @param {Number} y dialog top (client coordinates)
     * @param {Object} size {width, height} of the dialog
     * @returns {Number} 0..1
     */
    static coverage(boundary, x, y, {width, height}) {
        const overlapWidth  = Math.max(0, Math.min(x + width, boundary.right) - Math.max(x, boundary.left)),
              overlapHeight = Math.max(0, Math.min(y + height, boundary.bottom) - Math.max(y, boundary.top)),
              area          = width * height;

        return area > 0 ? overlapWidth * overlapHeight / area : 0
    }

    /**
     * The running header drag: {id, offsetX, offsetY, rect, x, y, canPopOut, opening, popupName}
     * @member {Object|null} gesture=null
     */
    gesture = null

    /**
     * Whether the running drag moved the dialog into a browser window (or is opening one)
     * @returns {Boolean}
     */
    get poppedOut() {
        return Boolean(this.gesture?.opening || this.gesture?.popupName)
    }

    /**
     * @param {Object} data drag:start
     * @param {AbortSignal} [signal]
     */
    async dragStart(data, signal) {
        const me    = this,
              owner = me.owner,
              rect  = me.getDragElementRect(data);

        me.gesture = {
            canPopOut: owner.canPopOut(),
            id       : data.gestureId,
            offsetX  : data.clientX - rect.left,
            offsetY  : data.clientY - rect.top,
            rect,
            x        : rect.left,
            y        : rect.top
        };

        await super.dragStart(data, signal)
    }

    /**
     * Lets the proxy of a dialog that can pop out move past the page edge, and gives the main thread
     * the grab point for the window drag
     * @returns {Object}
     */
    getMainThreadConfigs(...args) {
        const {gesture} = this,
              configs   = super.getMainThreadConfigs(...args);

        if (!gesture?.canPopOut) {
            return configs
        }

        return {...configs, allowOverdrag: true, dragProxyRect: gesture.rect, gestureId: gesture.id, offsetX: gesture.offsetX, offsetY: gesture.offsetY}
    }

    /**
     * @param {Object} data drag:move (alwaysFireDragMove)
     */
    dragMove(data) {
        const me                                         = this,
              {boundaryContainerRect: boundary, gesture} = me;

        super.dragMove(data);

        if (!gesture?.canPopOut || !boundary || me.poppedOut) {
            return
        }

        const x      = data.clientX - gesture.offsetX,
              y      = data.clientY - gesture.offsetY,
              before = DialogDragZone.coverage(boundary, gesture.x, gesture.y, gesture.rect),
              after  = DialogDragZone.coverage(boundary, x, y, gesture.rect);

        gesture.x = x;
        gesture.y = y;

        // moving out (not a jitter back in) with less than half of the dialog left in the page
        if (after < 0.5 && after < before) {
            me.popOutDuringDrag(gesture)
        }
    }

    /**
     * Opens the dialog's window where the dialog is now and lets it follow the pointer
     * @param {Object} gesture
     */
    async popOutDuringDrag(gesture) {
        const me              = this,
              {owner}         = me,
              {height, width} = gesture.rect,
              opening         = gesture.opening = {};

        // the window shows the dialog: nothing stays behind in the page
        me.setProxyOpacity(0);
        owner.style = {...owner.style, opacity: 0};

        let name = null;

        try {
            name = await owner.popOut({x: gesture.x, y: gesture.y, width, height})
        } catch (e) {
            console.error(e)
        }

        if (gesture.opening !== opening) {
            return
        }

        gesture.opening = null;

        if (!name) {
            // blocked (e.g. the drag outlasted the browser's user activation): stop at the edge
            owner.style = {...owner.style, opacity: me.gesture === gesture ? 0.7 : 1};
            me.keepInPage(gesture);
            return
        }

        gesture.popupName = name;

        if (me.gesture !== gesture) {
            // released while the window was opening: it stays where it opened
            return
        }

        try {
            await Neo.main.addon.DragDrop.startWindowDrag({gestureId: gesture.id, popupHeight: height, popupName: name, popupWidth: width, windowId: me.windowId})
        } catch (e) {
            // the window stays where it opened
        }
    }

    /**
     * After a refused popup: the proxy stops at the page edge again, as for any dialog
     * @param {Object} gesture
     */
    keepInPage(gesture) {
        const me       = this,
              boundary = me.boundaryContainerRect;

        gesture.canPopOut = false;

        if (me.gesture !== gesture) {
            return
        }

        Neo.main.addon.DragDrop.setConfigs({allowOverdrag: false, gestureId: gesture.id, windowId: me.windowId});

        if (me.dragProxy && boundary) {
            const {height, width} = gesture.rect;

            me.dragProxy.style = {
                ...me.dragProxy.style,
                left   : `${Math.max(boundary.left, Math.min(gesture.x, boundary.right - width))}px`,
                opacity: 1,
                top    : `${Math.max(boundary.top, Math.min(gesture.y, boundary.bottom - height))}px`
            }
        }
    }

    /**
     * @param {Number} opacity
     */
    setProxyOpacity(opacity) {
        const {dragProxy} = this;

        if (dragProxy) {
            dragProxy.style = {...dragProxy.style, opacity}
        }
    }

    /**
     * @param {Object} data
     */
    dragEnd(data) {
        this.gesture = null;
        super.dragEnd(data)
    }
}

export default Neo.setupClass(DialogDragZone);
