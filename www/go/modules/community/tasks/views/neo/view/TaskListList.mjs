import CheckList from '../../../../../../../views/neo/src/list/CheckList.mjs';

const HEX = /^[0-9a-f]{6}$/i;

/**
 * Task lists in the west panel: GO.list.CheckList with the tick in the list's colour
 * (GOUI checkboxselectcolumn with checkbox.color)
 */
class TaskListList extends CheckList {
    static config = {
        className: 'GO.tasks.TaskListList'
    }

    createItemContent(record) {
        const content = super.createItemContent(record);

        if (HEX.test(record.color || '')) {
            content[0] = {...content[0], style: {color: '#' + record.color}}
        }

        return content
    }
}

export default Neo.setupClass(TaskListList);
