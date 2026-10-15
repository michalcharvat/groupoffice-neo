import PasswordField from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Password.mjs';
import TextField     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {escapeHtml}  from '../../../../../../../views/neo/src/Format.mjs';
import FormWindow    from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'oidc');

const hint = text => ({ntype: 'component', cls: ['go-field-hint'], flex: 'none', text});

/**
 * OpenID Connect client (GOUI OIDConnectClientDialog): provider configuration URL,
 * client id and secret, and the redirect URI to register at the provider
 */
class ClientDialog extends FormWindow {
    static config = {
        className   : 'GO.oidc.view.ClientDialog',
        entityName  : 'OIDConnectClient',
        title       : t('Client'),
        wrapperStyle: {height: 'auto', left: 'calc(50vw - 400px)', top: '10vh', width: 'min(800px, 100vw)'}
    }

    createFormItems() {
        const field = (module, name, labelText, config = {}) => ({module, name, labelText, labelPosition: 'inline', ...config});

        return [
            field(TextField, 'name', t('Name'), {required: true}),
            field(TextField, 'url', t('Configuration URL')),
            hint(t('The Open ID endpoint that implements the .well-known/openid-configuration path')),
            field(TextField, 'clientId', t('Client ID')),
            field(PasswordField, 'clientSecret', t('Client secret'), {autoComplete: 'new-password'}),
            // a text, not a field: the form would send it
            {ntype: 'component', cls: ['go-oidc-redirect'], flex: 'none',
             html: `<div class="go-field-hint">Redirect URI</div><code>${escapeHtml(client.baseUrl + 'api/page.php/community/oidc/auth')}</code>`},
            hint(t("Use this redirect URI in your provider's App registration"))
        ]
    }

    addCustomFields() {
        // OIDConnectClient has no custom fields
    }
}

export default Neo.setupClass(ClientDialog);
