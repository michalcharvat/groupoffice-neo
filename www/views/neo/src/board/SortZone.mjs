import NeoSortZone from '../../node_modules/neo.mjs/src/board/SortZone.mjs';

/**
 * @summary Drag zone of GO.board.Board: a card whose record the board may not move (canDrag()) is not armed, so it
 * can't be picked up.
 * @class GO.board.SortZone
 * @extends Neo.board.SortZone
 */
class SortZone extends NeoSortZone {
    static config = {
        className: 'GO.board.SortZone'
    }

    /**
     * @summary Arms a card only when its record may be moved.
     * @param {Neo.board.Card} card
     * @param {Boolean} [draggable=true]
     */
    armCard(card, draggable=true) {
        const board = this.owner;

        super.armCard(card, draggable && !!board.canDrag?.(board.getDataRecord?.(card.record)))
    }
}

export default Neo.setupClass(SortZone);
