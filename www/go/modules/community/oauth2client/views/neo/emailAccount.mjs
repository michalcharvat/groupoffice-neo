import Button       from '../../../../../../views/neo/src/button/Button.mjs';
import JmapComboBox from '../../../../../../views/neo/src/form/field/JmapComboBox.mjs';
import client       from '../../../../../../views/neo/src/jmap/Client.mjs';
import {notify, notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import {translator} from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'oauth2client');

/**
 * OAuth2 provider of an e-mail account (ExtJS EmailOverrides.js and the oauth2client part of
 * GO.email.AccountDialog): an `emailAccountDialogCards` contribution (see
 * www/modules/email/views/neo/view/account/AccountDialog.mjs) that puts an "OAuth2 connection"
 * combo and a "Refresh token" button into the account's Properties.
 *
 * With a connection the Server card hides: the IMAP and SMTP settings come from the
 * connection's DefaultClient, the IMAP user name is the account's e-mail address and no
 * password is needed (AccountController::beforeSubmit sets a random one). The backend listeners
 * (oauth2client Module::loadAccountSettings / saveAccountSettings) read and store
 * oauth2_client_id. A new account then needs a refresh token: the authentication window opens.
 */

/**
 * The provider's authentication window (gauth.php), stores the refresh token in the account
 * @param {Object} dialog the account dialog
 * @param {Number|String} accountId
 */
function openRefreshTokenWindow(dialog, accountId) {
    Neo.Main.windowOpen({
        url       : client.baseUrl + 'go/modules/community/oauth2client/gauth.php/authenticate/' + encodeURIComponent(accountId),
        windowId  : dialog.windowId,
        windowName: 'go-oauth2-authenticate'
    })
}

/**
 * @param {Object} dialog
 * @returns {Object|null} the combo
 */
function combo(dialog) {
    return dialog.getReference('oauth2ClientField')
}

/**
 * Shows or hides what depends on a connection: the Server card, the refresh button and
 * whether the IMAP password is required
 * @param {Object} dialog
 * @param {Boolean} usesOauth2
 */
async function applyConnection(dialog, usesOauth2) {
    dialog.setCardVisible('serverCard', !usesOauth2);

    const button = dialog.getReference('oauth2RefreshButton');
    button && (button.hidden = !usesOauth2 || !dialog.accountId);

    const password = await dialog.form.getField('password');
    // a new account without connection needs a password (AccountDialog)
    password && (password.required = !usesOauth2 && !dialog.accountId)
}

/**
 * A connection was chosen: the server settings of its DefaultClient (ExtJS ClientCombo select)
 * @param {Object} dialog
 * @param {Object|null} value Oauth2Client
 */
async function onConnectionChange(dialog, value) {
    if (dialog.applying || !dialog.formReady) {
        return
    }

    const id = value?.id ?? value;

    await applyConnection(dialog, !!id);

    if (!id) {
        return
    }

    try {
        const [oauth2Client] = await client.get('Oauth2Client', [id], ['id', 'defaultClientId']),
              [defaults]     = oauth2Client?.defaultClientId ? await client.get('DefaultClient', [oauth2Client.defaultClientId]) : [];

        const set = async (name, fieldValue) => {
            const field = await dialog.form.getField(name);
            field && fieldValue !== undefined && fieldValue !== null && (field.value = fieldValue)
        };

        await set('username', (await dialog.form.getField('email'))?.value);

        if (defaults) {
            await set('host', defaults.imapHost);
            await set('port', defaults.imapPort);
            await set('imap_encryption', defaults.imapEncryption);
            await set('smtp_host', defaults.smtpHost);
            await set('smtp_port', defaults.smtpPort);
            await set('smtp_encryption', defaults.smtpEncryption)
        }
    } catch (e) {
        notifyError(dialog, e)
    }
}

export default {
    id    : 'oauth2client',
    target: 'properties',

    items: dialog => [{
        module      : JmapComboBox,
        reference   : 'oauth2ClientField',
        name        : 'oauth2_client_id',
        entity      : 'Oauth2Client',
        properties  : ['id', 'name', 'defaultClientId'],
        displayField: 'name',
        labelText    : t('OAuth2 connection'),
        labelPosition: 'inline',
        flex        : 'none',
        listeners   : {change: ({value}) => onConnectionChange(dialog, value)}
    }, {
        module   : Button,
        reference: 'oauth2RefreshButton',
        ui       : 'secondary',
        icon     : 'refresh',
        text     : t('Refresh token'),
        tooltip  : t('Request or update a refresh token in a separate window.'),
        flex     : 'none',
        hidden   : true,
        handler  : () => dialog.accountId && openRefreshTokenWindow(dialog, dialog.accountId)
    }],

    load: ({account, dialog}) => applyConnection(dialog, !!+(account?.oauth2_client_id || 0)),

    beforeSave: ({params, dialog}) => {
        const field = combo(dialog),
              id    = field?.getSubmitValue?.() ?? field?.value?.id;

        // the backend stores a connection, it doesn't remove one (like ExtJS)
        if (id) {
            params.oauth2_client_id = id
        } else {
            delete params.oauth2_client_id
        }
    },

    afterSave: ({accountId, response, dialog}) => {
        if (response?.needs_refresh_token) {
            notify(dialog, t('Please press the button "Refresh token" to finish the OAuth2 connection'), {title: t('Get a refresh token'), closable: true});
            openRefreshTokenWindow(dialog, accountId)
        }
    }
};
