import TextField          from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import AuthenticatorPanel from '../../../../../../../views/neo/src/login/AuthenticatorPanel.mjs';
import {translator}       from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'dev');

/**
 * Login step "dummy" (go.modules.community.dev.DummyAuthenticatorPanel): passes with
 * the code "dummy", to test two-step logins
 */
class DummyLoginPanel extends AuthenticatorPanel {
    static config = {
        className: 'GO.dev.view.DummyLoginPanel'
    }

    createFields() {
        return [{
            ntype: 'component',
            cls  : ['go-login-text'],
            text : t("Enter 'dummy' to pass.")
        }, {
            module       : TextField,
            name         : 'code',
            labelText    : t('Code'),
            labelPosition: 'inline',
            autoComplete : 'off',
            required     : true
        }]
    }
}

export default Neo.setupClass(DummyLoginPanel);
