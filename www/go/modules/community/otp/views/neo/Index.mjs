import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import client         from '../../../../../../views/neo/src/jmap/Client.mjs';
import {translator}   from '../../../../../../views/neo/src/Translate.mjs';
import {isEnforced, loadSettings} from './otp.mjs';

const t = translator('community', 'otp');

/**
 * Users of the enforced group without OTP get the setup after login (Module.js
 * "authenticated"); asked once per worker, not in every window
 */
let setupAsked = false;

async function enforceSetup(mainView) {
    if (setupAsked) {
        return
    }

    setupAsked = true;

    try {
        const [settings, [user]] = await Promise.all([
            loadSettings(),
            client.get('User', [client.user.id], ['id', 'groups', 'otp', 'authenticators'])
        ]);

        // LDAP enforces OTP on the LDAP server (checked by its authenticator)
        if (!user || user.otp?.isEnabled || !isEnforced(user, settings) || (user.authenticators || []).includes('ldap')) {
            return
        }

        const {default: EnableDialog} = await import('./view/EnableDialog.mjs');

        await EnableDialog.start({
            appName  : mainView.appName,
            windowId : mainView.windowId,
            userId   : user.id,
            enforced : true,
            block    : !!settings.block,
            countDown: parseInt(settings.countDown) || 0
        })
    } catch (e) {
        console.error('otp setup', e)
    }
}

client.on('logout', () => setupAsked = false);

ModuleRegistry.register({
    package   : 'community',
    name      : 'otp',
    title     : t('OTP Authenticator'),
    iconCls   : 'fa fa-shield-halved',
    capability: 'go:community:otp',
    // login step of users with OTP (go.AuthenticationManager.register('otpauthenticator'))
    loginPanels: {
        otpauthenticator: () => import('./view/OtpLoginPanel.mjs')
    },
    userSettings: {
        title  : t('Two Factor Authentication'),
        iconCls: 'fa fa-shield-halved',
        panel  : () => import('./view/OtpSettingsPanel.mjs')
    },
    systemSettings: {
        title  : t('OTP Authenticator'),
        iconCls: 'fa fa-shield-halved',
        panel  : () => import('./view/SystemSettingsPanel.mjs')
    },
    onMainView: enforceSetup
});
