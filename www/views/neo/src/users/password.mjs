import client from '../jmap/Client.mjs';

/**
 * A random password of the given length (go.form.PasswordGeneratorField)
 * @param {Number} length
 * @returns {String}
 */
export function generatePassword(length) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_+=?',
          bytes = crypto.getRandomValues(new Uint32Array(length));

    return Array.from(bytes, n => chars[n % chars.length]).join('')
}

/**
 * The core module settings (go.Modules.get('core', 'core').settings), e.g.
 * passwordMinLength and defaultGroups
 * @returns {Promise<Object>}
 */
export async function loadCoreSettings() {
    const {list} = await client.queryGet('Module', {filter: {package: 'core', name: 'core'}, properties: ['id', 'package', 'name', 'settings']});

    return list[0]?.settings || {}
}
