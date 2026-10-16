import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}  from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'imapauthenticator');

ModuleRegistry.register({
    package   : 'community',
    name      : 'imapauthenticator',
    title     : t('IMAP Authenticator'),
    iconCls   : 'fa fa-envelope-circle-check',
    capability: 'go:community:imapauthenticator',
    // ExtJS: a fieldset in System settings → Authentication
    systemSettings: {
        title  : t('IMAP Authenticator'),
        iconCls: 'fa fa-envelope-circle-check',
        panel  : () => import('./view/SystemSettingsPanel.mjs')
    }
});
