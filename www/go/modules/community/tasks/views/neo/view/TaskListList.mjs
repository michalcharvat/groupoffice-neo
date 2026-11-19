import CheckList from '../../../../../../../views/neo/src/list/CheckList.mjs';
import {escapeHtml} from '../../../../../../../views/neo/src/Format.mjs';
import {groupings} from '../util.mjs';

const HEX = /^[0-9a-f]{6}$/i;

/**
 * Task lists in the west panel: GO.list.CheckList with the tick in the list's colour
 * (GOUI checkboxselectcolumn with checkbox.color), grouped by TaskListGrouping like the ExtJS
 * TasklistsGrid (sort the store by "group" first). Lists without a grouping get no header.
 */
class TaskListList extends CheckList {
    static config = {
        className    : 'GO.tasks.TaskListList',
        groupField   : 'groupingId',
        groupRenderer: ({value}) => {
            const grouping = groupings.get(value);
            return grouping ? escapeHtml(grouping.name ?? '') : null
        }
    }

    createItemContent(record) {
        const content = super.createItemContent(record);

        if (HEX.test(record.color || '')) {
            content[0] = {...content[0], style: {color: '#' + record.color}}
        }

        return content
    }

    /**
     * The names of the groupings, then the headers
     */
    onStoreLoad() {
        let me = this;

        super.onStoreLoad();

        groupings.fetch(me.store.items.map(list => list.groupingId))
            .then(loaded => {
                if (loaded && !me.isDestroyed) {
                    me.mounted ? me.createItems() : me.on('mounted', () => me.createItems(), me, {once: true})
                }
            })
            .catch(e => console.error('Task list groupings', e))
    }
}

export default Neo.setupClass(TaskListList);
