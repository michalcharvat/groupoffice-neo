import {LEVEL_WRITE} from '../../../../../../views/neo/src/Acl.mjs';
import {addDays, parseYmd, toYmd} from '../../../../../../views/neo/src/DateUtil.mjs';

/**
 * Groupings of the tasks board (TasksMain, GO.board.Board): the columns, the columns of a task and the JMAP patch
 * of a drop. No neo imports, so mocha tests it directly (www/views/neo/tests/tasksBoard.test.mjs).
 *
 * Every function takes a context: {t, today, firstWeekday, lists, categories, users}
 * - t: translate function; today: the user's current date (DateUtil.userNow()); firstWeekday: 0 Sunday, 1 Monday
 * - lists: the lists shown [{id, name, color, permissionLevel, groups: [{id, name, color, progressChange}]}]
 * - categories: [{id, name, color}]; users: [{id, name}] assignees with a column
 */

export const GROUP_BY = ['progress', 'group', 'tasklist', 'assignee', 'priority', 'category', 'due'];

/**
 * @param {Function} t translate function
 * @returns {Object[]} [{id, name}] of the groupings, in GROUP_BY order
 */
export const groupByOptions = t => [t('Status'), t('List columns'), t('List'), t('Assignee'), t('Priority'), t('Category'), t('Due')]
    .map((name, i) => ({id: GROUP_BY[i], name}));

export const CLOSED = ['completed', 'failed', 'cancelled'];

const NONE = 'none';

const PROGRESS = [
    ['needs-action', 'Needs action'],
    ['in-progress', 'In progress'],
    ['completed', 'Completed'],
    ['failed', 'Failed'],
    ['cancelled', 'Cancelled']
];

const color = value => /^[0-9a-f]{6}$/i.test(value || '') ? '#' + value : null;

/**
 * GO priority: 1-4 high, 6-9 low, anything else normal (ExtJS TaskGrid, TasksMain.iconsHtml())
 * @param {Number|null} priority
 * @returns {String} 'high', 'normal' or 'low'
 */
export function priorityKey(priority) {
    return priority > 0 && priority < 5 ? 'high' : (priority > 5 ? 'low' : 'normal')
}

const PRIORITY_VALUE = {low: 9, normal: 0, high: 1};

/**
 * @param {Date} today
 * @param {Number} firstWeekday
 * @returns {Date} the first day of the next week
 */
function nextWeekStart(today, firstWeekday = 1) {
    const day = parseYmd(today);
    return addDays(day, 7 - ((day.getDay() - firstWeekday + 7) % 7))
}

/**
 * Due bucket of a task date
 * @param {String|null} due "Y-m-d"
 * @param {Date} today
 * @param {Number} [firstWeekday=1]
 * @returns {String} 'overdue', 'today', 'week' (until the end of this week), 'later' or 'none'
 */
export function dueBucket(due, today, firstWeekday = 1) {
    const date = parseYmd(due),
          day  = parseYmd(today);

    if (!date) {
        return NONE
    }

    if (date < day) {
        return 'overdue'
    }

    if (date.getTime() === day.getTime()) {
        return 'today'
    }

    return date < nextWeekStart(day, firstWeekday) ? 'week' : 'later'
}

/**
 * The due date a drop into a bucket sets: the start of the bucket
 * @param {String} bucket
 * @param {Date} today
 * @param {Number} [firstWeekday=1]
 * @returns {String|null|undefined} "Y-m-d", null for "No date", undefined: no drop (overdue)
 */
export function bucketStart(bucket, today, firstWeekday = 1) {
    const day = parseYmd(today);

    switch (bucket) {
        case 'today': return toYmd(day);
        // the last day of the week: no day left in "This week"
        case 'week' : return addDays(day, 1) < nextWeekStart(day, firstWeekday) ? toYmd(addDays(day, 1)) : undefined;
        case 'later': return toYmd(nextWeekStart(day, firstWeekday));
        case NONE   : return null;
        default     : return undefined
    }
}

/**
 * Columns of a grouping
 * @param {String} groupBy
 * @param {Object} ctx
 * @returns {Object[]} [{key, title, color, dropDisabled}]
 */
export function boardColumns(groupBy, ctx) {
    const {t} = ctx;

    switch (groupBy) {
        case 'group':
            return (ctx.lists.length === 1 ? ctx.lists[0].groups || [] : [])
                .map(group => ({key: String(group.id), title: group.name, color: color(group.color)}));
        case 'tasklist':
            return ctx.lists.map(list => ({key: String(list.id), title: list.name, color: color(list.color)}));
        case 'assignee':
            return [...ctx.users.map(user => ({key: String(user.id), title: user.name})), {key: NONE, title: t('Unassigned')}];
        case 'priority':
            return [{key: 'low', title: t('Low')}, {key: 'normal', title: t('Normal')}, {key: 'high', title: t('High')}];
        case 'category':
            return [...ctx.categories.map(c => ({key: String(c.id), title: c.name, color: color(c.color)})), {key: NONE, title: t('No category')}];
        case 'due':
            return [
                {key: 'overdue', title: t('Overdue'), dropDisabled: true},
                {key: 'today', title: t('Today')},
                {key: 'week', title: t('This week'), dropDisabled: bucketStart('week', ctx.today, ctx.firstWeekday) === undefined},
                {key: 'later', title: t('Later')},
                {key: NONE, title: t('No date')}
            ];
        default:
            return PROGRESS.map(([key, title]) => ({key, title: t(title)}))
    }
}

/**
 * Column keys of a task
 * @param {String} groupBy
 * @param {Object} task
 * @param {Object} ctx
 * @returns {String[]}
 */
export function columnsOf(groupBy, task, ctx) {
    switch (groupBy) {
        case 'group': {
            const groups = ctx.lists.length === 1 ? ctx.lists[0].groups || [] : [];
            // a task without a column (or of a deleted one) shows in the first
            const own    = groups.find(group => String(group.id) === String(task.groupId ?? ''));

            return own ? [String(own.id)] : groups.slice(0, 1).map(group => String(group.id))
        }
        case 'tasklist':
            return [String(task.tasklistId)];
        case 'assignee':
            return [task.responsibleUserId ? String(task.responsibleUserId) : NONE];
        case 'priority':
            return [priorityKey(task.priority)];
        case 'category':
            return task.categories?.length ? task.categories.map(String) : [NONE];
        case 'due':
            return [dueBucket(task.due, ctx.today, ctx.firstWeekday)];
        default:
            return [task.progress || 'needs-action']
    }
}

/**
 * JMAP patch of a drop, null when the drop is not allowed
 * @param {String} groupBy
 * @param {Object} task
 * @param {String} from column key the card left
 * @param {String} to column key it was dropped on
 * @param {Object} ctx
 * @returns {Object|null}
 */
export function dropPatch(groupBy, task, from, to, ctx) {
    if (from === to) {
        return null
    }

    switch (groupBy) {
        case 'group': {
            const group = (ctx.lists[0]?.groups || []).find(g => String(g.id) === to);

            if (!group) {
                return null
            }

            // TaskListGroup.progressChange: the column sets the progress (the server does not apply it)
            return group.progressChange ? {groupId: group.id, progress: group.progressChange} : {groupId: group.id}
        }
        case 'tasklist': {
            const list = ctx.lists.find(l => String(l.id) === to);

            // the columns of the old list don't exist in the new one
            return list && list.permissionLevel >= LEVEL_WRITE ? {tasklistId: list.id, groupId: null} : null
        }
        case 'assignee':
            return {responsibleUserId: to === NONE ? null : to};
        case 'priority':
            return to in PRIORITY_VALUE ? {priority: PRIORITY_VALUE[to]} : null;
        case 'category': {
            const ids = (task.categories || []).map(String).filter(id => id !== from);

            to === NONE || ids.includes(to) || ids.push(to);
            return {categories: ids}
        }
        case 'due': {
            const due = bucketStart(to, ctx.today, ctx.firstWeekday);

            return due === undefined ? null : {due}
        }
        default:
            return PROGRESS.some(([key]) => key === to) ? {progress: to} : null
    }
}

/**
 * Order in a column: due date (none last), then priority (high first)
 * @param {Object} a task
 * @param {Object} b task
 * @returns {Number}
 */
export function compareTasks(a, b) {
    const due  = (a.due || '9999').substring(0, 10).localeCompare((b.due || '9999').substring(0, 10)),
          rank = task => ({high: 0, normal: 1, low: 2})[priorityKey(task.priority)];

    return due || rank(a) - rank(b)
}

/**
 * Filter of the board: open tasks, closed ones only when closed in the last 14 days
 * @returns {Object} Task/query condition
 */
export function recentlyClosedFilter() {
    return {operator: 'OR', conditions: [
        {progress: ['needs-action', 'in-progress']},
        {progressUpdated: '>=-14 days'}
    ]}
}
