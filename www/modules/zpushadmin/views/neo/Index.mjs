import ModuleRegistry from '../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}   from '../../../../views/neo/src/Translate.mjs';

const t = translator('legacy', 'zpushadmin');

// admin module (ZpushadminModule::adminModule()): only admins have its capability
ModuleRegistry.register({
    package   : 'legacy',
    name      : 'zpushadmin',
    title     : t('ActiveSync'),
    iconCls   : 'fa fa-mobile-screen',
    capability: 'go:legacy:zpushadmin',
    icon      : 'phonelink_setup',
    mainView  : () => import('./view/DevicesMain.mjs')
});
