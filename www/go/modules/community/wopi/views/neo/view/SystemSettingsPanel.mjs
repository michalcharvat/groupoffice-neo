import EntityListPanel from '../../../../../../../views/neo/src/systemsettings/EntityListPanel.mjs';
import {translator}    from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'wopi');

/**
 * Office Online card of System settings (wopi ServiceGridPanel): the WOPI services
 * (Collabora, Microsoft Office Online) documents open in
 */
class SystemSettingsPanel extends EntityListPanel {
    static config = {
        className : 'GO.wopi.view.SystemSettingsPanel',
        entity    : 'WopiService',
        properties: ['id', 'name', 'type', 'url'],
        dialog    : () => import('./ServiceDialog.mjs'),
        columns   : [
            {text: t('Name'), field: 'name', flex: true},
            {text: t('Type'), field: 'type'},
            {text: t('URL'), field: 'url'}
        ]
    }
}

export default Neo.setupClass(SystemSettingsPanel);
