import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}  from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'maildomains');

ModuleRegistry.register({
    package   : 'community',
    name      : 'maildomains',
    title     : t('Mail domains'),
    iconCls   : 'fa fa-at',
    capability: 'go:community:maildomains',
    // Material icon in the header's main menu (GOUI system settings icon "email")
    icon      : 'email',
    // header search results: "#maildomains/5" (GOUI route)
    routes    : {MailDomain: id => String(id)},
    mainView  : () => import('./view/MailDomainsMain.mjs'),
    // card in System settings (GOUI SystemSettings: the mail host)
    systemSettings: {
        title  : t('Mail domains'),
        iconCls: 'fa fa-at',
        panel  : () => import('./view/SystemSettingsPanel.mjs')
    }
});
