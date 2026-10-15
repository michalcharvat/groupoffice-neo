/**
 * Calendar module state in the App worker (GOUI Index.ts stores): the user's calendar
 * preferences, module rights, the subscribed calendars, categories and views.
 * Reloads by itself when the server pushes a change (SSE) and fires 'change'.
 *
 *     await calendarData.init();
 *     calendarData.calendars, calendarData.getCalendar(id), calendarData.prefs
 *     const off = calendarData.on('change', ({type}) => …); // 'calendars' | 'categories' | 'views' | 'user'
 */
import client       from '../../../../../../views/neo/src/jmap/Client.mjs';
import {dateSettings} from './util/date.mjs';

const CALENDAR_PROPERTIES = ['id', 'name', 'description', 'color', 'sortOrder', 'isSubscribed', 'isVisible', 'includeInAvailability',
    'timeZone', 'syncToDevice', 'defaultAlertsWithTime', 'defaultAlertsWithoutTime', 'ownerId', 'createdBy', 'webcalUri',
    'groupId', 'publishKey', 'myRights', 'davaccountId'];

export const USER_CALENDAR_PROPERTIES = ['id', 'calendarPreferences', 'timezone', 'firstWeekday', 'holidayset', 'email',
    'emailAliases', 'language', 'isAdmin', 'timeFormat', 'dateFormat'];

class CalendarData {
    /** @member {Object[]} calendars subscribed calendars (not of DAV accounts), sorted like GOUI */
    calendars = []
    /** @member {Object[]} categories */
    categories = []
    /** @member {Object[]} views CalendarView entities */
    views = []
    /** @member {Object[]} resourceGroups */
    resourceGroups = []
    /** @member {Object} user the logged-in User with USER_CALENDAR_PROPERTIES */
    user = {}
    /** @member {Map<String, Object>} principals by id (calendar owners: emailAliases) */
    principals = new Map()

    #listeners = new Set()
    #initPromise = null
    #userId = null

    /**
     * @returns {Object} User.calendarPreferences
     */
    get prefs() {
        return this.user.calendarPreferences || (this.user.calendarPreferences = {})
    }

    /**
     * Module rights (Module.php: mayChangeCalendars, mayChangeCategories, mayChangeResources, mayChangeViews,
     * mayChangeOrganizer)
     * @returns {Object}
     */
    get rights() {
        return client.session?.capabilities?.['go:community:calendar'] || {}
    }

    on(event, fn) {
        const listener = {event, fn};
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener)
    }

    fire(event, data) {
        this.#listeners.forEach(l => l.event === event && l.fn(data))
    }

    /**
     * Loads everything once per login
     * @returns {Promise<void>}
     */
    init() {
        let me = this;

        if (me.#initPromise && me.#userId === client.user?.id) {
            return me.#initPromise
        }

        me.#userId = client.user?.id;

        if (!me.listening) {
            me.listening = true;
            client.watch(['Calendar', 'CalendarCategory', 'CalendarView', 'ResourceGroup', 'User']);
            client.on('stateChange', ({changed}) => me.onStateChange(changed));
            client.on('logout', () => me.#initPromise = null)
        }

        me.#initPromise = Promise.all([me.loadUser(), me.loadCalendars(), me.loadCategories(), me.loadViews()])
            .catch(e => {
                me.#initPromise = null;
                throw e
            });

        return me.#initPromise
    }

    onStateChange(changed) {
        let me = this;

        if (!me.#initPromise) {
            return
        }

        changed.includes('Calendar')         && me.loadCalendars().then(() => me.loadCategories()).catch(e => console.error(e));
        changed.includes('CalendarCategory') && me.loadCategories().catch(e => console.error(e));
        changed.includes('CalendarView')     && me.loadViews().catch(e => console.error(e));
        changed.includes('ResourceGroup')    && me.resourceGroups.length && me.loadResourceGroups().catch(e => console.error(e));
        changed.includes('User')             && me.loadUser().catch(e => console.error(e))
    }

    async loadUser() {
        const [user] = await client.get('User', [client.user.id], USER_CALENDAR_PROPERTIES);

        this.user = user || {};
        this.user.calendarPreferences ||= {};

        dateSettings.firstWeekday = Number(this.user.firstWeekday ?? 1);
        dateSettings.timezone     = this.user.timezone || null;
        dateSettings.timeFormat   = this.user.timeFormat || client.user.timeFormat || 'G:i';

        this.fire('change', {type: 'user'})
    }

    async loadCalendars() {
        let me = this;

        const {list} = await client.queryGet('Calendar', {
            filter    : {isSubscribed: true, davaccountId: null},
            sort      : [{property: 'groupId'}, {property: 'sortOrder'}, {property: 'name'}],
            properties: CALENDAR_PROPERTIES
        });

        // owners: their e-mail aliases tell which participant is "the calendar"
        const ownerIds = [...new Set(list.map(c => c.ownerId).filter(id => id && !me.principals.has(String(id))))].map(String);

        if (ownerIds.length) {
            try {
                (await client.get('Principal', ownerIds, ['id', 'name', 'email', 'emailAliases', 'avatarId'])).forEach(p => me.principals.set(String(p.id), p))
            } catch (e) {
                console.error(e)
            }
        }

        if (list.some(c => c.groupId) && !me.resourceGroups.length) {
            await me.loadResourceGroups().catch(e => console.error(e))
        }

        me.calendars = list.map(c => ({...c, id: String(c.id), owner: c.ownerId ? me.principals.get(String(c.ownerId)) || null : null}));
        me.fire('change', {type: 'calendars'})
    }

    async loadCategories() {
        const {list} = await client.queryGet('CalendarCategory', {sort: [{property: 'name'}]});

        this.categories = list.map(c => ({...c, id: String(c.id)}));
        this.fire('change', {type: 'categories'})
    }

    async loadViews() {
        const {list} = await client.queryGet('CalendarView', {sort: [{property: 'name'}]});

        this.views = list.map(v => ({...v, id: String(v.id)}));
        this.fire('change', {type: 'views'})
    }

    async loadResourceGroups() {
        const {list} = await client.queryGet('ResourceGroup', {sort: [{property: 'name'}]});

        this.resourceGroups = list.map(g => ({...g, id: String(g.id)}));
        this.fire('change', {type: 'resourceGroups'})
    }

    /**
     * @param {String|Number} id
     * @returns {Object|undefined}
     */
    getCalendar(id) {
        return id == null ? undefined : this.calendars.find(c => c.id === String(id))
    }

    getCategory(id) {
        return this.categories.find(c => c.id === String(id))
    }

    /**
     * Calendars new events may go into (GOUI writeableCalendarStore: permission writeOwn)
     * @returns {Object[]}
     */
    get writableCalendars() {
        return this.calendars.filter(c => c.myRights?.mayWriteOwn)
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name))
    }

    /**
     * Saves calendar preferences (User.calendarPreferences, patched)
     * @param {Object} prefs
     */
    async savePrefs(prefs) {
        Object.assign(this.prefs, prefs);
        await client.set('User', {update: {[client.user.id]: {calendarPreferences: prefs}}})
    }
}

export default new CalendarData();
