import TreeModel from '../../node_modules/neo.mjs/src/data/TreeModel.mjs';

/**
 * @summary A resource row of GO.scheduler.Scheduler: a tree node (parentId, collapsed) with a name.
 * @description Extend it for more fields a resource column or the caller reads: neo drops undeclared fields.
 * @class GO.scheduler.ResourceModel
 * @extends Neo.data.TreeModel
 */
class ResourceModel extends TreeModel {
    static config = {
        className: 'GO.scheduler.ResourceModel',
        fields   : [
            {name: 'id', type: 'String'},
            {name: 'name', type: 'String', defaultValue: ''},
            // false: a grouping row (company, vessel) that takes no bookings
            {name: 'bookable', type: 'Boolean', defaultValue: true},
            {name: 'cls', defaultValue: null, nullable: true}
        ]
    }
}

export default Neo.setupClass(ResourceModel);
