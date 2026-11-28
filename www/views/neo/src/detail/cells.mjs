import {escapeHtml} from '../Format.mjs';

/**
 * Cells of the classic 12-column detail grid (go.detail.Panel templates): `<p class="s6 pad">
 * <label>Term</label><span>value</span></p>`. Styled in detail scrollers and detail cards
 * (resources/scss/go/shared/_detail-grid.scss), so a module detail writes the same classes and
 * order as its classic `views/extjs3/*Detail.js` and puts the HTML into a GO.detail.LinesCard
 * with setHtml().
 *
 *     card.setHtml(cellsHtml([
 *         ['s6 pad', t('Vessel'), vessel.name],
 *         ['s6 pad', t('Member'), {html: entityLink('AmdCrewMember', id, name)}],
 *         notes && ['s12 pad', t('Notes'), notes]          // false / null entries are left out
 *     ]))
 */

/**
 * @summary Text escaped, {html} as trusted markup.
 * @param {String|Number|{html: String}|null} value
 * @returns {String} HTML
 */
const toHtml = value => value && typeof value === 'object' ? String(value.html ?? '') : escapeHtml(value);

/**
 * @summary One cell: label and value; text is escaped, {html} is trusted markup. An empty label
 * leaves the label out; `{html: '&nbsp;'}` keeps an empty one, so the value lines up with the
 * cells next to it (classic `<label>&nbsp;</label>`).
 * @param {String} cls grid classes, e.g. 's6 pad'
 * @param {String|{html: String}} label
 * @param {String|Number|{html: String}|null} value
 * @returns {String} HTML
 */
export function cellHtml(cls, label, value) {
    return `<p class="${escapeHtml(cls)}">`
        + (label ? `<label>${toHtml(label)}</label>` : '')
        + `<span>${toHtml(value)}</span></p>`
}

/**
 * @summary The cells of a list, in order; falsy entries (a classic `<tpl if>`) are left out.
 * @param {Array[]} cells [cls, label, value] each
 * @returns {String} HTML
 */
export function cellsHtml(cells) {
    return (cells || []).filter(Boolean).map(([cls, label, value]) => cellHtml(cls, label, value)).join('')
}
