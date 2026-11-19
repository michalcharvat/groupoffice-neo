import ModuleRegistry from '../../../../views/neo/src/ModuleRegistry.mjs';
import client         from '../../../../views/neo/src/jmap/Client.mjs';
import {notifyError}  from '../../../../views/neo/src/Notify.mjs';
import {translator}   from '../../../../views/neo/src/Translate.mjs';

const t = translator('legacy', 'sync');

/**
 * Asked once per worker, not in every window
 * @member {Boolean} devicesChecked=false
 */
let devicesChecked = false;

client.on('logout', () => devicesChecked = false);

/**
 * ActiveSync 2FA (System settings "Enable 2-Factor authentication for ActiveSync devices"):
 * Z-Push registers a new device as a User client with status "new"; the user confirms
 * after login that it was them (go.User.checkForNewDevices()). No: denied.
 * @param {Neo.component.Base} mainView
 */
async function checkForNewDevices(mainView) {
    if (devicesChecked) {
        return
    }

    devicesChecked = true;

    try {
        const [user] = await client.get('User', [client.user.id], ['id', 'clients']),
              clients = user?.clients || {};

        for (const [id, device] of Object.entries(clients)) {
            if (device?.status !== 'new') {
                continue
            }

            const {default: ConfirmDialog} = await import('../../../../views/neo/src/view/ConfirmDialog.mjs');

            const yes = await ConfirmDialog.ask({
                appName : mainView.appName,
                windowId: mainView.windowId,
                title   : t('New ActiveSync device'),
                message : t('A new account was set up on your mobile device. Please confirm that it was you to enable this device') +
                    ': ' + (device.version || device.name || '')
            });

            // only this client's status: the map may have changed meanwhile (other sessions, new devices)
            await client.set('User', {update: {[user.id]: {[`clients/${id}/status`]: yes ? 'allowed' : 'denied'}}})
        }
    } catch (e) {
        notifyError(mainView, e)
    }
}

ModuleRegistry.register({
    package   : 'legacy',
    name      : 'sync',
    title     : t('Synchronization'),
    iconCls   : 'fa fa-rotate',
    capability: 'go:legacy:sync',
    // GO.sync.SettingsPanel in My account (userSettingsPanels)
    userSettings: {
        title  : t('Synchronization'),
        iconCls: 'fa fa-rotate',
        panel  : () => import('./view/SettingsPanel.mjs')
    },
    onMainView: checkForNewDevices
});
