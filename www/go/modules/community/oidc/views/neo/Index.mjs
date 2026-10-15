import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}  from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'oidc');

// the login screen's "Sign in with ..." buttons come from views/neo/login.php (Neo.php)
ModuleRegistry.register({
    package   : 'community',
    name      : 'oidc',
    title     : 'OIDC',
    iconCls   : 'fa fa-right-to-bracket',
    capability: 'go:community:oidc',
    systemSettings: {
        title  : 'OIDC',
        iconCls: 'fa fa-right-to-bracket',
        panel  : () => import('./view/SystemSettingsPanel.mjs')
    }
});
