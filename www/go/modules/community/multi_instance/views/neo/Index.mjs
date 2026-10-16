import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}  from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'multi_instance');

ModuleRegistry.register({
    package   : 'community',
    name      : 'multi_instance',
    title     : t('Multi instance'),
    iconCls   : 'fa fa-server',
    capability: 'go:community:multi_instance',
    icon      : 'dns',
    mainView  : () => import('./view/InstancesMain.mjs')
});
