import EntityListPanel      from './EntityListPanel.mjs';
import Button               from '../button/Button.mjs';
import client               from '../jmap/Client.mjs';
import {decodeEntities, formatUserDateTime} from '../Format.mjs';
import {notifyError}        from '../Notify.mjs';
import {fmt, t}             from '../Translate.mjs';
import ConfirmDialog        from '../view/ConfirmDialog.mjs';

// ids of CronJobSchedule rows in core/cron/store
const SCHEDULE_PREFIX = 'new:';

/**
 * A run time of core/cron/store: the legacy jobs send it formatted in the user's format,
 * the CronJobSchedule rows ("new:<id>") a unix timestamp or "-"
 * @param {String|Number|null} value
 * @returns {String}
 */
export function runTime(value) {
    if (typeof value === 'number') {
        return value > 0 ? formatUserDateTime(value * 1000) : ''
    }

    return !value || value === '-' ? '' : String(value)
}

/**
 * The "Enabled" column: the store sends 1/0 (true/false for schedules), or "Error" / "Running"
 * @param {Object} record
 * @returns {String}
 */
function activeText(record) {
    const active = record.active;

    if (typeof active === 'string' && !/^[01]$/.test(active)) {
        return active
    }

    return active === true || active === 1 || active === '1' ? t('Yes') : t('No')
}

/**
 * System task scheduler card of System settings (go.cron.SystemSettingsCronGrid): the jobs of
 * the legacy core/cron controller (GO\Base\Cron\CronJob) together with the CronJobSchedule
 * entities that modules register. A legacy job is created, edited and deleted here
 * (CronJobDialog); a schedule can only be changed: its description, expression and whether it runs.
 */
class CronPanel extends EntityListPanel {
    static config = {
        className: 'GO.systemsettings.CronPanel',
        addText  : t('Add'),
        columns  : [
            {text: t('Enabled'), field: 'active', render: activeText},
            {text: t('System task scheduler'), field: 'name', flex: true, cls: ['go-cron-wrap']},
            {text: t('Expression'), field: 'expression'},
            {text: t('Next run'), field: 'nextrun', render: record => runTime(record.nextrun)},
            {text: t('Last run'), field: 'lastrun', render: record => runTime(record.lastrun)},
            {text: t('Completed at'), field: 'completedat', render: record => runTime(record.completedat)},
            {text: t('Error'), field: 'error', vdom: record => record.error ? [{
                tag  : 'span',
                title: String(record.error),
                text : String(record.error).length > 20 ? String(record.error).substring(0, 20) + '…' : String(record.error)
            }] : []},
            {text: t('Job'), field: 'job', cls: ['go-cron-wrap', 'go-cron-job']}
        ]
    }

    createHeaderItems() {
        // "The main cron job doesn't appear to be running" of the store
        return [{
            ntype    : 'component',
            tag      : 'p',
            reference: 'feedback',
            cls      : ['go-systemsettings-text', 'go-cron-feedback'],
            flex     : 'none',
            hidden   : true
        }]
    }

    createToolbarItems() {
        // a job's run times and errors change while the card is open
        return [{
            module : Button,
            icon   : 'refresh',
            text   : t('Refresh'),
            handler: () => this.load()
        }]
    }

    async load() {
        let me = this;

        try {
            me.applyStore(await client.legacy('core/cron/store'))
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * @param {Object} response core/cron/store
     */
    applyStore({results = [], feedback}) {
        let me = this;

        if (me.isDestroyed) {
            return
        }

        const note = me.getReference('feedback');
        note.text   = feedback || '';
        note.hidden = !feedback;

        // the legacy store sends its text attributes HTML encoded, the schedule rows don't
        const records = results.map(r => CronPanel.isSchedule(r) ? r : {
            ...r,
            name : decodeEntities(r.name),
            error: r.error ? decodeEntities(r.error) : r.error,
            job  : decodeEntities(r.job)
        });

        me.getReference('table').records = records.sort((a, b) => String(a.name).localeCompare(String(b.name)))
    }

    /**
     * @param {Object} record
     * @returns {Boolean}
     */
    static isSchedule(record) {
        return String(record.id).startsWith(SCHEDULE_PREFIX)
    }

    mayDelete(record) {
        // a CronJobSchedule belongs to its module, which registers it again
        return !CronPanel.isSchedule(record)
    }

    async edit(id) {
        let me = this;

        try {
            let dialog;

            if (id !== null && String(id).startsWith(SCHEDULE_PREFIX)) {
                const {default: CronScheduleDialog} = await import('./CronScheduleDialog.mjs');
                dialog = Neo.create(CronScheduleDialog, {appName: me.appName, windowId: me.windowId, entityId: String(id).substring(SCHEDULE_PREFIX.length)})
            } else {
                const {default: CronJobDialog} = await import('./CronJobDialog.mjs');
                dialog = await CronJobDialog.open({appName: me.appName, windowId: me.windowId, id})
            }

            me.isDestroyed || dialog.on('save', () => me.load())
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    async remove(record) {
        let me = this;

        const yes = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Confirm delete'),
            message : fmt(t("Are you sure you want to delete '{item}'?"), {item: record.name})
        });

        if (!yes || me.isDestroyed) {
            return
        }

        try {
            // GO.grid.GridPanel deleteSelected(): delete_keys on the store, which answers with the rows left
            const response = await client.legacy('core/cron/store', {delete_keys: JSON.stringify([record.id])});

            if (response.deleteSuccess === false) {
                throw new Error(String(response.deleteFeedback || t('Error')).replace(/<br\s*\/?>/gi, ' ').trim())
            }

            me.applyStore(response)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }
}

export default Neo.setupClass(CronPanel);
