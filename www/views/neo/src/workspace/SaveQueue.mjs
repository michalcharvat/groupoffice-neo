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
 * - yes: re-read it and apply only what this window changed (against the copy it edited) to the
 *   server copy: panels it added, changed or closed; the layout of its profile only when it changed
 *   that layout (then last write wins). `onMerged` tells the window to show the merged result.
 * A save that fails for another reason (network) stays queued for the next flush.
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
     * @param {Function} [options.onMerged] (workspaceId) a save was merged with another window's
     */
    constructor({onError, onDestroyed, onMerged} = {}) {
        this.onError     = onError;
        this.onDestroyed = onDestroyed;
        this.onMerged    = onMerged;
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
        me.pending = {...change, timer: setTimeout(() => me.flush(), DELAY)};
        // what the change was made against: a conflict applies only the difference (resolveConflict())
        me.pending.origin = me.origin(change)
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

        me.running = me.running.then(() => me.send(change)).catch(e => {
            // a network failure: kept for the next flush, unless a newer change of the same target waits
            if (!e.setError && e.type !== 'notFound' && !me.pending) {
                me.pending = {...change, timer: null}
            }
            me.onError?.(e)
        });

        return me.running
    }

    /**
     * @param {Object} change
     * @returns {Object} {panels, layoutChanged} against the server copy the window edited
     * @protected
     */
    origin(change) {
        const base = this.base[change.workspaceId] || {panels: {}, layouts: {}};

        return {
            panels       : clone(base.panels || {}),
            layoutChanged: !equal(change.layout, base.layouts?.[change.profile])
        }
    }

    /**
     * @param {Object} change
     * @param {Number} [attempt=0]
     * @protected
     */
    async send(change, attempt = 0) {
        let me     = this,
            base   = me.base[change.workspaceId] || {panels: {}, layouts: {}},
            origin = change.origin ||= me.origin(change),
            patch  = {};

        if (!equal(change.panels, base.panels)) {
            patch.panels = change.panels
        }

        // a layout the window didn't change is not written back over another window's
        if (origin.layoutChanged && !equal(change.layout, base.layouts?.[change.profile])) {
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

                throw Object.assign(new Error(client.constructor.describeSetError?.(error) || error.type), {setError: error})
            }

            me.state = response.newState;
            me.base[change.workspaceId] = clone({
                panels : change.panels,
                layouts: patch['layouts/' + change.profile] ? {...base.layouts, [change.profile]: change.layout} : base.layouts
            });

            change.merged && me.onMerged?.(change.workspaceId)
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

        const origin = change.origin || me.origin(change),
              theirs = Array.isArray(remote.panels) ? {} : remote.panels || {};

        change.panels = mergePanels(origin.panels, change.panels, theirs);
        // our layout refers only to panels that are left
        change.layout = dropItems(change.layout, change.panels);
        change.merged = true;
        me.base[id] = clone({panels: theirs, layouts: Array.isArray(remote.layouts) ? {} : remote.layouts || {}})
    }
}

/**
 * Applies our panel changes (origin → ours) to theirs: panels we added or changed are ours, panels
 * we closed go, all others are theirs (their route changes, additions and removals stay)
 * @param {Object} origin the panels our change was made against
 * @param {Object} ours
 * @param {Object} theirs
 * @returns {Object}
 */
export function mergePanels(origin, ours, theirs) {
    const result = {...theirs};

    // their panels we closed
    Object.keys(origin).forEach(id => {
        id in ours || delete result[id]
    });

    Object.entries(ours).forEach(([id, panel]) => {
        if (equal(panel, origin[id])) {
            return
        }

        // one module in one panel: the one we opened wins
        Object.entries(result).forEach(([other, theirPanel]) => {
            other !== id && theirPanel.module === panel.module && delete result[other]
        });

        result[id] = panel
    });

    return result
}

/**
 * A dock document without the items whose panel is gone (a tab group may end up empty: the dock
 * prunes it on its next change)
 * @param {Object} doc
 * @param {Object} panels
 * @returns {Object}
 */
export function dropItems(doc, panels) {
    if (!doc?.items) {
        return doc
    }

    const result = clone(doc);

    Object.keys(result.items).forEach(id => {
        if (id in panels) {
            return
        }

        delete result.items[id];

        Object.values(result.nodes || {}).forEach(node => {
            if (node.type === 'tabs' && node.items.includes(id)) {
                node.items = node.items.filter(item => item !== id);
                node.activeItemId === id && (node.activeItemId = node.items[0] ?? null)
            }
        })
    });

    return result
}

export default SaveQueue;
