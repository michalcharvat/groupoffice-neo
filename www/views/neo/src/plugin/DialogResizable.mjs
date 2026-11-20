import Resizable from '../../node_modules/neo.mjs/src/plugin/Resizable.mjs';

const GEOMETRY = ['height', 'left', 'top', 'width'];

/**
 * neo's Resizable for GO.view.Dialog: a resize also works after the dialog was moved.
 *
 * A dialog has no wrapper node, so its element gets {...wrapperStyle, ...style}. Moving a
 * dialog by its header (dialog/Base onDragEnd) writes left, top, width and height into
 * `style`; neo's Resizable writes the new size into `wrapperStyle` only, which `style`
 * then outranks: the dialog snapped back to its old size.
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
     * @param {Object} data
     */
    onDragEnd(data) {
        let me      = this,
            // read before super: dragEnd() destroys the proxy
            proxy   = me.dragZone?.dragProxy?.wrapperStyle || {},
            {owner} = me;

        super.onDragEnd(data);

        let style = owner.style;

        if (GEOMETRY.some(key => style[key] != null)) {
            GEOMETRY.forEach(key => {
                proxy[key] != null && (style[key] = proxy[key])
            });

            owner.style = style
        }
    }
}

export default Neo.setupClass(DialogResizable);
