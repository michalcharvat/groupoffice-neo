import Model from '../../node_modules/neo.mjs/src/data/Model.mjs';

/**
 * @summary One card of a GO.board.Board: a source record in one column, with the fields the card renders.
 * @class GO.board.CardModel
 * @extends Neo.data.Model
 */
class CardModel extends Model {
    static config = {
        className  : 'GO.board.CardModel',
        keyProperty: 'id',
        fields     : [
            // "<sourceId>::<column key>"
            {name: 'id',       type: 'String'},
            {name: 'sourceId', type: 'String'},
            {name: 'status',   type: 'String'},
            {name: 'order',    type: 'Int'},
            {name: 'title',    type: 'String'},
            {name: 'tags'},
            {name: 'assignee'},
            {name: 'due'},
            {name: 'overdue'},
            {name: 'icons'},
            {name: 'progress'},
            {name: 'color'}
        ]
    }
}

export default Neo.setupClass(CardModel);
