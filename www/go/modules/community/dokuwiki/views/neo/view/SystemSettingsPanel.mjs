import {fieldset}    from '../../../../../../../views/neo/src/form/fieldset.mjs';
import SettingsPanel from '../../../../../../../views/neo/src/systemsettings/SettingsPanel.mjs';
import {hint, textField} from '../../../../../../../views/neo/src/systemsettings/fields.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'dokuwiki');

/**
 * Dokuwiki card of System settings (dokuwiki SystemSettingsPanel): wiki URL and module title
 */
class SystemSettingsPanel extends SettingsPanel {
    static config = {
        className    : 'GO.dokuwiki.view.SystemSettingsPanel',
        modulePackage: 'community',
        moduleName   : 'dokuwiki',
        // the title names the module in the header
        reloadOnSave : true
    }

    createItems() {
        return [fieldset(t('Dokuwiki'), [
            textField('externalUrl', t('URL')),
            hint(t('Used as dokuwiki URL')),
            textField('title', t('Title')),
            hint(t('Used as dokuwiki page title'))
        ])]
    }
}

export default Neo.setupClass(SystemSettingsPanel);
