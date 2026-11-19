import client         from './jmap/Client.mjs';
import ModuleRegistry from './ModuleRegistry.mjs';

/**
 * Counts on the modules in the header: the module tab and its main menu item
 * (GO.mainLayout.setNotification(), e.g. open invitations of the calendar). They are
 * kept while the module is closed.
 *
 * A module counts by itself with a `badge` config in ModuleRegistry.register():
 *
 *     badge: {
 *         entities: ['CalendarEvent'],                            // counted again when they change (push)
 *         count   : () => client.call('CalendarEvent/countMine')  // Promise<Number>
 *     }
 *
 * or sets the count whenever it knows it (e.g. the unseen mails of a mail check):
 *
 *     badges.set('email', 3)
 *
 * One instance per App worker: every window's header listens with onChange().
 */
class Badges {
    /** module name → count (> 0) */
    #counts    = new Map()
    #listeners = new Set()
    /** client listeners while started */
    #off       = []
    /** user id the counts are loaded for */
    #userId    = null
    /** goes up with every stop(): counts of an earlier start() are dropped */
    #generation = 0
    /** module name → running count() and whether to count once more after it */
    #counting  = new Map()

    /**
     * Counts the badges of the modules the user has access to. Idempotent: every main
     * window calls it.
     */
    start() {
        let me = this;

        if (!client.user || me.#userId === client.user.id) {
            return
        }

        me.stop();
        me.#userId = client.user.id;

        const modules  = ModuleRegistry.getAvailable().filter(m => m.badge?.count),
              entities = [...new Set(modules.flatMap(m => m.badge.entities || []))];

        me.#off.push(
            client.on('stateChange', ({changed = []}) => modules.forEach(m =>
                m.badge.entities?.some(entity => changed.includes(entity)) && me.refresh(m.name))),
            client.on('logout', () => me.stop())
        );

        if (!entities.length) {
            modules.forEach(m => me.refresh(m.name));
            return
        }

        // Foo/get without ids gives the state the push compares with (Client #baseState()):
        // a change between the count and the first push would otherwise not be reported
        const generation = me.#generation;

        Promise.all(entities.map(entity => client.get(entity, []).catch(e => console.warn(`Badge state of ${entity}`, e))))
            .then(() => {
                if (me.#generation === generation) {
                    client.watch(entities);
                    modules.forEach(m => me.refresh(m.name))
                }
            })
    }

    stop() {
        let me = this;

        me.#off.forEach(off => off?.());
        me.#off    = [];
        me.#userId = null;
        me.#generation++;
        me.#counting.clear();
        [...me.#counts.keys()].forEach(name => me.set(name, 0))
    }

    /**
     * Counts the badge of a module again with its `badge.count()`. A call while it is
     * counting counts once more after it.
     * @param {String} name module name
     * @returns {Promise<void>}
     */
    async refresh(name) {
        let me      = this,
            module  = ModuleRegistry.get(name),
            running = me.#counting.get(name);

        if (!module?.badge?.count || !me.#userId) {
            return
        }

        if (running) {
            running.again = true;
            return running.promise
        }

        const generation = me.#generation,
              entry      = {again: false};

        // before count() runs: a count() that throws at once must not leave the entry behind
        me.#counting.set(name, entry);

        entry.promise = (async () => {
            try {
                do {
                    entry.again = false;

                    const count = await module.badge.count();

                    // stopped (logout, another user) meanwhile
                    if (me.#generation !== generation) {
                        return
                    }

                    me.set(name, count)
                } while (entry.again)
            } catch (e) {
                // counted again with the next change
                console.warn(`Badge of ${name}`, e)
            } finally {
                me.#counting.get(name) === entry && me.#counting.delete(name)
            }
        })();

        return entry.promise
    }

    /**
     * @param {String} name module name
     * @param {Number} count 0 hides the badge
     */
    set(name, count) {
        let me = this;

        count = Math.max(0, parseInt(count) || 0);

        if ((me.#counts.get(name) || 0) === count) {
            return
        }

        count ? me.#counts.set(name, count) : me.#counts.delete(name);
        me.#listeners.forEach(fn => {
            try {
                fn({name, count})
            } catch (e) {
                console.error('Badge listener', e)
            }
        })
    }

    /**
     * @param {String} name module name
     * @returns {Number} 0 without a badge
     */
    get(name) {
        return this.#counts.get(name) || 0
    }

    /**
     * Text of a badge: the count, "99+" above 99, '' without one
     * @param {String} name module name
     * @returns {String}
     */
    text(name) {
        const count = this.get(name);
        return count > 99 ? '99+' : count ? String(count) : ''
    }

    /**
     * @param {Function} fn called with {name, count} when a count changes
     * @returns {Function} removes the listener
     */
    onChange(fn) {
        this.#listeners.add(fn);
        return () => this.#listeners.delete(fn)
    }
}

export default new Badges();
