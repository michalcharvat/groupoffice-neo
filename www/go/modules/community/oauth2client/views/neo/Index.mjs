import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}  from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'oauth2client');

// the e-mail account dialog overrides (EmailOverrides.js) belong to the legacy email module
ModuleRegistry.register({
    package   : 'community',
    name      : 'oauth2client',
    title     : t('OAuth2 client'),
    iconCls   : 'fa fa-arrows-rotate',
    capability: 'go:community:oauth2client',
    systemSettings: {
        title  : t('OAuth2 Client Settings'),
        iconCls: 'fa fa-arrows-rotate',
        itemId : 'oauth2client',
        panel  : () => import('./view/SystemSettingsPanel.mjs')
    }
});
