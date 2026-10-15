import Model from '../../../../../../../views/neo/node_modules/neo.mjs/src/data/Model.mjs';

class NoteBook extends Model {
    static config = {
        className  : 'GO.notes.model.NoteBook',
        keyProperty: 'id',
        fields     : [
            {name: 'id',              type: 'String'},
            {name: 'name',            type: 'String'},
            {name: 'permissionLevel', type: 'Int'}
        ]
    }
}

export default Neo.setupClass(NoteBook);
