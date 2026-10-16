import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}  from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'apikeys');

ModuleRegistry.register({
    package   : 'community',
    name      : 'apikeys',
    title     : t('API Keys'),
    iconCls   : 'fa fa-key',
    capability: 'go:community:apikeys',
    systemSettings: {
        title  : t('API Keys'),
        iconCls: 'fa fa-key',
        panel  : () => import('./view/SystemSettingsPanel.mjs')
    }
});
