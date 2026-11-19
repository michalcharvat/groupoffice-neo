import PasswordField from '../../node_modules/neo.mjs/src/form/field/Password.mjs';
import TextField     from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox  from '../form/field/BoolCheckBox.mjs';
import LinesField    from '../form/field/LinesField.mjs';
import FormWindow    from '../view/FormWindow.mjs';
import {t}           from '../Translate.mjs';

/**
 * Redirect URIs, one per line. One URI is saved as a string like the ExtJS text field did;
 * several (a self-registered client) as an array.
 */
class RedirectUriField extends LinesField {
    static config = {
        className: 'GO.systemsettings.OauthRedirectUriField'
    }

    /**
     * @returns {String|String[]}
     */
    getSubmitValue() {
        const uris = super.getSubmitValue();
        return uris.length > 1 ? uris : uris[0] || ''
    }
}

Neo.setupClass(RedirectUriField);

/**
 * OAuth 2.0 client (go.oauth.ClientDialog): name, identifier, redirect URIs and, for a
 * confidential client, the secret. The server only keeps the secret's hash and never sends it:
 * when editing, an empty secret keeps the current one.
 */
class OauthClientDialog extends FormWindow {
    static config = {
        className   : 'GO.systemsettings.OauthClientDialog',
        entityName  : 'OauthClient',
        title       : t('Client'),
        properties  : ['id', 'name', 'identifier', 'isConfidential', 'redirectUri'],
        wrapperStyle: {height: 'auto', left: 'calc(50vw - 260px)', top: '15vh', width: 'min(520px, 100vw)'}
    }

    /**
     * isConfidential as loaded: an existing confidential client has a secret already
     * @member {Boolean} loadedConfidential=false
     */
    loadedConfidential = false

    createFormItems() {
        let me = this;

        return [{
            module       : TextField,
            name         : 'name',
            labelText    : t('Name'),
            labelPosition: 'inline',
            required     : true
        }, {
            module       : TextField,
            name         : 'identifier',
            labelText    : t('Identifier'),
            labelPosition: 'inline',
            required     : true
        }, {
            module       : RedirectUriField,
            name         : 'redirectUri',
            labelText    : t('Redirect URI'),
            required     : true,
            height       : 90
        }, {
            module    : BoolCheckBox,
            name      : 'isConfidential',
            reference : 'isConfidential',
            valueLabel: t('Is confidential'),
            listeners : {userChange: ({component}) => me.syncSecret(component.checked)}
        }, {
            module       : PasswordField,
            name         : 'secret',
            reference    : 'secret',
            labelText    : t('Secret'),
            labelPosition: 'inline',
            autoComplete : 'new-password',
            disabled     : true
        }]
    }

    addCustomFields() {
        // OauthClient has no custom fields
    }

    onConstructed() {
        let me     = this;
        const result = super.onConstructed();

        me.form.on({
            load: ({data}) => {
                me.loadedConfidential = !!data.isConfidential;
                me.syncSecret(me.loadedConfidential)
            },
            beforesave: ({data}) => {
                // no secret for a public client, and an empty field keeps the current secret
                // (setSecret('') would store the hash of an empty string)
                if (!me.getReference('isConfidential')?.checked || !data.secret) {
                    delete data.secret
                }
            }
        });

        return result
    }

    /**
     * The secret is only for a confidential client; it is required when the client has none yet
     * @param {Boolean} confidential
     */
    syncSecret(confidential) {
        const field = this.getReference('secret');

        if (field) {
            field.disabled = !confidential;
            field.required = confidential && !(this.entityId && this.loadedConfidential)
        }
    }
}

export default Neo.setupClass(OauthClientDialog);
