import PasswordField from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Password.mjs';
import {fieldset}    from '../../../../../../../views/neo/src/form/fieldset.mjs';
import SettingsPanel from '../../../../../../../views/neo/src/systemsettings/SettingsPanel.mjs';
import {checkField, textField} from '../../../../../../../views/neo/src/systemsettings/fields.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'jitsimeet');

/**
 * Jitsi Meet card of System settings (GOUI jitsimeet Settings): server and JWT authentication
 */
class SystemSettingsPanel extends SettingsPanel {
    static config = {
        className    : 'GO.jitsimeet.view.SystemSettingsPanel',
        modulePackage: 'community',
        moduleName   : 'jitsimeet'
    }

    createFields() {
        return [fieldset(t('Video meeting'), [
            textField('videoUri', t('Server URL')),
            checkField('videoJwtEnabled', t('Enable JWT authentification')),
            textField('videoJwtSecret', t('App Secret'), {module: PasswordField, autoComplete: 'new-password'}),
            textField('videoJwtAppId', t('App ID'))
        ])]
    }
}

export default Neo.setupClass(SystemSettingsPanel);
