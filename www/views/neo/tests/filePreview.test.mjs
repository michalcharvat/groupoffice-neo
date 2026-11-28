// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
// GO.preview.FilePreview and its kinds (src/preview/previewKinds.mjs)
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';
import {extensionOf, previewKindOf, registerPreview} from '../src/preview/previewKinds.mjs';
import {sanitizeHtml} from '../src/Format.mjs';

setup({appConfig: {name: 'test'}});
// goUrl() resolves against the page; node has no location
globalThis.location ??= {href: 'http://localhost/views/neo/'};

const {default: FilePreview} = await import('../src/preview/FilePreview.mjs');
const {docxToHtml, sheetRowsToHtml} = await import('../src/preview/officePreviews.mjs');

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('previewKinds (file preview)', () => {
    it('extension first, from the name when not given', () => {
        assert.equal(previewKindOf({extension: 'PDF'}), 'pdf');
        assert.equal(previewKindOf({extension: '.md'}), 'markdown');
        assert.equal(previewKindOf({name: 'photo.JPG'}), 'image');
        assert.equal(previewKindOf({name: 'notes.txt', type: 'application/pdf'}), 'text');
        assert.equal(previewKindOf({name: 'clip.webm'}), 'video');
        assert.equal(previewKindOf({extension: 'mp3'}), 'audio');
        assert.equal(extensionOf('archive.tar.GZ'), 'gz');
        assert.equal(extensionOf('README'), '');
    });

    it('MIME type when the extension is unknown or missing', () => {
        assert.equal(previewKindOf({type: 'application/pdf'}), 'pdf');
        assert.equal(previewKindOf({type: 'image/png'}), 'image');
        assert.equal(previewKindOf({type: 'text/plain; charset=utf-8'}), 'text');
        assert.equal(previewKindOf({type: 'text/markdown'}), 'markdown');
        assert.equal(previewKindOf({type: 'audio/ogg'}), 'audio');
        assert.equal(previewKindOf({extension: 'bin', type: 'video/mp4'}), 'video');
        assert.equal(previewKindOf({extension: 'zip', type: 'application/zip'}), null);
        assert.equal(previewKindOf({}), null);
    });

    it('registered kinds come after the built-in ones', () => {
        registerPreview('testsheet', {extensions: ['TESTX'], types: ['application/x-test-sheet'], render: async () => '<p>sheet</p>'});

        assert.equal(previewKindOf({name: 'a.testx'}), 'testsheet');
        assert.equal(previewKindOf({type: 'application/x-test-sheet'}), 'testsheet');
        registerPreview('testpdf', {types: ['application/pdf', 'text/csv'], render: async () => ''});
        assert.equal(previewKindOf({type: 'application/pdf'}), 'pdf');
        assert.equal(previewKindOf({type: 'text/csv'}), 'text');
        assert.throws(() => registerPreview('pdf', {render: async () => ''}), /built in/);
    });
});

describe('GO.preview.FilePreview', () => {
    let fetchBefore, pending, previews = [];

    beforeEach(() => {
        fetchBefore = globalThis.fetch;
        pending     = {};
        // a fetch per URL that the test answers with pending[url](text)
        globalThis.fetch = url => new Promise(resolve => {
            pending[String(url).split('/').pop()] = text => resolve({ok: true, text: async () => text})
        })
    });

    afterEach(() => {
        globalThis.fetch = fetchBefore;
        previews.forEach(p => p.destroy());
        previews = []
    });

    function create() {
        const preview = Neo.create(FilePreview, {appName: 'test'});

        previews.push(preview);
        return preview
    }

    const visible = (preview, ref) => !preview.getReference(ref).cls.includes('go-hidden');

    it('text is escaped in a pre', async () => {
        const preview = create();

        preview.setFile({src: 'a.txt', name: 'a.txt'});
        await tick();
        pending['a.txt']('<b>x</b>');
        await tick();

        assert.equal(preview.getReference('content').html, '<pre>&lt;b&gt;x&lt;/b&gt;</pre>');
        assert.ok(visible(preview, 'content'));
        assert.ok(!visible(preview, 'viewer'));
    });

    it('only the latest file renders', async () => {
        const preview = create();

        preview.setFile({src: 'old.txt', name: 'old.txt'});
        await tick();
        preview.setFile({src: 'new.md', name: 'new.md'});
        await tick();
        pending['new.md']('# New');
        await tick();
        pending['old.txt']('old');
        await tick();

        assert.match(preview.getReference('content').html, /<h1>New<\/h1>/);
        assert.equal(preview.isLoading, false);
    });

    it('Markdown is sanitised', async () => {
        const preview = create();

        preview.setFile({src: 'x.md', name: 'x.md'});
        await tick();
        pending['x.md']('<script>alert(1)</script><img src="javascript:alert(1)" onerror="x">ok');
        await tick();

        const html = preview.getReference('content').html;
        assert.ok(!/script|onerror|javascript/i.test(html), html);
        assert.match(html, /ok/);
    });

    it('Markdown with the host HTML is a frame, media are players, no preview is the fallback', async () => {
        const preview = create();

        preview.setFile({src: 'x.md', name: 'x.md', htmlUrl: 'api/page.php/x"y'});
        await tick();
        assert.match(preview.getReference('content').html, /^<iframe src="http:\/\/localhost\/api\/page\.php\/x%22y" title="x\.md"><\/iframe>$/);
        assert.equal(Object.keys(pending).length, 0);

        preview.setFile({src: 'song.mp3', name: 'song.mp3'});
        await tick();
        assert.match(preview.getReference('content').html, /^<audio controls preload="metadata" src="[^"]*song\.mp3"><\/audio>$/);

        preview.setFile({src: 'download.php?blob=1', name: '<a>.zip'});
        await tick();
        assert.ok(visible(preview, 'fallback'));
        assert.match(preview.getReference('fallbackText').html, /&lt;a&gt;\.zip/);

        preview.setFile(null);
        await tick();
        assert.ok(['viewer', 'content', 'fallback'].every(ref => !visible(preview, ref)));
    });

    it('a registered kind renders its HTML', async () => {
        const preview = create();

        registerPreview('testdoc', {extensions: ['testdoc'], render: async ({name}) => `<p>${name}</p>`});
        preview.setFile({src: 'download.php?blob=2', name: 'r.testdoc'});
        await tick();
        await tick();

        assert.equal(preview.getReference('content').html, '<p>r.testdoc</p>');
    });
});

describe('sheet and docx previews (officePreviews.mjs)', () => {
    it('registers sheet and docx with FilePreview', () => {
        assert.equal(previewKindOf({name: 'Report.XLSX'}), 'sheet');
        assert.equal(previewKindOf({extension: 'xls'}), 'sheet');
        assert.equal(previewKindOf({type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), 'sheet');
        assert.equal(previewKindOf({name: 'letter.docx'}), 'docx');
        assert.equal(previewKindOf({name: 'old.doc'}), null);
    });

    it('escapes the cells, pads short rows, header when the addon says so', () => {
        const html = sheetRowsToHtml({rows: [['Name', 'Qty'], ['<b>x</b>', '5'], ['only']], header: true});

        assert.equal(html, '<table class="go-filepreview-sheet"><thead><tr><th>Name</th><th>Qty</th></tr></thead>' +
            '<tbody><tr><td>&lt;b&gt;x&lt;/b&gt;</td><td>5</td></tr><tr><td>only</td><td></td></tr></tbody></table>');
    });

    it('no header without the flag or with one row; notes cut rows and columns; empty sheet', () => {
        assert.ok(!sheetRowsToHtml({rows: [['a', 'b'], ['1', '2']]}).includes('<thead>'));
        assert.ok(!sheetRowsToHtml({rows: [['a', 'b']], header: true}).includes('<thead>'));
        assert.match(sheetRowsToHtml({rows: [['1'], ['2']], truncated: true}), /Only the first 2 rows are shown\./);
        assert.match(sheetRowsToHtml({rows: [['1', '2']], columnsCut: true}), /Only the first 2 columns are shown\./);
        assert.match(sheetRowsToHtml({rows: []}), /go-empty/);
    });

    it('docxToHtml sanitises what the Mammoth addon returns and calls it in the window', async () => {
        const calls      = [],
              importAddon = Neo.Main.importAddon;

        Neo.Main.importAddon = async args => calls.push(['import', args]);
        Neo.ns('GO.main.addon', true).Mammoth = {
            convertToHtml: async args => {
                calls.push(['convert', args]);
                return '<p onclick="x()">Hi<script>alert(1)</script><img src="javascript:alert(1)"></p>'
            }
        };

        try {
            assert.equal(await docxToHtml('api/download.php?blob=1', 'w1'), '<p>Hi</p>');
            assert.deepEqual(calls[0], ['import', {name: 'WS/Mammoth', windowId: 'w1'}]);
            assert.equal(calls[1][1].windowId, 'w1');
            assert.equal(calls[1][1].url, 'http://localhost/api/download.php?blob=1');

            const controller = new AbortController();
            controller.abort();
            await assert.rejects(docxToHtml('a.docx', 'w1', controller.signal));
            assert.equal(calls.filter(([kind]) => kind === 'convert').length, 1);
        } finally {
            Neo.Main.importAddon = importAddon;
            delete GO.main.addon.Mammoth
        }
    });

    it('sanitizeHtml keeps base64 raster images of a docx, drops other data URLs', () => {
        const png = 'data:image/png;base64,iVBORw0KGgo=';

        assert.equal(sanitizeHtml(`<p><img src="${png}" alt="a"></p>`), `<p><img src="${png}" alt="a"></p>`);
        assert.equal(sanitizeHtml('<img src="data:image/svg+xml;base64,PHN2Zz4=">'), '');
        assert.equal(sanitizeHtml('<img src="data:text/html;base64,PHN2Zz4=">'), '');
        assert.equal(sanitizeHtml('<img src="data:image/png;base64,x&quot;onerror=alert(1)">'), '');
    });
});
