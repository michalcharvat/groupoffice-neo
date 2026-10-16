import client from '../../../../../../views/neo/src/jmap/Client.mjs';
import {avatarColor, escapeHtml, initials} from '../../../../../../views/neo/src/Format.mjs';
import {lookup, translator} from '../../../../../../views/neo/src/Translate.mjs';

export const t = translator('community', 'addressbook');

/**
 * Options of a type list in the language file (emailTypes, phoneTypes, addressTypes,
 * dateTypes, urlTypes) as [[id, name]] (go.modules.community.addressbook.typeStoreData)
 * @param {String} langKey
 * @returns {Array[]}
 */
export function typeOptions(langKey) {
    const types = lookup(langKey, 'community', 'addressbook') || lookup(langKey) || {};
    return Object.entries(types)
}

/**
 * Translated type of an e-mail address, phone number, …
 * @param {String} langKey e.g. 'emailTypes'
 * @param {String} type
 * @returns {String}
 */
export function typeName(langKey, type) {
    return (lookup(langKey, 'community', 'addressbook') || {})[type] || type || ''
}

/**
 * The user's address book settings (User.addressBookSettings), loaded once per worker
 * and updated by whoever saves them
 */
export const settings = {
    value: null,

    async load() {
        if (!this.value) {
            const [user] = await client.get('User', [client.user.id], ['addressBookSettings']);
            this.value = user?.addressBookSettings || {}
        }

        return this.value
    },

    get sortBy() {
        return this.value?.sortBy || 'name'
    }
};

/**
 * Module permissions (Module::getUserRights(), JMAP session capability)
 * @returns {Object} {mayChangeAddressbooks, mayExportContacts, …}
 */
export function userRights() {
    return client.session?.capabilities?.['go:community:addressbook'] || {}
}

/**
 * Name as the grid shows it: "Last, First Middle" when the user sorts by last name
 * (go.modules.community.addressbook.renderName)
 * @param {Object} contact
 * @returns {String}
 */
export function renderName(contact) {
    if (!contact.isOrganization && settings.sortBy === 'lastName' && contact.lastName) {
        let name = contact.lastName + ', ' + (contact.firstName || '');
        contact.middleName && (name += ' ' + contact.middleName);
        return name
    }

    return contact.name || ''
}

/**
 * Link of an online profile (Utils.transformUrl): a bare user name becomes the profile URL
 * @param {String} url
 * @param {String} type
 * @returns {String}
 */
export function transformUrl(url, type) {
    url = String(url || '');

    if (/^https?:\/\//i.test(url)) {
        return url
    }

    switch (type) {
        case 'twitter':
            return 'https://twitter.com/' + url;
        case 'facebook':
            return 'https://www.facebook.com/' + url;
        case 'linkedin':
            return 'https://linkedin.com/in/' + url;
        case 'instagram':
            return 'https://www.instagram.com/' + url;
        default:
            return 'http://' + url
    }
}

/**
 * @param {String} blobId
 * @param {Number} size px
 * @returns {String} thumbnail URL
 */
export function thumbUrl(blobId, size = 80) {
    return client.baseUrl + 'api/thumb.php?blob=' + encodeURIComponent(blobId) + `&w=${size}&h=${size}&zc=1`
}

/**
 * @param {String} blobId
 * @param {Boolean} [inline=false]
 * @returns {String} download URL of a blob
 */
export function downloadUrl(blobId, inline = false) {
    return client.baseUrl + 'api/download.php?blob=' + encodeURIComponent(blobId) + (inline ? '&inline=1' : '')
}

/**
 * Avatar of a contact (go.util.avatar): the photo, a business icon for organizations,
 * else the initials; the contact's colour
 * @param {Object} contact
 * @param {String[]} [cls]
 * @returns {String} HTML
 */
export function contactAvatarHtml(contact, cls = []) {
    const name  = contact.name || '',
          color = contact.color ? '#' + String(contact.color).replace(/[^0-9a-f]/gi, '') : avatarColor(name),
          classes = ['go-avatar', ...cls].join(' ');

    if (contact.photoBlobId) {
        return `<img class="${classes}" alt="" title="${escapeHtml(name)}" src="${escapeHtml(thumbUrl(contact.photoBlobId))}">`
    }

    const content = contact.isOrganization ? '<i class="go-icon">business</i>' : escapeHtml(initials(name));

    return `<span class="${classes}" style="background-color:${color}" title="${escapeHtml(name)}">${content}</span>`
}

/**
 * First letter for the index column, without accents
 * @param {String} value
 * @returns {String}
 */
export function indexChar(value) {
    return String(value || '').substr(0, 1).toUpperCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}
