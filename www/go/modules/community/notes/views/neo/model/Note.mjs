import Model from '../../../../../../../views/neo/node_modules/neo.mjs/src/data/Model.mjs';

class Note extends Model {
    static config = {
        className  : 'GO.notes.model.Note',
        keyProperty: 'id',
        fields     : [
            {name: 'id',              type: 'String'},
            {name: 'name',            type: 'String'},
            {name: 'content',         type: 'String'},
            {name: 'noteBookId',      type: 'String'},
            {name: 'createdAt',       type: 'String'},
            {name: 'modifiedAt',      type: 'String'},
            {name: 'createdBy',       type: 'String'},
            {name: 'modifiedBy',      type: 'String'},
            {name: 'password',        type: 'String'},
            {name: 'permissionLevel', type: 'Int'},
            {name: 'filesFolderId',   type: 'String'}
        ]
    }
}

export default Neo.setupClass(Note);
