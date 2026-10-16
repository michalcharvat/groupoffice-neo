import EntityListPanel from '../../../../../../../views/neo/src/systemsettings/EntityListPanel.mjs';
import {translator}    from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'oidc');

/**
 * OIDC card of System settings (GOUI oidc Settings): the OpenID Connect clients
 */
class SystemSettingsPanel extends EntityListPanel {
    static config = {
        className : 'GO.oidc.view.SystemSettingsPanel',
        entity    : 'OIDConnectClient',
        properties: ['id', 'name', 'url'],
        jmapSort  : [{property: 'name', isAscending: true}],
        intro     : t('OpenID Connect clients'),
        addText   : t('Add'),
        dialog    : () => import('./ClientDialog.mjs'),
        columns   : [
            {text: t('Name'), field: 'name', flex: true},
            {text: t('Configuration URL'), field: 'url'}
        ]
    }
}

export default Neo.setupClass(SystemSettingsPanel);
