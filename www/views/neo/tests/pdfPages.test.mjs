// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
// src/pdf/pdfPages.mjs: which pages GO.pdf.PdfViewer draws, its title, the preview kind of a source and the zoom steps
import assert from 'node:assert/strict';
import {
    MAX_RANGE_PAGES, nextZoom, normalizePages, pagesTitle, pagesToDraw, parsePageRange, previewKind, ZOOM_STEPS
} from '../src/pdf/pdfPages.mjs';

const t = key => key;

describe('pdfPages (PDF viewer)', () => {
    it('normalizePages: positive integers only, empty means the preview', () => {
        assert.equal(normalizePages(null), null);
        assert.equal(normalizePages([]), null);
        assert.equal(normalizePages('3'), null);
        assert.deepEqual(normalizePages([3, '4', 0, -1, 2.5, 'x']), [3, 4]);
        assert.equal(normalizePages([0, -2]), null);
    });

    it('pagesToDraw: the preview is the first previewPages pages', () => {
        assert.deepEqual(pagesToDraw({numPages: 3}), [1, 2, 3]);
        assert.deepEqual(pagesToDraw({numPages: 14}), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        assert.deepEqual(pagesToDraw({numPages: 14, previewPages: 2}), [1, 2]);
        assert.deepEqual(pagesToDraw({numPages: 0}), []);
    });

    it('pagesToDraw: a page list keeps its order, skips missing pages and is capped', () => {
        assert.deepEqual(pagesToDraw({numPages: 14, pages: [12, 3, 40]}), [12, 3]);
        assert.deepEqual(pagesToDraw({numPages: 14, pages: [40]}), []);
        assert.deepEqual(pagesToDraw({numPages: 500, pages: [1, 2, 3, 4], maxListedPages: 2}), [1, 2]);
    });

    it('pagesTitle: page list, preview limit, plain PDF', () => {
        assert.equal(pagesTitle({t, numPages: 14, pages: [12, 3, 40]}), 'PDF - pages 12, 3, 40');
        assert.equal(pagesTitle({t, numPages: 14, pages: [1, 2, 3], maxListedPages: 2}), 'PDF - pages 1, 2, …');
        assert.equal(pagesTitle({t, numPages: 14}), 'PDF - preview of the first 10 pages');
        assert.equal(pagesTitle({t, numPages: 10}), 'PDF');
        assert.equal(pagesTitle({t, numPages: null}), 'PDF');
    });

    it('previewKind: MIME types and extensions', () => {
        assert.equal(previewKind('application/pdf'), 'pdf');
        assert.equal(previewKind('PDF'), 'pdf');
        assert.equal(previewKind('image/jpeg'), 'image');
        assert.equal(previewKind('png'), 'image');
        assert.equal(previewKind('docx'), null);
        assert.equal(previewKind(null), null);
    });

    it('nextZoom: steps up and down, stops at the ends, snaps from between steps', () => {
        assert.equal(nextZoom(1, 1), 1.25);
        assert.equal(nextZoom(1, -1), 0.75);
        assert.equal(nextZoom(ZOOM_STEPS.at(-1), 1), ZOOM_STEPS.at(-1));
        assert.equal(nextZoom(ZOOM_STEPS[0], -1), ZOOM_STEPS[0]);
        assert.equal(nextZoom(1.1, 1), 1.25);
        assert.equal(nextZoom(1.1, -1), 1);
    });

    it('parsePageRange: printer style ranges in the order entered, like PageRangeParser.php', () => {
        assert.deepEqual(parsePageRange('3', 10), [3]);
        assert.deepEqual(parsePageRange(' 5-7 , 1,3 ', 10), [5, 6, 7, 1, 3]);
        assert.deepEqual(parsePageRange('2 - 3,2', 10), [2, 3, 2]);
        assert.deepEqual(parsePageRange('1-10', 10).length, 10);

        for (const invalid of ['', ' ', '\u00a01', '1\u00a0-\u00a03', '0', '11', '3-2', '1-11', '1,', 'a', '1;2', '-2', '1.5', '1-2-3']) {
            assert.equal(parsePageRange(invalid, 10), null, invalid);
        }

        assert.equal(parsePageRange('1-' + MAX_RANGE_PAGES, 1000).length, MAX_RANGE_PAGES);
        assert.equal(parsePageRange('1-' + MAX_RANGE_PAGES + ',1', 1000), null);
    });
});
