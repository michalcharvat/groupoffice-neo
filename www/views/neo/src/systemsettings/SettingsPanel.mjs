import DataSourceForm from '../form/DataSourceForm.mjs';
import client         from '../jmap/Client.mjs';
import {t}            from '../Translate.mjs';

/**
 * A System settings card over a module's settings (go.systemsettings.Panel): the
 * module's `Module` entity, fields named "settings.<key>".
 *
 *     class SystemSettingsPanel extends SettingsPanel {
 *         static config = {className: 'GO.history.SystemSettingsPanel', modulePackage: 'community', moduleName: 'history'}
 *
 *         createFields() {
 *             return [{module: NumberField, name: 'settings.deleteAfterDays', labelText: t('Delete entries after')}]
 *         }
 *     }
 *
 * Settings the server's config.php sets (settings.readOnlyKeys) are disabled, with a note
 * on top. Saving sends the changed settings only (Module/set).
 *
 * The dialog calls the card interface every System settings card may implement:
 * - load()           when the dialog opens
 * - isModified()     → Promise<Boolean>, asked before discarding changes
 * - validate()       → Promise<Boolean>
 * - save()           → Promise<Boolean> false on failure; called for valid cards only
 * - needsReload      the windows reload when the dialog closes (page title, colours, ...)
 */
class SettingsPanel extends DataSourceForm {
    static config = {
        className: 'GO.systemsettings.SettingsPanel',
        baseCls  : ['go-systemsettings-panel', 'neo-container'],
        entity   : 'Module',
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {String} modulePackage='core'
         */
        modulePackage: 'core',
        /**
         * @member {String} moduleName='core'
         */
        moduleName: 'core',
        /**
         * Saved changes set needsReload: the page shows them (title, colours, login screen)
         * @member {Boolean} reloadOnSave=false
         */
        reloadOnSave: false
    }

    /**
     * Changed settings of the last save()
     * @member {Object} saved={}
     */
    saved = {}

    /**
     * @member {Boolean} needsReload=false
     */
    needsReload = false

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype    : 'component',
            reference: 'readOnlyInfo',
            cls      : ['go-systemsettings-info'],
            flex     : 'none',
            hidden   : true,
            html     : `<i class="go-icon">info</i>${t("Some fields on this page can't be edited because they have been locked in the server configuration file.")}`
        }, ...me.createFields()];

        me.on('load', ({data}) => me.onSettingsLoad(data))
    }

    /**
     * The card's fields, named "settings.<key>"
     * @returns {Object[]}
     */
    createFields() {
        return []
    }

    /**
     * Loads the module and its settings
     * @returns {Promise<Object|null>}
     */
    async load() {
        let me = this;

        try {
            const {ids} = await client.queryGet('Module', {
                filter    : {package: me.modulePackage, name: me.moduleName},
                properties: ['id']
            });

            if (!ids.length) {
                throw new Error(t('Not found'))
            }

            return me.isDestroyed ? null : await super.load(ids[0])
        } catch (error) {
            me.isDestroyed || me.fire('loaderror', {error});
            return null
        }
    }

    /**
     * Disables the settings the server configuration fixes
     * @param {Object} module
     * @protected
     */
    async onSettingsLoad(module) {
        let me       = this,
            readOnly = module.settings?.readOnlyKeys || [],
            fields   = await me.getFields(),
            locked   = fields.filter(field => readOnly.includes(String(field.name).replace(/^settings\./, '')));

        locked.forEach(field => field.disabled = true);
        me.getReference('readOnlyInfo').hidden = !locked.length
    }

    /**
     * Saves the changed settings
     * @returns {Promise<Boolean>}
     */
    async save() {
        let me = this;

        // not loaded: a submit would create a Module instead of updating it
        if (!me.currentId) {
            me.fire('saveerror', {error: new Error(t('Not found')), validationErrors: null});
            return false
        }

        // rich text editors sync their HTML debounced: take the last typing along
        const fields = await me.getFields();
        await Promise.all(fields.filter(field => typeof field.flush === 'function').map(field => field.flush()));

        me.saved = (await me.getModified()).settings || {};

        const ok = !!await me.submit();

        ok && me.reloadOnSave && Object.keys(me.saved).length && (me.needsReload = true);
        return ok
    }

    /**
     * Current value of a setting (field value, or the loaded one)
     * @param {String} key
     * @returns {Promise<*>}
     */
    async getSetting(key) {
        const field = await this.getField('settings.' + key);
        return field ? DataSourceForm.fieldValue(field) : this.entityData.settings?.[key]
    }
}

export default Neo.setupClass(SettingsPanel);
