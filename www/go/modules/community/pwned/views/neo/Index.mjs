import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}  from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'pwned');

ModuleRegistry.register({
    package   : 'community',
    name      : 'pwned',
    title     : t('`;-- Have I been Pwned'),
    iconCls   : 'fa fa-user-shield',
    capability: 'go:community:pwned',
    // ExtJS: a fieldset in System settings → Authentication
    systemSettings: {
        title  : t('`;-- Have I been Pwned'),
        iconCls: 'fa fa-user-shield',
        panel  : () => import('./view/SystemSettingsPanel.mjs')
    }
});
