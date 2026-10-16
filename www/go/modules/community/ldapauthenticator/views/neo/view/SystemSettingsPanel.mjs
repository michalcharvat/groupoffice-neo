import EntityListPanel from '../../../../../../../views/neo/src/systemsettings/EntityListPanel.mjs';
import {translator}    from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'ldapauthenticator');

/**
 * LDAP Authenticator card of System settings (ldapauthenticator ServerGrid): server profiles
 */
class SystemSettingsPanel extends EntityListPanel {
    static config = {
        className   : 'GO.ldapauthenticator.view.SystemSettingsPanel',
        entity      : 'LdapAuthServer',
        properties  : ['id', 'hostname', 'domains'],
        displayField: 'hostname',
        dialog      : () => import('./ServerDialog.mjs'),
        columns     : [
            {text: 'ID', field: 'id'},
            {text: t('Hostname'), field: 'hostname', flex: true},
            {text: t('Domains'), render: server => (server.domains || []).map(d => d.name).join(', ')}
        ]
    }
}

export default Neo.setupClass(SystemSettingsPanel);
