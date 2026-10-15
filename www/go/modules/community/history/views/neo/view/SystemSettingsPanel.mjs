import {fieldset}    from '../../../../../../../views/neo/src/form/fieldset.mjs';
import SettingsPanel from '../../../../../../../views/neo/src/systemsettings/SettingsPanel.mjs';
import {hint, numberField} from '../../../../../../../views/neo/src/systemsettings/fields.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'history');

/**
 * History card of System settings (GOUI history SystemSettings): how long log entries are kept
 */
class SystemSettingsPanel extends SettingsPanel {
    static config = {
        className    : 'GO.history.view.SystemSettingsPanel',
        modulePackage: 'community',
        moduleName   : 'history'
    }

    createItems() {
        return [fieldset(t('History'), [
            numberField('deleteAfterDays', t('Delete entries after') + ' (' + t('days') + ')', {minValue: 0, width: 240}),
            hint(t('0 keeps the entries forever'))
        ])]
    }
}

export default Neo.setupClass(SystemSettingsPanel);
