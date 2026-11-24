import Resizable from '../../node_modules/neo.mjs/src/plugin/Resizable.mjs';

/**
 * neo's Resizable for GO.view.Dialog: no resize handles on a maximized dialog.
 *
 * (Up to neo 13.4 it also copied the new size from `wrapperStyle` into `style`, which a move
 * by the header writes; neo 14's dialog resizes `style` itself (styleConfig: 'style').)
 */
class DialogResizable extends Resizable {
    static config = {
        className: 'GO.plugin.DialogResizable'
    }

    /**
     * No resize handles on a maximized dialog: a resize would replace the size it restores to
     * @param {Object} data
     */
    onMouseMove(data) {
        if (this.owner.maximized) {
            this.removeAllNodes();
            return
        }

        super.onMouseMove(data)
    }

    /**
     * Escape cancelled the resize: the dialog must not close on that key (Dialog.onEscape())
     * @param {Object} [data]
     */
    onDragCancel(data) {
        this.isDragging && this.owner.rememberCancelEscape?.(data);
        super.onDragCancel(data)
    }
}

export default Neo.setupClass(DialogResizable);
