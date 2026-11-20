import {LEVEL_CREATE} from '../../../../../../views/neo/src/Acl.mjs';
import client         from '../../../../../../views/neo/src/jmap/Client.mjs';
import {toYmd, userNow} from '../../../../../../views/neo/src/DateUtil.mjs';

/**
 * "Add link" → "Task" in another item's detail (ExtJS Module.js linkWindow and
 * TaskDialog.setLinkEntity()): a new task in the user's default list, linked to the item
 * once it is saved. A contact's or project's name becomes the subject, an order's number.
 * See ModuleRegistry `linkWindows`.
 *
 * @param {Object} ctx {appName, windowId, entity, entityId, record}
 * @returns {Promise<GO.tasks.TaskDialog>}
 */
export default async function openLinkedTask({appName, windowId, entity, entityId, record}) {
    const [{default: TaskDialog}, user, {list: lists}] = await Promise.all([
        import('./view/TaskDialog.mjs'),
        client.get('User', [client.user.id], ['tasksSettings']).then(([u]) => u).catch(() => null),
        client.queryGet('TaskList', {
            filter    : {role: 'list', permissionLevel: LEVEL_CREATE},
            sort      : [{property: 'name', isAscending: true}],
            properties: ['id']
        })
    ]);

    const settings = user?.tasksSettings || {},
          values   = {
              progress       : 'needs-action',
              priority       : 0,
              percentComplete: 0,
              tasklistId     : lists.find(l => String(l.id) === String(settings.defaultTasklistId))?.id || lists[0]?.id || null
          };

    // "Set today for start and due date when creating new tasks"
    if (settings.defaultDate) {
        values.start = values.due = toYmd(userNow())
    }

    const title = ['Contact', 'Project', 'Project3'].includes(entity) ? record?.name : entity === 'Order' ? record?.order_id : null;

    title && (values.title = String(title));

    const dialog = Neo.create(TaskDialog, {appName, windowId, values, redirectOnSave: false});

    dialog.addLinkOnSave(entity, entityId);
    return dialog
}
