import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}  from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'history');

ModuleRegistry.register({
    package   : 'community',
    name      : 'history',
    title     : t('History'),
    iconCls   : 'fa fa-clock-rotate-left',
    capability: 'go:community:history',
    icon      : 'history',
    mainView  : () => import('./view/HistoryMain.mjs'),
    systemSettings: {
        title  : t('History'),
        iconCls: 'fa fa-clock-rotate-left',
        panel  : () => import('./view/SystemSettingsPanel.mjs')
    }
});
