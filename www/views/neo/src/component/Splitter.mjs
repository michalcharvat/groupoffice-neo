import NeoSplitter            from '../../node_modules/neo.mjs/src/component/Splitter.mjs';
import {dpSize, getState, setState} from '../State.mjs';

/**
 * GOUI splitter(): resizes its previous sibling live and remembers the size.
 *
 * State is GOUI compatible ({width} or {height} in dp under "state-<stateId>"), so a
 * module using the same stateId as its GOUI version shares the panel sizes.
 */
class Splitter extends NeoSplitter {
    static config = {
        className   : 'GO.component.Splitter',
        baseCls     : ['go-splitter', 'neo-splitter', 'neo-draggable'],
        liveResize  : true,
        resizeTarget: 'previous',
        size        : 5,
        /**
         * @member {String|null} stateId=null
         */
        stateId: null
    }

    /**
     * @member {Boolean} stateRestored=false
     */
    stateRestored = false

    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (value && !this.stateRestored) {
            this.stateRestored = true;
            this.stateId && this.restoreState()
        }
    }

    applyResize(value, axis, targetId) {
        const applied = super.applyResize(value, axis, targetId);

        applied && this.stateId && this.saveState(value, axis);

        return applied
    }

    async restoreState() {
        let me      = this,
            state   = await getState(me.stateId, me.windowId),
            axis    = me.direction === 'vertical' ? 'width' : 'height',
            sibling = me.getResizeSibling();

        if (sibling && !me.isDestroyed && state[axis] > 0) {
            sibling.wrapperStyle = {...(sibling.wrapperStyle || {}), flex: 'none', [axis]: `${state[axis] / 10}rem`}
        }
    }

    async saveState(px, axis) {
        const dp = px / await dpSize(this.windowId);

        await setState(this.stateId, {[axis]: Math.round(dp)}, this.windowId)
    }
}

export default Neo.setupClass(Splitter);
