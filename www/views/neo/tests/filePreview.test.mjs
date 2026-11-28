// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
// GO.preview.FilePreview and its kinds (src/preview/previewKinds.mjs)
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';
import {extensionOf, previewKindOf, registerPreview} from '../src/preview/previewKinds.mjs';

setup({appConfig: {name: 'test'}});
// goUrl() resolves against the page; node has no location
globalThis.location ??= {href: 'http://localhost/views/neo/'};

const {default: FilePreview} = await import('../src/preview/FilePreview.mjs');

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
        registerPreview('testsheet', {extensions: ['XLSX'], types: ['application/x-test-sheet'], render: async () => '<p>sheet</p>'});

        assert.equal(previewKindOf({name: 'a.xlsx'}), 'testsheet');
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
