import TextField    from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import AuthenticatorPanel from '../../../../../../../views/neo/src/login/AuthenticatorPanel.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'otp');

/**
 * Login step "otpauthenticator" (go.modules.community.otp.OtpPanel): the code of the
 * user's OTP app
 */
class OtpLoginPanel extends AuthenticatorPanel {
    static config = {
        className: 'GO.otp.view.OtpLoginPanel'
    }

    createFields() {
        return [{
            ntype: 'component',
            cls  : ['go-login-text'],
            text : t('Get the code from the OTP Authenticator app on your mobile device and fill it in below') + '.'
        }, {
            module       : TextField,
            name         : 'otp_code',
            labelText    : t('Code'),
            labelPosition: 'inline',
            autoComplete : 'one-time-code',
            required     : true
        }]
    }

    async getAuthenticatorData() {
        const data = await super.getAuthenticatorData();

        // pasted codes may contain spaces ("123 456")
        data && (data.otp_code = String(data.otp_code || '').replace(/\D/g, ''));
        return data
    }

    errorText(field, code) {
        return {1: t('Code is required'), 5: t('Not found'), 10: t('Invalid code')}[code] || null
    }

    async clear() {
        await super.clear();

        const field = await this.getField('otp_code');
        field && this.timeout(50).then(() => field.isDestroyed || field.focus(field.getInputElId()))
    }
}

export default Neo.setupClass(OtpLoginPanel);
