import Model from '../../../../../../../views/neo/node_modules/neo.mjs/src/data/Model.mjs';

/**
 * Task (GOUI TaskGrid record). Arrays and objects (categories, alerts,
 * recurrenceRule) keep their JMAP shape.
 */
class Task extends Model {
    static config = {
        className  : 'GO.tasks.model.Task',
        keyProperty: 'id',
        fields     : [
            {name: 'id',                type: 'String'},
            {name: 'title',             type: 'String'},
            {name: 'tasklistId',        type: 'String'},
            {name: 'responsibleUserId', type: 'String'},
            {name: 'start',             type: 'String'},
            {name: 'due',               type: 'String'},
            {name: 'progress',          type: 'String'},
            {name: 'percentComplete',   type: 'Int'},
            {name: 'priority',          type: 'Int'},
            {name: 'estimatedDuration', type: 'Int'},
            {name: 'timeBooked',        type: 'Int'},
            {name: 'color',             type: 'String'},
            {name: 'description',       type: 'String'},
            {name: 'location',          type: 'String'},
            {name: 'categories'},
            {name: 'alerts'},
            {name: 'recurrenceRule'},
            {name: 'projectId'},
            {name: 'createdAt',         type: 'String'},
            {name: 'modifiedAt',        type: 'String'},
            {name: 'createdBy',         type: 'String'},
            {name: 'modifiedBy',        type: 'String'},
            {name: 'permissionLevel',   type: 'Int'},
            {name: 'filesFolderId',     type: 'String'}
        ]
    }
}

export default Neo.setupClass(Task);
