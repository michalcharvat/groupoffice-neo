import Model from '../../node_modules/neo.mjs/src/data/Model.mjs';

/**
 * Saved filter (core EntityFilter)
 */
class EntityFilter extends Model {
    static config = {
        className  : 'GO.model.EntityFilter',
        keyProperty: 'id',
        fields     : [
            {name: 'id',              type: 'String'},
            {name: 'name',            type: 'String'},
            {name: 'filter'},
            {name: 'permissionLevel', type: 'Int'}
        ]
    }
}

export default Neo.setupClass(EntityFilter);
