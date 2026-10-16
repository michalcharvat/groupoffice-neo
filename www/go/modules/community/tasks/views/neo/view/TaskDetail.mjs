import Container from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar   from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_DELETE, LEVEL_WRITE} from '../../../../../../../views/neo/src/Acl.mjs';
import Button      from '../../../../../../../views/neo/src/button/Button.mjs';
import client      from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {escapeHtml} from '../../../../../../../views/neo/src/Format.mjs';
import {notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import CommentsPanel from '../../../../../../../views/neo/src/detail/CommentsPanel.mjs';
import FilesPanel    from '../../../../../../../views/neo/src/detail/FilesPanel.mjs';
import HistoryPanel  from '../../../../../../../views/neo/src/detail/HistoryPanel.mjs';
import AddLinkButton    from '../../../../../../../views/neo/src/link/AddLinkButton.mjs';
import LinkBrowseButton from '../../../../../../../views/neo/src/link/LinkBrowseButton.mjs';
import LinkDetail       from '../../../../../../../views/neo/src/link/LinkDetail.mjs';
import DetailFieldsets  from '../../../../../../../views/neo/src/customfields/DetailFieldsets.mjs';
import RecurrenceField  from '../../../../../../../views/neo/src/form/field/RecurrenceField.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import {categories, formatDuration, formatTaskDate, PROGRESS, toDate, principalHtml, principals, progressBarHtml, taskLists} from '../util.mjs';

const t = translator('community', 'tasks');

/**
 * Right pane: the selected task, like the GOUI TaskDetail: toolbar (assign me, edit,
 * links, more), a card with title and progress (click: change it), dates, list,
 * responsible, % complete, description, location, categories; then custom fields,
 * comments, files, links, history and "Continue task" at the bottom.
 *
 * Events: edit {task}, delete {task}, continue {task}
 */
class TaskDetail extends Container {
    static config = {
        className: 'GO.tasks.TaskDetail',
        baseCls  : ['go-tasks-detail', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module   : Toolbar,
            cls      : ['go-border-bottom'],
            flex     : 'none',
            reference: 'toolbar',
            items    : ['->', {
                module   : Button,
                text     : t('Assign me'),
                reference: 'assignMeButton',
                hidden   : true,
                handler  : 'up.onAssignMe'
            }, {
                module   : Button,
                icon     : 'edit',
                reference: 'editButton',
                tooltip  : t('Edit'),
                disabled : true,
                handler  : 'up.onEdit'
            }, {
                module   : AddLinkButton,
                reference: 'addLinkButton'
            }, {
                module   : LinkBrowseButton,
                reference: 'linkBrowseButton'
            }, {
                module   : Button,
                icon     : 'more_vert',
                reference: 'moreButton',
                tooltip  : t('More'),
                disabled : true
            }]
        }, {
            ntype    : 'container',
            cls      : ['go-detail-scroller'],
            flex     : 1,
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'scroller',
            items    : [{
                ntype    : 'container',
                cls      : ['go-card', 'go-tasks-card'],
                reference: 'card',
                flex     : 'none',
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
                        cls      : ['go-tasks-status'],
                        text     : ''
                    }]
                }, {
                    ntype    : 'component',
                    reference: 'body',
                    flex     : 'none',
                    html     : ''
                }]
            }, {
                module   : DetailFieldsets,
                reference: 'customFields',
                flex     : 'none'
            }, {
                module   : CommentsPanel,
                reference: 'comments',
                flex     : 'none',
                hidden   : true
            }, {
                module   : FilesPanel,
                reference: 'files',
                flex     : 'none',
                hidden   : true
            }, {
                module   : LinkDetail,
                reference: 'links',
                flex     : 'none'
            }, {
                module   : HistoryPanel,
                reference: 'history',
                flex     : 'none',
                hidden   : true
            }]
        }, {
            module   : Toolbar,
            cls      : ['go-border-top'],
            flex     : 'none',
            reference: 'bottomBar',
            hidden   : true,
            items    : ['->', {
                module : Button,
                icon   : 'arrow_right_alt',
                text   : t('Continue task'),
                handler: 'up.onContinue'
            }]
        }]
    }

    /**
     * @member {Object|null} task=null record of GO.tasks.model.Task
     */
    task = null

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('moreButton').menu = [{text: t('Delete'), icon: 'delete', handler: () => me.onDelete()}];
        me.getReference('progressButton').menu = Object.entries(PROGRESS).map(([value, text]) => ({
            text   : t(text),
            handler: () => me.setProgress(value)
        }))
    }

    /**
     * @param {Object|null} task
     */
    setTask(task) {
        let me    = this,
            level = task?.permissionLevel || 0,
            id    = task?.id || null,
            type  = task ? 'Task' : null;

        me.task = task;

        me.getReference('editButton').disabled     = !task || level < LEVEL_WRITE;
        me.getReference('moreButton').disabled     = !task || level < LEVEL_DELETE;
        me.getReference('assignMeButton').hidden   = !task || !!task.responsibleUserId || level < LEVEL_WRITE;
        me.getReference('progressButton').disabled = !task || level < LEVEL_WRITE;
        me.getReference('bottomBar').hidden        = !task || level < LEVEL_WRITE;
        me.getReference('card').hidden             = !task;

        me.getReference('addLinkButton').setEntity(type, id);

        if (me.getReference('linkBrowseButton').target?.entityId !== id) {
            me.getReference('linkBrowseButton').setEntity(type, id)
        }

        if (me.getReference('links').current?.entityId !== id) {
            me.getReference('links').setEntity(type, id, task)
        }

        me.getReference('customFields').setEntity(type, id);

        ['comments', 'files', 'history'].forEach(ref => {
            const card = me.getReference(ref);

            card.hidden = !task;

            if (card.current?.entityId !== id) {
                card.setEntity(type, id, task)
            } else if (task) {
                card.current.record = task
            }
        });

        me.renderTask()
    }

    /**
     * Renders the card again (names loaded later, see TasksMain.loadNames())
     */
    renderTask() {
        let me   = this,
            task = me.task,
            body = me.getReference('body');

        if (!task) {
            me.getReference('title').text = '';
            body.html = '';
            return
        }

        const progressButton = me.getReference('progressButton');

        me.getReference('title').text = task.title || '';
        progressButton.text = t(PROGRESS[task.progress] || task.progress || '');
        progressButton.cls  = ['go-tasks-status', 'go-tasks-status-' + task.progress];

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
                ${field(t('Recurrence'), task.recurrenceRule ? escapeHtml(RecurrenceField.toText(task.recurrenceRule, toDate(task.start) || new Date())) : '')}
            </div>
            ${field(t('Percent complete'), progressBarHtml(task.percentComplete) + `<span>${task.percentComplete || 0}%</span>`)}
            ${field(t('Description'), text(task.description))}
            ${field(t('Location'), text(task.location))}
            ${field(t('Categories'), names.map(name => `<span class="go-tasks-category">${escapeHtml(name)}</span>`).join(''))}`
    }

    async saveTask(values) {
        let me = this;

        if (!me.task) {
            return
        }

        try {
            await client.set('Task', {update: {[me.task.id]: values}})
            // the grid reloads on the push and shows the task again
        } catch (e) {
            notifyError(me, e)
        }
    }

    setProgress(progress) {
        this.task?.progress !== progress && this.saveTask({progress})
    }

    onAssignMe() {
        this.saveTask({responsibleUserId: client.user.id})
    }

    onEdit() {
        this.task && this.fire('edit', {task: this.task})
    }

    onDelete() {
        this.task && this.fire('delete', {task: this.task})
    }

    onContinue() {
        this.task && this.fire('continue', {task: this.task})
    }
}

export default Neo.setupClass(TaskDetail);
