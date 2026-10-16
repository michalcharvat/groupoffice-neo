import {t} from '../Translate.mjs';

/**
 * Translated name of a module (its language file's "name")
 * @param {Object} module
 * @returns {String}
 */
export function moduleTitle(module) {
    const title = t('name', module.package || 'legacy', module.name);
    // t() falls back to core's "name"
    return title === t('name') ? module.name : title
}

/**
 * Entity name as words in the module's language: "NoteBook" → "Note book"
 * @param {String} name
 * @param {Object} module
 * @returns {String}
 */
export function entityTitle(name, module) {
    const words = name.replace(/([a-z])([A-Z])/g, '$1 $2'),
          text  = words.charAt(0) + words.slice(1).toLowerCase();

    return t(text, module.package || 'legacy', module.name)
}
