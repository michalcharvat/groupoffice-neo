import TextField      from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import DataSourceForm from '../../../../../../../views/neo/src/form/DataSourceForm.mjs';
import {fieldset}     from '../../../../../../../views/neo/src/form/fieldset.mjs';
import client         from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {t}            from './util.mjs';

/**
 * Mail domains card of System settings (GOUI SystemSettings): the module setting
 * mailHost, used for the PTR, SPF and MX checks. A DataSourceForm over the module's
 * `Module` entity with the System settings card interface (load, isModified,
 * validate, save).
 */
class SystemSettingsPanel extends DataSourceForm {
    static config = {
        className: 'GO.maildomains.view.SystemSettingsPanel',
        baseCls  : ['go-md-settings', 'neo-container'],
        entity   : 'Module',
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [fieldset(t('Mail domains'), [{
            module       : TextField,
            name         : 'settings.mailHost',
            labelText    : t('Mail hostname'),
            labelPosition: 'inline',
            flex         : 'none'
        }, {
            ntype: 'component',
            cls  : ['go-field-hint'],
            flex : 'none',
            text : t('The hostname of the mail system. Used for PTR, SPF and MX checks.')
        }])]
    }

    /**
     * Loads the maildomains module and its settings
     * @returns {Promise<Object|null>}
     */
    async load() {
        let me = this;

        try {
            const {ids} = await client.queryGet('Module', {
                filter    : {package: 'community', name: 'maildomains'},
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
     * @returns {Promise<Boolean>}
     */
    async save() {
        return !!await this.submit()
    }
}

export default Neo.setupClass(SystemSettingsPanel);
