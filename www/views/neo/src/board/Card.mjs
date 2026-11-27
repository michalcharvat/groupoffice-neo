import NeoCard from '../../node_modules/neo.mjs/src/board/Card.mjs';

/**
 * @summary A card of GO.board.Board: the title edit of neo's card opens the record instead (the card is a view of
 * another entity, its title is not saved here).
 * @class GO.board.Card
 * @extends Neo.board.Card
 */
class Card extends NeoCard {
    static config = {
        className: 'GO.board.Card'
    }

    /**
     * @summary Double click on the title and F2 open the record (board event cardOpen).
     * @returns {null}
     */
    startTitleEdit() {
        this.board?.activateCard(this);
        return null
    }
}

export default Neo.setupClass(Card);
