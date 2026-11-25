import BaseDialog              from '../../node_modules/neo.mjs/src/dialog/Base.mjs';
import DomEventManager         from '../../node_modules/neo.mjs/src/manager/DomEvent.mjs';
import Button                  from '../button/Button.mjs';
import DialogDragZone          from './DialogDragZone.mjs';
import DialogResizable         from '../plugin/DialogResizable.mjs';
import {cancelPopup, closePopup, openPopup, popupsSupported} from '../Popup.mjs';
import {focusWithoutTooltip}   from '../tooltip.mjs';
import {t}                     from '../Translate.mjs';

const TOOLS = {
    popin   : {icon: 'open_in_browser', text: 'Return to page'},
    popout  : {icon: 'open_in_new', text: 'Open in new window'},
    maximize: {icon: 'fullscreen',  text: 'Maximize'},
    close   : {icon: 'close',       text: 'Close'}
};

/**
 * Header config with GOUI window tools (flat buttons, Material icons) instead of
 * neo's Font Awesome actions: headerConfig: headerTools('close')
 * 'popout' comes with a hidden 'popin' tool ("Return to page"), which a popped out dialog shows.
 * @param {...String} names 'popout', 'maximize', 'close'
 * @returns {Object}
 */
export function headerTools(...names) {
    const tool = (action, hidden = false) => {
        const label = t(TOOLS[action].text);
        return {action, hidden, icon: TOOLS[action].icon, tooltip: label, vdom: {'aria-label': label}}
    };

    return {
        actionDefaults: {module: Button},
        actions       : names.flatMap(action => {
            if (action !== 'popout') {
                return [tool(action)]
            }

            return popupsSupported() ? [tool('popin', true), tool(action)] : []
        })
    }
}

/**
 * Mounted GO dialogs, oldest first: the last one of a window is its topmost
 * @type {GO.view.Dialog[]}
 */
const openDialogs = [];

/**
 * @param {GO.view.Dialog} dialog
 */
function removeOpenDialog(dialog) {
    const index = openDialogs.indexOf(dialog);

    index > -1 && openDialogs.splice(index, 1)
}

/**
 * popOut() attempts: each gets its own popup id and window name, so a cancelled attempt whose
 * window is still opening cannot close or take over the next one
 * @type {Number}
 */
let popOutCount = 0;

/**
 * @param {String} windowId
 * @returns {Boolean} whether the window is still connected to the shared worker
 */
const windowConnected = windowId => Neo.currentWorker.ports.some(port => port.windowId === windowId);

/**
 * Per window: the GO dialog the last mousedown was in (null: outside any GO dialog)
 * @type {Map<String, GO.view.Dialog|null>}
 */
const pointerDialogs = new Map();

/**
 * Escape with the focus on body closes a dialog.
 *
 * neo handles a dialog's keys on keydown inside the dialog. A click on content that
 * cannot take the focus (text, an image, the dialog body) moves the focus to body;
 * that keydown has no component on its path, so no dialog would ever see it.
 *
 * It closes the topmost GO dialog when that one is modal, otherwise the GO dialog the user
 * last clicked in: not a non-modal dialog after a click on the page next to it.
 */
const fire = DomEventManager.fire;

DomEventManager.fire = function(event) {
    fire.call(this, event);

    const {data, eventName, windowId} = event;

    if (eventName === 'mousedown') {
        pointerDialogs.set(windowId, dialogOnPath(data?.path))
    } else if (eventName === 'keydown' && data?.key === 'Escape' && data.target?.tagName === 'body') {
        const isOpen  = dialog => dialog && openDialogs.includes(dialog) && dialog.windowId === windowId && !dialog.hidden && !dialog.isClosing,
              topmost = openDialogs.findLast(isOpen),
              clicked = pointerDialogs.get(windowId),
              // a modal dialog blocks the ones below, also the one clicked before it opened
              dialog  = topmost?.modal ? topmost : (isOpen(clicked) ? clicked : null);

        // Escape while dragging only cancels the drag (onEscape())
        dialog?.onEscape(data)
    }
};

/**
 * @param {Object[]} [path] a DOM event's path
 * @returns {GO.view.Dialog|null} the innermost GO dialog on it
 */
function dialogOnPath(path) {
    for (const {id} of path || []) {
        const cmp = id && Neo.getComponent(id);

        if (cmp instanceof Dialog) {
            return cmp
        }
    }

    return null
}

/**
 * Base dialog for GO dialogs: close (button, Escape, hiding) always destroys the dialog
 * and removes the modal mask at once (up to neo.mjs 13.4 Escape only hid a neo dialog and
 * the mask could stay; GO dialogs ignore neo 14's closeAction).
 *
 * - Escape also works with the focus on body (after a click on non-focusable content).
 * - Escape that cancels a header move or a resize does not close (onEscape()).
 *
 * Subclasses position themselves with wrapperStyle (left/top): without an
 * animateTarget, .neo-floating parks a dialog at -10000px.
 *
 * The "popout" header action moves the dialog, with its form state, into its
 * own browser window (src/Popup.mjs). Dragging such a dialog past the edge of the page does
 * the same (GO.view.DialogDragZone). The "popin" tool of a popped out dialog (returnToPage()) and
 * dragging it back over the page during that drag move it back.
 */
class Dialog extends BaseDialog {
    static config = {
        className   : 'GO.view.Dialog',
        // GOUI window tools: flat buttons with Material icons
        headerConfig: headerTools('popout', 'maximize', 'close'),
        // through onEscape(): Escape that cancels a drag does not close (subclasses override
        // onKeyDownEscape())
        keys        : {Escape: 'onEscape'},
        // resizing keeps working after the dialog was moved by its header
        resizablePluginConfig: {module: DialogResizable},
        // dragged past the edge of the page, a dialog with the popout tool moves into a window
        dragZoneConfig: {module: DialogDragZone, alwaysFireDragMove: true}
    }

    isClosing = false

    /**
     * The popup window that is waiting for a drag out of the page to end before it adopts the
     * dialog (popOut(), endPopOutDrag())
     * @member {GO.view.PopupView|null} pendingAdopt=null
     */
    pendingAdopt = null

    /**
     * timeStamp of the Escape keydown that cancelled a header move or a resize, see onEscape()
     * @member {Number|null} cancelEscapeTimeStamp=null
     */
    cancelEscapeTimeStamp = null

    /**
     * Popup window of a popped out dialog: {id, name, openerWindowId}. A new object for every
     * popOut(): callbacks of a window the dialog left (returnToPage()) find another one or none.
     * @member {Object|null} popup=null
     */
    popup = null

    /**
     * What adoptWindow() changed, to restore in returnToPage()
     * @member {Object|null} pageState=null
     */
    pageState = null

    /**
     * Whether returnToPage() is moving the dialog back into the page
     * @member {Boolean} returning=false
     */
    returning = false

    close(...args) {
        const me                           = this,
              {id, modal, popup, windowId} = me;

        if (me.isClosing || me.isDestroyed) {
            return
        }

        me.isClosing = true;

        // The DOM removal of a closed dialog is asynchronous: a mask sync that still
        // finds it as ".neo-modal" puts the mask below it, and the mask outlives it
        // (page stays grey). Drop the class first; deltas apply in order, so once
        // this one is applied the sync only sees the remaining modals.
        // Hide it in the same delta: the mask goes first, and a dialog still on screen for a
        // frame without it flashes its border and shadow.
        // (Not when animating to an animateTarget: the dialog has to stay visible for that.)
        const animate  = args[0] ?? !!me.animateTargetId,
              unmasked = modal && Neo.applyDeltas(windowId, {id: me.vdom.id || id, cls: {remove: ['neo-modal']}, ...(animate ? {} : {style: {visibility: 'hidden'}})});

        super.close(...args);

        unmasked && unmasked
            .catch(() => {}) // window gone
            .then(() => Neo.main.DomAccess.syncModalMask({id, modal: false, windowId}))
            .catch(() => {});

        popup?.name && closePopup(popup.name, popup.openerWindowId)
    }

    /**
     * The body container gets the class go-dialog-body, whatever containerConfig a subclass
     * sets: Dialog.scss pads a form placed directly in it (GOUI pads a window's form fieldset).
     */
    createItems() {
        const me = this;

        // without headers Panel.createItems() applies containerConfig to the dialog itself, and
        // its cls would replace the dialog's own (neo creates a header for every dialog)
        me.hasHeaders() && (me.containerConfig = {...me.containerConfig, cls: [...me.containerConfig?.cls || [], 'go-dialog-body']});

        super.createItems()
    }

    construct(config) {
        super.construct(config);

        const me = this;

        // double-click on the header toggles maximize, like ExtJS and GOUI windows
        me.addDomListeners({dblclick: me.onHeaderDblClick, delegate: '.neo-header-toolbar', scope: me});

        // a dialog is not an item of its window's view: close it with its window.
        // Removed by event id: neo's un() with a function also matches by fn.name, and an
        // anonymous handler would remove app.mjs's (no popup window would get cleaned up).
        me.disconnectListenerId = Neo.currentWorker.on('disconnect', ({windowId}) => {
            // a window the dialog is leaving (returnToPage()) does not take it along
            if (windowId === me.windowId && !me.returning) {
                me.popup = null; // gone already
                me.close()
            } else if (windowId === me.pageState?.windowId && !me.returning) {
                // the page is gone: the dialog stays in its window, without "Return to page"
                me.pageState = null;
                me.headerToolbar?.items.forEach(item => item.action === 'popin' && (item.hidden = true))
            }
        })
    }

    destroy(...args) {
        Neo.currentWorker.un('disconnect', this.disconnectListenerId);
        removeOpenDialog(this);
        pointerDialogs.forEach((dialog, windowId) => dialog === this && pointerDialogs.delete(windowId));
        super.destroy(...args)
    }

    closeOrHide() {
        this.close()
    }

    /**
     * A dialog opened from a menu (avatar menu → My account) took the focus from a menu
     * item of a floating menu that unmounted on the click. Giving it back mounts the menu
     * again: it flashes at its button. Keep neo's focus return for everything else.
     * neo 14 returns the focus through this method on close (revertFocus()) and on
     * destroy / unmount (revertFocusOnDeparture()).
     * @returns {Neo.component.Base|null}
     */
    getFocusReturnTarget() {
        const target = this.focusEnterData?.relatedTarget,
              // a list item's id is "<list id>__<record id>"
              cmp    = target?.id && (Neo.getComponent(target.id) || Neo.getComponent(target.id.split('__')[0]));

        const menu = cmp && (cmp.ntype === 'menu-list' ? cmp : cmp.up?.('menu-list'));

        // only a dismissed (unmounted) menu: an embedded or still open menu keeps its focus
        if (menu && (!menu.mounted || menu.hidden)) {
            return null
        }

        return super.getFocusReturnTarget()
    }

    /**
     * Without a field neo focuses the first focusable node, the header's "Close" tool of a
     * confirm dialog: it keeps the focus, but not its tooltip over the header
     */
    focusOnArrival() {
        this.getFirstField() ? super.focusOnArrival() : focusWithoutTooltip(this, {id: this.id, children: true})
    }

    /**
     * neo 14 picks the first visible field for the initial focus, but inactive cards of a card
     * layout (FormWindow tabs) are neither hidden nor disabled: look in the active card only
     * @param {Neo.component.Base} [component=this]
     * @returns {Neo.form.field.Base|null}
     */
    getFirstField(component=this) {
        const {layout} = component;

        if (layout?.ntype === 'layout-card') {
            const card = component.items?.[layout.activeIndex];

            return card && !card.hidden && !card.disabled ? super.getFirstField({items: [card]}) : null
        }

        return super.getFirstField(component)
    }

    /**
     * @param {Object} [data]
     */
    onDragCancel(data) {
        // Escape after the dialog left the page: the window it moved into stays
        if (this.dragZone?.poppedOut) {
            this.rememberCancelEscape(data);
            this.endPopOutDrag(data, true);
            return
        }

        this.isDragging && this.rememberCancelEscape(data);
        super.onDragCancel(data)
    }

    /**
     * A dialog whose window is opening (popout tool) cannot be dragged: the window adopts it any moment
     * @param {Object} data
     */
    onDragStart(data) {
        this.popup || super.onDragStart(data)
    }

    /**
     * Every GO dialog gets drag:move (alwaysFireDragMove, for DialogDragZone); a header drag that
     * did not start (maximized, window opening) has no zone or an idle one
     * @param {Object} data
     */
    onDragMove(data) {
        this.isDragging && this.dragZone && super.onDragMove(data)
    }

    /**
     * A drag that moved the dialog into a window ends where the window is: the dialog keeps its
     * place (and stays hidden) in the page until the window adopts it
     * @param {Object} data
     */
    onDragEnd(data) {
        this.dragZone?.poppedOut ? this.endPopOutDrag(data) : super.onDragEnd(data)
    }

    /**
     * @param {Object} data
     * @param {Boolean} [cancelled]
     */
    endPopOutDrag(data, cancelled = false) {
        const me = this;

        me.dragStartAbortController?.abort();
        me.dragStartAbortController = null;
        me.dragStartOpacity         = undefined;
        me.isDragging               = false;

        // the zone ends a cancel it handles itself (dialog/Base.mjs onDragCancel())
        if (!cancelled || !data?.dragZoneId || Neo.get(data.dragZoneId) !== me.dragZone) {
            me.dragZone.dragEnd(data)
        }

        me.dragZone.boundaryContainerId = null;

        if (me.pendingAdopt) {
            const popupView = me.pendingAdopt;

            me.pendingAdopt = null;
            me.adoptWindow(popupView)
        }
    }

    /**
     * neo 14 cancels a header move or a resize on Escape; remember that key (see onEscape())
     * @param {Object} [data] drag:cancel data: the keydown's data when Escape cancelled
     */
    rememberCancelEscape(data) {
        this.cancelEscapeTimeStamp = data?.key === 'Escape' ? data.timeStamp ?? null : null
    }

    /**
     * Escape in or for this dialog. neo 14 cancels a header move or a resize on Escape: that
     * Escape must not close the dialog as well. Its keydown and the drag:cancel reach the worker
     * in either order: while dragging the cancel is still to come; after the cancel the keydown
     * carries the timeStamp of the cancelling key.
     * @param {Object} [data] keydown data
     */
    onEscape(data) {
        const me      = this,
              resizer = me.getPlugin('resizable');

        if (me.isDragging || resizer?.isDragging) {
            return
        }

        if (data?.timeStamp != null && data.timeStamp === me.cancelEscapeTimeStamp) {
            me.cancelEscapeTimeStamp = null;
            return
        }

        me.onKeyDownEscape()
    }

    onKeyDownEscape() {
        this.close()
    }

    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        // mounting again (popout) makes it the topmost dialog
        removeOpenDialog(this);
        value && openDialogs.push(this)
    }

    afterSetHidden(value, oldValue) {
        super.afterSetHidden?.(value, oldValue);

        value && oldValue === false && this.close()
    }

    /**
     * neo swaps Font Awesome classes; the GO tool swaps the Material icon
     * @param {Object} data
     */
    maximize(data) {
        let me = this;

        me.maximized = !me.maximized;

        data.component.set({
            icon   : me.maximized ? 'fullscreen_exit' : 'fullscreen',
            tooltip: me.maximized ? t('Restore') : t('Maximize')
        })
    }

    /**
     * A double-click on the header (not on one of its tools) maximizes or restores a dialog
     * with a visible maximize tool, through that tool so its icon follows. A double-click
     * cannot start a drag: the drag sensor waits for 5px of movement.
     * @param {Object} data
     */
    onHeaderDblClick(data) {
        const me     = this,
              header = me.headerToolbar,
              tool   = header?.items.find(item => item.action === 'maximize' && !item.hidden);

        // a nested header toolbar (e.g. a date selector's) matches the delegate too
        if (!tool || me.isDragging || me.isClosing || data.currentTarget !== header.id) {
            return
        }

        // the path runs from the target up: everything before the header toolbar is inside it
        for (const node of data.path || []) {
            if (node.id === header.id) {
                break
            }

            if (node.cls?.includes('neo-button') || ['button', 'input', 'textarea'].includes(node.tagName)) {
                return
            }
        }

        me.maximize({component: tool})
    }

    executeHeaderAction(data) {
        const {action} = data;

        if (action === 'popout') {
            this.popOut()
        } else if (action === 'popin') {
            this.returnToPage()
        } else {
            super.executeHeaderAction(data)
        }
    }

    /**
     * Whether the dialog can move into its own browser window now: it shows the popout tool
     * (one shared App worker, src/Popup.mjs) and is not in a window of its own already
     * @returns {Boolean}
     */
    canPopOut() {
        const me = this;

        return !me.popup && !me.isClosing && !me.maximized && popupsSupported() &&
            Boolean(me.headerToolbar?.items.some(item => item.action === 'popout' && !item.hidden))
    }

    /**
     * Moves the dialog into a browser window at its screen position
     * @param {Object} [rect] {x, y, width, height} in page CSS px, default: where the dialog is
     * @returns {Promise<String|null>} the window's name, null when nothing was opened
     */
    async popOut(rect) {
        const me             = this,
              {id, windowId} = me;

        if (me.popup || me.isClosing) {
            return null
        }

        const popup = me.popup = {id: `${id}-${++popOutCount}`, name: null, openerWindowId: windowId};

        let name = null;

        try {
            name = await openPopup({
                id      : popup.id,
                windowId,
                rect    : rect || await me.getDomRect(),
                // a drag out of the page adopts once released (endPopOutDrag()): moving the dialog
                // to the popup's windowId would move its drag zone too, and the proxy left in the
                // opener would never be removed
                // (not after cancelPopOut(): the window is closing)
                onAdopt : popupView => {
                    if (me.popup === popup) {
                        me.dragZone?.poppedOut ? me.pendingAdopt = popupView : me.adoptWindow(popupView)
                    }
                },
                // the window is gone already: cancel the dialog (not one that went back to the page)
                onClose : () => {
                    if (me.popup === popup) {
                        me.popup = null;
                        me.close()
                    }
                },
                // the dialog stays where it is (and shows again after a drag out of the page)
                onFailed: () => {
                    if (me.popup !== popup) {
                        return
                    }

                    me.popup = null;
                    me.isDestroyed || (me.style = {...me.style, opacity: null})
                }
            });
        } catch (e) {
            console.error(e)
        }

        // closed or cancelled (cancelPopOut()) while the window was opening: close() could not close
        // a window without a name yet
        if (name && (me.isClosing || me.isDestroyed || me.popup !== popup)) {
            closePopup(name, windowId);
            return null
        }

        if (name) {
            popup.name = name
        } else if (me.popup === popup) {
            me.popup = null;
            console.warn('GO.view.Dialog: popup window was blocked')
        }

        return name
    }

    /**
     * Stops a pop out whose window has not adopted the dialog yet (a drag that came back over the
     * page, DialogDragZone): the window closes, the dialog stays in the page
     * @returns {Boolean} false when there is nothing to stop (no window, or adopted already)
     */
    cancelPopOut() {
        const me      = this,
              {popup} = me;

        if (!popup || me.pageState) {
            return false
        }

        me.popup        = null;
        me.pendingAdopt = null;
        cancelPopup(popup.id);

        // without a name the window is still opening: popOut() closes it
        popup.name && closePopup(popup.name, popup.openerWindowId);

        return true
    }

    /**
     * @param {GO.view.PopupView} popupView
     */
    async adoptWindow({appName, windowId}) {
        const me                             = this,
              {id, windowId: openerWindowId} = me;

        if (me.isClosing || me.isDestroyed) {
            return
        }

        // a dragged dialog keeps its position in style (dialog/Base.mjs onDragEnd)
        // (a drag out of the page left it transparent in the opener: DialogDragZone)
        const {height, left, opacity, top, transform, width, ...style} = me.style || {},
              resizer   = me.getPlugin('resizable'),
              popupTools = me.headerToolbar.items.filter(item => item.action && !['close', 'popin'].includes(item.action) && !item.hidden);

        me.pageState = {
            appName              : me.appName,
            // a plugin whose import is still pending has none yet: neo's dialog default
            delegationCls        : resizer?.delegationCls || me.resizablePluginConfig?.delegationCls || 'neo-dialog',
            draggable            : me.draggable,
            hiddenTools          : popupTools,
            modal                : me.modal,
            resizablePluginConfig: me.resizablePluginConfig,
            windowId             : openerWindowId,
            wrapperStyle         : {...me.wrapperStyle}
        };

        me.modal = false;
        me.unmount();

        // let pending drag / mount deltas for the opener finish (see neo apps/shareddialog)
        await me.timeout(70);

        // the opener's mask was synced while the dialog still had .neo-modal
        Neo.main.DomAccess.syncModalMask({id, modal: false, windowId: openerWindowId});

        // the popup window sizes the dialog: no resizing. neo cannot drop the resizable plugin
        // (its DOM listeners stay): no element carries its delegation class any more. The
        // config covers a plugin whose import (afterSetResizable) is still pending
        me.resizablePluginConfig = {...me.resizablePluginConfig, delegationCls: 'go-no-resize'};

        if (resizer) {
            resizer.currentNodeName && resizer.removeBodyCursorCls();
            resizer.removeAllNodes();
            resizer.delegationCls = 'go-no-resize'
        }

        me.set({
            appName,
            draggable   : false,
            maximized   : false,
            // null removes the opacity a drag out of the page set
            style       : {...style, opacity: null},
            windowId,
            // wrapperStyle merges: drop a dialog's max size too (FormWindow maxHeight: 90vh), it
            // would leave a strip of the popup window empty
            // '0px': neo 14's initVnode() replaces a falsy left / top with 'initial'
            wrapperStyle: {height: '100%', left: '0px', maxHeight: 'none', maxWidth: 'none', top: '0px', width: '100%'}
        });

        // the window manages size and position now; "Return to page" instead
        popupTools.forEach(item => item.hidden = true);
        me.headerToolbar.items.forEach(item => item.action === 'popin' && (item.hidden = false));

        me.addCls('go-dialog-popup');
        me.mount()
    }

    /**
     * Moves a popped out dialog back into the page it came from, where its window is (kept inside
     * the page), and closes the window. Reverse of adoptWindow().
     * @returns {Promise<void>}
     */
    async returnToPage() {
        const me                  = this,
              {pageState, popup}  = me,
              {windowId}          = me;

        if (!pageState || !popup || me.returning || me.isClosing || me.isDestroyed || !windowConnected(pageState.windowId)) {
            return
        }

        me.returning = true;

        let rect = null;

        try {
            rect = await me.getReturnRect(windowId, pageState.windowId)
        } catch (e) {
            // the page (or the popup) is going away: the dialog stays where it is
        }

        if (!rect || me.isClosing || me.isDestroyed || !windowConnected(pageState.windowId)) {
            me.returning = false;
            return
        }

        me.unmount();

        // let pending deltas for the popup finish (adoptWindow())
        await me.timeout(70);

        if (me.isDestroyed) {
            return
        }

        // the page went away meanwhile: back into the popup, edits intact
        if (!windowConnected(pageState.windowId)) {
            me.returning = false;
            me.pageState = null;
            me.headerToolbar.items.forEach(item => item.action === 'popin' && (item.hidden = true));
            windowConnected(windowId) ? me.mount() : me.close();
            return
        }

        const resizer = me.getPlugin('resizable'),
              // wrapperStyle merges: every key the popup set goes back to its page value or away
              wrapperStyle = {...pageState.wrapperStyle};

        Object.keys(me.wrapperStyle || {}).forEach(key => key in wrapperStyle || (wrapperStyle[key] = null));

        me.resizablePluginConfig = pageState.resizablePluginConfig;
        resizer && (resizer.delegationCls = pageState.delegationCls);

        // before modal: a cls change rebuilds the classes and drops the neo-modal that afterSetModal() adds
        me.removeCls('go-dialog-popup');

        me.set({
            appName  : pageState.appName,
            draggable: pageState.draggable,
            modal    : pageState.modal,
            // style merges too: null removes a key
            style    : {
                height   : `${rect.height}px`,
                left     : `${rect.left}px`,
                opacity  : null,
                top      : `${rect.top}px`,
                transform: 'none',
                width    : `${rect.width}px`
            },
            windowId : pageState.windowId,
            wrapperStyle
        });

        me.headerToolbar.items.forEach(item => {
            if (item.action === 'popin') {
                item.hidden = true
            } else if (item.action === 'maximize') {
                // adoptWindow() restored a maximized dialog
                item.set({icon: 'fullscreen', tooltip: t('Maximize')})
            }
        });
        pageState.hiddenTools.forEach(item => item.isDestroyed || (item.hidden = false));

        me.pageState = null;
        me.popup     = null;

        me.mount();

        // the page was in the background: the popup asks its opener to take the focus (no windowName)
        Neo.Main.windowFocus({windowId}).catch(() => {}).then(() => {
            // the window goes, the dialog stays: popOut()'s onClose skips a popup that is not me.popup
            closePopup(popup.name, popup.openerWindowId);
            // the first field, as on opening (not a header tool: its tooltip would show)
            me.isDestroyed || me.focusOnArrival()
        });

        me.returning = false
    }

    /**
     * Where a popped out dialog lands in the page: at its window's place on the screen and in its
     * window's size, kept inside the page. Inverse of src/Popup.mjs openPopup(): the dialog's
     * size became the window's outer size (neo windowOpen() useTotalHeight), and the window's
     * top edge sat at the dialog's top in the page.
     * @param {String} popupWindowId
     * @param {String} pageWindowId
     * @returns {Promise<Object>} {left, top, width, height} in page CSS px
     */
    async getReturnRect(popupWindowId, pageWindowId) {
        const [popupWin, pageWin] = await Promise.all([
                  Neo.Main.getWindowData({windowId: popupWindowId}),
                  Neo.Main.getWindowData({windowId: pageWindowId})
              ]),
              // browser chrome above the page (as in src/Popup.mjs openPopup())
              pageChrome = pageWin.outerHeight - pageWin.innerHeight,
              width      = Math.min(popupWin.outerWidth, pageWin.innerWidth),
              height     = Math.min(popupWin.outerHeight, pageWin.innerHeight),
              left       = popupWin.screenLeft - pageWin.screenLeft,
              top        = popupWin.screenTop - pageWin.screenTop - pageChrome;

        return {
            height,
            left: Math.max(0, Math.min(left, pageWin.innerWidth - width)),
            top : Math.max(0, Math.min(top, pageWin.innerHeight - height)),
            width
        }
    }
}

export default Neo.setupClass(Dialog);
