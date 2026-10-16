import EntityListPanel from '../../../../../../../views/neo/src/systemsettings/EntityListPanel.mjs';
import {translator}    from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'imapauthenticator');

/**
 * IMAP Authenticator card of System settings (imapauthenticator ServerGrid): server profiles
 */
class SystemSettingsPanel extends EntityListPanel {
    static config = {
        className   : 'GO.imapauthenticator.view.SystemSettingsPanel',
        entity      : 'ImapAuthServer',
        properties  : ['id', 'imapHostname', 'domains'],
        displayField: 'imapHostname',
        dialog      : () => import('./ServerDialog.mjs'),
        columns     : [
            {text: t('Hostname'), field: 'imapHostname', flex: true},
            {text: t('Domains'), render: server => (server.domains || []).map(d => d.name).join(', ')}
        ]
    }
}

export default Neo.setupClass(SystemSettingsPanel);
