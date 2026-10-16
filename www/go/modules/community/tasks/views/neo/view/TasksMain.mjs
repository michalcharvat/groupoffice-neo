import Toolbar       from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_DELETE, LEVEL_MANAGE, LEVEL_WRITE} from '../../../../../../../views/neo/src/Acl.mjs';
import Button        from '../../../../../../../views/neo/src/button/Button.mjs';
import SearchButton  from '../../../../../../../views/neo/src/button/SearchButton.mjs';
import CheckBox      from '../../../../../../../views/neo/src/component/CheckBox.mjs';
import TableTitle    from '../../../../../../../views/neo/src/component/TableTitle.mjs';
import JmapStore     from '../../../../../../../views/neo/src/data/JmapStore.mjs';
import BoolCheckBox  from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import Grid          from '../../../../../../../views/neo/src/grid/Grid.mjs';
import MultiSelectToolbar from '../../../../../../../views/neo/src/grid/MultiSelectToolbar.mjs';
import {selectRow}   from '../../../../../../../views/neo/src/grid/selectRow.mjs';
import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import CheckList     from '../../../../../../../views/neo/src/list/CheckList.mjs';
import {escapeHtml, formatUserDateTime, smartDateTime} from '../../../../../../../views/neo/src/Format.mjs';
import {notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import {getState, setState} from '../../../../../../../views/neo/src/State.mjs';
import ConfirmDialog from '../../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import FilterPanel   from '../../../../../../../views/neo/src/view/FilterPanel.mjs';
import MainThreeColumnPanel from '../../../../../../../views/neo/src/view/MainThreeColumnPanel.mjs';
import {fmt, translator} from '../../../../../../../views/neo/src/Translate.mjs';
import TaskModel     from '../model/Task.mjs';
import TaskListModel from '../model/TaskList.mjs';
import {categories, dateState, formatDuration, formatTaskDate, hasRight, principalHtml, principals, progressBarHtml,
        progressHtml, taskLists} from '../util.mjs';
import CategoryDialog from './CategoryDialog.mjs';
import ContinueTaskDialog from './ContinueTaskDialog.mjs';
import ScheduleList  from './ScheduleList.mjs';
import SubscribeDialog from './SubscribeDialog.mjs';
import TaskDetail    from './TaskDetail.mjs';
import TaskDialog    from './TaskDialog.mjs';
import TaskListDialog from './TaskListDialog.mjs';
import TaskListList  from './TaskListList.mjs';

const t = translator('community', 'tasks');

// GOUI loads all tasks (limit 0); scroll loading keeps big lists fast
const PAGE_SIZE = 50;

const dateTimeRenderer = ({value}) => value ? `<span title="${escapeHtml(formatUserDateTime(value))}">${escapeHtml(smartDateTime(value))}</span>` : '';

const nameRenderer = cache => ({value}) => escapeHtml(cache.get(value)?.name ?? '');

// filters for saved filters (Task::defineFilters)
const TASK_FILTERS = [
    {name: 'text',            type: 'string', multiple: false, title: t('Query')},
    {name: 'title',           type: 'string', multiple: true,  title: t('Title')},
    {name: 'start',           type: 'date',   multiple: false, title: t('Start')},
    {name: 'due',             type: 'date',   multiple: false, title: t('Due')},
    {name: 'percentComplete', type: 'number', multiple: false, title: t('Percent complete')},
    {name: 'commentedat',     type: 'date',   multiple: false, title: t('Commented at')},
    {name: 'modifiedat',      type: 'date',   multiple: false, title: t('Modified at')},
    {name: 'createdat',       type: 'date',   multiple: false, title: t('Created at')}
];

/**
 * Tasks main panel: schedule, assignment, lists and categories | task grid | task
 * detail, like the GOUI tasks module (go/modules/community/tasks/views/goui/script/Main.ts)
 */
class TasksMain extends MainThreeColumnPanel {
    static config = {
        className: 'GO.tasks.TasksMain',
        cls      : ['go-tasks'],
        // GOUI's id: the panel widths are shared with the GOUI tasks module
        stateName: 'tasks',
        /**
         * Route prefix, set by the shell (GO.view.MainView)
         * @member {String|null} moduleName=null
         */
        moduleName: null
    }

    /**
     * Task to select once the grid has loaded (deep link or after create)
     * @member {String|null} pendingTaskId=null
     */
    pendingTaskId = null
    /**
     * The user's tasksSettings
     * @member {Object|null} tasksSettings=null
     */
    tasksSettings = null

    createWest() {
        return {
            ntype : 'container',
            cls   : ['go-scroll', 'go-tasks-west'],
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Toolbar,
                flex  : 'none',
                items : ['->', this.hideWestButton()]
            }, {
                module   : ScheduleList,
                reference: 'scheduleList',
                flex     : 'none'
            }, {
                ntype : 'container',
                cls   : ['go-tasks-assigned'],
                flex  : 'none',
                layout: {ntype: 'vbox', align: 'stretch'},
                items : [{
                    module    : BoolCheckBox,
                    reference : 'showCompleted',
                    valueLabel: t('Show completed'),
                    listeners : {change: () => this.onShowCompletedChange()}
                }, {
                    ntype: 'component',
                    tag  : 'h3',
                    text : t('Assigned')
                }, {
                    module    : BoolCheckBox,
                    reference : 'assignedToMe',
                    valueLabel: t('Mine'),
                    listeners : {change: () => this.onAssignmentChange()}
                }, {
                    module    : BoolCheckBox,
                    reference : 'unassigned',
                    valueLabel: t('Unassigned'),
                    listeners : {change: () => this.onAssignmentChange()}
                }]
            }, {
                module: Toolbar,
                cls   : ['go-border-bottom'],
                flex  : 'none',
                items : [{
                    module   : CheckBox,
                    reference: 'selectAllLists',
                    flex     : 'none',
                    listeners: {change: ({checked}) => this.onSelectAllLists(checked)}
                }, {
                    ntype: 'component',
                    tag  : 'h4',
                    cls  : ['go-toolbar-heading'],
                    text : t('Lists')
                }, '->', {
                    module   : SearchButton,
                    cls      : ['small'],
                    listeners: {search: ({text}) => this.onListSearch(text)}
                }, {
                    module   : Button,
                    icon     : 'more_vert',
                    cls      : ['small'],
                    reference: 'listMenuButton',
                    tooltip  : t('More options')
                }]
            }, {
                module      : TaskListList,
                reference   : 'taskListList',
                flex        : 'none',
                displayField: 'name',
                rowMenu     : record => this.getTaskListMenu(record),
                store       : {
                    module    : JmapStore,
                    entity    : 'TaskList',
                    model     : TaskListModel,
                    // GOUI TasklistGrid: subscribed lists of the "list" role
                    jmapFilter: {role: 'list', isSubscribed: true},
                    jmapSort  : [{property: 'name', isAscending: true}],
                    properties: ['id', 'name', 'color', 'aclId', 'permissionLevel']
                }
            }, {
                module: Toolbar,
                cls   : ['go-border-bottom'],
                flex  : 'none',
                items : [{
                    ntype: 'component',
                    tag  : 'h4',
                    cls  : ['go-toolbar-heading'],
                    text : t('Categories')
                }, '->', {
                    module : Button,
                    icon   : 'add',
                    cls    : ['small'],
                    tooltip: t('Add category'),
                    handler: () => this.openCategoryDialog(null)
                }]
            }, {
                module      : CheckList,
                reference   : 'categoryList',
                flex        : 'none',
                displayField: 'name',
                rowMenu     : record => this.getCategoryMenu(record),
                store       : {
                    module    : JmapStore,
                    entity    : 'TaskCategory',
                    model     : TaskListModel,
                    jmapSort  : [{property: 'name', isAscending: true}],
                    properties: ['id', 'name', 'ownerId', 'tasklistId']
                }
            }, {
                module   : FilterPanel,
                reference: 'filterPanel',
                flex     : 'none',
                entity   : 'Task',
                filters  : TASK_FILTERS,
                listeners: {filterChange: ({filter}) => this.onSavedFilterChange(filter)}
            }]
        }
    }

    createCenter() {
        return {
            ntype : 'container',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                // GOUI: the multi select toolbar covers the toolbar while rows are selected
                ntype : 'container',
                flex  : 'none',
                cls   : ['go-mstb-host'],
                items : [{
                    module: Toolbar,
                    cls   : ['go-bg-mid', 'go-border-bottom'],
                    items : [this.showWestButton(), {
                        module   : TableTitle,
                        reference: 'tableTitle',
                        title    : t('Tasks')
                    }, '->', {
                        module   : SearchButton,
                        listeners: {search: ({text}) => this.onSearch(text)}
                    }, {
                        module   : Button,
                        icon     : 'add',
                        ui       : 'primary',
                        reference: 'newButton',
                        tooltip  : t('Add'),
                        handler  : 'up.onNew'
                    }]
                }, {
                    module   : MultiSelectToolbar,
                    reference: 'multiSelectToolbar',
                    items    : [{
                        module : Button,
                        icon   : 'merge',
                        tooltip: t('Merge'),
                        handler: 'up.onMergeSelected'
                    }, {
                        module : Button,
                        icon   : 'delete',
                        tooltip: t('Delete'),
                        handler: 'up.onDeleteSelected'
                    }]
                }]
            }, {
                module     : Grid,
                reference  : 'grid',
                flex       : 1,
                multiSelect: true,
                store      : {
                    module    : JmapStore,
                    entity    : 'Task',
                    model     : TaskModel,
                    pageSize  : PAGE_SIZE,
                    scrollLoad: true,
                    // a list rename or a new category shows in the rows
                    watch     : ['Task', 'TaskList', 'TaskCategory'],
                    // GOUI TaskGrid relations: GO sorts these by name
                    sortProperties: {tasklistId: 'tasklist', responsibleUserId: 'responsible', createdBy: 'creator', modifiedBy: 'modifier'},
                    // GOUI: grouped by list, then by start
                    sorters   : [{property: 'tasklistId', direction: 'ASC'}, {property: 'start', direction: 'ASC'}],
                    jmapFilter: {role: 'list'}
                },
                stateId: 'tasks-taskGrid',
                columns: [{
                    dataField: 'complete',
                    text     : '',
                    width    : 48,
                    hideable : false,
                    sortable : false,
                    renderer : ({record}) => `<span class="go-check${record.progress === 'completed' ? ' go-checked' : ''}" role="checkbox" aria-checked="${record.progress === 'completed'}"></span>`
                }, {
                    dataField: 'id',
                    text     : t('ID'),
                    width    : 80,
                    cellAlign: 'right',
                    hidden   : true
                }, {
                    dataField: 'title',
                    text     : t('Title'),
                    width    : 300,
                    hideable : false,
                    renderer : ({record}) => /^[0-9a-f]{6}$/i.test(record.color || '')
                        ? `<span style="color:#${record.color}">${escapeHtml(record.title)}</span>`
                        : escapeHtml(record.title)
                }, {
                    dataField: 'icons',
                    text     : '',
                    width    : 80,
                    hideable : false,
                    sortable : false,
                    renderer : ({record}) => TasksMain.iconsHtml(record)
                }, {
                    dataField: 'start',
                    text     : t('Start at'),
                    width    : 120,
                    cellCls  : ({record}) => dateState(record) === 'go-tasks-success' ? ['go-tasks-success'] : [],
                    renderer : ({value}) => escapeHtml(formatTaskDate(value))
                }, {
                    dataField: 'due',
                    text     : t('Due at'),
                    width    : 120,
                    cellCls  : ({record}) => dateState(record) === 'go-tasks-danger' ? ['go-tasks-danger'] : [],
                    renderer : ({value}) => escapeHtml(formatTaskDate(value))
                }, {
                    dataField: 'responsibleUserId',
                    stateKey : 'responsible',
                    text     : t('Responsible'),
                    width    : 180,
                    renderer : ({value}) => principalHtml(principals.get(value)) || '-'
                }, {
                    dataField: 'percentComplete',
                    text     : t('% complete'),
                    width    : 120,
                    renderer : ({value}) => progressBarHtml(value)
                }, {
                    dataField: 'progress',
                    text     : t('Progress'),
                    width    : 130,
                    renderer : ({value}) => progressHtml(value)
                }, {
                    dataField: 'tasklistId',
                    stateKey : 'tasklist',
                    text     : t('List'),
                    width    : 160,
                    renderer : nameRenderer(taskLists)
                }, {
                    dataField: 'categories',
                    text     : t('Categories'),
                    width    : 160,
                    sortable : false,
                    renderer : ({value}) => (value || []).map(id => categories.get(id))
                        .filter(Boolean).map(c => `<span class="go-tasks-category">${escapeHtml(c.name)}</span>`).join('')
                }, {
                    dataField: 'estimatedDuration',
                    text     : t('Estimated duration'),
                    cellAlign: 'right',
                    width    : 100,
                    hidden   : true,
                    renderer : ({value}) => escapeHtml(formatDuration(value))
                }, {
                    dataField: 'createdAt',
                    text     : t('Created at'),
                    cellAlign: 'right',
                    width    : 164,
                    hidden   : true,
                    renderer : dateTimeRenderer
                }, {
                    dataField: 'modifiedAt',
                    text     : t('Modified at'),
                    cellAlign: 'right',
                    width    : 164,
                    hidden   : true,
                    renderer : dateTimeRenderer
                }, {
                    dataField: 'createdBy',
                    stateKey : 'creator',
                    text     : t('Created by'),
                    width    : 160,
                    hidden   : true,
                    renderer : nameRenderer(principals)
                }, {
                    dataField: 'modifiedBy',
                    stateKey : 'modifier',
                    text     : t('Modified by'),
                    width    : 160,
                    hidden   : true,
                    renderer : nameRenderer(principals)
                }]
            }]
        }
    }

    createEast() {
        return {
            module   : TaskDetail,
            reference: 'detail'
        }
    }

    /**
     * GOUI TaskGrid "icons" column: priority, repeating, files, alerts, time booked
     * @param {Object} task
     * @returns {String} HTML
     */
    static iconsHtml(task) {
        const icons = [];

        if (task.priority > 0 && task.priority < 5) {
            icons.push(['priority_high', 'go-tasks-orange', t('High')])
        } else if (task.priority > 5) {
            icons.push(['low_priority', 'go-tasks-blue', t('Low')])
        }

        task.recurrenceRule && icons.push(['repeat', '', t('Recurrence')]);
        task.filesFolderId && icons.push(['attachment', '', t('Files')]);
        task.alerts?.length && icons.push(['alarm', '', t('Alerts')]);
        task.timeBooked > 0 && icons.push(['timer', '', t('Time booked')]);

        return icons.map(([icon, cls, title]) => `<i class="go-icon ${cls}" title="${escapeHtml(title)}">${icon}</i>`).join('')
    }

    /**
     * Open dialogs: closing the module (MainView.closeModule) closes them too
     * @member {Set<GO.view.Dialog>} dialogs
     */
    dialogs = new Set()

    destroy(...args) {
        // close(), not destroy(): it removes the modal mask and the dialog's DOM
        this.dialogs.forEach(dialog => dialog.isDestroyed || dialog.close());
        super.destroy(...args)
    }

    /**
     * @param {GO.view.Dialog} dialog
     * @returns {GO.view.Dialog}
     */
    trackDialog(dialog) {
        this.dialogs.forEach(d => d.isDestroyed && this.dialogs.delete(d));
        this.dialogs.add(dialog);
        return dialog
    }

    /**
     * Creates a dialog with this view's app and window, tracked for closing
     * @param {Object} module dialog class
     * @param {Object} config
     * @returns {GO.view.Dialog|null}
     */
    createDialog(module, config = {}) {
        let me = this;

        try {
            return me.trackDialog(Neo.create(module, {appName: me.appName, windowId: me.windowId, ...config}))
        } catch (e) {
            me.showError(e);
            return null
        }
    }

    onConstructed() {
        super.onConstructed();

        let me        = this,
            listList  = me.getReference('taskListList'),
            catList   = me.getReference('categoryList'),
            grid      = me.getReference('grid'),
            taskStore = grid.store,
            detail    = me.getReference('detail');

        me.getReference('listMenuButton').menu = [{
            text   : t('Create task list...'),
            icon   : 'add',
            handler: () => me.openTaskListDialog(null)
        }, {
            text   : t('Subscribe to task list...'),
            icon   : 'bookmark_added',
            handler: () => me.createDialog(SubscribeDialog)?.on('subscribed', () => me.reloadTaskLists())
        }];

        me.getReference('scheduleList').selectionModel.on('selectionChange', me.onScheduleChange, me);

        listList.selectionModel.on('selectionChange', me.onTaskListSelectionChange, me);
        listList.store.on('load', me.onTaskListsLoad, me);
        catList.selectionModel.on('selectionChange', me.onCategorySelectionChange, me);
        catList.store.on('load', me.onCategoriesLoad, me);

        grid.view.selectionModel.on('selectionChange', me.onTaskSelectionChange, me);
        me.getReference('multiSelectToolbar').setGrid(grid);
        grid.on('rowClick', event => {
            const sm     = grid.view.selectionModel,
                  data   = event.data || {},
                  record = event.record || sm.getRecord(data.path),
                  id     = record && grid.view.getRecordId(record);

            // a clicked row stays selected (no selectionChange): tapping the open task again
            // (a phone after "close") must show it
            if (record && !data.ctrlKey && !data.metaKey && !data.shiftKey && sm.selectedRows.length === 1 && sm.isSelectedRow(id)) {
                me.showInDetail(record);
                me.activatePanel('east')
            }
        });
        grid.on('cellClick', ({dataField, record}) => dataField === 'complete' && record && me.toggleComplete(record));
        grid.on('rowDoubleClick', ({record}) => record && record.permissionLevel >= LEVEL_WRITE && me.openDialog(record.id));

        taskStore.on('load', me.onTasksLoad, me);
        taskStore.on('loadMore', me.updateTaskCount, me);
        taskStore.on('load', me.loadNames, me);
        taskStore.on('loadMore', me.loadNames, me);
        grid.body.on('scrollEdge', () => taskStore.loadMore().catch(() => {})); // loadError shows it

        detail.getReference('toolbar').insert(0, me.showCenterButton());
        detail.on({
            edit    : ({task}) => me.openDialog(task.id),
            delete  : ({task}) => me.deleteTasks([task]),
            continue: ({task}) => me.openContinueDialog(task)
        });

        listList.store.on('loadError', ({error}) => me.showError(error));
        catList.store.on('loadError', ({error}) => me.showError(error));
        taskStore.on('loadError', ({error}) => me.showError(error));

        me.initialLoad = me.loadInitial()
    }

    /**
     * ExtJS MainPanel: the remembered schedule entry and "show completed", the user's
     * default (or last used) lists; then the tasks load once with all of it
     */
    async loadInitial() {
        let me       = this,
            listList = me.getReference('taskListList'),
            settings = null;

        me.restoring = true;

        const [lists, user, state] = await Promise.allSettled([
            listList.store.load(),
            client.get('User', [client.user.id], ['tasksSettings']),
            getState('tasks-main', me.windowId)
        ]);

        if (me.isDestroyed) {
            return
        }

        if (user.status === 'fulfilled') {
            settings = user.value[0]?.tasksSettings || null
        }

        me.tasksSettings = settings;

        const saved    = state.status === 'fulfilled' ? state.value || {} : {},
              schedule = saved.schedule in ScheduleList.FILTERS ? saved.schedule : 'today',
              ids      = !settings ? [] : settings.rememberLastItems
                  ? settings.lastTasklistIds || []
                  : [settings.defaultTasklistId].filter(Boolean),
              records  = lists.status === 'fulfilled'
                  ? ids.map(id => listList.store.get(String(id))).filter(Boolean)
                  : [];

        me.getReference('showCompleted').checked = saved.showCompleted !== false;
        me.applyCompletedFilter();
        me.applyScheduleFilter(schedule);
        me.getReference('scheduleList').selectionModel.select(me.getReference('scheduleList').store.get(schedule));
        records.length && listList.selectionModel.select(records);
        me.applyListFilter();
        me.loadCategories();

        me.restoring = false;
        me.reloadTasks()
    }

    /**
     * Called by the shell for "#tasks/<path>", e.g. "#tasks/task/5"
     * @param {String} path
     */
    route(path) {
        const match = path.match(/^task\/(\d+)$/);

        match && this.showTask(match[1])
    }

    async showTask(id) {
        let me     = this,
            record = me.getReference('grid').store.get(id);

        me.activatePanel('east');

        if (record) {
            me.pendingTaskId = null;
            selectRow(me.getReference('grid'), id);
            me.showInDetail(record);
            return
        }

        me.pendingTaskId = id;
        me.fetchIntoDetail(id)
    }

    /**
     * Shows a task that is not in the grid's page. A later selection wins.
     * @param {String} id
     */
    async fetchIntoDetail(id) {
        let me         = this,
            generation = me.detailGeneration = (me.detailGeneration || 0) + 1;

        try {
            const [task] = await client.get('Task', [id]);

            task && await me.fetchNames([task]);

            if (!me.isDestroyed && generation === me.detailGeneration) {
                me.getReference('detail').setTask(task || null)
            }
        } catch (e) {
            me.isDestroyed || me.showError(e)
        }
    }

    showInDetail(task) {
        this.detailGeneration = (this.detailGeneration || 0) + 1;
        this.getReference('detail').setTask(task)
    }

    reloadTasks() {
        if (this.restoring) {
            return
        }

        this.getReference('grid').store.load().catch(() => {}) // loadError shows it
    }

    /**
     * Sets filter conditions without loading (JmapStore.setFilter() loads)
     * @param {Object} filter
     */
    setTaskFilter(filter) {
        const store = this.getReference('grid').store;

        store.jmapFilter = {...store.jmapFilter, ...filter};
        Object.keys(store.jmapFilter).forEach(key => store.jmapFilter[key] === undefined && delete store.jmapFilter[key])
    }

    saveState() {
        let me = this;

        setState('tasks-main', {
            schedule     : me.schedule,
            showCompleted: !!me.getReference('showCompleted').checked
        }, me.windowId)
    }

    // --- west: schedule, completed, assignment ---

    applyScheduleFilter(id) {
        const condition = ScheduleList.FILTERS[id];

        this.schedule = id;
        this.setTaskFilter({status: condition ? {operator: 'AND', conditions: [condition]} : undefined})
    }

    onScheduleChange() {
        let me   = this,
            list = me.getReference('scheduleList'),
            id   = list.selectionModel.getSelection().map(itemId => String(list.getItemRecordId(itemId)))[0];

        if (!id || id === me.schedule) {
            return
        }

        me.applyScheduleFilter(id);
        me.restoring || me.saveState();
        me.reloadTasks()
    }

    applyCompletedFilter() {
        this.setTaskFilter({complete: this.getReference('showCompleted').checked ? undefined : false})
    }

    onShowCompletedChange() {
        if (this.restoring) {
            return
        }

        this.applyCompletedFilter();
        this.saveState();
        this.reloadTasks()
    }

    /**
     * ExtJS MainPanel.setAssignmentFilters
     */
    onAssignmentChange() {
        let me     = this,
            mine   = me.getReference('assignedToMe').checked,
            nobody = me.getReference('unassigned').checked,
            userId = client.user.id,
            conditions = [mine && {responsibleUserId: userId}, nobody && {responsibleUserId: null}].filter(Boolean);

        me.setTaskFilter({assigned: conditions.length ? {operator: 'OR', conditions} : undefined});
        me.reloadTasks()
    }

    // --- west: lists ---

    onTaskListsLoad() {
        let me    = this,
            store = me.getReference('taskListList').store;

        taskLists.put(store.items);
        me.syncSelectAll();

        // a checked list was deleted or unsubscribed: the tasks follow what is left checked
        if (!me.restoring && !me.listSearch && !me.sameIds(me.getCheckedListIds(), me.getReference('grid').store.jmapFilter.tasklistId)) {
            me.applyListFilter();
            me.loadCategories();
            me.reloadTasks()
        }
        // new tasks need a list the user may write to
        me.getReference('newButton').disabled = !store.items.length && !me.listSearch
    }

    /**
     * (Un)subscribing changes a per-user property of TaskList: the server sends no push
     */
    reloadTaskLists() {
        let me = this;

        if (me.isDestroyed) {
            return
        }

        me.getReference('taskListList').store.load().then(() => {
            // no list checked: the grid shows all subscribed lists, which just changed
            !me.isDestroyed && !me.getCheckedListIds().length && me.reloadTasks()
        }).catch(() => {}) // loadError shows it
    }

    onListSearch(text) {
        this.listSearch = text;
        this.getReference('taskListList').store.setFilter({text: text || undefined}).catch(() => {})
    }

    /**
     * @returns {String[]} ids of the checked lists
     */
    getCheckedListIds() {
        return this.getReference('taskListList').getCheckedIds()
    }

    /**
     * Without checked lists: tasks of all subscribed lists of the "list" role (server
     * default of tasklistId)
     */
    applyListFilter() {
        let me  = this,
            ids = me.getCheckedListIds();

        me.setTaskFilter({tasklistId: ids.length ? ids : undefined, role: ids.length ? undefined : 'list'});
        me.getReference('tableTitle').title = ids.length
            ? ids.map(id => me.getReference('taskListList').store.get(id)?.name || '').join(', ')
            : t('Tasks')
    }

    onTaskListSelectionChange() {
        let me  = this,
            ids = me.getCheckedListIds();

        me.syncSelectAll();

        if (me.restoring) {
            return
        }

        // remembered for the next visit when the user wants that
        if (me.tasksSettings?.rememberLastItems) {
            client.set('User', {update: {[client.user.id]: {tasksSettings: {lastTasklistIds: ids}}}}).catch(() => {})
        }

        me.applyListFilter();
        me.loadCategories();
        me.reloadTasks()
    }

    syncSelectAll() {
        let list    = this.getReference('taskListList'),
            count   = list.store.count,
            checked = list.selectionModel.getSelection().length;

        this.getReference('selectAllLists').set({
            checked      : count > 0 && checked === count,
            indeterminate: checked > 0 && checked < count
        })
    }

    onSelectAllLists(checked) {
        let model = this.getReference('taskListList').selectionModel;

        checked ? model.select([...this.getReference('taskListList').store.items]) : model.deselectAll()
    }

    getTaskListMenu(record) {
        const manage = record.permissionLevel >= LEVEL_MANAGE;

        return [{
            text    : t('Edit') + '...',
            icon    : 'edit',
            disabled: !manage,
            handler : () => this.openTaskListDialog(record)
        }, {
            text    : t('Delete') + '...',
            icon    : 'delete',
            disabled: !manage,
            handler : () => this.destroyWithConfirm('TaskList', record)
        }, {
            separator: true
        }, {
            text   : t('Unsubscribe'),
            icon   : 'remove_circle',
            handler: () => client.set('TaskList', {update: {[record.id]: {isSubscribed: false}}})
                .then(() => this.reloadTaskLists(), e => this.showError(e))
        }]
    }

    openTaskListDialog(record) {
        this.createDialog(TaskListDialog, {entityId: record?.id || null})
        // the list reloads by itself (push of the TaskList change)
    }

    // --- west: categories ---

    /**
     * ExtJS filterCategories(): own and global categories, and those of the checked lists
     */
    loadCategories() {
        let ids        = this.getCheckedListIds(),
            conditions = [{ownerId: client.user.id}, {global: true}];

        ids.length && conditions.push({tasklistId: ids});

        this.getReference('categoryList').store.setFilter({scope: {operator: 'OR', conditions}}).catch(() => {})
    }

    onCategoriesLoad() {
        let me      = this,
            catList = me.getReference('categoryList');

        if (me.isDestroyed) {
            return
        }

        categories.put(catList.store.items);

        // a checked category was deleted or is no longer offered
        if (!me.restoring && !me.sameIds(catList.getCheckedIds(), me.getReference('grid').store.jmapFilter.categories)) {
            me.onCategorySelectionChange()
        }
    }

    /**
     * @param {String[]} ids
     * @param {Array|undefined} filterIds
     * @returns {Boolean}
     */
    sameIds(ids, filterIds) {
        return [...ids].sort().join(',') === (filterIds || []).map(String).sort().join(',')
    }

    onCategorySelectionChange() {
        if (this.restoring) {
            return
        }

        const ids = this.getReference('categoryList').getCheckedIds();

        this.setTaskFilter({categories: ids.length ? ids : undefined});
        this.reloadTasks()
    }

    getCategoryMenu(record) {
        // personal categories are the owner's, global and list categories need the module right
        const mayChange = String(record.ownerId) === String(client.user.id) || hasRight('mayChangeCategories');

        return [{
            text    : t('Edit'),
            icon    : 'edit',
            disabled: !mayChange,
            handler : () => this.openCategoryDialog(record)
        }, {
            text    : t('Delete'),
            icon    : 'delete',
            disabled: !mayChange,
            handler : () => this.destroyWithConfirm('TaskCategory', record)
        }]
    }

    openCategoryDialog(record) {
        this.createDialog(CategoryDialog, {entityId: record?.id || null})
    }

    async destroyWithConfirm(entity, record) {
        let me = this;

        const confirmed = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : fmt(t("Are you sure you want to delete '{item}'?"), {item: record.name})
        });

        if (!confirmed || me.isDestroyed) {
            return
        }

        try {
            await client.set(entity, {destroy: [record.id]})
        } catch (e) {
            me.showError(e)
        }
    }

    onSavedFilterChange(filter) {
        this.getReference('grid').store.setFilter({savedFilter: filter}).catch(() => {})
    }

    // --- center ---

    onSearch(text) {
        this.getReference('grid').store.setFilter({text: text || undefined}).catch(() => {})
    }

    onTaskSelectionChange({records}) {
        // more rows selected: the detail keeps its task, MultiSelectToolbar has the actions
        if (records.length > 1) {
            return
        }

        let me   = this,
            task = records[0] || null;

        task && (me.pendingTaskId = null);
        task && me.activatePanel('east');
        me.showInDetail(task);

        task && me.moduleName && Neo.Main.setRoute({value: `${me.moduleName}/task/${task.id}`, windowId: me.windowId})
    }

    /**
     * Names of responsible users, creators, lists and categories of these tasks
     * @param {Object[]} tasks
     * @returns {Promise<Boolean>} something new was loaded
     */
    async fetchNames(tasks) {
        const results = await Promise.allSettled([
            principals.fetch(tasks.flatMap(task => [task.responsibleUserId, task.createdBy, task.modifiedBy])),
            taskLists.fetch(tasks.map(task => task.tasklistId)),
            categories.fetch(tasks.flatMap(task => task.categories || []))
        ]);

        return results.some(result => result.status === 'fulfilled' && result.value)
    }

    /**
     * Names for the grid's columns, then the rows render again
     */
    async loadNames() {
        let me   = this,
            grid = me.getReference('grid');

        if (grid && await me.fetchNames(grid.store.items) && !me.isDestroyed && !grid.isDestroyed) {
            grid.body?.createViewData();
            // the detail shows the same names
            me.getReference('detail').renderTask()
        }
    }

    onTasksLoad() {
        if (this.isDestroyed || !this.getReference('grid')) {
            return
        }

        let me     = this,
            store  = me.getReference('grid').store,
            detail = me.getReference('detail'),
            id     = me.pendingTaskId || detail.task?.id;

        me.updateTaskCount();
        me.pendingTaskId = null;

        if (!id) {
            return
        }

        const record = store.get(id);

        if (record) {
            selectRow(me.getReference('grid'), id);
            me.showInDetail(record)
        } else {
            // deleted elsewhere or filtered out
            me.fetchIntoDetail(id)
        }
    }

    updateTaskCount() {
        const total = this.getReference('grid').store.totalCount || 0;
        this.getReference('tableTitle').subtitle = `${total} ${total === 1 ? t('task') : t('tasks')}`
    }

    /**
     * GOUI checkboxcolumn "complete": completed ↔ needs action
     * @param {Object} task
     */
    async toggleComplete(task) {
        let me = this;

        if (task.permissionLevel < LEVEL_WRITE) {
            return
        }

        try {
            await client.set('Task', {update: {[task.id]: {progress: task.progress === 'completed' ? 'needs-action' : 'completed'}}})
        } catch (e) {
            me.showError(e)
        }
    }

    onNew() {
        this.openDialog(null)
    }

    /**
     * Header "+" menu (GO.view.MainView)
     */
    async onQuickAdd() {
        await this.initialLoad;
        this.isDestroyed || this.onNew()
    }

    /**
     * @param {String|null} id task to edit, null for a new one
     */
    openDialog(id) {
        let me       = this,
            checked  = me.getCheckedListIds(),
            settings = me.tasksSettings || {},
            values   = {
                // GOUI / server defaults, shown in the combos
                progress       : 'needs-action',
                priority       : 0,
                percentComplete: 0,
                tasklistId: checked[0] || settings.defaultTasklistId || me.getReference('taskListList').store.items[0]?.id || null
            };

        // "Set today for start and due date when creating new tasks"
        if (settings.defaultDate) {
            const today = new Date(),
                  ymd   = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

            values.start = values.due = ymd
        }

        const dialog = me.createDialog(TaskDialog, id ? {entityId: id} : {values});

        dialog?.on('save', ({data}) => {
            if (me.isDestroyed) {
                return
            }

            me.pendingTaskId = data.id;
            me.reloadTasks()
        })
    }

    openContinueDialog(task) {
        this.createDialog(ContinueTaskDialog, {entityId: task.id})
    }

    /**
     * MultiSelectToolbar: GOUI merge (the first selected task is kept)
     */
    async onMergeSelected() {
        let me    = this,
            grid  = me.getReference('grid'),
            tasks = grid.getSelectedRecords();

        if (tasks.length < 2) {
            return
        }

        const confirmed = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : t('The selected items will be merged into one. The item you selected first will be used primarily. Are you sure?')
        });

        if (!confirmed || me.isDestroyed) {
            return
        }

        try {
            const response = await client.call('Task/merge', {ids: tasks.map(task => task.id)});

            grid.view.selectionModel.clear();
            response?.id && me.openDialog(response.id)
        } catch (e) {
            me.showError(e)
        }
    }

    onDeleteSelected() {
        this.deleteTasks(this.getReference('grid').getSelectedRecords())
    }

    /**
     * @param {Object[]} tasks the ones the user may delete are deleted
     */
    async deleteTasks(tasks) {
        let me = this;

        tasks = tasks.filter(task => task.permissionLevel >= LEVEL_DELETE);

        if (!tasks.length) {
            return
        }

        const confirmed = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : tasks.length === 1
                ? fmt(t("Are you sure you want to delete '{item}'?"), {item: tasks[0].title})
                : fmt(t('Are you sure you want to delete the {count} items?'), {count: tasks.length})
        });

        if (!confirmed || me.isDestroyed) {
            return
        }

        try {
            await client.set('Task', {destroy: tasks.map(task => task.id)});
            me.getReference('grid').view.selectionModel.clear();
            me.showInDetail(null)
            // the grid reloads on the push
        } catch (e) {
            me.showError(e)
        }
    }

    showError(error) {
        notifyError(this, error)
    }
}

export default Neo.setupClass(TasksMain);
