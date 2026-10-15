import BaseDialog              from '../../node_modules/neo.mjs/src/dialog/Base.mjs';
import Button                  from '../button/Button.mjs';
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
 * Base dialog for GO dialogs: close always destroys the dialog and removes the
 * modal mask.
 *
 * - neo's closeOrHide() destroys the dialog and only then awaits this.timeout(),
 *   which never resolves on a destroyed instance, so the mask stayed.
 * - Escape only hides a neo dialog (hidden = true) and leaves the mask; a hidden
 *   GO dialog is closed instead.
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
        headerConfig: headerTools('popout', 'maximize', 'close')
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
        const unmasked = modal && Neo.applyDeltas(windowId, {id: me.vdom.id || id, cls: {remove: ['neo-modal']}});

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

        // a dialog is not an item of its window's view: close it with its window
        me.onWindowDisconnect = ({windowId}) => {
            if (windowId === me.windowId) {
                me.popup = null; // gone already
                me.close()
            }
        };

        Neo.currentWorker.on('disconnect', me.onWindowDisconnect)
    }

    destroy(...args) {
        Neo.currentWorker.un('disconnect', this.onWindowDisconnect);
        super.destroy(...args)
    }

    closeOrHide() {
        this.close()
    }

    onKeyDownEscape() {
        this.close()
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

        // a dragged dialog keeps its position in style (dialog/Base.mjs onDragEnd)
        const {height, left, top, transform, width, ...style} = me.style || {};

        me.set({
            appName,
            draggable   : false,
            maximized   : false,
            style,
            windowId,
            wrapperStyle: {height: '100%', left: 0, top: 0, width: '100%'}
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
