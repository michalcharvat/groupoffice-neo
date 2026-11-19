import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}  from '../../../../../../views/neo/src/Translate.mjs';
import emailAccount  from './emailAccount.mjs';

const t = translator('community', 'oauth2client');

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
    },
    // the e-mail account dialog: OAuth2 connection instead of a password (ExtJS EmailOverrides.js)
    emailAccountDialogCards: emailAccount
});
