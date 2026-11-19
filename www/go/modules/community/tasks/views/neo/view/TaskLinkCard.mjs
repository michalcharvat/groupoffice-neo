import {LEVEL_WRITE} from '../../../../../../../views/neo/src/Acl.mjs';
import Button      from '../../../../../../../views/neo/src/button/Button.mjs';
import Card        from '../../../../../../../views/neo/src/detail/Card.mjs';
import client      from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {escapeHtml} from '../../../../../../../views/neo/src/Format.mjs';
import {confirmUnlink, openLink} from '../../../../../../../views/neo/src/link/links.mjs';
import MenuList    from '../../../../../../../views/neo/src/menu/List.mjs';
import {notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import {formatTaskDate, taskLists} from '../util.mjs';

const t = translator('community', 'tasks');

const PROPERTIES = ['id', 'title', 'description', 'due', 'start', 'color', 'tasklistId', 'permissionLevel'];

/**
 * "Incomplete tasks" or "Completed tasks" in another item's detail (ExtJS TaskLinkDetail):
 * the tasks linked to the item, grouped by list, with title, description and due date.
 * Hidden while there are none. "Add" creates a new linked task (linkWindow.mjs); a click
 * opens the task, its menu edits, unlinks or opens it.
 * See linkDetailCards.mjs and ModuleRegistry `linkDetailCards`.
 */
class TaskLinkCard extends Card {
    static config = {
        className: 'GO.tasks.TaskLinkCard',
        cls      : ['go-link-detail', 'go-tasks-link-card'],
        hidden   : true,
        watch    : ['Link', 'Task'],
        /**
         * Completed (true) or incomplete (false) tasks
         * @member {Boolean} complete=false
         */
        complete : false
    }

    /**
     * Rendered tasks
     * @member {Object[]} tasks=[]
     */
    tasks = []

    async onConstructed() {
        await super.onConstructed();

        let me = this;

        if (me.isDestroyed) {
            return
        }

        me.getReference('list').addDomListeners({click: me.onListClick, scope: me})
    }

    createTools() {
        let me = this;

        return [{
            module : Button,
            icon   : 'add',
            tooltip: t('Add'),
            handler: () => me.addTask().catch(e => notifyError(me, e))
        }]
    }

    createBody() {
        return [{
            ntype    : 'component',
            reference: 'list',
            cls      : ['go-links'],
            html     : ''
        }]
    }

    async loadData(entity, entityId) {
        const {list} = await client.queryGet('Task', {
            // every list the user can read, not only the subscribed ones (the filter's default);
            // any role: the generic Links card leaves out all tasks
            filter    : {link: {entity, id: entityId}, complete: this.complete, tasklistId: 'any'},
            // grouped by list (ExtJS GroupingView)
            sort      : [{property: 'tasklist', isAscending: true}, {property: 'due', isAscending: true}, {property: 'title', isAscending: true}],
            properties: PROPERTIES
        });

        await taskLists.fetch(list.map(task => task.tasklistId));

        return list
    }

    showData(tasks) {
        let me    = this,
            html  = '',
            group = null;

        tasks.forEach((task, index) => {
            const list  = taskLists.get(task.tasklistId),
                  title = escapeHtml(task.title || ''),
                  due   = formatTaskDate(task.due);

            if (String(task.tasklistId) !== group) {
                group !== null && (html += '</div>');
                group = String(task.tasklistId);
                html += `<div class="go-link-group"><h4 class="go-link-group-title"><i class="go-icon">checklist</i>${escapeHtml(list?.name || '')}</h4>`
            }

            html += `<div class="go-link" data-index="${index}">
                <div class="go-link-text"><b>${/^[0-9a-f]{6}$/i.test(task.color || '') ? `<span style="color:#${task.color}">${title}</span>` : title}</b>${task.description ? `<small>${escapeHtml(task.description)}</small>` : ''}</div>
                ${due ? `<span class="go-link-date" title="${escapeHtml(t('Due'))}">${escapeHtml(due)}</span>` : ''}
                <i class="go-icon go-link-more" id="${me.id}__more-${index}" title="${escapeHtml(t('More options'))}">more_vert</i>
            </div>`
        });

        group !== null && (html += '</div>');

        me.tasks  = tasks;
        me.hidden = !tasks.length;
        me.getReference('list').html = html
    }

    clearData() {
        let me = this;

        me.tasks  = [];
        me.hidden = true;
        me.getReference('list').html = ''
    }

    showError(e) {
        let me = this;

        me.hidden = false;
        me.getReference('list').html = `<div class="go-empty">${escapeHtml(e.message || String(e))}</div>`
    }

    /**
     * Row: open the task; its "more" icon: menu with edit, unlink and open (ExtJS initMoreMenu())
     * @param {Object} data neo DOM event
     * @protected
     */
    onListClick({path}) {
        let me   = this,
            row  = path.find(node => node.cls?.includes('go-link')),
            task = row && me.tasks[Number(row.data?.index)],
            more = path.find(node => node.cls?.includes('go-link-more'));

        if (!task) {
            return
        }

        if (!more) {
            me.openTask(task);
            return
        }

        MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : more.id,
            items   : [{
                text    : t('Edit'),
                icon    : 'edit',
                disabled: (task.permissionLevel || 0) < LEVEL_WRITE,
                handler : () => me.editTask(task).catch(e => notifyError(me, e))
            }, {
                text   : t('Unlink'),
                icon   : 'link_off',
                handler: () => me.unlinkTask(task).catch(e => notifyError(me, e))
            }, {
                text   : t('Open'),
                icon   : 'open_in_new',
                handler: () => me.openTask(task)
            }]
        })
    }

    /**
     * @param {Object} task
     * @protected
     */
    openTask(task) {
        openLink(this, {link: {toEntity: 'Task', toId: task.id}})
    }

    /**
     * Task dialog; the detail stays (ExtJS: redirectOnSave = false)
     * @param {Object} task
     * @returns {Promise<void>}
     * @protected
     */
    async editTask(task) {
        const {default: TaskDialog} = await import('./TaskDialog.mjs');

        Neo.create(TaskDialog, {appName: this.appName, windowId: this.windowId, entityId: task.id, redirectOnSave: false})
    }

    /**
     * Asks, then deletes the link between the shown item and the task
     * @param {Object} task
     * @returns {Promise<void>}
     * @protected
     */
    async unlinkTask(task) {
        let me = this,
            {entity, entityId} = me.current || {};

        if (!entity) {
            return
        }

        const {list} = await client.queryGet('Link', {
            filter    : {entity, entityId, entities: [{name: 'Task'}]},
            properties: ['id', 'toEntity', 'toId']
        });

        const link = list.find(l => String(l.toId) === String(task.id));

        if (link && await confirmUnlink(me, {link, to: {name: task.title}})) {
            me.isDestroyed || me.reload()
        }
    }

    /**
     * New task linked to the shown item (ExtJS "Add": TaskDialog.setLinkEntity())
     * @returns {Promise<void>}
     * @protected
     */
    async addTask() {
        let me      = this,
            current = me.current;

        if (!current) {
            return
        }

        const {default: openLinkedTask} = await import('../linkWindow.mjs');

        // the item it was asked for, also when the detail moved on meanwhile
        me.isDestroyed || await openLinkedTask({appName: me.appName, windowId: me.windowId, ...current})
    }
}

export default Neo.setupClass(TaskLinkCard);
