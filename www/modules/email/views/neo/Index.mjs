import ModuleRegistry from '../../../../views/neo/src/ModuleRegistry.mjs';
import {t} from './util.mjs';

/**
 * The e-mail client (legacy module www/modules/email): its neo registration. The backend
 * stays the legacy controllers (email/account/*, email/folder/*, email/message/*), see
 * docs/neo-email-module.md for the extension points other modules use.
 */
ModuleRegistry.register({
    package   : 'legacy',
    name      : 'email',
    title     : t('E-mail'),
    iconCls   : 'fa fa-envelope',
    capability: 'go:legacy:email',
    // Material icon in the header's main menu
    icon      : 'email',
    // header "+" menu: the main view's onQuickAdd() opens the composer
    quickAdd  : {text: t('E-mail'), icon: 'email'},
    mainView  : () => import('./view/EmailMain.mjs'),
    /**
     * Opens the composer (ExtJS go.showComposer / GO.email.showComposer), for core
     * src/Mail.mjs and other modules: ModuleRegistry.getConfigs('showComposer')[0](cfg).
     * cfg: see view/composer/compose.mjs (appName and windowId required).
     */
    showComposer: async cfg => (await import('./view/composer/compose.mjs')).compose(cfg),
    userSettings: {
        title  : t('E-mail'),
        iconCls: 'fa fa-envelope',
        panel  : () => import('./view/settings/UserSettingsPanel.mjs')
    },
    systemSettings: {
        title  : t('E-mail'),
        iconCls: 'fa fa-envelope',
        panel  : () => import('./view/settings/SystemSettingsPanel.mjs')
    }
});
