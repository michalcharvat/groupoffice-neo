import ModuleRegistry from '../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}   from '../../../../views/neo/src/Translate.mjs';

const t = translator('legacy', 'customcss');

// admin module (CustomcssModule::adminModule()): only admins have its capability
ModuleRegistry.register({
    package   : 'legacy',
    name      : 'customcss',
    title     : t('name'),
    iconCls   : 'fa fa-paintbrush',
    capability: 'go:legacy:customcss',
    icon      : 'format_paint',
    mainView  : () => import('./view/CustomCssMain.mjs')
});
