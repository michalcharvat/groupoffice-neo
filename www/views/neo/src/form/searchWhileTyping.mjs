/**
 * @summary Search fields search while typing from 3 characters, Enter searches right away
 *
 * A search on one or two characters is the most expensive query, so the search fields
 * (SearchButton, GlobalSearch, SelectSearchDialog) send it while typing only from
 * MIN_SEARCH_CHARS characters or when the field is emptied. Enter searches for any text.
 */
export const MIN_SEARCH_CHARS = 3;

/**
 * @summary Whether typing this text starts a search
 * @param {String} text the field value
 * @returns {Boolean} true for an empty field or at least MIN_SEARCH_CHARS characters
 */
export function searchesWhileTyping(text) {
    text = String(text ?? '');

    return text === '' || text.trim().length >= MIN_SEARCH_CHARS
}
