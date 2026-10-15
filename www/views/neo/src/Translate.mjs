/**
 * Translations from GO's language files, like GOUI Translate.ts.
 *
 * app.mjs awaits load() before it imports any view, so t() can be called in
 * static configs and class fields. The language is fixed for the lifetime of
 * the App worker: Neo.php puts the language into the shared worker name, a
 * user with another language gets a new worker (see apps/go/app.mjs).
 *
 *     import {t} from '../Translate.mjs';
 *     t('Save')                          // core/core
 *
 *     // module code: own section first, then core/core
 *     const t = translator('community', 'notes');
 *     t('Note book')
 */

/** {package: {module: {key: text}}} */
let lang = {};

/** Keys without a translation, for translators: Neo.ns('GO.Translate').missing */
export const missing = {};

/**
 * @param {String} [url] Neo.config.goLanguageUrl
 * @returns {Promise<void>}
 */
export async function load(url = Neo.config.goLanguageUrl) {
    if (!url) {
        return
    }

    try {
        const response = await fetch(new URL(url, globalThis.location.href), {credentials: 'same-origin'});

        if (!response.ok) {
            throw new Error(response.status + ' ' + response.statusText)
        }

        lang = await response.json()
    } catch (e) {
        // untranslated UI rather than none
        console.warn('Failed to load translations', e)
    }
}

/**
 * @param {String} key usually the English text
 * @param {String} [pkg='core']
 * @param {String} [module='core']
 * @returns {String} key when there is no translation
 */
export function t(key, pkg = 'core', module = 'core') {
    const text = lang[pkg]?.[module]?.[key];

    if (typeof text === 'string' && text !== '') {
        return text
    }

    if (pkg !== 'core' || module !== 'core') {
        return t(key)
    }

    missing[key] = key;

    return key
}

/**
 * t() of a module: its own section, then core/core
 * @param {String} pkg    e.g. 'community'
 * @param {String} module e.g. 'notes'
 * @returns {Function} (key) => String
 */
export function translator(pkg, module) {
    return key => t(key, pkg, module)
}

/**
 * Current language, e.g. "en" or "cs"
 * @returns {String}
 */
export function language() {
    return Neo.config.goLanguage || 'en'
}

/**
 * Fills GO placeholders: fmt(t("Are you sure you want to delete '{item}'?"), {item: name}),
 * fmt(t('… "{0}" …'), [name])
 * @param {String} text
 * @param {Object|Array} params
 * @returns {String}
 */
export function fmt(text, params) {
    return text.replace(/\{(\w+)\}/g, (match, key) => key in Object(params) ? String(params[key]) : match)
}

/**
 * Raw language value, also for non-string entries like full_months / short_days
 * @param {String} key
 * @param {String} [pkg='core']
 * @param {String} [module='core']
 * @returns {*} undefined when missing
 */
export function lookup(key, pkg = 'core', module = 'core') {
    return lang[pkg]?.[module]?.[key]
}
