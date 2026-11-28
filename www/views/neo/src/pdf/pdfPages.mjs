/**
 * Which pages a PDF view draws and what its title says, without DOM or pdf.js, so it is shared by the App worker
 * (src/pdf/PdfViewer.mjs) and the main thread addon (src/main/addon/PdfJs.mjs) and is unit tested
 * (tests/pdfPages.test.mjs).
 *
 * Two modes, as in the classic PdfViewPanel:
 * - preview: the first `previewPages` pages of the document
 * - page list: only the given 1-based pages (e.g. the pages of a job's manual), at most `maxListedPages`
 */

/** Default number of pages of a preview */
export const PREVIEW_PAGES = 10;

/** A page list draws at most this many pages: a canvas at scale 1.5 takes about 8 MB */
export const MAX_LISTED_PAGES = 200;

/**
 * @summary A page list as the views keep it: positive integers, or null for "the preview".
 * @param {Number[]|null|undefined} pages
 * @returns {Number[]|null}
 */
export function normalizePages(pages) {
    if (!Array.isArray(pages)) {
        return null
    }

    const list = pages.map(Number).filter(n => Number.isInteger(n) && n > 0);

    return list.length ? list : null
}

/**
 * @summary The page numbers to draw, in order.
 * @param {Object} options
 * @param {Number} options.numPages         pages of the loaded document
 * @param {Number[]|null} [options.pages]   page list, null for the preview
 * @param {Number} [options.previewPages]
 * @param {Number} [options.maxListedPages]
 * @returns {Number[]}
 */
export function pagesToDraw({numPages, pages = null, previewPages = PREVIEW_PAGES, maxListedPages = MAX_LISTED_PAGES}) {
    const list = normalizePages(pages);

    if (list) {
        // pages the document does not have are skipped
        return list.filter(page => page <= numPages).slice(0, maxListedPages)
    }

    const count = Math.min(numPages, previewPages),
          result = [];

    for (let page = 1; page <= count; page++) {
        result.push(page)
    }

    return result
}

/**
 * @summary The title of the view: the requested pages, the preview limit or plain "PDF".
 * The requested pages are listed also when the document lacks them (nothing is drawn for those); a list longer
 * than maxListedPages ends in "…", only that many are drawn.
 * @param {Object} options
 * @param {Function} options.t                 translator
 * @param {Number|null} options.numPages       null while nothing is loaded
 * @param {Number[]|null} [options.pages]
 * @param {Number} [options.previewPages]
 * @param {Number} [options.maxListedPages]
 * @returns {String} plain text
 */
export function pagesTitle({t, numPages, pages = null, previewPages = PREVIEW_PAGES, maxListedPages = MAX_LISTED_PAGES}) {
    const list = normalizePages(pages);

    if (list) {
        return t('PDF - pages') + ' ' + list.slice(0, maxListedPages).join(', ') + (list.length > maxListedPages ? ', …' : '')
    }

    if (numPages > previewPages) {
        return t('PDF - preview of the first {count} pages').replace('{count}', String(previewPages))
    }

    return 'PDF'
}

/**
 * @summary Whether a source is drawn by pdf.js or shown as an image.
 * @param {String|null} type a MIME type or an extension ("application/pdf", "pdf", "image/png", "jpg")
 * @returns {String|null} 'pdf', 'image' or null when unknown
 */
export function previewKind(type) {
    const value = String(type || '').toLowerCase().trim();

    if (value === 'pdf' || value === 'application/pdf') {
        return 'pdf'
    }

    if (value.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(value)) {
        return 'image'
    }

    return null
}

/** Zoom steps of the toolbar buttons, 1 = 100 % */
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4];

/**
 * @summary The next zoom step up or down from a zoom value.
 * @param {Number} zoom
 * @param {Number} direction 1 = in, -1 = out
 * @returns {Number} the zoom itself at either end
 */
export function nextZoom(zoom, direction) {
    if (direction > 0) {
        return ZOOM_STEPS.find(step => step > zoom + 1e-9) ?? zoom
    }

    return [...ZOOM_STEPS].reverse().find(step => step < zoom - 1e-9) ?? zoom
}

/** A page range takes at most this many pages, as amd/dms util/PageRangeParser.php */
export const MAX_RANGE_PAGES = 500;

/**
 * @summary The pages of a printer style range ("3", "2-5", "1,3,5-7"), in the order entered with repeats, as the
 * server side amd/dms util/PageRangeParser.php reads it.
 * @param {String} range
 * @param {Number} numPages pages of the document
 * @returns {Number[]|null} 1-based pages, null when the range is invalid, empty, out of the document or longer than
 * MAX_RANGE_PAGES
 */
export function parsePageRange(range, numPages) {
    const pages = [];

    for (const part of String(range ?? '').split(',')) {
        // the whitespace of PHP's trim() and \s, not JavaScript's (which takes a pasted no-break space)
        const token = part.replace(/^[ \t\n\r\v\f\0]+|[ \t\n\r\v\f\0]+$/g, ''),
              match = token.match(/^(\d+)[ \t\n\r\v\f]*-[ \t\n\r\v\f]*(\d+)$/) || token.match(/^(\d+)$/);

        if (!match) {
            return null
        }

        const from = parseInt(match[1], 10),
              to   = parseInt(match[2] ?? match[1], 10);

        if (from < 1 || to < from || to > numPages || pages.length + to - from + 1 > MAX_RANGE_PAGES) {
            return null
        }

        for (let page = from; page <= to; page++) {
            pages.push(page)
        }
    }

    return pages.length ? pages : null
}
