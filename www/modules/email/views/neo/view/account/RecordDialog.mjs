import LegacyFormWindow from './LegacyFormWindow.mjs';
import * as accountApi  from './accountApi.mjs';

/**
 * Dialog of one record of a standard legacy controller of an account (email/alias,
 * email/filter, email/label: load/submit with `id`, new records with `account_id`).
 *
 *     const dialog = await AliasDialog.open({appName, windowId, accountId, id}); // id null: new
 *     dialog.on('save', …)
 *
 * Subclasses set the static `legacyController`, implement createFormItems() and may override toValues(data)
 * (load data → field values) and toParams(values) (field values → submit params).
 */
class RecordDialog extends LegacyFormWindow {
    /**
     * The legacy controller: 'alias' | 'filter' | 'label'
     * @type {String|null}
     */
    static legacyController = null

    static config = {
        className: 'GO.email.account.RecordDialog',
        cls      : ['go-form-window', 'go-email-record-dialog'],
        /**
         * The static `legacyController` of the class (set by open())
         * @member {String|null} legacyController=null
         */
        legacyController: null,
        /**
         * @member {Number|null} accountId=null
         */
        accountId: null,
        /**
         * Record id, null for a new record
         * @member {Number|null} recordId=null
         */
        recordId: null
    }

    /**
     * Loads the record (when `id`) and opens the dialog
     * @param {Object} config appName, windowId, accountId, id, and the subclass's own config
     * @returns {Promise<RecordDialog>}
     */
    static async open({id=null, ...config}) {
        const Cls  = this,
              data = id ? await accountApi.load(Cls.legacyController, id) : null;

        return Neo.create(Cls, {...config, legacyController: Cls.legacyController, recordId: id, values: Cls.toValues(data, config)})
    }

    /**
     * @param {Object|null} data the load response's data, null for a new record
     * @param {Object} config
     * @returns {Object} field values
     */
    static toValues(data, config) {
        return data || {}
    }

    /**
     * @param {Object} values all field values
     * @returns {Object} submit params (without id / account_id)
     */
    toParams(values) {
        return values
    }

    async save(modified, values) {
        let me     = this,
            params = me.toParams(values);

        const result = await accountApi.submit(me.legacyController, me.recordId ? {...params, id: me.recordId} : {...params, account_id: me.accountId});
        return {id: result.id || me.recordId}
    }
}

export default Neo.setupClass(RecordDialog);

/**
 * Field config with the label above the input
 * @param {Object} module
 * @param {String} name
 * @param {String} labelText
 * @param {Object} [config]
 * @returns {Object}
 */
export function field(module, name, labelText, config={}) {
    return {module, name, labelText, labelPosition: 'inline', flex: 'none', ...config}
}

/**
 * wrapperStyle of a dialog in the middle of the window
 * @param {Number} width px
 * @param {Number} height px
 * @returns {Object}
 */
export function centered(width, height) {
    return {
        height   : `min(${height}px, 90vh)`,
        left     : `max(0px, calc(50vw - ${width / 2}px))`,
        maxHeight: '90vh',
        top      : `max(5vh, calc(50vh - ${height / 2}px))`,
        width    : `min(${width}px, 100vw)`
    }
}
