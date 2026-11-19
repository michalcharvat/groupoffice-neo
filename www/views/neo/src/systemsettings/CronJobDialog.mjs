import TextField        from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox     from '../form/field/BoolCheckBox.mjs';
import SelectField      from '../form/field/SelectField.mjs';
import {fieldset}       from '../form/fieldset.mjs';
import client           from '../jmap/Client.mjs';
import {decodeEntities} from '../Format.mjs';
import {t}              from '../Translate.mjs';
import LegacyFormWindow from '../view/LegacyFormWindow.mjs';

// the cron fields of the Time fieldset: [name, label]
const TIME_FIELDS = () => [
    ['minutes',   t('Minutes') + ' (0-59)'],
    ['hours',     t('Hours') + ' (0-23)'],
    ['monthdays', t('Month days') + ' (1-31)'],
    ['months',    t('Months') + ' (1-12)'],
    ['weekdays',  t('Week days') + ' (0-6)']
];

// the formats of a time field (the help tool of go.cron.CronDialog)
const FORMATS = () => [
    ['*',           t('(all)')],
    ['1',           t('(only the first)')],
    ['1-5',         t('(All between 1 and 5)')],
    ['0-23/2',      t('(Every 2nd between 0 and 23)')],
    ['1,2,3,13,22', t('(Only on the given numbers)')],
    ['0-4,8-12',    t('(Between 0 and 4 and between 8 and 12)')]
];

/**
 * A job of the legacy scheduler (go.cron.CronDialog, core/cron/update | create): name, job
 * class, the cron fields, enabled and run once, and the job's parameters (its public
 * properties, saved as JSON in `params`). A new job gets its parameter fields when it is
 * opened again after saving, as in ExtJS.
 *
 * The Users and Groups tabs of the ExtJS dialog are left out: they only apply to jobs whose
 * enableUserAndGroupSupport() is true, none of the 26.x jobs is, and their cron/cronUser and
 * cron/cronGroup controllers don't exist any more.
 *
 *     const dialog = await CronJobDialog.open({appName, windowId, id}) // id null: new
 */
class CronJobDialog extends LegacyFormWindow {
    static config = {
        className   : 'GO.systemsettings.CronJobDialog',
        title       : t('Job'),
        wrapperStyle: {height: 'min(720px, 90vh)', left: 'calc(50vw - 260px)', top: '5vh', width: 'min(520px, 100vw)'},
        /**
         * CronJob id, null for a new job
         * @member {Number|null} jobId=null
         */
        jobId: null,
        /**
         * Job classes [{value: class, text: label}] (core/cron/availableCronCollection)
         * @member {Object[]} jobs=[]
         */
        jobs: [],
        /**
         * The job's parameters {name: value} (paramsToSet of the load response)
         * @member {Object} params={}
         */
        params: {}
    }

    /**
     * Loads the job (when `id`) and the job classes, then shows the dialog
     * @param {Object} config appName, windowId, id
     * @returns {Promise<CronJobDialog>}
     */
    static async open({id=null, ...config}) {
        // load on GET: the update and create actions save on POST
        const [{data}, {results = []}] = await Promise.all([
            client.legacy(id ? 'core/cron/update' : 'core/cron/create', id ? {id} : {}, {method: 'GET'}),
            client.legacy('core/cron/availableCronCollection')
        ]);

        // paramsToSet is [] without parameters (a PHP array)
        const params = data.paramsToSet && !Array.isArray(data.paramsToSet) ? data.paramsToSet : {},
              values = {
                  name     : data.name || '',
                  job      : data.job || null,
                  active   : !!data.active,
                  runonce  : !!data.runonce,
                  ...Object.fromEntries(TIME_FIELDS().map(([name]) => [name, data[name] ?? '*'])),
                  param    : Object.fromEntries(Object.entries(params).map(([name, value]) => [name, value ?? '']))
              };

        return Neo.create(CronJobDialog, {
            ...config,
            jobId: id,
            jobs : results.map(job => ({value: job.class, text: job.name})),
            params,
            values
        })
    }

    createFormItems() {
        let me = this;

        const text = (name, labelText, config = {}) => ({module: TextField, name, labelText, labelPosition: 'inline', ...config});

        return [
            text('name', t('Name'), {required: true, maxLength: 100}),
            {module: SelectField, name: 'job', labelText: t('Job'), labelPosition: 'inline', required: true, options: me.jobs},
            fieldset(t('Time'), [
                ...TIME_FIELDS().map(([name, label]) => text(name, label, {required: true, maxLength: 100})),
                {
                    ntype: 'component',
                    cls  : ['go-cron-formats'],
                    flex : 'none',
                    vdom : {tag: 'div', cn: [
                        {tag: 'p', text: t('Please use one of these formats (eg. hour, no spaces):')},
                        {tag: 'table', cn: [{tag: 'tbody', cn: FORMATS().map(([format, description]) => ({
                            tag: 'tr', cn: [{tag: 'td', text: format}, {tag: 'td', text: description}]
                        }))}]}
                    ]}
                }
            ]),
            {module: BoolCheckBox, name: 'active', valueLabel: t('Enabled')},
            {module: BoolCheckBox, name: 'runonce', valueLabel: t('Run only once')},
            ...Object.keys(me.params).length ? [fieldset(t('Params'),
                Object.keys(me.params).map(name => text('param.' + name, name)))] : []
        ]
    }

    addCustomFields() {
        // a legacy record without custom fields
    }

    async save(modified, values) {
        let me     = this,
            params = {
                name   : values.name,
                job    : values.job,
                active : values.active ? 1 : 0,
                runonce: values.runonce ? 1 : 0
            };

        TIME_FIELDS().forEach(([name]) => params[name] = values[name]);

        // CronJob::setAttributes() takes the job's public properties from the posted values
        Object.keys(me.params).forEach(name => params[name] = values.param?.[name] ?? '');

        try {
            const result = await client.legacy(me.jobId ? 'core/cron/update' : 'core/cron/create', me.jobId ? {...params, id: me.jobId} : params);
            return {id: result.id || me.jobId}
        } catch (e) {
            // the validation feedback is HTML (<br />, the format table of an invalid expression)
            throw new Error(decodeEntities(String(e.message).replace(/<br\s*\/?>|<\/tr>|<\/p>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim())
        }
    }
}

export default Neo.setupClass(CronJobDialog);
