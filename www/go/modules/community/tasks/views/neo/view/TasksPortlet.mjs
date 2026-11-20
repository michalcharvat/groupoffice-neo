import Component     from '../../../../../../../views/neo/node_modules/neo.mjs/src/component/Base.mjs';
import {toYmd, userNow} from '../../../../../../../views/neo/src/DateUtil.mjs';
import {escapeHtml, smartDateTime} from '../../../../../../../views/neo/src/Format.mjs';
import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';
import EntitySelectDialog from '../../../../../../../views/neo/src/view/EntitySelectDialog.mjs';

const t = translator('community', 'tasks');

/**
 * Start page portlet "Tasks" (views/extjs3/Portlet.js): the incomplete tasks that have
 * started, of the lists chosen with "Settings" (User.taskPortletTaskLists, else the default
 * list). A click opens the task.
 */
class TasksPortlet extends Component {
    static config = {
        className: 'GO.tasks.TasksPortlet',
        cls      : ['go-portlet-list', 'go-tasks-portlet'],
        html     : ''
    }

    /**
     * @member {Object[]} records=[]
     */
    records = []

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.addDomListeners([{click: me.onClick, scope: me}]);
        me.removeStateListener = client.on('stateChange', ({changed}) => changed?.includes('Task') && me.refresh());
        client.watch(['Task']);
        me.refresh()
    }

    destroy(...args) {
        this.removeStateListener?.();
        super.destroy(...args)
    }

    /**
     * @returns {Promise<String[]>} the chosen lists, else the default one
     */
    async taskLists() {
        const [user] = await client.get('User', [client.user.id], ['id', 'taskPortletTaskLists', 'tasksSettings']),
              lists  = user?.taskPortletTaskLists || [];

        return lists.length ? lists.map(String) : [user?.tasksSettings?.defaultTasklistId].filter(Boolean).map(String)
    }

    async refresh() {
        let me = this;

        try {
            const lists = await me.taskLists();

            const {list} = lists.length ? await client.queryGet('Task', {
                filter    : {tasklistId: lists, complete: false, start: '<=' + toYmd(userNow())},
                sort      : [{property: 'start', isAscending: true}],
                limit     : 50,
                properties: ['id', 'title', 'start', 'due', 'percentComplete', 'priority']
            }) : {list: []};

            if (me.isDestroyed) {
                return
            }

            me.records = list;

            me.html = list.length ? list.map((task, i) => {
                const overdue = task.due && task.due < toYmd(userNow());

                return `<div class="go-portlet-row" data-index="${i}">
                    <i class="go-icon go-portlet-icon">check_circle</i>
                    <span class="go-portlet-text"><b>${escapeHtml(task.title)}</b>${task.due ? `<small class="${overdue ? 'go-overdue' : ''}">${escapeHtml(t('Due') + ': ' + smartDateTime(task.due + 'T00:00:00', false))}</small>` : ''}</span>
                    ${task.percentComplete ? `<span class="go-portlet-meta">${Number(task.percentComplete)}%</span>` : ''}
                </div>`
            }).join('') : `<div class="go-empty">${escapeHtml(t('No items to display'))}</div>`
        } catch (e) {
            me.isDestroyed || (me.html = `<div class="go-empty">${escapeHtml(e.message)}</div>`)
        }
    }

    onClick({path}) {
        let me     = this,
            index  = path.find(n => n.cls?.includes('go-portlet-row'))?.data?.index,
            record = index !== undefined && me.records[Number(index)];

        record && Neo.Main.setRoute({value: 'tasks/task/' + record.id, windowId: me.windowId})
    }

    /**
     * "Visible lists": User.taskPortletTaskLists
     */
    async openSettings() {
        let me = this;

        try {
            const [user] = await client.get('User', [client.user.id], ['id', 'taskPortletTaskLists']);

            const ids = await EntitySelectDialog.ask({
                appName   : me.appName,
                windowId  : me.windowId,
                title     : t('Visible lists'),
                entity    : 'TaskList',
                jmapFilter: {role: 'list'},
                value     : user?.taskPortletTaskLists || []
            });

            if (ids) {
                await client.set('User', {update: {[client.user.id]: {taskPortletTaskLists: ids.map(Number)}}});
                me.refresh()
            }
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(TasksPortlet);
