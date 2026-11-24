import client from '../jmap/Client.mjs';

const DELAY = 1500;

/**
 * Stable JSON for comparisons (object keys sorted)
 * @param {*} value
 * @returns {String}
 */
export function stableJson(value) {
    return JSON.stringify(value, (key, v) => v && typeof v === 'object' && !Array.isArray(v) ?
        Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v)
}

const clone = value => JSON.parse(JSON.stringify(value));

const equal = (a, b) => stableJson(a ?? null) === stableJson(b ?? null);

/**
 * The write queue of one window (docs/neo-workspace.md, "Saving and conflicts").
 *
 * Every save is bound to the workspace id and profile the change was made in. A change for another
 * workspace or profile sends the pending one to its own target first, never to the new one.
 * Writes carry ifInState and only the changed properties: `panels` and the one `layouts/<profile>`.
 *
 * ifInState compares the state of the Workspace type, which every user's saves move. On a
 * stateMismatch the queue asks Workspace/changes whether this workspace changed:
 * - no: retry with the new state;
 * - yes: re-read it. Panels merge (our additions and removals applied to theirs); the layout of
 *   our profile is ours (last write wins), the other window reloads it after the push
 *   (GO.view.Workspace onRemoteChange()).
 */
class SaveQueue {
    /**
     * Last known server copy per workspace id: {panels, layouts}
     * @member {Object} base={}
     */
    base = {}

    /**
     * {workspaceId, profile, panels, layout, timer}
     * @member {Object|null} pending=null
     */
    pending = null

    /**
     * State of the Workspace type this window last saw
     * @member {String|null} state=null
     */
    state = null

    /**
     * The flush in progress, saves run one after the other
     * @member {Promise} running
     */
    running = Promise.resolve()

    /**
     * @param {Object} options
     * @param {Function} [options.onError] (error) a save failed for another reason than a conflict
     * @param {Function} [options.onDestroyed] (workspaceId) the workspace was deleted meanwhile
     */
    constructor({onError, onDestroyed} = {}) {
        this.onError     = onError;
        this.onDestroyed = onDestroyed;
    }

    /**
     * Remembers the server copy of a workspace (after Workspace/get)
     * @param {Object} workspace {id, panels, layouts}
     * @param {String} [state] the Workspace state of the get response
     */
    setBase(workspace, state) {
        // a copy: the window changes its own panels in place
        this.base[workspace.id] = clone({panels: workspace.panels || {}, layouts: workspace.layouts || {}});
        state && (this.state = state)
    }

    /**
     * @param {String} workspaceId
     * @returns {Boolean} a save of this workspace waits or runs
     */
    isPending(workspaceId) {
        return this.pending?.workspaceId === workspaceId || this.inFlight === workspaceId
    }

    /**
     * Queues the current state of a workspace, sent after a quiet moment
     * @param {Object} change {workspaceId, profile, panels, layout}
     */
    schedule(change) {
        let me = this;

        if (me.pending && (me.pending.workspaceId !== change.workspaceId || me.pending.profile !== change.profile)) {
            me.flush()
        }

        clearTimeout(me.pending?.timer);
        me.pending = {...change, timer: setTimeout(() => me.flush(), DELAY)}
    }

    /**
     * Forgets the pending save (narrow profile, a reload of the workspace from the server)
     * @param {String} [workspaceId] only for this workspace
     */
    drop(workspaceId) {
        if (this.pending && (!workspaceId || this.pending.workspaceId === workspaceId)) {
            clearTimeout(this.pending.timer);
            this.pending = null
        }
    }

    /**
     * Sends the pending save now
     * @returns {Promise<void>}
     */
    flush() {
        let me     = this,
            change = me.pending;

        if (!change) {
            return me.running
        }

        clearTimeout(change.timer);
        me.pending = null;

        me.running = me.running.then(() => me.send(change)).catch(e => me.onError?.(e));

        return me.running
    }

    /**
     * @param {Object} change
     * @param {Number} [attempt=0]
     * @protected
     */
    async send(change, attempt = 0) {
        let me   = this,
            base = me.base[change.workspaceId] || {panels: {}, layouts: {}},
            patch = {};

        if (!equal(change.panels, base.panels)) {
            patch.panels = change.panels
        }

        if (!equal(change.layout, base.layouts[change.profile])) {
            patch['layouts/' + change.profile] = change.layout
        }

        if (!Object.keys(patch).length) {
            return
        }

        me.inFlight = change.workspaceId;

        try {
            const response = await client.call('Workspace/set', {
                ifInState: me.state || undefined,
                update   : {[change.workspaceId]: patch}
            });

            const error = response.notUpdated?.[change.workspaceId];

            if (error) {
                if (error.type === 'notFound') {
                    me.onDestroyed?.(change.workspaceId);
                    return
                }

                throw new Error(client.constructor.describeSetError?.(error) || error.type)
            }

            me.state = response.newState;
            me.base[change.workspaceId] = clone({
                panels : change.panels,
                layouts: {...base.layouts, [change.profile]: change.layout}
            })
        } catch (e) {
            if (e.type !== 'stateMismatch' || attempt > 4) {
                throw e
            }

            await me.resolveConflict(change);
            return me.send(change, attempt + 1)
        } finally {
            me.inFlight = null
        }
    }

    /**
     * After a stateMismatch: catches up with the server, merges the panels of our change
     * @param {Object} change
     * @protected
     */
    async resolveConflict(change) {
        let me   = this,
            id   = change.workspaceId,
            changed;

        try {
            const changes = await client.call('Workspace/changes', {sinceState: me.state});

            changed = [...changes.created || [], ...changes.updated || [], ...changes.destroyed || []].map(String).includes(String(id));
            me.state = changes.newState;

            if (changes.hasMoreChanges) {
                changed = true
            }
        } catch (e) {
            // cannotCalculateChanges: read the workspace
            changed = true
        }

        if (!changed) {
            return
        }

        const response = await client.call('Workspace/get', {ids: [id], properties: ['panels', 'layouts']}),
              remote   = response.list?.[0];

        if (!remote) {
            me.onDestroyed?.(id);
            throw Object.assign(new Error('Workspace deleted'), {type: 'notFound'})
        }

        me.state = response.state;

        const base = me.base[id] || {panels: {}, layouts: {}};

        change.panels = mergePanels(base.panels, change.panels, remote.panels || {});
        me.base[id] = clone({panels: remote.panels || {}, layouts: remote.layouts || {}})
    }
}

/**
 * Applies our panel changes (base → ours) to theirs: our panels stay (our layout refers to them,
 * last write wins), the ones we closed go, theirs that we don't know are added
 * @param {Object} base
 * @param {Object} ours
 * @param {Object} theirs
 * @returns {Object}
 */
export function mergePanels(base, ours, theirs) {
    const result  = {...theirs},
          modules = new Set(Object.values(ours).map(panel => panel.module));

    // their panels we closed
    Object.keys(base).forEach(id => {
        id in ours || delete result[id]
    });

    Object.entries(result).forEach(([id, panel]) => {
        // one module in one panel: ours wins
        !(id in ours) && modules.has(panel.module) && delete result[id]
    });

    // ours stay (our layout refers to them), changed or not
    return Object.assign(result, ours)
}

export default SaveQueue;
