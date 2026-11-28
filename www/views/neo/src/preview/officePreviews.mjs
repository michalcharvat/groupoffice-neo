import {escapeHtml, sanitizeHtml} from '../Format.mjs';
import {goUrl}                    from '../pdf/PdfViewer.mjs';
import {fmt, t}                   from '../Translate.mjs';
import {registerPreview}          from './previewKinds.mjs';

/**
 * Sheet and docx previews of GO.preview.FilePreview, registered when this module loads (FilePreview imports it).
 * The libraries run on the main thread (src/main/addon/SheetJs.mjs, Mammoth.mjs) and load on first use from
 * views/neo/lib; the HTML is built or sanitised here.
 *
 *     const html = await docxToHtml(downloadUrl, windowId);   // sanitised HTML of a docx, e.g. for an import
 */

/** At most this many rows and columns of a sheet are shown */
export const SHEET_ROW_LIMIT    = 1000,
             SHEET_COLUMN_LIMIT = 100;

// vendored copies (views/neo/lib/*/); the version only busts the browser cache
const XLSX_SCRIPT    = 'views/neo/lib/xlsx/xlsx.full.min.js?v=0.20.3',
      MAMMOTH_SCRIPT = 'views/neo/lib/mammoth/mammoth.browser.min.js?v=1.13.0';

/**
 * @summary Loads a main thread addon in the window and returns it.
 * @param {String} name class name below GO.main.addon
 * @param {String} windowId
 * @param {AbortSignal} [signal] stops before the addon is called
 * @returns {Promise<Object>}
 */
async function addon(name, windowId, signal) {
    await Neo.Main.importAddon({name: 'WS/' + name, windowId});
    // shortcut: an abort after this point does not stop the main thread's fetch and parsing; the caller drops the result
    signal?.throwIfAborted();

    return Neo.ns('GO.main.addon.' + name)
}

/**
 * @summary An escaped table of sheet rows, with notes when rows or columns were cut.
 * @param {Object} sheet what GO.main.addon.SheetJs readFirstSheet() returns
 * @param {String[][]} sheet.rows cell texts
 * @param {Boolean} [sheet.header=false] the first row is a header (all its cells are text)
 * @param {Boolean} [sheet.truncated=false] there are more rows than given
 * @param {Boolean} [sheet.columnsCut=false] there are more columns than given
 * @returns {String} HTML
 */
export function sheetRowsToHtml({rows, header = false, truncated = false, columnsCut = false}) {
    if (!rows.length) {
        return `<p class="go-empty">${escapeHtml(t('This sheet is empty.'))}</p>`
    }

    const width    = Math.max(...rows.map(row => row.length)),
          cells    = (row, tag) => Array.from({length: width}, (x, i) => `<${tag}>${escapeHtml(row[i] ?? '')}</${tag}>`).join(''),
          isHeader = header && rows.length > 1,
          body     = (isHeader ? rows.slice(1) : rows).map(row => `<tr>${cells(row, 'td')}</tr>`).join(''),
          note     = text => `<p class="go-empty">${escapeHtml(text)}</p>`;

    return '<table class="go-filepreview-sheet">' +
        (isHeader ? `<thead><tr>${cells(rows[0], 'th')}</tr></thead>` : '') +
        `<tbody>${body}</tbody></table>` +
        (truncated  ? note(fmt(t('Only the first {count} rows are shown.'), {count: rows.length})) : '') +
        (columnsCut ? note(fmt(t('Only the first {count} columns are shown.'), {count: width})) : '')
}

/**
 * @summary The first sheet of an xls / xlsx file as an escaped table, at most SHEET_ROW_LIMIT rows and
 * SHEET_COLUMN_LIMIT columns.
 * @param {String} url same-origin URL (relative to GO's root or absolute)
 * @param {String} windowId window whose main thread reads the file
 * @param {AbortSignal} [signal]
 * @returns {Promise<String>} HTML
 */
export async function sheetToHtml(url, windowId, signal) {
    return sheetRowsToHtml(await (await addon('SheetJs', windowId, signal)).readFirstSheet({
        url       : goUrl(url),
        scriptUrl : goUrl(XLSX_SCRIPT),
        maxRows   : SHEET_ROW_LIMIT,
        maxColumns: SHEET_COLUMN_LIMIT,
        windowId
    }))
}

/**
 * @summary A docx file as sanitised HTML (Format.sanitizeHtml(): formatting, tables, links and images).
 * @param {String} url same-origin URL (relative to GO's root or absolute), also a blob: URL of the window
 * @param {String} windowId window whose main thread converts the file
 * @param {AbortSignal} [signal]
 * @returns {Promise<String>} HTML
 */
export async function docxToHtml(url, windowId, signal) {
    const html = await (await addon('Mammoth', windowId, signal)).convertToHtml({
        url      : goUrl(url),
        scriptUrl: goUrl(MAMMOTH_SCRIPT),
        windowId
    });

    return sanitizeHtml(html)
}

registerPreview('sheet', {
    extensions: ['xls', 'xlsx'],
    types     : ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    render    : ({src, windowId, signal}) => sheetToHtml(src, windowId, signal)
});

registerPreview('docx', {
    extensions: ['docx'],
    types     : ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    render    : async ({src, windowId, signal}) => `<div class="go-filepreview-docx">${await docxToHtml(src, windowId, signal)}</div>`
});
