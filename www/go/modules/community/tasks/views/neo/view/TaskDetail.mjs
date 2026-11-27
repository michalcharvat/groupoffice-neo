import Toolbar   from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_WRITE} from '../../../../../../../views/neo/src/Acl.mjs';
import Button      from '../../../../../../../views/neo/src/button/Button.mjs';
import client      from '../../../../../../../views/neo/src/jmap/Client.mjs';
import Panel       from '../../../../../../../views/neo/src/detail/Panel.mjs';
import {escapeHtml} from '../../../../../../../views/neo/src/Format.mjs';
import {notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import RecurrenceField  from '../../../../../../../views/neo/src/form/field/RecurrenceField.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import {categories, formatDuration, formatTaskDate, PROGRESS, toDate, principalHtml, principals, progressBarHtml, taskLists} from '../util.mjs';
import {userNow} from '../../../../../../../views/neo/src/DateUtil.mjs';

const t = translator('community', 'tasks');

/**
 * @summary Right pane: the selected task on GO.detail.Panel, like the GOUI TaskDetail: toolbar (assign me, edit,
 * links, more), a card with title and progress (click: change it), dates, list,
 * responsible, % complete, description, location, categories; then custom fields,
 * comments, files, links, history and "Continue task" at the bottom.
 *
 * Events (GO.detail.Panel): edit {record}, delete {record}, continue {record}
 * @class GO.tasks.TaskDetail
 * @extends GO.detail.Panel
 */
class TaskDetail extends Panel {
    static config = {
        className : 'GO.tasks.TaskDetail',
        baseCls   : ['go-tasks-detail', 'go-detail-panel', 'neo-container'],
        entityName: 'Task',
        cards     : ['customFields', 'comments', 'files', 'links', 'history']
    }

    /**
     * @summary "Assign me" left of Edit.
     * @returns {Array}
     */
    createToolbarItems() {
        return ['->', {
            module   : Button,
            text     : t('Assign me'),
            reference: 'assignMeButton',
            hidden   : true,
            handler  : () => this.onAssignMe()
        }]
    }

    /**
     * @summary The task card: title, progress chip and fields.
     * @returns {Object[]}
     */
    createBody() {
        return [{
            ntype    : 'container',
            cls      : ['go-card', 'go-tasks-card'],
            reference: 'card',
            hidden   : true,
            layout   : {ntype: 'vbox', align: 'stretch'},
            items    : [{
                module: Toolbar,
                flex  : 'none',
                items : [{
                    ntype    : 'component',
                    tag      : 'h3',
                    reference: 'title',
                    flex     : 1,
                    text     : ''
                }, {
                    // GOUI: the status chip opens a menu that sets the progress
                    module   : Button,
                    reference: 'progressButton',
                    // the status is printed (renderTask() sets the cls)
                    cls      : ['go-tasks-status', 'go-print-show'],
                    text     : ''
                }]
            }, {
                ntype    : 'component',
                reference: 'body',
                flex     : 'none',
                html     : ''
            }]
        }]
    }

    /**
     * @summary "Continue task" at the bottom.
     * @returns {Object[]}
     */
    createBottomItems() {
        return [{
            module   : Toolbar,
            cls      : ['go-border-top'],
            flex     : 'none',
            reference: 'bottomBar',
            hidden   : true,
            items    : ['->', {
                module : Button,
                icon   : 'arrow_right_alt',
                text   : t('Continue task'),
                handler: () => this.onContinue()
            }]
        }]
    }

    /**
     * @summary The progress menu.
     */
    onConstructed() {
        super.onConstructed();

        this.getReference('progressButton').menu = Object.entries(PROGRESS).map(([value, text]) => ({
            text   : t(text),
            handler: () => this.setProgress(value)
        }))
    }

    /**
     * @summary The task's own buttons and card.
     * @param {Object|null} task record of GO.tasks.model.Task
     */
    renderRecord(task) {
        let me    = this,
            level = task?.permissionLevel || 0;

        me.getReference('assignMeButton').hidden   = !task || !!task.responsibleUserId || level < LEVEL_WRITE;
        me.getReference('progressButton').disabled = !task || level < LEVEL_WRITE;
        me.getReference('bottomBar').hidden        = !task || level < LEVEL_WRITE;
        me.getReference('card').hidden             = !task;

        me.renderTask()
    }

    /**
     * @summary Renders the card again (names loaded later, see TasksMain.loadNames())
     */
    renderTask() {
        let me   = this,
            task = me.record,
            body = me.getReference('body');

        if (!task) {
            me.getReference('title').text = '';
            body.html = '';
            return
        }

        const progressButton = me.getReference('progressButton');

        me.getReference('title').text = task.title || '';
        progressButton.text = t(PROGRESS[task.progress] || task.progress || '');
        progressButton.cls  = ['go-tasks-status', 'go-tasks-status-' + task.progress, 'go-print-show'];

        const field = (label, value) => value ? `<div class="go-tasks-field"><label>${escapeHtml(label)}</label><div>${value}</div></div>` : '',
              names = (task.categories || []).map(id => categories.get(id)?.name).filter(Boolean),
              text  = value => value ? escapeHtml(value).replace(/\n/g, '<br>') : '';

        body.html = `
            <div class="go-tasks-fields">
                ${field(t('Start at'), escapeHtml(formatTaskDate(task.start)))}
                ${field(t('Due at'), escapeHtml(formatTaskDate(task.due)))}
                ${field(t('List'), escapeHtml(taskLists.get(task.tasklistId)?.name || ''))}
                ${field(t('Responsible'), principalHtml(principals.get(task.responsibleUserId)))}
                ${field(t('Estimated duration'), escapeHtml(formatDuration(task.estimatedDuration)))}
                ${field(t('Recurrence'), task.recurrenceRule ? escapeHtml(RecurrenceField.toText(task.recurrenceRule, toDate(task.start) || userNow())) : '')}
            </div>
            ${field(t('Percent complete'), progressBarHtml(task.percentComplete) + `<span>${task.percentComplete || 0}%</span>`)}
            ${field(t('Description'), text(task.description))}
            ${field(t('Location'), text(task.location))}
            ${field(t('Categories'), names.map(name => `<span class="go-tasks-category">${escapeHtml(name)}</span>`).join(''))}`
    }

    /**
     * @summary Saves changed properties of the shown task.
     */
    async saveTask(values) {
        let me = this;

        if (!me.record) {
            return
        }

        try {
            await client.set('Task', {update: {[me.record.id]: values}})
            // the grid reloads on the push and shows the task again
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * @summary Sets the progress of the shown task.
     */
    setProgress(progress) {
        this.record?.progress !== progress && this.saveTask({progress})
    }

    /**
     * @summary Makes the current user responsible.
     */
    onAssignMe() {
        this.saveTask({responsibleUserId: client.user.id})
    }

    /**
     * @summary Fires continue {record}.
     */
    onContinue() {
        this.record && this.fire('continue', {record: this.record})
    }
}

export default Neo.setupClass(TaskDetail);
