import PasswordField from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Password.mjs';
import TextField     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import Button        from '../../../../../../../views/neo/src/button/Button.mjs';
import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {notify, notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import FormWindow    from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import {t as coreT, translator} from '../../../../../../../views/neo/src/Translate.mjs';

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
            // no name: the form doesn't send it; absolute like the server's redirectUri
            field(TextField, null, t('Redirect URI'), {
                reference: 'redirectUri',
                readOnly : true,
                clearable: false,
                value    : new URL(client.baseUrl + 'api/page.php/community/oidc/auth', globalThis.location.href).href
            }),
            hint(t("Use this redirect URI in your provider's App registration")),
            {
                ntype : 'container',
                flex  : 'none',
                layout: {ntype: 'hbox', pack: 'end'},
                items : [{
                    module : Button,
                    icon   : 'content_copy',
                    text   : t('Copy to clipboard'),
                    handler: () => this.copyRedirectUri()
                }]
            }
        ]
    }

    /**
     * Selects the redirect URI and copies it (GOUI copy button)
     */
    async copyRedirectUri() {
        let me   = this,
            opts = {appName: me.appName, windowId: me.windowId};

        try {
            await Neo.main.DomAccess.selectNode({...opts, id: me.getReference('redirectUri').getInputElId()});
            await Neo.main.DomAccess.execCommand({...opts, command: 'copy'});
            notify(me, coreT('Copied!'))
        } catch (e) {
            notifyError(me, e)
        }
    }

    addCustomFields() {
        // OIDConnectClient has no custom fields
    }
}

export default Neo.setupClass(ClientDialog);
