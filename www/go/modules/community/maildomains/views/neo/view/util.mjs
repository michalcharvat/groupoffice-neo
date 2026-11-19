import client from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {escapeHtml, fileSize, formatUserDateTime, smartDateTime} from '../../../../../../../views/neo/src/Format.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';

export const t = translator('community', 'maildomains');

/** bytes per MB: quotas are bytes on the server, MB in the dialogs (GOUI multiplier) */
export const MB = 1024 * 1024;

/**
 * autoExpunge value ("0" or "<days>d", GOUI AutoExpungeField) → switch and days
 * @param {String|null} value
 * @returns {{enabled: Boolean, days: Number}}
 */
export function expungeToForm(value) {
    const expunge = String(value ?? '30d');
    return {enabled: expunge !== '0', days: parseInt(expunge) || 30}
}

/**
 * Switch and days → autoExpunge value
 * @param {Boolean} enabled
 * @param {Number|String} days
 * @returns {String}
 */
export function expungeToEntity(enabled, days) {
    return enabled ? (parseInt(days) || 30) + 'd' : '0'
}

/**
 * Status icon (Material) with the GOUI status colour
 * @param {Boolean} ok
 * @returns {String} html
 */
export function statusIcon(ok) {
    return `<i class="go-icon go-md-status ${ok ? 'go-md-success' : 'go-md-danger'}">${ok ? 'check_circle' : 'warning'}</i>`
}

/**
 * GOUI mailDomainStatus(): inactive, or all DNS checks (MX, SPF, DMARC, enabled DKIM keys) fine
 * @param {Object} domain
 * @returns {String} html
 */
export function domainStatusHtml(domain) {
    if (!domain) {
        return ''
    }

    if (!domain.active) {
        return `<i class="go-icon go-md-status go-md-disabled" title="${escapeHtml(t('Inactive'))}">unpublished</i>`
    }

    const dkimOk = Object.values(domain.dkim || {}).every(key => !key.enabled || key.status);

    return statusIcon(!!(domain.mxStatus && domain.dmarcStatus && domain.spfStatus && dkimOk))
}

export const yesNoRenderer = ({value}) => value ? t('Yes') : t('No');

/** GOUI: 0 is unlimited */
export const quotaRenderer = ({value}) => value ? escapeHtml(fileSize(value)) : t('Unlimited');

export const usageRenderer = ({value}) => value > 0 ? escapeHtml(fileSize(value)) : '0 B';

export const dateRenderer = ({value}) => value ? `<span title="${escapeHtml(formatUserDateTime(value))}">${escapeHtml(smartDateTime(value, false))}</span>` : '';

/** Principal id → name, for the owner / created by / modified by columns */
const principalNames = new Map();

export function principalName(id) {
    return id ? principalNames.get(String(id)) ?? '' : ''
}

export const principalRenderer = ({value}) => escapeHtml(principalName(value));

/**
 * Fetches the names of the given principals that are not known yet
 * @param {Array} ids
 * @returns {Promise<Boolean>} true when names were added
 */
export async function loadPrincipalNames(ids) {
    const missing = [...new Set(ids.filter(Boolean).map(String))].filter(id => !principalNames.has(id));

    if (!missing.length) {
        return false
    }

    try {
        (await client.get('Principal', missing, ['id', 'name'])).forEach(p => principalNames.set(String(p.id), p.name))
    } catch (e) {
        return false
    }

    // unknown or deleted users: don't ask again
    missing.forEach(id => principalNames.has(id) || principalNames.set(id, ''));
    return true
}

/**
 * Settings of a module (Module/get by package and name)
 * @param {String} pkg
 * @param {String} name
 * @returns {Promise<Object>}
 */
export async function moduleSettings(pkg, name) {
    try {
        const {list} = await client.queryGet('Module', {filter: {package: pkg, name}, properties: ['id', 'settings']});
        return list[0]?.settings || {}
    } catch (e) {
        return {}
    }
}
