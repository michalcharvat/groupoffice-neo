import client       from '../../../../views/neo/src/jmap/Client.mjs';
import {translator} from '../../../../views/neo/src/Translate.mjs';

/**
 * t() of the smime module (its strings live in modules/smime/language)
 * @type {Function}
 */
export const t = translator('legacy', 'smime');

/** Account permission to add, change and delete certificates (smime Certificate::checkPermissionLevel) */
export const LEVEL_WRITE = 30;

/**
 * Accounts whose certificate password is in the PHP session (ExtJS GO.smime.passwordsInSession).
 * Keyed with the security token too: a shared worker outlives the PHP session of a logout.
 * @type {Set<String>}
 */
const passwords = new Set();

const passwordKey = accountId => client.constructor.securityToken() + ':' + accountId;

/**
 * @param {Number|String} accountId
 * @returns {Boolean} the server has the certificate password of the account in its session
 */
export function hasPassword(accountId) {
    return passwords.has(passwordKey(accountId))
}

/**
 * Remembers that the server has the certificate password of the account
 * @param {Number|String} accountId
 */
export function setPassword(accountId) {
    passwords.add(passwordKey(accountId))
}

/**
 * Forgets that the server has the password, e.g. after a new certificate was added
 * @param {Number|String} accountId
 */
export function clearPassword(accountId) {
    passwords.delete(passwordKey(accountId))
}

// ------------------------------------------------------------- private keys (PKCS#12)

/**
 * The account's PKCS#12 certificates, newest first
 * @param {Number} accountId
 * @returns {Promise<Object[]>} [{id, serial, valid_since, valid_until, provided_by}]
 */
export async function certificates(accountId) {
    const response = await client.legacy('smime/certificate/store', {account_id: accountId, limit: 1000});
    return response.results || []
}

/**
 * Adds a PKCS#12 certificate (needs write permission on the account)
 * @param {Object} params
 * @param {Number} params.accountId
 * @param {String} params.blobId the uploaded .p12 / .pfx file
 * @param {String} params.password the certificate's password
 * @returns {Promise<Object>}
 */
export async function uploadCertificate({accountId, blobId, password}) {
    const response = await client.legacy('smime/certificate/upload', {account_id: accountId, blobId, smime_password: password});

    if (!response.success) {
        throw new Error(response.feedback || t('This certificate already exists'))
    }

    // the newest certificate signs now: its password must be checked again
    clearPassword(accountId);
    return response
}

/**
 * @param {Number} id
 * @returns {Promise<Object>}
 */
export function deleteCertificate(id) {
    return client.legacy('smime/certificate/delete', {id})
}

/**
 * @param {Number} id
 * @returns {String} download URL of the .p12 file
 */
export function downloadUrl(id) {
    return client.legacyUrl('smime/certificate/download', {id})
}

/**
 * Checks the password of the account's newest certificate; a correct one stays in the PHP
 * session for signing, encrypting and decrypting
 * @param {Number} accountId
 * @param {String} password
 * @returns {Promise<Boolean>} the password is correct
 */
export async function checkPassword(accountId, password) {
    let correct;

    try {
        correct = !!(await client.legacy('smime/certificate/checkPassword', {account_id: accountId, password})).passwordCorrect
    } catch (e) {
        // readPKCS12() throws "The SMIME password was incorrect." (in the user's language)
        // instead of answering false
        const message = e.message || '';

        if (message.includes(t('The SMIME password was incorrect.')) || message.includes('Unauthorized')) {
            return false
        }

        throw e
    }

    correct && setPassword(accountId);
    return correct
}

// ------------------------------------------------------------- public certificates

/**
 * The user's public certificates of other people
 * @param {String} [query] search text
 * @returns {Promise<Object[]>} [{id, email}]
 */
export async function publicCertificates(query='') {
    const response = await client.legacy('smime/publicCertificate/store', {limit: 1000, sort: 'email', dir: 'ASC', query});
    return response.results || []
}

/**
 * @param {Number[]} ids
 * @returns {Promise<Object>}
 */
export function deletePublicCertificates(ids) {
    return client.legacy('smime/publicCertificate/store', {delete_keys: JSON.stringify(ids)})
}

/**
 * Imports a PEM certificate for an e-mail address
 * @param {String} blobId
 * @param {String} email
 * @returns {Promise<Object>}
 */
export async function importPublicCertificate(blobId, email) {
    const response = await client.legacy('smime/publicCertificate/import', {blobId, email});

    if (!response.success) {
        throw new Error(t('Could not add SMIME certificate for') + ' ' + email)
    }

    return response
}

/**
 * Imports a PEM certificate attached to a message as the sender's
 * @param {Object} message {accountId, mailbox, uid}
 * @param {Object} attachment {number, encoding}
 * @param {String} sender e-mail address
 * @returns {Promise<Object>}
 */
export async function importAttachment({accountId, mailbox, uid}, attachment, sender) {
    const response = await client.legacy('smime/publicCertificate/importAttachment', {
        account_id: accountId,
        mailbox,
        uid,
        number    : attachment.number,
        encoding  : attachment.encoding,
        sender
    });

    if (!response.success) {
        throw new Error(t('Could not add SMIME certificate for') + ' ' + sender)
    }

    return response
}

/**
 * Verifies the signature of a message and imports the sender's certificate, or parses a stored
 * public certificate (certId)
 * @param {Object} params
 * @param {String} params.email the sender, compared with the certificate
 * @param {Object} [params.message] {accountId, mailbox, uid}
 * @param {Number} [params.certId]
 * @returns {Promise<Object>} {valid, emails[], name, hash, serialNumber, version, issuer{}, validFrom, validTo, ocspFound, ocsp, ocspMsg}
 */
export async function verify({email, message=null, certId=null}) {
    const params = {email: email || ''};

    if (certId) {
        params.cert_id = certId
    } else {
        Object.assign(params, {account_id: message.accountId, mailbox: message.mailbox, uid: message.uid, filepath: ''})
    }

    return (await client.legacy('smime/publicCertificate/verify', params)).data || {}
}

/**
 * The verdict on a verified certificate (ExtJS GO.smime.checkCert)
 * @param {String} email the sender
 * @param {Object} data verify() result
 * @returns {{state: String, icon: String, text: String}} state 'valid' | 'mismatch' | 'invalid'
 */
export function checkCert(email, data) {
    const emails = data.emails || [];

    if (data.valid === false) {
        return {state: 'invalid', icon: 'gpp_bad', text: t('The certificate is invalid!')}
    }

    if (!emails.includes(String(email || '').toLowerCase())) {
        return {state: 'mismatch', icon: 'warning', text: t('Valid certificate but the e-mail of the certificate does not match the sender address of the e-mail.')}
    }

    // ocsp: false = revoked or the check failed (ocspMsg says why); no OCSP URI = not checked
    if (data.ocsp === false) {
        return {state: 'invalid', icon: 'close', text: t('The certificate is invalid!')}
    }

    return {state: 'valid', icon: 'verified_user', text: t('Valid certificate')}
}
