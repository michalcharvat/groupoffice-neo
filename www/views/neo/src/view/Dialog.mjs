import BaseDialog              from '../../node_modules/neo.mjs/src/dialog/Base.mjs';
import DomEventManager         from '../../node_modules/neo.mjs/src/manager/DomEvent.mjs';
import Button                  from '../button/Button.mjs';
import DialogResizable         from '../plugin/DialogResizable.mjs';
import {closePopup, openPopup} from '../Popup.mjs';
import {t}                     from '../Translate.mjs';

const TOOLS = {
    popout  : {icon: 'open_in_new', text: 'Open in new window'},
    maximize: {icon: 'fullscreen',  text: 'Maximize'},
    close   : {icon: 'close',       text: 'Close'}
};

/**
 * Header config with GOUI window tools (flat buttons, Material icons) instead of
 * neo's Font Awesome actions: headerConfig: headerTools('close')
 * @param {...String} names 'popout', 'maximize', 'close'
 * @returns {Object}
 */
export function headerTools(...names) {
    return {
        actionDefaults: {module: Button},
        actions       : names.map(action => {
            const label = t(TOOLS[action].text);
            return {action, icon: TOOLS[action].icon, tooltip: label, vdom: {'aria-label': label}}
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

        // Escape while dragging only cancels the drag
        dialog && !dialog.isDragging && dialog.onKeyDownEscape()
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
 * Base dialog for GO dialogs: close always destroys the dialog and removes the
 * modal mask.
 *
 * - neo's closeOrHide() destroys the dialog and only then awaits this.timeout(),
 *   which never resolves on a destroyed instance, so the mask stayed.
 * - Escape only hides a neo dialog (hidden = true) and leaves the mask; a hidden
 *   GO dialog is closed instead.
 * - Escape also works with the focus on body (after a click on non-focusable content).
 *
 * Subclasses position themselves with wrapperStyle (left/top): without an
 * animateTarget, .neo-floating parks a dialog at -10000px.
 *
 * The "popout" header action moves the dialog, with its form state, into its
 * own browser window (src/Popup.mjs).
 */
class Dialog extends BaseDialog {
    static config = {
        className   : 'GO.view.Dialog',
        // GOUI window tools: flat buttons with Material icons
        headerConfig: headerTools('popout', 'maximize', 'close'),
        // resizing keeps working after the dialog was moved by its header
        resizablePluginConfig: {module: DialogResizable}
    }

    isClosing = false

    /**
     * Popup window of a popped out dialog: {name, openerWindowId}
     * @member {Object|null} popup=null
     */
    popup = null

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

    construct(config) {
        super.construct(config);

        const me = this;

        // double-click on the header toggles maximize, like ExtJS and GOUI windows
        me.addDomListeners({dblclick: me.onHeaderDblClick, delegate: '.neo-header-toolbar', scope: me});

        // a dialog is not an item of its window's view: close it with its window.
        // Removed by event id: neo's un() with a function also matches by fn.name, and an
        // anonymous handler would remove app.mjs's (no popup window would get cleaned up).
        me.disconnectListenerId = Neo.currentWorker.on('disconnect', ({windowId}) => {
            if (windowId === me.windowId) {
                me.popup = null; // gone already
                me.close()
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
     */
    revertFocus() {
        const target = this.focusEnterData?.relatedTarget,
              // a list item's id is "<list id>__<record id>"
              cmp    = target?.id && (Neo.getComponent(target.id) || Neo.getComponent(target.id.split('__')[0]));

        const menu = cmp && (cmp.ntype === 'menu-list' ? cmp : cmp.up?.('menu-list'));

        // only a dismissed (unmounted) menu: an embedded or still open menu keeps its focus
        if (menu && (!menu.mounted || menu.hidden)) {
            return
        }

        super.revertFocus()
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
        data.action === 'popout' ? this.popOut() : super.executeHeaderAction(data)
    }

    /**
     * Moves the dialog into a browser window at its screen position
     */
    async popOut() {
        const me             = this,
              {id, windowId} = me;

        if (me.popup || me.isClosing) {
            return
        }

        me.popup = {name: null, openerWindowId: windowId};

        const name = await openPopup({
            id,
            windowId,
            rect    : await me.getDomRect(),
            onAdopt : popupView => me.adoptWindow(popupView),
            // the window is gone already: cancel the dialog
            onClose : () => {
                me.popup = null;
                me.close()
            },
            // the dialog stays where it is
            onFailed: () => {
                me.popup = null
            }
        });

        if (name) {
            me.popup.name = name
        } else {
            me.popup = null;
            console.warn('GO.view.Dialog: popup window was blocked')
        }
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

        me.modal = false;
        me.unmount();

        // let pending drag / mount deltas for the opener finish (see neo apps/shareddialog)
        await me.timeout(70);

        // the opener's mask was synced while the dialog still had .neo-modal
        Neo.main.DomAccess.syncModalMask({id, modal: false, windowId: openerWindowId});

        // the popup window sizes the dialog: no resizing. neo cannot drop the resizable plugin
        // (its DOM listeners stay): no element carries its delegation class any more. The
        // config covers a plugin whose import (afterSetResizable) is still pending
        const resizer = me.getPlugin('resizable');

        me.resizablePluginConfig = {...me.resizablePluginConfig, delegationCls: 'go-no-resize'};

        if (resizer) {
            resizer.currentNodeName && resizer.removeBodyCursorCls();
            resizer.removeAllNodes();
            resizer.delegationCls = 'go-no-resize'
        }

        // a dragged dialog keeps its position in style (dialog/Base.mjs onDragEnd)
        const {height, left, top, transform, width, ...style} = me.style || {};

        me.set({
            appName,
            draggable   : false,
            maximized   : false,
            style,
            windowId,
            // wrapperStyle merges: drop a dialog's max size too (FormWindow maxHeight: 90vh), it
            // would leave a strip of the popup window empty
            wrapperStyle: {height: '100%', left: 0, maxHeight: 'none', maxWidth: 'none', top: 0, width: '100%'}
        });

        // the window manages size and position now
        me.headerToolbar.items.forEach(item => {
            if (item.action && item.action !== 'close') {
                item.hidden = true
            }
        });

        me.addCls('go-dialog-popup');
        me.mount()
    }
}

export default Neo.setupClass(Dialog);
