import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import client         from '../../../../../../views/neo/src/jmap/Client.mjs';
import {translator}   from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'jitsimeet');

/**
 * Random room name: 8 random bytes, base64url
 * @returns {String}
 */
function roomName() {
    return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(8))))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * A new meeting (GOUI onlineMeetingServices.register('Jitsi Meet')): its URL, signed with a
 * JWT when the server requires one
 * @returns {Promise<String>}
 */
async function createMeeting() {
    const {list}   = await client.queryGet('Module', {filter: {package: 'community', name: 'jitsimeet'}, properties: ['id', 'settings']}),
          settings = list[0]?.settings || {},
          room     = roomName();

    if (!settings.videoJwtEnabled) {
        return settings.videoUri + room
    }

    const {jwt} = await client.call('community/jitsimeet/Auth/generateJWT', {room});
    return settings.videoUri + room + '?jwt=' + jwt
}

ModuleRegistry.register({
    package   : 'community',
    name      : 'jitsimeet',
    title     : 'Jitsi Meet',
    iconCls   : 'fa fa-video',
    capability: 'go:community:jitsimeet',
    systemSettings: {
        title  : 'Jitsi Meet',
        iconCls: 'fa fa-video',
        panel  : () => import('./view/SystemSettingsPanel.mjs')
    },
    /**
     * Online meeting service for the calendar's event dialog (GOUI onlineMeetingServices):
     * the dialog sets the event's location to the URL and appends the join text to its description
     */
    onlineMeeting: {
        name    : 'Jitsi Meet',
        create  : createMeeting,
        joinText: () => t('Join the online meeting now')
    }
});
