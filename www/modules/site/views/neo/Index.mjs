import ModuleRegistry from '../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}   from '../../../../views/neo/src/Translate.mjs';

const t = translator('legacy', 'site');

// GO.site.MainPanel ("Website Manager"): users with access to the site module
ModuleRegistry.register({
    package   : 'legacy',
    name      : 'site',
    title     : t('Website Manager'),
    iconCls   : 'fa fa-sitemap',
    capability: 'go:legacy:site',
    icon      : 'web',
    mainView  : () => import('./view/SiteMain.mjs')
});
