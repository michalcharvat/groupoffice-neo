import client from '../../../../../../../views/neo/src/jmap/Client.mjs';

/**
 * Encrypted note content (GOUI notes Encrypt.ts), compatible with it.
 *
 * - "{ENCRYPTED}" content is encrypted in the browser: AES-GCM with the SHA-256 of the
 *   password as key; the text after the prefix is the IV (12 bytes, hex) and the base64
 *   ciphertext. The server never sees the password.
 * - Old notes have a `password` and "{GOCRYPT}" / "{GOCRYPT2}" content, encrypted by the
 *   server. They are decrypted with Note/decrypt and can't be edited (classic UI too).
 *
 * The last password that worked (or encrypted) is kept in memory, like GOUI
 * Encrypt.lastPass, so the next note with the same password opens without asking.
 */
const PREFIX = '{ENCRYPTED}';

let lastPassword = '';

/**
 * @param {String} password
 * @param {String[]} usages
 * @param {Uint8Array} iv
 * @returns {Promise<Array>} [key, algorithm]
 */
async function createKey(password, usages, iv) {
    const hash      = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password)),
          algorithm = {name: 'AES-GCM', iv};

    return [await crypto.subtle.importKey('raw', hash, algorithm, false, usages), algorithm]
}

/**
 * Browser encryption is available (crypto.subtle needs a secure context)
 * @returns {Boolean}
 */
export function canEncrypt() {
    return !!globalThis.crypto?.subtle
}

/**
 * @param {String|null} content
 * @returns {Boolean} encrypted in the browser ("{ENCRYPTED}")
 */
export function isEncrypted(content) {
    return typeof content === 'string' && content.startsWith(PREFIX)
}

/**
 * @param {Object|null} note
 * @returns {Boolean} encrypted by the server in an old version (read only)
 */
export function isLegacyEncrypted(note) {
    return !!note?.password
}

/**
 * @param {Object|null} note
 * @returns {Boolean} the content can't be shown without a password
 */
export function isLocked(note) {
    return isLegacyEncrypted(note) || isEncrypted(note?.content)
}

/**
 * @returns {String} the last password that decrypted a note, '' for none
 */
export function getLastPassword() {
    return lastPassword
}

/**
 * @param {String} plaintext
 * @param {String} password
 * @returns {Promise<String>} "{ENCRYPTED}" + IV (hex) + ciphertext (base64)
 */
export async function encrypt(plaintext, password) {
    const iv               = crypto.getRandomValues(new Uint8Array(12)),
          [key, algorithm] = await createKey(password, ['encrypt'], iv),
          cipher           = new Uint8Array(await crypto.subtle.encrypt(algorithm, key, new TextEncoder().encode(plaintext))),
          ivHex            = Array.from(iv, b => b.toString(16).padStart(2, '0')).join('');

    let binary = '';
    cipher.forEach(b => binary += String.fromCharCode(b));

    lastPassword = password;

    return PREFIX + ivHex + btoa(binary)
}

/**
 * @param {String} content "{ENCRYPTED}..."
 * @param {String} password
 * @returns {Promise<String>} rejects when the password is wrong
 */
export async function decrypt(content, password) {
    const data             = content.slice(PREFIX.length),
          iv               = new Uint8Array(data.slice(0, 24).match(/.{2}/g).map(hex => parseInt(hex, 16))),
          cipher           = Uint8Array.from(atob(data.slice(24)), ch => ch.charCodeAt(0)),
          [key, algorithm] = await createKey(password, ['decrypt'], iv),
          plaintext        = new TextDecoder().decode(await crypto.subtle.decrypt(algorithm, key, cipher));

    lastPassword = password;

    return plaintext
}

/**
 * Decrypts a note's content, browser or server encrypted
 * @param {Object} note {content, password}
 * @param {String} password
 * @returns {Promise<String>} rejects when the password is wrong
 */
export async function decryptNote(note, password) {
    if (!isLegacyEncrypted(note)) {
        return decrypt(note.content, password)
    }

    const response = await client.call('Note/decrypt', {data: note.content, password});

    lastPassword = password;

    return response.content
}
