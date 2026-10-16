import client   from '../../../../../../views/neo/src/jmap/Client.mjs';
import {parseYmd} from '../../../../../../views/neo/src/DateUtil.mjs';
import {avatarHtml, escapeHtml, formatDate, userFormat} from '../../../../../../views/neo/src/Format.mjs';
import {translator} from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'tasks');

/**
 * GOUI ProgressType: JMAP value → English text (translated where shown)
 */
export const PROGRESS = {
    'needs-action': 'Needs action',
    'in-progress' : 'In progress',
    'completed'   : 'Completed',
    'failed'      : 'Failed',
    'cancelled'   : 'Cancelled'
};

/**
 * @returns {Object[]} [{id, name}] for a progress combo (GOUI ProgressCombo order)
 */
export const progressOptions = () => ['completed', 'failed', 'in-progress', 'needs-action', 'cancelled']
    .map(id => ({id, name: t(PROGRESS[id])}));

/**
 * @returns {Object[]} GOUI PriorityCombo: 1 high, 0 normal, 9 low
 */
export const priorityOptions = () => [{id: 9, name: t('Low')}, {id: 0, name: t('Normal')}, {id: 1, name: t('High')}];

/**
 * Status chip (GOUI "status tasks-status-<progress>")
 * @param {String} progress
 * @returns {String} HTML
 */
export const progressHtml = progress => progress
    ? `<span class="go-tasks-status go-tasks-status-${escapeHtml(progress)}">${escapeHtml(t(PROGRESS[progress] || progress))}</span>`
    : '';

/**
 * GOUI go-progressbar
 * @param {Number} percent
 * @returns {String} HTML
 */
export const progressBarHtml = percent =>
    `<div class="go-tasks-progressbar" title="${Math.round(percent || 0)}%"><div style="width:${Math.min(100, Math.ceil(percent || 0))}%"></div></div>`;

/**
 * Task dates are local "Y-m-d" (a time part, if any, is ignored)
 * @param {String|null} value
 * @returns {Date|null}
 */
export const toDate = value => value ? parseYmd(String(value).substring(0, 10)) : null;

/**
 * @param {String|null} value
 * @returns {String} in the user's date format
 */
export const formatTaskDate = value => {
    const date = toDate(value);
    return date ? formatDate(date, userFormat.dateFormat) : ''
};

/**
 * @param {Number|null} seconds
 * @returns {String} "h:mm"
 */
export const formatDuration = seconds => {
    if (!(seconds > 0)) {
        return ''
    }

    const minutes = Math.round(seconds / 60);
    return Math.floor(minutes / 60) + ':' + String(minutes % 60).padStart(2, '0')
};

/**
 * GOUI startDueRenderer: overdue red, started green
 * @param {Object} task
 * @returns {String|null} cell class
 */
export function dateState(task) {
    const today = new Date(),
          start = toDate(task.start),
          due   = toDate(task.due);

    today.setHours(0, 0, 0, 0);

    if (task.progress === 'completed') {
        return null
    }

    if (due && due < today) {
        return 'go-tasks-danger'
    }

    return start && start <= today ? 'go-tasks-success' : null
}

/**
 * Responsible user: avatar and name
 * @param {Object|null} principal {name}
 * @returns {String} HTML
 */
export const principalHtml = principal => principal?.name
    ? `<span class="go-tasks-principal">${avatarHtml(principal.name)}<span>${escapeHtml(principal.name)}</span></span>`
    : '';

/**
 * Id → entity cache for names shown in the grid and the detail (Principal, TaskList,
 * TaskCategory). fetch() loads the missing ones and tells whether anything was new.
 */
export class EntityCache {
    /**
     * @param {String} entity
     * @param {String[]} properties
     */
    constructor(entity, properties = ['id', 'name']) {
        this.entity     = entity;
        this.properties = properties;
        this.map        = new Map()
    }

    /**
     * @param {String|Number|null} id
     * @returns {Object|null}
     */
    get(id) {
        return id === null || id === undefined ? null : this.map.get(String(id)) || null
    }

    /**
     * @param {Object[]} records already loaded elsewhere (e.g. the lists of the west panel)
     */
    put(records) {
        records.forEach(record => this.map.set(String(record.id), record))
    }

    /**
     * @param {Array} ids
     * @returns {Promise<Boolean>} something was loaded
     */
    async fetch(ids) {
        const missing = [...new Set(ids.filter(id => id !== null && id !== undefined && id !== '').map(String))]
            .filter(id => !this.map.has(id));

        if (!missing.length) {
            return false
        }

        const list = await client.get(this.entity, missing, this.properties);

        list.forEach(record => this.map.set(String(record.id), record));
        // unknown or deleted: don't ask again
        missing.forEach(id => this.map.has(id) || this.map.set(id, null));
        return true
    }
}

/** Shared by the main view, the detail and the dialogs */
export const principals = new EntityCache('Principal', ['id', 'name', 'avatarId']),
             taskLists  = new EntityCache('TaskList', ['id', 'name', 'color', 'aclId']),
             categories = new EntityCache('TaskCategory', ['id', 'name']);

/**
 * Module rights (Module.php rights(): mayChangeTasklists, mayChangeCategories)
 * @param {String} right
 * @returns {Boolean}
 */
export const hasRight = right => !!client.session?.capabilities?.['go:community:tasks']?.[right];
