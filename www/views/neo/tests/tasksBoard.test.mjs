// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {boardColumns, bucketStart, columnsOf, compareTasks, dropPatch, dueBucket} from
    '../../../go/modules/community/tasks/views/neo/boardGroups.mjs';

// Wednesday
const today = new Date(2026, 10, 25);

const ctx = {
    t           : s => s,
    today,
    firstWeekday: 1,
    lists       : [{id: 1, name: 'A', color: 'ff0000', permissionLevel: 50, groups: [
        {id: 10, name: 'Todo', progressChange: null},
        {id: 11, name: 'Doing', progressChange: 'in-progress'}
    ]}, {id: 2, name: 'B', permissionLevel: 10, groups: []}],
    categories  : [{id: 5, name: 'Red'}, {id: 6, name: 'Blue'}],
    users       : [{id: 3, name: 'Ann'}]
};
const one = {...ctx, lists: [ctx.lists[0]]};

describe('tasks board', () => {
    it('puts due dates in buckets of the user\'s week', () => {
        assert.equal(dueBucket('2026-11-24', today), 'overdue');
        assert.equal(dueBucket('2026-11-25', today), 'today');
        assert.equal(dueBucket('2026-11-29', today), 'week');      // Sunday, Monday weeks
        assert.equal(dueBucket('2026-11-30', today), 'later');
        assert.equal(dueBucket('2026-11-29', today, 0), 'later');  // Sunday starts the next week
        assert.equal(dueBucket(null, today), 'none');
    });

    it('sets due to the start of the bucket, never into overdue', () => {
        assert.equal(bucketStart('today', today), '2026-11-25');
        assert.equal(bucketStart('week', today), '2026-11-26');
        assert.equal(bucketStart('later', today), '2026-11-30');
        assert.equal(bucketStart('later', today, 0), '2026-11-29');
        assert.equal(bucketStart('none', today), null);
        assert.equal(dropPatch('due', {}, 'today', 'overdue', ctx), null);
        assert.deepEqual(dropPatch('due', {}, 'overdue', 'week', ctx), {due: '2026-11-26'});
        assert.equal(boardColumns('due', ctx)[0].dropDisabled, true);
        // Sunday, Monday weeks: no day left in "This week"
        const sunday = {...ctx, today: new Date(2026, 10, 29)};
        assert.equal(dropPatch('due', {}, 'today', 'week', sunday), null);
        assert.equal(boardColumns('due', sunday)[2].dropDisabled, true);
        assert.equal(boardColumns('due', ctx)[2].dropDisabled, false);
    });

    it('maps status drops to progress', () => {
        assert.deepEqual(columnsOf('progress', {progress: 'failed'}, ctx), ['failed']);
        assert.deepEqual(dropPatch('progress', {}, 'needs-action', 'completed', ctx), {progress: 'completed'});
        assert.equal(dropPatch('progress', {}, 'completed', 'completed', ctx), null);
    });

    it('offers list columns only for one list and applies progressChange', () => {
        assert.deepEqual(boardColumns('group', ctx), []);
        assert.deepEqual(boardColumns('group', one).map(c => c.key), ['10', '11']);
        assert.deepEqual(columnsOf('group', {groupId: null}, one), ['10']);
        assert.deepEqual(columnsOf('group', {groupId: 11}, one), ['11']);
        assert.deepEqual(dropPatch('group', {}, '10', '11', one), {groupId: 11, progress: 'in-progress'});
        assert.deepEqual(dropPatch('group', {}, '11', '10', one), {groupId: 10});
    });

    it('moves to a list only with write permission and clears its column', () => {
        assert.deepEqual(dropPatch('tasklist', {}, '2', '1', ctx), {tasklistId: 1, groupId: null});
        assert.equal(dropPatch('tasklist', {}, '1', '2', ctx), null);
    });

    it('maps assignee and priority', () => {
        assert.deepEqual(columnsOf('assignee', {responsibleUserId: null}, ctx), ['none']);
        assert.deepEqual(dropPatch('assignee', {}, 'none', '3', ctx), {responsibleUserId: '3'});
        assert.deepEqual(dropPatch('assignee', {}, '3', 'none', ctx), {responsibleUserId: null});
        assert.deepEqual(columnsOf('priority', {priority: 9}, ctx), ['low']);
        assert.deepEqual(columnsOf('priority', {priority: 3}, ctx), ['high']);
        assert.deepEqual(dropPatch('priority', {}, 'low', 'high', ctx), {priority: 1});
        assert.deepEqual(dropPatch('priority', {}, 'high', 'normal', ctx), {priority: 0});
    });

    it('shows a task in each category and replaces the source category on drop', () => {
        assert.deepEqual(columnsOf('category', {categories: [5, 6]}, ctx), ['5', '6']);
        assert.deepEqual(columnsOf('category', {categories: []}, ctx), ['none']);
        assert.deepEqual(dropPatch('category', {categories: [5, 6]}, '5', 'none', ctx), {categories: ['6']});
        assert.deepEqual(dropPatch('category', {categories: [5]}, '5', '6', ctx), {categories: ['6']});
        assert.deepEqual(dropPatch('category', {categories: [5, 6]}, '5', '6', ctx), {categories: ['6']});
        assert.deepEqual(dropPatch('category', {categories: []}, 'none', '5', ctx), {categories: ['5']});
    });

    it('orders by due (none last), then priority', () => {
        const tasks = [{id: 1, due: null, priority: 1}, {id: 2, due: '2026-11-26', priority: 9},
            {id: 3, due: '2026-11-26', priority: 1}, {id: 4, due: '2026-11-20', priority: 0}];

        assert.deepEqual(tasks.sort(compareTasks).map(task => task.id), [4, 3, 2, 1]);
    });
});
