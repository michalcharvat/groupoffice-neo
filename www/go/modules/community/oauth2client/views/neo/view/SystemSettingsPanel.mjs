import EntityListPanel from '../../../../../../../views/neo/src/systemsettings/EntityListPanel.mjs';
import client          from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {translator}    from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'oauth2client');

/**
 * OAuth2 Client Settings card of System settings (oauth2client ClientGrid): the OAuth2
 * connections (Google, Azure, ...) e-mail accounts and single sign-on use
 */
class SystemSettingsPanel extends EntityListPanel {
    static config = {
        className : 'GO.oauth2client.view.SystemSettingsPanel',
        entity    : 'Oauth2Client',
        properties: ['id', 'name', 'clientId', 'projectId', 'defaultClientId'],
        dialog    : () => import('./ClientDialog.mjs'),
        columns   : [
            {text: t('ID'), field: 'id'},
            {text: t('Name'), field: 'name', flex: true},
            {text: t('Provider'), field: 'providerName'},
            {text: t('Client ID'), field: 'clientId'},
            {text: t('Project ID'), field: 'projectId'}
        ]
    }

    async prepareRecords(list) {
        const ids       = [...new Set(list.map(c => c.defaultClientId).filter(Boolean))],
              providers = ids.length ? await client.get('DefaultClient', ids, ['id', 'name']) : [],
              names     = Object.fromEntries(providers.map(p => [String(p.id), p.name]));

        return list.map(c => ({...c, providerName: names[String(c.defaultClientId)] || ''}))
    }
}

export default Neo.setupClass(SystemSettingsPanel);
