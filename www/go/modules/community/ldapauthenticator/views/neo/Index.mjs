import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}  from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'ldapauthenticator');

ModuleRegistry.register({
    package   : 'community',
    name      : 'ldapauthenticator',
    title     : t('LDAP Authenticator'),
    iconCls   : 'fa fa-sitemap',
    capability: 'go:community:ldapauthenticator',
    // ExtJS: a fieldset in System settings → Authentication
    systemSettings: {
        title  : t('LDAP Authenticator'),
        iconCls: 'fa fa-sitemap',
        panel  : () => import('./view/SystemSettingsPanel.mjs')
    }
});
