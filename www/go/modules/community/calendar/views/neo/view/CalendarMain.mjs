import Container     from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar       from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../../../views/neo/src/button/Button.mjs';
import Splitter      from '../../../../../../../views/neo/src/component/Splitter.mjs';
import CheckBox      from '../../../../../../../views/neo/src/component/CheckBox.mjs';
import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import MenuList      from '../../../../../../../views/neo/src/menu/List.mjs';
import {notify, notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import {fmt, translator} from '../../../../../../../views/neo/src/Translate.mjs';
import ConfirmDialog from '../../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import MainThreeColumnPanel from '../../../../../../../views/neo/src/view/MainThreeColumnPanel.mjs';
import CalendarAdapter from '../CalendarAdapter.mjs';
import CalendarItem  from '../CalendarItem.mjs';
import calendarData  from '../data.mjs';
import {addDays, addMonths, diffDays, format, parseDate, startOfDay, weekStart, ymd} from '../util/date.mjs';
import CalendarView  from './CalendarView.mjs';
import CheckRows     from './CheckRows.mjs';
import ChoiceDialog  from './ChoiceDialog.mjs';
import ListView      from './ListView.mjs';
import MonthView     from './MonthView.mjs';
import SplitView     from './SplitView.mjs';
import WeekView      from './WeekView.mjs';
import YearView      from './YearView.mjs';

const t = translator('community', 'calendar');

/** timeSpan → [card index, index of the pressed view button (-1: none)] (GOUI updateView()) */
const SPANS = {
    day  : [0, 0],
    days : [0, -1],
    week : [0, 2],
    weeks: [1, -1],
    month: [1, 3],
    year : [2, 4],
    split: [3, 5],
    list : [4, 6]
};

/** View buttons: [icon, text, route] */
const VIEW_BUTTONS = () => [
    ['view_day', t('Day'), 'day'],
    ['view_week', t('5 Days'), 'days-5'],
    ['view_week', t('Week'), 'week'],
    ['view_module', t('Month'), 'month'],
    ['view_compact', t('Year'), 'year'],
    ['call_split', t('Split'), 'split-5'],
    ['list', t('List'), 'list']
];

/**
 * Calendar main panel (GOUI calendar Main.ts): the sidebar with the calendars, other
 * sources and categories, a toolbar with the period and the views, and the views as cards.
 *
 * Routes (below "#calendar/"): month|list|week|day|year/<Y-m-d>, days|weeks|split-<n>/<Y-m-d>,
 * event/<id>.
 */
class CalendarMain extends MainThreeColumnPanel {
    static config = {
        className: 'GO.calendar.CalendarMain',
        cls      : ['go-calendar'],
        stateName: 'calendar',
        /**
         * Route prefix, set by the shell (GO.view.MainView)
         * @member {String|null} moduleName=null
         */
        moduleName: null
    }

    /** @member {Date} date the shown date */
    date = startOfDay(new Date())
    /** @member {String} timeSpan */
    timeSpan = 'month'
    /** @member {Number|undefined} spanAmount */
    spanAmount = undefined
    /** @member {Object} visible calendar id → shown */
    visible = {}
    /** @member {Object} visibleChanges calendar id → shown, saved buffered */
    visibleChanges = {}
    /** @member {Object} categoryFilter category id → true */
    categoryFilter = {}
    /** @member {Set<GO.view.Dialog>} dialogs closed with the module */
    dialogs = new Set()
    /** @member {Boolean} initialized */
    initialized = false

    get adapter() {
        return this._adapter ??= new CalendarAdapter()
    }

    /**
     * west | splitter | center (MainThreeColumnPanel without the east panel)
     */
    createItems() {
        let me = this;

        const panel = (config, cls, width, minWidth) => ({
            ...config,
            cls     : [...(config.cls || []), ...[cls].flat()],
            flex    : width ? 'none' : 1,
            minWidth: `${minWidth / 10}rem`,
            ...(width ? {width: `${width / 10}rem`} : {})
        });

        me._items = [
            {...panel(me.createWest(), 'go-west', 274, 274), reference: 'west'},
            {module: Splitter, reference: 'westSplitter', stateId: `${me.stateName}-west-splitter`},
            panel(me.createCenter(), ['go-center', 'go-active'], 0, 300)
        ];

        Container.prototype.createItems.call(me)
    }

    createWest() {
        let me = this;

        return {
            ntype : 'container',
            cls   : ['go-scroll', 'go-cal-west'],
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Toolbar,
                flex  : 'none',
                cls   : ['go-cal-dense'],
                items : [{
                    module   : CheckBox,
                    reference: 'selectAllCalendars',
                    flex     : 'none',
                    listeners: {change: ({checked}) => me.selectCalendars(checked ? 'all' : 'none')}
                }, {
                    ntype: 'component',
                    tag  : 'h3',
                    text : t('Calendars')
                }, '->', {
                    module : Button,
                    icon   : 'home',
                    cls    : ['small'],
                    tooltip: t('Default calendar'),
                    handler: () => me.showDefaultCalendar()
                }, {
                    module   : Button,
                    icon     : 'more_vert',
                    cls      : ['small'],
                    reference: 'calendarMenuButton',
                    handler  : () => me.showCalendarsMenu()
                }, me.hideWestButton()]
            }, {
                module    : CheckRows,
                reference : 'calendarList',
                flex      : 'none',
                selectable: true,
                listeners : {
                    check           : ({id, checked}) => me.setCalendarVisible(id, checked),
                    select          : ({id}) => me.selectCalendar(id),
                    rowMenu         : ({id, target}) => me.showCalendarMenu(id, target),
                    checkContextMenu: ({id, target}) => me.showCalendarCheckMenu(id, target)
                }
            }, {
                module: Toolbar,
                flex  : 'none',
                cls   : ['go-cal-dense'],
                items : [{ntype: 'component', tag: 'h3', text: t('Other')}]
            }, {
                module   : CheckRows,
                reference: 'providerList',
                flex     : 'none',
                listeners: {check: ({id, checked}) => me.setProviderEnabled(id, checked)}
            }, {
                module: Toolbar,
                flex  : 'none',
                cls   : ['go-cal-dense'],
                items : [{ntype: 'component', tag: 'h3', text: t('Categories')}, '->', {
                    module   : Button,
                    icon     : 'add',
                    cls      : ['small'],
                    reference: 'addCategoryButton',
                    tooltip  : t('Create category'),
                    handler  : () => me.openCategoryDialog(null)
                }]
            }, {
                module   : CheckRows,
                reference: 'categoryList',
                flex     : 'none',
                listeners: {
                    check  : ({id, checked}) => me.setCategoryFilter(id, checked),
                    rowMenu: ({id, target}) => me.showCategoryMenu(id, target)
                }
            }]
        }
    }

    createCenter() {
        let me = this;

        return {
            ntype : 'container',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Toolbar,
                flex  : 'none',
                cls   : ['go-cal-toolbar'],
                items : [me.showWestButton(), {
                    module : Button,
                    icon   : 'add',
                    ui     : 'primary',
                    cls    : ['go-cal-not-phone'],
                    tooltip: t('New event'),
                    handler: () => me.onNew()
                }, {
                    module   : Button,
                    icon     : 'inbox',
                    reference: 'inboxButton',
                    cls      : ['go-cal-inbox'],
                    hidden   : true,
                    tooltip  : t('Invitations'),
                    handler  : () => me.showInvitations()
                }, {
                    ntype    : 'component',
                    tag      : 'h3',
                    reference: 'periodTitle',
                    cls      : ['go-cal-period-title'],
                    flex     : 'none',
                    text     : t('Today')
                }, {
                    ntype    : 'container',
                    reference: 'viewButtons',
                    cls      : ['go-cal-view-buttons', 'go-cal-not-phone'],
                    flex     : 'none',
                    layout   : {ntype: 'hbox'},
                    items    : VIEW_BUTTONS().map(([icon, text, route]) => ({
                        module : Button,
                        icon,
                        text,
                        handler: () => me.routeTo(route, me.date)
                    }))
                }, {
                    module : Button,
                    icon   : 'view_agenda',
                    cls    : ['go-cal-for-phone'],
                    menu   : VIEW_BUTTONS().map(([icon, text, route]) => ({text, icon, handler: () => me.routeTo(route, me.date)}))
                }, '->', {
                    module : Button,
                    icon   : 'keyboard_arrow_left',
                    tooltip: t('Previous'),
                    handler: () => me.forward(-1)
                }, {
                    module : Button,
                    icon   : 'today',
                    tooltip: t('Today'),
                    handler: () => me.routeTo(me.currentRouteSpan(), new Date())
                }, {
                    module : Button,
                    icon   : 'keyboard_arrow_right',
                    tooltip: t('Next'),
                    handler: () => me.forward(1)
                }, {
                    module   : Button,
                    icon     : 'more_vert',
                    reference: 'moreButton',
                    handler  : () => me.showMoreMenu()
                }]
            }, {
                ntype    : 'container',
                reference: 'cards',
                cls      : ['go-cal-cards'],
                flex     : 1,
                layout   : {ntype: 'card', activeIndex: 1},
                items    : [
                    {module: WeekView,  reference: 'weekView',  adapter: me.adapter, listeners: me.viewListeners()},
                    {module: MonthView, reference: 'monthView', adapter: me.adapter, listeners: me.viewListeners()},
                    {module: YearView,  reference: 'yearView',  adapter: me.adapter, listeners: me.viewListeners()},
                    {module: SplitView, reference: 'splitView', adapter: me.adapter, listeners: me.viewListeners()},
                    {
                        ntype    : 'container',
                        reference: 'listCard',
                        cls      : ['go-cal-list-container'],
                        layout   : {ntype: 'hbox', align: 'stretch'},
                        items    : [{module: ListView, reference: 'listView', flex: 1, adapter: me.adapter, listeners: {
                            ...me.viewListeners(),
                            selectItem: ({item}) => me.onListSelect(item)
                        }}]
                    }
                ]
            }]
        }
    }

    viewListeners() {
        return {
            dayClick  : ({day}) => this.routeTo('day', day),
            weekClick : ({day}) => this.routeTo('week', day),
            monthClick: ({day}) => this.routeTo('month', day)
        }
    }

    /**
     * The active view
     * @returns {GO.calendar.CalendarView}
     */
    get view() {
        const index = SPANS[this.timeSpan]?.[0] ?? 1;
        return [this.getReference('weekView'), this.getReference('monthView'), this.getReference('yearView'),
                this.getReference('splitView'), this.getReference('listView')][index]
    }

    onConstructed() {
        super.onConstructed();

        let me      = this,
            adapter = me.adapter;

        CalendarItem.ui = me.createUi();

        adapter.windowId = me.windowId;
        adapter.onLoad   = () => me.isDestroyed || me.view?.refresh();
        adapter.onError  = e => me.showError(e);

        me.removeDataListener = calendarData.on('change', ({type}) => me.onDataChange(type));

        me.initialLoad = me.init()
    }

    destroy(...args) {
        let me = this;

        me.removeDataListener?.();
        me._adapter?.destroy();
        clearTimeout(me.saveVisibleTimer);
        me.dialogs.forEach(dialog => dialog.isDestroyed || dialog.close());
        super.destroy(...args)
    }

    trackDialog(dialog) {
        this.dialogs.forEach(d => d.isDestroyed && this.dialogs.delete(d));
        this.dialogs.add(dialog);
        return dialog
    }

    async init() {
        let me = this;

        try {
            await calendarData.init()
        } catch (e) {
            me.showError(e);
            return
        }

        if (me.isDestroyed) {
            return
        }

        const prefs = calendarData.prefs;

        CalendarView.selectedCalendarId = prefs.defaultCalendarId ? String(prefs.defaultCalendarId) : null;

        me.getReference('cards').toggleCls('multiline', !!prefs.multiLine);
        me.getReference('addCategoryButton').hidden = false;

        Object.entries(me.adapter.providers).forEach(([type, p]) => {
            p.checkbox && (p.enabled = !!prefs[type + 'sAreVisible'])
        });

        me.renderProviders();
        me.renderCategories();
        me.onCalendarsLoaded();

        me.initialized = true;

        if (me.pendingRoute !== undefined) {
            me.route(me.pendingRoute)
        } else {
            me.route('')
        }
    }

    onDataChange(type) {
        let me = this;

        if (me.isDestroyed || !me.initialized) {
            return
        }

        switch (type) {
            case 'calendars':
                me.onCalendarsLoaded();
                break;
            case 'categories':
                me.renderCategories();
                me.view?.refresh();
                break;
            case 'user':
                me.getReference('cards').toggleCls('multiline', !!calendarData.prefs.multiLine);
                me.view?.refresh();
                break
        }
    }

    /**
     * Calendars (re)loaded: the list, the visible ones and the event filter
     */
    onCalendarsLoaded() {
        let me      = this,
            visible = {};

        calendarData.calendars.forEach(c => {
            visible[c.id] = c.id in me.visibleChanges ? me.visibleChanges[c.id] : !!c.isVisible
        });

        const before = me.visibleIds().join(',');
        me.visible = visible;

        if (!CalendarView.selectedCalendarId || !calendarData.getCalendar(CalendarView.selectedCalendarId)) {
            CalendarView.selectedCalendarId = calendarData.writableCalendars[0]?.id || null
        }

        me.renderCalendars();

        // a selected view filters by its own calendars
        if (!me.activeViewId && me.visibleIds().join(',') !== before) {
            me.applyCalendarFilter(me.visibleIds());
            me.initialized && me.updateView()
        } else if (me.initialized) {
            // names and colours
            me.view?.refresh()
        }
    }

    visibleIds() {
        return Object.keys(this.visible).filter(id => this.visible[id])
    }

    renderCalendars() {
        let me     = this,
            groups = Object.fromEntries(calendarData.resourceGroups.map(g => [g.id, g.name])),
            ids    = me.visibleIds();

        me.getReference('calendarList').rows = calendarData.calendars.map(c => ({
            id      : c.id,
            text    : c.name,
            color   : c.color,
            checked : !!me.visible[c.id],
            selected: c.id === CalendarView.selectedCalendarId,
            menu    : true,
            icon    : c.webcalUri ? 'web' : null,
            group   : c.groupId ? groups[c.groupId] || t('Resources') : null
        }));

        me.getReference('selectAllCalendars').set({
            checked      : ids.length > 0 && ids.length === calendarData.calendars.length,
            indeterminate: ids.length > 0 && ids.length < calendarData.calendars.length
        })
    }

    renderProviders() {
        this.getReference('providerList').rows = Object.entries(this.adapter.providers)
            .filter(([, p]) => p.checkbox)
            .map(([type, p]) => ({id: type, text: p.checkbox.label, color: p.checkbox.color, checked: !!p.enabled}))
    }

    renderCategories() {
        let me    = this,
            mayChange = !!calendarData.rights.mayChangeCategories;

        me.getReference('categoryList').rows = calendarData.categories.map(c => ({
            id     : c.id,
            text   : c.name,
            color  : c.color,
            checked: !!me.categoryFilter[c.id],
            menu   : mayChange || c.ownerId == client.user.id
        }))
    }

    applyCalendarFilter(ids) {
        this.adapter.byType('event').filter.inCalendars = ids
    }

    setCalendarVisible(id, visible) {
        let me = this;

        me.visible[id]        = visible;
        me.visibleChanges[id] = visible;
        me.activeViewId       = null;

        me.renderCalendars();
        me.applyCalendarFilter(me.visibleIds());
        me.updateView();
        me.saveVisibleChanges()
    }

    /**
     * @param {'all'|'none'|String} which 'all', 'none' or the only calendar to show
     */
    selectCalendars(which) {
        let me = this;

        calendarData.calendars.forEach(c => {
            const on = which === 'all' || c.id === which;
            me.visible[c.id] = on;
            me.visibleChanges[c.id] = on
        });

        me.activeViewId = null;
        me.renderCalendars();
        me.applyCalendarFilter(me.visibleIds());
        me.updateView();
        me.saveVisibleChanges()
    }

    /**
     * Calendar.isVisible is per user: saved 2 s after the last change (GOUI)
     */
    saveVisibleChanges() {
        let me = this;

        clearTimeout(me.saveVisibleTimer);

        me.saveVisibleTimer = setTimeout(() => {
            const update = {};

            Object.entries(me.visibleChanges).forEach(([id, isVisible]) => update[id] = {isVisible});
            me.visibleChanges = {};

            Object.keys(update).length && client.set('Calendar', {update}).catch(e => me.showError(e))
        }, 2000)
    }

    selectCalendar(id) {
        const calendar = calendarData.getCalendar(id);

        // new events go into the selected calendar when the user may write all its events
        if (calendar?.myRights?.mayWriteAll) {
            CalendarView.selectedCalendarId = id;
            this.renderCalendars()
        }
    }

    showDefaultCalendar() {
        const id = calendarData.prefs.defaultCalendarId;

        if (id && calendarData.getCalendar(id)) {
            CalendarView.selectedCalendarId = String(id);
            this.selectCalendars(String(id))
        }
    }

    setProviderEnabled(type, enabled) {
        let me = this;

        me.adapter.byType(type).enabled = enabled;
        calendarData.savePrefs({[type + 'sAreVisible']: enabled}).catch(e => me.showError(e));
        me.updateView()
    }

    setCategoryFilter(id, checked) {
        let me = this;

        checked ? (me.categoryFilter[id] = true) : delete me.categoryFilter[id];

        const ids = Object.keys(me.categoryFilter);
        me.adapter.byType('event').filter.inCategories = ids.length ? ids : undefined;
        me.updateView()
    }

    showMenu(items, target, align) {
        MenuList.showAt({appName: this.appName, windowId: this.windowId, target, align, items})
    }

    showCalendarCheckMenu(id, target) {
        this.showMenu([
            {text: t('Select all'), handler: () => this.selectCalendars('all')},
            {text: t('Select none'), handler: () => this.selectCalendars('none')},
            {text: t('Deselect others'), handler: () => this.selectCalendars(id)}
        ], target, {edgeAlign: 't0-t0'})
    }

    /**
     * Row menu of a calendar (GOUI CalendarList checkboxRenderer)
     */
    showCalendarMenu(id, target) {
        let me       = this,
            c        = calendarData.getCalendar(id),
            rights   = calendarData.rights;

        if (!c) {
            return
        }

        const items = [];

        c.davaccountId && items.push({text: t('Synchronize'), icon: 'sync', handler: () => me.syncCalendar(c)});
        c.webcalUri && items.push({text: t('Reload'), icon: 'sync', handler: () => me.reloadWebcal(c)});

        if (!c.davaccountId && !(c.groupId && !rights.mayChangeResources)) {
            items.push({text: t('Edit') + '…', icon: 'edit', disabled: !c.myRights?.mayReadItems, handler: () => me.openCalendarDialog(c)})
        }

        if (!c.davaccountId && rights.mayChangeCalendars) {
            items.push({text: t('Delete') + '…', icon: 'delete', disabled: !c.myRights?.mayAdmin, handler: () => me.deleteCalendar(c)})
        }

        String(id) !== String(calendarData.prefs.personalCalendarId) && items.push(
            {separator: true},
            {text: t('Unsubscribe'), icon: 'remove_circle', handler: () => client.set('Calendar', {update: {[id]: {isSubscribed: false}}}).catch(e => me.showError(e))}
        );

        if (!c.groupId) {
            items.push(
                {separator: true},
                {text: t('Export'), icon: 'file_save', handler: () => me.download('community/calendar/calendar/' + c.id)},
                {text: t('Import') + '…', icon: 'upload_file', handler: () => me.importIcs(c)}
            )
        }

        me.showMenu(items, target)
    }

    showCalendarsMenu() {
        let me     = this,
            rights = calendarData.rights,
            items  = [];

        rights.mayChangeCalendars && items.push({text: t('Create calendar') + '…', icon: 'add', handler: () => me.openCalendarDialog(null)});
        items.push({text: t('Subscribe to calendar') + '…', icon: 'bookmark_added', handler: () => me.openSubscribeDialog()});
        rights.mayChangeCalendars && items.push({text: t('Add calendar from link') + '…', icon: 'travel_explore', handler: () => me.openWebcalDialog()});

        rights.mayChangeViews && items.push(
            {separator: true},
            {text: t('Compose new view') + '…', icon: 'calendar_view_month', handler: () => me.openViewDialog(null)}
        );

        me.showMenu(items, me.getReference('calendarMenuButton').id)
    }

    showCategoryMenu(id, target) {
        let me  = this,
            cat = calendarData.getCategory(id),
            may = !!cat && (cat.ownerId == client.user.id || calendarData.rights.mayChangeCategories);

        me.showMenu([
            {text: t('Edit'), icon: 'edit', disabled: !may, handler: () => me.openCategoryDialog(cat)},
            {text: t('Delete'), icon: 'delete', disabled: !may, handler: () => me.confirmDestroy('CalendarCategory', cat.id, cat.name)}
        ], target)
    }

    showMoreMenu() {
        let me     = this,
            prefs  = calendarData.prefs,
            rights = calendarData.rights;

        const items = [{
            text : t('Print'),
            icon : 'print',
            items: [
                {text: t('Current view'), icon: 'print', handler: () => me.openPdf(me.timeSpan)},
                {text: t('List'), icon: 'view_list', handler: () => me.openPdf('list')},
                {text: t('Day'), icon: 'view_day', handler: () => me.openPdf('day')},
                {text: t('Workweek'), icon: 'view_week', handler: () => me.openPdf('days')},
                {text: t('Week'), icon: 'view_week', handler: () => me.openPdf('week')},
                {text: t('Month'), icon: 'view_module', handler: () => me.openPdf('month')}
            ]
        }];

        rights.mayChangeResources && items.push({text: t('Resources') + '…', icon: 'meeting_room', handler: () => me.openResourcesDialog()});

        items.push({
            text   : t('Show declined events'),
            icon   : prefs.showDeclined ? 'check_box' : 'check_box_outline_blank',
            handler: async () => {
                try {
                    await calendarData.savePrefs({showDeclined: !prefs.showDeclined});
                    me.view?.refresh()
                } catch (e) {
                    me.showError(e)
                }
            }
        });

        me.showMenu(items, me.getReference('moreButton').id)
    }

    /**
     * Print pages of the calendar module (Module.php pagePrint, pagePrintRange, pagePrintList)
     * @param {String} type
     */
    openPdf(type) {
        let me    = this,
            start = new Date(me.viewStart || me.date),
            path;

        if (type === 'list') {
            let end = new Date(start);

            switch (me.timeSpan) {
                case 'days':
                case 'weeks':
                case 'split': end = addDays(start, me.spanAmount); break;
                case 'week' : end = addDays(start, 7); break;
                case 'year' :
                    start = new Date(start.getFullYear(), 0, 1);
                    end   = new Date(start.getFullYear(), 11, 31);
                    break;
                default:
                    start = new Date(me.date.getFullYear(), me.date.getMonth(), 1);
                    end   = new Date(me.date.getFullYear(), me.date.getMonth() + 1, 0)
            }

            path = `community/calendar/printList/${ymd(start)}/${ymd(end)}`
        } else if (['day', 'month', 'list'].includes(type)) {
            path = `community/calendar/print/${type}/${ymd(me.date)}`
        } else if (type === 'week') {
            path = `community/calendar/printRange/week/7/${ymd(weekStart(start))}`
        } else {
            path = `community/calendar/printRange/${type}/${me.spanAmount || 5}/${ymd(start)}`
        }

        me.openUrl((client.session?.pageUrl || client.baseUrl + 'api/page.php') + '/' + path)
    }

    openUrl(url) {
        Neo.Main.windowOpen({url, windowName: '_blank', windowId: this.windowId})
    }

    /**
     * @param {String} blobId blob id or a module download path ("community/calendar/ics/5")
     * @param {String} [name]
     */
    download(blobId) {
        const url = (client.session?.downloadUrl || client.baseUrl + 'api/download.php?blob={blobId}').replace('{blobId}', blobId);
        this.openUrl(url)
    }

    /**
     * Called by the shell for "#calendar/<path>"
     * @param {String} path
     */
    route(path) {
        let me = this,
            m;

        if (!me.initialized) {
            me.pendingRoute = path;
            return
        }

        if ((m = path.match(/^(month|list|week|day|year)\/(\d{4}-\d{2}-\d{2})$/))) {
            me.date = parseDate(m[2]);
            me.setSpan(m[1], 0)
        } else if ((m = path.match(/^(days|weeks|split)-(\d+)\/(\d{4}-\d{2}-\d{2})$/))) {
            me.date = parseDate(m[3]);
            me.setSpan(m[1], Math.min(parseInt(m[2]), 373))
        } else if ((m = path.match(/^event\/(\d+)$/))) {
            me.openEventById(m[1]);
            me.timeSpan || me.startView()
        } else if (!me.started) {
            me.startView()
        }

        me.started = true
    }

    startView() {
        const [span, amount] = (calendarData.prefs.startView || 'month').split('-');
        this.setSpan(span, parseInt(amount || 0))
    }

    /**
     * @param {String} view e.g. 'month', 'days-5'
     * @param {Date} date
     */
    routeTo(view, date) {
        let me    = this,
            value = `${me.moduleName || 'calendar'}/${view}/${ymd(date)}`;

        me.date = startOfDay(date);
        Neo.Main.setRoute({value, windowId: me.windowId});

        // same hash: no hash change, show it anyway
        const [span, amount] = view.split('-');
        me.setSpan(span, parseInt(amount || 0))
    }

    currentRouteSpan() {
        return ['days', 'weeks', 'split'].includes(this.timeSpan) ? `${this.timeSpan}-${this.spanAmount}` : this.timeSpan
    }

    /**
     * Next / previous period (GOUI forward())
     * @param {Number} value 1 or -1
     */
    forward(value) {
        let me   = this,
            date = new Date(me.date);

        switch (me.timeSpan) {
            case 'day':
                date = addDays(date, value);
                break;
            case 'days':
            case 'weeks':
                date = addDays(date, value * (me.spanAmount === 5 ? 7 : me.spanAmount));
                break;
            case 'split':
            case 'week':
                date = addDays(date, value * 7);
                break;
            case 'month':
            case 'list':
                date = addMonths(new Date(date.getFullYear(), date.getMonth(), 1), value);
                break;
            case 'year':
                date = new Date(date.getFullYear() + value, 0, 1);
                break
        }

        me.routeTo(me.currentRouteSpan(), date)
    }

    /**
     * @param {String} span
     * @param {Number} amount
     */
    setSpan(span, amount) {
        let me = this;

        if (!SPANS[span]) {
            span = 'month'
        }

        const changed = me.timeSpan !== span || me.spanAmount !== amount || me.shownDate !== ymd(me.date);

        me.timeSpan   = span;
        me.spanAmount = amount || undefined;

        (changed || !me.shown) && me.updateView()
    }

    /**
     * Shows the period in the active view (GOUI updateView())
     */
    updateView() {
        let me    = this,
            [card, button] = SPANS[me.timeSpan],
            start = new Date(me.date),
            title = me.getReference('periodTitle'),
            end;

        if (!me.initialized) {
            return
        }

        me.shown     = true;
        me.shownDate = ymd(me.date);

        me.getReference('cards').layout.activeIndex = card;

        me.getReference('viewButtons').items.forEach((b, i) => {
            b.pressed = i === button || (me.timeSpan === 'days' && me.spanAmount === 5 && i === 1)
        });

        const monthTitle = d => ({html: `${format(d, 'F')} <em>${d.getFullYear()}</em>`});

        switch (me.timeSpan) {
            case 'year':
                me.spanAmount = undefined;
                title.text = String(start.getFullYear());
                break;
            case 'month':
            case 'list':
                me.spanAmount = undefined;
                title.html = monthTitle(start).html;
                break;
            case 'week':
                me.spanAmount = 7;
                start = weekStart(start);
                title.html = monthTitle(start).html;
                break;
            case 'split':
                start = weekStart(start);
                title.html = monthTitle(start).html;
                break;
            case 'weeks':
                start = weekStart(start);
                me.spanAmount = Math.ceil((me.spanAmount || 14) / 7) * 7;
                end = addDays(start, me.spanAmount - 1);
                title.text = 'W' + format(start, 'W') + ' - W' + format(end, 'W');
                break;
            case 'days':
                me.spanAmount ||= 5;
                // the work week starts on the first weekday
                me.spanAmount === 5 && (start = weekStart(start));
                end = addDays(start, me.spanAmount - 1);
                title.text = format(start, 'j M') + ' - ' + format(end, 'j M');
                break;
            case 'day':
                me.spanAmount = 1;
                title.text = format(start, 'j F');
                break
        }

        me.viewStart = start;
        me.viewEnd   = end || null;
        me.fire('periodChange', {start, end: end || start});

        me.view.goto(start, me.spanAmount)
    }

    onNew() {
        const start = new Date();
        start.setMinutes(0, 0, 0);
        CalendarView.newItem(start).save()
    }

    /**
     * Header "+" menu (GO.view.MainView)
     */
    async onQuickAdd() {
        await this.initialLoad;
        this.isDestroyed || this.onNew()
    }

    async openEventById(id) {
        let me = this;

        try {
            await me.initialLoad;
            const [event] = await client.get('CalendarEvent', [id]);
            event && new CalendarItem({key: String(event.id), data: event}).open()
        } catch (e) {
            me.showError(e)
        }
    }

    onListSelect(item) {
    }

    showInvitations() {
    }

    // Dialogs of later parts
    openCalendarDialog(calendar) {this.todo()}
    openCategoryDialog(category) {this.todo()}
    openViewDialog(view) {this.todo()}
    openSubscribeDialog() {this.todo()}
    openWebcalDialog() {this.todo()}
    openResourcesDialog() {this.todo()}
    importIcs(calendar) {this.todo()}
    syncCalendar(calendar) {this.todo()}
    reloadWebcal(calendar) {this.todo()}

    todo() {
        notify(this, 'Not available yet')
    }

    async confirmDestroy(entity, id, name) {
        let me = this;

        const ok = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : fmt(t("Are you sure you want to delete '{item}'?"), {item: name})
        });

        if (ok) {
            try {
                await client.set(entity, {destroy: [id]})
            } catch (e) {
                me.showError(e)
            }
        }
    }

    async deleteCalendar(calendar) {
        await this.confirmDestroy('Calendar', calendar.id, calendar.name)
    }

    /**
     * Dialogs and messages for CalendarItem
     * @returns {Object}
     */
    createUi() {
        let me    = this,
            masks = 0;

        const base = () => ({appName: me.appName, windowId: me.windowId});

        return {
            openEditor: async (item, opts) => me.openEditor(item, opts),
            openDetail: async item => me.openDetail(item),
            choose    : config => ChoiceDialog.ask({...base(), ...config}),
            confirm   : message => ConfirmDialog.ask({...base(), message}),
            error     : e => me.showError(e),
            mask      : () => {masks++ === 0 && (me.isLoading = t('Saving...'))},
            unmask    : () => {--masks <= 0 && (masks = 0, me.isLoading = false)},
            download  : blobId => me.download(blobId),
            mailTo    : to => me.openUrl('mailto:' + to),
            noWritableCalendar: () => me.noWritableCalendar()
        }
    }

    openEditor(item, opts) {
        this.todo();
        opts?.onCancel?.()
    }

    openDetail(item) {
        this.todo()
    }

    /**
     * No calendar to write in: subscribe to one or create the personal calendar
     * @returns {Promise<Object|null>} the new personal calendar
     */
    async noWritableCalendar() {
        let me = this;

        const choice = await ChoiceDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('No writeable calendars'),
            text    : t('There are no calendars to add an appointment.') + '<br>' + t('Subscribe to an existing calendar or create a personal calendar.'),
            buttons : [
                {text: t('Show calendars') + '...', value: 'subscribe'},
                {text: t('Create personal calendar'), value: 'create', primary: true}
            ]
        });

        if (choice === 'subscribe') {
            me.openSubscribeDialog();
            return null
        }

        if (choice === 'create') {
            try {
                const r = await client.call('Calendar/first', {});
                await calendarData.loadCalendars();
                return calendarData.getCalendar(r.calendarId) || r.calendar || null
            } catch (e) {
                me.showError(e)
            }
        }

        return null
    }

    showError(error) {
        notifyError(this, error)
    }
}

export default Neo.setupClass(CalendarMain);
