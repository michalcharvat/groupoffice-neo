/**
 * Collects the items of the shown period from providers (GOUI CalendarAdapter and the
 * providers Main.ts registers): events, holidays, tasks and birthdays.
 *
 *     adapter.onLoad = () => view.update();
 *     await adapter.goto(start, end);
 *     for (const item of adapter.items) { … }
 */
import client         from '../../../../../../views/neo/src/jmap/Client.mjs';
import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}   from '../../../../../../views/neo/src/Translate.mjs';
import CalendarItem   from './CalendarItem.mjs';
import calendarData   from './data.mjs';
import {addDays, parseDate, ymd} from './util/date.mjs';

const t = translator('community', 'calendar');

/**
 * Opens a record of another module through its route ("#tasks/task/5"), when that module
 * has a neo UI
 */
function openInModule(moduleName, entity, id, windowId) {
    const module = ModuleRegistry.get(moduleName),
          route  = module?.routes?.[entity]?.(id);

    route && Neo.Main.setRoute({value: `${moduleName}/${route}`, windowId})
}

export default class CalendarAdapter {
    /** @member {Object} providers type → provider */
    providers = {}
    /** @member {Function} onLoad called when the items changed */
    onLoad = () => {}
    /** @member {Function} onError */
    onError = e => console.error(e)
    /** @member {String|null} windowId for routes to other modules */
    windowId = null

    start = null
    end   = null
    #generation = 0

    constructor() {
        this.registerProviders();

        // events changed elsewhere (or by us): reload the period
        client.watch(['CalendarEvent']);
        this.removeStateListener = client.on('stateChange', ({changed}) => {
            if (!this.start) {
                return
            }

            const types = Object.entries(this.providers).filter(([, p]) => p.enabled && p.watch && changed.includes(p.watch)).map(([type]) => type);

            types.length && this.reload(types)
        })
    }

    destroy() {
        this.removeStateListener?.()
    }

    byType(type) {
        return this.providers[type]
    }

    registerProvider(type, provider) {
        this.providers[type] = provider
    }

    /**
     * Loads all enabled providers for the period, then onLoad()
     * @param {Date} start
     * @param {Date} end exclusive
     */
    async goto(start, end) {
        let me         = this,
            generation = ++me.#generation;

        me.start = start;
        me.end   = end;

        try {
            await Promise.all(Object.values(me.providers).filter(p => p.enabled).map(p => p.load(start, end)));
        } catch (e) {
            me.onError(e)
        }

        // a later goto() wins
        generation === me.#generation && me.onLoad()
    }

    /**
     * Reloads providers in the current period
     * @param {String[]} [types] all enabled when left out
     */
    async reload(types) {
        let me         = this,
            generation = me.#generation;

        if (!me.start) {
            return
        }

        try {
            await Promise.all(Object.entries(me.providers)
                .filter(([type, p]) => p.enabled && (!types || types.includes(type)))
                .map(([, p]) => p.load(me.start, me.end)))
        } catch (e) {
            me.onError(e)
        }

        generation === me.#generation && me.onLoad()
    }

    /**
     * Items of all enabled providers in the current period
     * @returns {Generator<CalendarItem>}
     */
    *generate() {
        for (const type in this.providers) {
            const p = this.providers[type];

            if (!p.enabled) {
                continue
            }

            for (const item of p.items(this.start, this.end)) {
                item.provider = type;
                yield item
            }
        }
    }

    get items() {
        return this.generate()
    }

    registerProviders() {
        let me    = this,
            prefs = () => calendarData.prefs;

        me.registerProvider('event', {
            enabled: true,
            watch  : 'CalendarEvent',
            list   : [],
            /**
             * Extra filter conditions: inCalendars, inCategories, savedFilter
             * @member {Object} filter
             */
            filter : {inCalendars: []},
            async load(start, end) {
                const {list} = await client.queryGet('CalendarEvent', {
                    filter: {
                        operator  : 'AND',
                        conditions: [
                            {after: ymd(start), before: ymd(end)},
                            ...Object.entries(this.filter).filter(([, v]) => v !== undefined).map(([k, v]) => k === 'savedFilter' ? v : {[k]: v})
                        ]
                    }
                });

                this.list = list
            },
            *items(start, end) {
                // personal calendar first: a merged (same uid) item favours the personal one
                const pId    = String(prefs().personalCalendarId || ''),
                      events = [...this.list].sort((a, b) => (String(b.calendarId) === pId ? 1 : 0) - (String(a.calendarId) === pId ? 1 : 0));

                for (const e of events) {
                    for (const item of CalendarItem.expand(e, start, end)) {
                        if (!item.isDeclined || prefs().showDeclined !== false) {
                            yield item
                        }
                    }
                }
            }
        });

        me.registerProvider('holiday', {
            enabled : !!prefs().holidaysAreVisible,
            checkbox: {color: '025d7b', label: t('Holidays')},
            list    : [],
            async load(start, end) {
                const user = calendarData.user,
                      set  = user.holidayset || user.language || client.user.language || 'en';

                let [lang, country] = set.split('_');
                country ||= lang;
                country === 'uk' && (country = 'gb');

                const response = await client.call('core/Holiday/fetch', {
                    set : country.toUpperCase(),
                    lang: set.replace('_', '-'),
                    from: ymd(start),
                    till: ymd(end)
                });

                this.list = response.list || []
            },
            *items() {
                for (const o of this.list) {
                    yield new CalendarItem({
                        key         : '',
                        start       : parseDate(o.start),
                        extraIcons  : ['family_star'],
                        defaultColor: '025d7b',
                        readOnly    : true,
                        data        : {
                            title          : o.title + (o.region ? ` (${o.region})` : ''),
                            duration       : o.duration || 'P1D',
                            showWithoutTime: true
                        },
                        cal: {name: t('Holidays'), myRights: {}}
                    })
                }
            }
        });

        if (client.hasCapability('go:community:tasks')) {
            me.registerProvider('task', {
                enabled : !!prefs().tasksAreVisible,
                checkbox: {color: '7e472a', label: t('Tasks')},
                watch   : 'Task',
                list    : [],
                async load(start, end) {
                    const range = ymd(start) + '..' + ymd(end),
                          {list} = await client.queryGet('Task', {
                              filter: {
                                  operator  : 'AND',
                                  conditions: [{showInCalendar: true}, {
                                      operator  : 'OR',
                                      conditions: [{start: null, due: null}, {start: range}, {due: range}, {progressUpdated: range}]
                                  }]
                              }
                          });

                    this.list = list
                },
                *items(from, until) {
                    const today = ymd(new Date());

                    for (const task of this.list) {
                        const date  = task.progress === 'completed' ? (task.progressUpdated || today) : (task.due || task.start || today),
                              start = parseDate(String(date).substring(0, 10));

                        if (!start || start < from || start >= until) {
                            continue
                        }

                        yield new CalendarItem({
                            key         : '-',
                            start,
                            readOnly    : true,
                            extraIcons  : [task.progress === 'completed' ? 'task_alt' : 'radio_button_unchecked'],
                            defaultColor: '7e472a',
                            data        : {...task, duration: 'P1D', showWithoutTime: true},
                            cal         : {name: t('Tasks'), myRights: {}},
                            open        : () => openInModule('tasks', 'Task', task.id, me.windowId)
                        })
                    }
                }
            })
        }

        if (client.hasCapability('go:community:addressbook')) {
            me.registerProvider('birthday', {
                enabled : !!prefs().birthdaysAreVisible,
                checkbox: {color: '009c63', label: t('Birthdays')},
                watch   : 'Contact',
                list    : [],
                async load(start, end) {
                    // the birthday filter's end date is inclusive
                    const {list} = await client.queryGet('Contact', {
                        filter    : {isOrganization: false, birthday: ymd(addDays(start, 1)) + '..' + ymd(end)},
                        properties: ['id', 'name', 'birthday']
                    });

                    this.list = list
                },
                *items(from, end) {
                    const sy = from.getFullYear(),
                          ey = end.getFullYear();

                    for (const b of this.list) {
                        const start = parseDate(b.birthday);

                        if (!start) {
                            continue
                        }

                        const born = start.getFullYear();
                        start.setFullYear(Number(b.birthday.split('-')[1]) < 7 ? ey : sy);

                        yield new CalendarItem({
                            key         : '',
                            start,
                            readOnly    : true,
                            extraIcons  : ['cake'],
                            defaultColor: '009c63',
                            data        : {
                                title          : t("{name}'s birthday").replace('{name}', b.name) + ` (${start.getFullYear() - born})`,
                                duration       : 'P1D',
                                showWithoutTime: true
                            },
                            cal : {name: t('Birthdays'), myRights: {}},
                            open: () => openInModule('addressbook', 'Contact', b.id, me.windowId)
                        })
                    }
                }
            })
        }
    }
}
