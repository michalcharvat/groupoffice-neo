import Model from '../../node_modules/neo.mjs/src/data/Model.mjs';

/**
 * Core User as the users card lists it (GO.users.UsersPanel)
 */
class User extends Model {
    static config = {
        className  : 'GO.model.User',
        keyProperty: 'id',
        fields     : [
            {name: 'id',             type: 'String'},
            {name: 'username',       type: 'String'},
            {name: 'displayName',    type: 'String'},
            {name: 'avatarId'},
            {name: 'loginCount',     type: 'Int'},
            {name: 'authenticators'},
            {name: 'enabled',        type: 'Boolean'},
            {name: 'createdAt'},
            {name: 'modifiedAt'},
            {name: 'lastLogin'}
        ]
    }
}

export default Neo.setupClass(User);
