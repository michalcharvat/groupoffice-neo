import Model from '../../../../../../../views/neo/node_modules/neo.mjs/src/data/Model.mjs';

/**
 * TaskList (lists in the west panel) and TaskCategory (categories) share the shape
 * the check lists need
 */
class TaskList extends Model {
    static config = {
        className  : 'GO.tasks.model.TaskList',
        keyProperty: 'id',
        fields     : [
            {name: 'id',              type: 'String'},
            {name: 'name',            type: 'String'},
            {name: 'color',           type: 'String'},
            {name: 'aclId',           type: 'Int'},
            {name: 'ownerId',         type: 'String'},
            {name: 'tasklistId',      type: 'String'},
            {name: 'permissionLevel', type: 'Int'}
        ]
    }
}

export default Neo.setupClass(TaskList);
