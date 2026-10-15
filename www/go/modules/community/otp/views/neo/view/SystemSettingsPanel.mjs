import GroupCombo    from '../../../../../../../views/neo/src/form/field/GroupCombo.mjs';
import {fieldset}    from '../../../../../../../views/neo/src/form/fieldset.mjs';
import SettingsPanel from '../../../../../../../views/neo/src/systemsettings/SettingsPanel.mjs';
import {checkField, hint, numberField} from '../../../../../../../views/neo/src/systemsettings/fields.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'otp');

/**
 * OTP Authenticator card of System settings (go.modules.community.otp.AuthenticatorSystemSettingsFieldset,
 * which GO puts in the Authentication tab): enforce OTP for a group
 */
class SystemSettingsPanel extends SettingsPanel {
    static config = {
        className    : 'GO.otp.view.SystemSettingsPanel',
        modulePackage: 'community',
        moduleName   : 'otp'
    }

    construct(config) {
        super.construct(config);

        let me = this;

        // GO: no count down while the setup blocks GO anyway
        me.on('load', () => me.syncCountDown());
        me.on('fieldChange', ({field}) => field?.name === 'settings.block' && me.syncCountDown())
    }

    createItems() {
        return [fieldset(t('OTP Authenticator'), [{
            ntype: 'component',
            tag  : 'p',
            flex : 'none',
            text : t('Enforce two factor authentication for users in a specific group')
        }, {
            module       : GroupCombo,
            name         : 'settings.enforceForGroupId',
            labelPosition: 'inline'
        },
            checkField('block', t('Block Group-Office usage until setup is done')),
            numberField('countDown', t('Count down'), {minValue: 0, width: 240}),
            hint(t('Count down this number of seconds until the user can cancel the setup'))
        ])]
    }

    async syncCountDown() {
        const field = await this.getField('settings.countDown');
        field && (field.disabled = !!await this.getSetting('block'))
    }
}

export default Neo.setupClass(SystemSettingsPanel);
