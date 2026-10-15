import GroupCombo    from '../../../../../../../views/neo/src/form/field/GroupCombo.mjs';
import {fieldset}    from '../../../../../../../views/neo/src/form/fieldset.mjs';
import SettingsPanel from '../../../../../../../views/neo/src/systemsettings/SettingsPanel.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'pwned');

/**
 * "Have I been Pwned" card of System settings (pwned AuthenticatorSystemSettingsFieldset):
 * the group whose passwords are checked against leaked passwords
 */
class SystemSettingsPanel extends SettingsPanel {
    static config = {
        className    : 'GO.pwned.view.SystemSettingsPanel',
        modulePackage: 'community',
        moduleName   : 'pwned'
    }

    createItems() {
        return [fieldset(t('`;-- Have I been Pwned'), [{
            ntype: 'component',
            tag  : 'p',
            flex : 'none',
            text : t("Enable 'Have I Been Pwned' checking for users in a specific group")
        }, {
            module       : GroupCombo,
            name         : 'settings.enableForGroupId',
            labelPosition: 'inline',
            required     : true
        }])]
    }
}

export default Neo.setupClass(SystemSettingsPanel);
