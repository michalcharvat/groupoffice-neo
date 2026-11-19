import EntityListPanel from './EntityListPanel.mjs';
import {t}             from '../Translate.mjs';

/**
 * OAuth 2.0 card of System settings (go.oauth.SystemSettingsPanel / ClientGrid): the clients
 * that may sign users in through GroupOffice's OAuth 2.0 server. Self-registered clients
 * (an AI assistant, RFC 7591) have several redirect URIs.
 */
class OauthClientsPanel extends EntityListPanel {
    static config = {
        className : 'GO.systemsettings.OauthClientsPanel',
        entity    : 'OauthClient',
        properties: ['id', 'name', 'identifier', 'redirectUri'],
        jmapSort  : [{property: 'name', isAscending: true}],
        dialog    : () => import('./OauthClientDialog.mjs'),
        addText   : t('Add client'),
        columns   : [
            {text: t('Name'), field: 'name', flex: true},
            {text: t('Identifier'), field: 'identifier'},
            {text: t('Redirect URI'), field: 'redirectUri', render: record => [].concat(record.redirectUri ?? []).join(', ')}
        ]
    }
}

export default Neo.setupClass(OauthClientsPanel);
