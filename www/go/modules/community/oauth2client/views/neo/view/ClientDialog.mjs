import PasswordField from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Password.mjs';
import TextField     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox  from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import JmapComboBox  from '../../../../../../../views/neo/src/form/field/JmapComboBox.mjs';
import FormWindow    from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'oauth2client');

// DefaultClient id of Azure: its "project" is the tenant
const AZURE = '2';

/**
 * OAuth2 connection (oauth2client ClientDialog): provider, client id and secret, project
 * (Azure: tenant) id, and whether it signs users in with OpenID Connect
 */
class ClientDialog extends FormWindow {
    static config = {
        className   : 'GO.oauth2client.view.ClientDialog',
        entityName  : 'Oauth2Client',
        title       : t('OAuth2 Connection'),
        wrapperStyle: {height: 'auto', left: 'calc(50vw - 400px)', top: '10vh', width: 'min(800px, 100vw)'}
    }

    createFormItems() {
        const field = (module, name, labelText, config = {}) => ({module, name, labelText, labelPosition: 'inline', ...config});

        return [
            field(TextField, 'name', t('Name'), {required: true}),
            field(JmapComboBox, 'defaultClientId', t('Provider'), {
                entity    : 'DefaultClient',
                properties: ['id', 'name'],
                required  : true,
                listeners : {change: ({value}) => this.syncProjectLabel(value)}
            }),
            field(TextField, 'clientId', t('Client Id'), {required: true}),
            field(PasswordField, 'clientSecret', t('Client Secret'), {required: true, autoComplete: 'new-password'}),
            field(TextField, 'projectId', t('API Project Id'), {required: true, reference: 'projectId'}),
            {module: BoolCheckBox, name: 'openId', valueLabel: t('Use this connection for single signon with OpenID Connect')}
        ]
    }

    addCustomFields() {
        // Oauth2Client has no custom fields
    }

    onConstructed() {
        const result = super.onConstructed();
        this.form.on('load', ({data}) => this.syncProjectLabel(data.defaultClientId));
        return result
    }

    /**
     * @param {String|Number|Object|null} provider DefaultClient id (or record)
     */
    syncProjectLabel(provider) {
        const id    = provider && typeof provider === 'object' ? provider.id : provider,
              field = this.getReference('projectId');

        field && (field.labelText = String(id) === AZURE ? 'Tenant Id' : t('Project Id'))
    }
}

export default Neo.setupClass(ClientDialog);
