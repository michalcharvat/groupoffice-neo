import ModuleRegistry from '../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}   from '../../../../views/neo/src/Translate.mjs';

const t = translator('legacy', 'sync');

ModuleRegistry.register({
    package   : 'legacy',
    name      : 'sync',
    title     : t('Synchronization'),
    iconCls   : 'fa fa-rotate',
    capability: 'go:legacy:sync',
    // GO.sync.SettingsPanel in My account (userSettingsPanels)
    userSettings: {
        title  : t('Synchronization'),
        iconCls: 'fa fa-rotate',
        panel  : () => import('./view/SettingsPanel.mjs')
    }
});
