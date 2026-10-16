import Model from '../../node_modules/neo.mjs/src/data/Model.mjs';

/**
 * Core Group as the groups card lists it (GO.groups.GroupsPanel)
 */
class Group extends Model {
    static config = {
        className  : 'GO.model.Group',
        keyProperty: 'id',
        fields     : [
            {name: 'id',              type: 'String'},
            {name: 'name',            type: 'String'},
            {name: 'users'},
            {name: 'isUserGroupFor'},
            {name: 'permissionLevel', type: 'Int'}
        ]
    }
}

export default Neo.setupClass(Group);
