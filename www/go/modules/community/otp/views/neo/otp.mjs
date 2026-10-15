import client         from '../../../../../../views/neo/src/jmap/Client.mjs';
import PasswordPrompt from '../../../../../../views/neo/src/view/PasswordPrompt.mjs';
import {translator}   from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'otp');

/**
 * OTP helpers (go.modules.community.otp in Module.js / Settings.js)
 */

/**
 * The otp module's settings: enforceForGroupId, block, countDown
 * @returns {Promise<Object>}
 */
export async function loadSettings() {
    const {list} = await client.queryGet('Module', {filter: {package: 'community', name: 'otp'}, properties: ['id', 'settings']});
    return list[0]?.settings || {}
}

/**
 * @param {Object} user User with groups
 * @param {Object} settings
 * @returns {Boolean} the administrator requires OTP for one of the user's groups
 */
export function isEnforced(user, settings) {
    const groupId = settings.enforceForGroupId;
    return !!groupId && (user.groups || []).map(String).includes(String(groupId))
}

/**
 * User/set of the given user that asks for the current password when the server wants it
 * (go.AuthenticationManager.passwordPrompt), until it is right or the user cancels.
 * @param {Object} opts
 * @param {String} opts.appName
 * @param {String} opts.windowId
 * @param {String|Number} opts.userId
 * @param {Object} opts.data User properties
 * @param {String} opts.title prompt title
 * @param {String} opts.message prompt text
 * @param {Boolean} [opts.askFirst] ask before the first try (GO: not for administrators)
 * @param {Boolean} [opts.closable=true] false: cancelling the prompt asks again
 * @returns {Promise<Object|null>} the updated properties the server returns, null when cancelled
 */
export async function saveWithPassword({appName, windowId, userId, data, title, message, askFirst = false, closable = true}) {
    let password = null,
        ask      = askFirst,
        wrong    = false;

    for (;;) {
        if (ask) {
            password = await PasswordPrompt.ask({
                appName, windowId, title,
                message: sentences(wrong ? t('The password was incorrect') : '', message)
            });

            if (password === null) {
                if (closable) {
                    return null
                }
                continue
            }
        }

        const update   = password ? {...data, currentPassword: password} : data,
              response = await client.call('User/set', {update: {[userId]: update}}),
              error    = response.notUpdated?.[userId];

        if (!error) {
            return response.updated?.[userId] || {}
        }

        const passwordError = error.validationErrors?.currentPassword;

        if (!passwordError) {
            const e = new Error(client.constructor.describeSetError(error));
            e.validationErrors = error.validationErrors || null;
            throw e
        }

        // required: ask; invalid: ask again
        wrong = !!password;
        ask   = true
    }
}

/**
 * Joins translated sentences, adding the full stop some translations lack
 * @param {...String} texts empty ones are left out
 * @returns {String}
 */
export function sentences(...texts) {
    return texts.filter(Boolean).map(text => /[.!?:]$/.test(text.trim()) ? text.trim() : text.trim() + '.').join(' ')
}
