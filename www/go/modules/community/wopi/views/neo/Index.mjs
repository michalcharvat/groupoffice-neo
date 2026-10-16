import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}  from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'wopi');

ModuleRegistry.register({
    package   : 'community',
    name      : 'wopi',
    title     : t('Online Office'),
    iconCls   : 'fa fa-file-word',
    capability: 'go:community:wopi',
    systemSettings: {
        title  : t('Office Online'),
        iconCls: 'fa fa-file-word',
        itemId : 'wopi',
        panel  : () => import('./view/SystemSettingsPanel.mjs')
    }
});
