// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';
import {editorJsSame, editorJsToHtml, isEditorJsEmpty, isHtmlEmpty, restoreImageUrls, rootImageUrls, safeUrl, toEditorJsDoc} from '../src/form/field/editorJsDoc.mjs';

setup({appConfig: {name: 'test'}});

const {default: EditorJsField} = await import('../src/form/field/EditorJsField.mjs');
const {default: client}        = await import('../src/jmap/Client.mjs');

// the client passes Format.sanitizeHtml(); here a marker proves the inline HTML went through it
const sani = html => `[${html}]`,
      doc  = text => ({blocks: [{type: 'paragraph', data: {text}}]}),
      tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('editorJsDoc', () => {
    it('editorJsSame ignores time, version and the cropper state', () => {
        const a   = {time: 1, version: '2.30', blocks: [{id: 'x', type: 'paragraph', data: {text: 'Hi'}}]},
              b   = {time: 2, version: '2.31', blocks: [{id: 'x', type: 'paragraph', data: {text: 'Hi'}}]},
              img = cropper => ({blocks: [{type: 'image', data: {file: {url: 'u'}}, tunes: {imageResize: {resize: 50, ...cropper}}}]});

        assert.equal(editorJsSame(a, b), true);
        assert.equal(editorJsSame(a, doc('Ho')), false);
        assert.equal(editorJsSame(img({}), img({cropperInterface: {x: 1}})), true);
        assert.equal(editorJsSame(null, {blocks: []}), true)
    });

    it('isEditorJsEmpty: no blocks or one empty paragraph', () => {
        assert.equal(isEditorJsEmpty(null), true);
        assert.equal(isEditorJsEmpty({blocks: []}), true);
        assert.equal(isEditorJsEmpty(doc('')), true);
        assert.equal(isEditorJsEmpty(doc('x')), false);
        assert.equal(isEditorJsEmpty({blocks: [{type: 'header', data: {text: ''}}]}), false)
    });

    it('toEditorJsDoc parses JSON of a document and refuses other values', () => {
        assert.deepEqual(toEditorJsDoc('{"blocks":[{"type":"paragraph","data":{"text":"a"}}]}'), doc('a'));
        assert.deepEqual(toEditorJsDoc({blocks: []}), {blocks: []});
        assert.equal(toEditorJsDoc('{blocks: []}'), null);
        assert.equal(toEditorJsDoc('x'), null);
        assert.equal(toEditorJsDoc([]), null);
        assert.equal(toEditorJsDoc(null), null)
    });

    it('isHtmlEmpty: tags, breaks and spaces only', () => {
        assert.equal(isHtmlEmpty('<p><o:p>&nbsp;</o:p></p><br/> '), true);
        assert.equal(isHtmlEmpty(null), true);
        assert.equal(isHtmlEmpty('<p>x</p>'), false)
    });

    it('rootImageUrls makes relative image URLs absolute, restoreImageUrls brings them back', () => {
        const img   = url => ({type: 'image', data: {file: {url}}}),
              made  = new Map(),
              doc0  = {blocks: [img('download.php?blob=a'), img('/api/download.php?blob=b'), img('https://x/y.png'), img('data:image/png;base64,AA'), {type: 'paragraph', data: {text: 'download.php'}}]},
              shown = rootImageUrls(doc0, '/go/api/', made);

        assert.deepEqual(shown.blocks.map(b => b.data.file?.url), ['/go/api/download.php?blob=a', '/api/download.php?blob=b', 'https://x/y.png', 'data:image/png;base64,AA', undefined]);
        assert.deepEqual(restoreImageUrls(shown, made), doc0);
        const plain = doc('x');
        assert.equal(rootImageUrls(plain, '/go/api/'), plain);
        assert.equal(restoreImageUrls(doc0, new Map()), doc0)

        const legacy = {blocks: [{type: 'image', data: {url: ' download.php?blob=c', file: {id: 7}}}]},
              made2  = new Map(),
              shown2 = rootImageUrls(legacy, '/go/api/', made2);

        assert.deepEqual(shown2.blocks[0].data, {url: '/go/api/download.php?blob=c', file: {id: 7}});
        assert.deepEqual(restoreImageUrls(shown2, made2), legacy);
        assert.equal(rootImageUrls(shown2, '/go/api/'), shown2)
    });

    it('safeUrl allows http(s) and relative URLs only', () => {
        assert.equal(safeUrl('https://x/a.png'), 'https://x/a.png');
        assert.equal(safeUrl('/api/download.php?blob=1'), '/api/download.php?blob=1');
        assert.equal(safeUrl('java\nscript:alert(1)'), null);
        assert.equal(safeUrl('javascript:alert(1)'), null);
        assert.equal(safeUrl('data:image/png;base64,x'), null);
        assert.equal(safeUrl(''), null)
    });

    it('editorJsToHtml renders the blocks, inline HTML through the sanitizer', () => {
        const html = editorJsToHtml({blocks: [
            {type: 'header', data: {text: 'T', level: 3}},
            {type: 'paragraph', data: {text: '<b>b</b>'}, tunes: {alignment: {alignment: 'center'}}},
            {type: 'paragraph', data: {text: ''}},
            {type: 'list', data: {style: 'ordered', items: [{content: 'a', items: [{content: 'a1', items: []}]}, {content: 'b', items: []}]}},
            {type: 'list', data: {style: 'unordered', items: ['x']}},
            {type: 'list', data: {style: 'checklist', items: [{content: 'c', meta: {checked: true}, items: []}]}},
            {type: 'table', data: {withHeadings: true, content: [['h'], ['v']]}},
            {type: 'code', data: {code: '<script>'}},
            {type: 'image', data: {file: {url: '/api/download.php?blob=ab'}, caption: 'cap'}},
            {type: 'image', data: {file: {url: 'javascript:alert(1)'}}},
            {type: 'quote', data: {text: 'q', caption: 'w'}},
            {type: 'delimiter', data: {}},
            {type: 'unknown', data: {text: 'nope'}}
        ]}, sani);

        assert.equal(html,
            '<div class="go-ejs">' +
            '<h3>[T]</h3>' +
            '<p style="text-align: center">[<b>b</b>]</p>' +
            '<ol><li>[a]<ol><li>[a1]</li></ol></li><li>[b]</li></ol>' +
            '<ul><li>[x]</li></ul>' +
            '<ul class="go-ejs-checklist"><li><span class="go-ejs-check">☑</span> [c]</li></ul>' +
            '<table class="go-ejs-table"><tr><th>[h]</th></tr><tr><td>[v]</td></tr></table>' +
            '<pre class="go-ejs-code"><code>&lt;script&gt;</code></pre>' +
            '<figure class="go-ejs-image"><img src="/api/download.php?blob=ab" alt="cap"><figcaption>[cap]</figcaption></figure>' +
            '<blockquote>[q]<footer>[w]</footer></blockquote>' +
            '<hr>' +
            '</div>')
    });

    it('editorJsToHtml: nothing to show is null', () => {
        assert.equal(editorJsToHtml(null, sani), null);
        assert.equal(editorJsToHtml({blocks: []}, sani), null);
        assert.equal(editorJsToHtml(doc(''), sani), null)
    });

    it('editorJsToHtml shows the source of diagram blocks as text', () => {
        assert.equal(editorJsToHtml({blocks: [{type: 'flowcharts', data: {code: 'a -> <b>'}}, {type: 'a2s', data: {code: ''}}, {type: 'a2s', data: {code: '+-+'}}]}, sani),
            '<div class="go-ejs"><pre class="go-ejs-code"><code>a -&gt; &lt;b&gt;</code></pre><pre class="go-ejs-code"><code>+-+</code></pre></div>')
    });

    it('editorJsToHtml keeps the numbering of an ordered nested checklist', () => {
        assert.equal(editorJsToHtml({blocks: [{type: 'nestedchecklist', data: {style: 'ordered', items: [{content: 'a', checked: true, items: []}, {content: 'b', checked: null, items: []}]}}]}, s => s),
            '<div class="go-ejs"><ol class="go-ejs-checklist"><li><span class="go-ejs-check">☑</span> a</li><li><span class="go-ejs-check">☐</span> b</li></ol></div>')
    });
});

/**
 * A fake main thread addon: Editor.js normalises a document on save (adds time and block ids)
 */
function fakeAddon() {
    const save  = value => value ? {time: Date.now(), version: '2.31', blocks: value.blocks.map((b, i) => ({id: 'b' + i, ...b}))} : {time: 1, blocks: []},
          addon = {
              doc           : null,
              createInstance: async ({value}) => ({baseline: addon.doc = save(value)}),
              setValue      : async ({value}) => addon.doc = save(value),
              setHtml       : async ({html}) => addon.doc = save(doc(html.replace(/<[^>]*>/g, ''))),
              getValue      : async () => addon.doc,
              setReadOnly   : async () => {},
              destroyInstance: async () => {}
          };
    return addon
}

describe('GO.form.field.EditorJsField', () => {
    let addon, importAddon, hasCapability, fields = [];

    beforeEach(() => {
        addon = fakeAddon();
        Neo.ns('GO.main.addon', true).EditorJs = addon;
        importAddon   = Neo.Main.importAddon;
        hasCapability = client.hasCapability;
        Neo.Main.importAddon = async () => {};
        client.hasCapability = name => name === 'go:sf:editorjs'
    });

    afterEach(() => {
        Neo.Main.importAddon = importAddon;
        client.hasCapability = hasCapability;
        fields.forEach(f => f.destroy());
        fields = []
    });

    function create(config) {
        const field = Neo.create(EditorJsField, {appName: 'test', windowId: 1, name: 'content', ...config});
        fields.push(field);
        return field
    }

    async function mounted(config) {
        const field = create(config);
        field.mounted = true;
        await tick();
        return field
    }

    it('keeps the loaded value when the editor only re-saved it', async () => {
        const loaded = doc('Hi'),
              field  = await mounted({value: loaded});

        assert.deepEqual(await field.flush(), loaded);
        assert.equal(field.isDirty, false)
    });

    it('shows relative image URLs absolute and saves them as stored', async () => {
        const loaded = {blocks: [{type: 'image', data: {file: {url: 'download.php?blob=a'}}}]},
              field  = await mounted({value: loaded});

        assert.equal(addon.doc.blocks[0].data.file.url, client.apiUrl + 'download.php?blob=a');
        assert.deepEqual(await field.flush(), loaded);
        assert.equal(field.isDirty, false);

        addon.doc = {blocks: [...addon.doc.blocks, {type: 'paragraph', data: {text: 'Hi'}}]};
        assert.equal((await field.flush()).blocks[0].data.file.url, 'download.php?blob=a');
        assert.equal(field.isDirty, true)
    });

    it('takes an edited document, and the loaded value back when edited back', async () => {
        const loaded = doc('Hi'),
              field  = await mounted({value: loaded});

        addon.doc = doc('Ho');
        assert.deepEqual((await field.flush()).blocks, doc('Ho').blocks);
        assert.equal(field.isDirty, true);

        addon.doc = {time: 5, blocks: [{id: 'b0', type: 'paragraph', data: {text: 'Hi'}}]};
        assert.deepEqual(await field.flush(), loaded);
        assert.equal(field.isDirty, false)
    });

    it('a change event of an older mount is dropped', async () => {
        const field = await mounted({value: doc('x')});

        field.onEditorChange({id: field.id, token: -1, value: doc('old')});
        assert.deepEqual(field.value, doc('x'))
    });

    it('setValueFromHtml() puts the converted blocks in as a change', async () => {
        const field = await mounted({value: null});

        await field.setValueFromHtml('<p>From Word</p>');
        assert.equal(field.value.blocks[0].data.text, 'From Word');
        assert.equal(field.isDirty, true)
    });

    it('setValueFromHtml() of empty HTML changes nothing', async () => {
        const loaded = doc('Hi'),
              field  = await mounted({value: loaded});

        await field.setValueFromHtml('<p>&nbsp;</p>');
        assert.deepEqual(field.value, loaded)
    });

    it('setValueFromHtml() before the editor exists waits for it', async () => {
        const field = create({value: null});

        await field.setValueFromHtml('<p>Later</p>');
        assert.equal(field.value, null);

        field.mounted = true;
        await tick();
        await field.flush();
        assert.equal(field.value.blocks[0].data.text, 'Later')
    });

    it('flush() during the creation of the editor waits for it and takes a waiting import', async () => {
        let release;
        const createInstance = addon.createInstance;
        addon.createInstance = async args => { await new Promise(r => release = r); return createInstance(args) };

        const field = create({value: null});
        field.mounted = true;
        await field.setValueFromHtml('<p>Docx</p>');

        const flushed = field.flush();
        await tick();
        release();

        assert.equal((await flushed).blocks[0].data.text, 'Docx')
    });

    it('a value set while the import waits for the editor drops the import', async () => {
        const field = create({value: null});

        await field.setValueFromHtml('<p>Old record</p>');
        field.value = doc('Other');
        field.mounted = true;
        await tick();

        assert.deepEqual((await field.flush()).blocks.map(b => b.data.text), ['Other'])
    });

    it('setValueFromHtml() takes an image alone', async () => {
        const field = await mounted({value: null});
        let sent = null;
        addon.setHtml = async ({html}) => addon.doc = {blocks: [{type: 'image', data: {file: {url: sent = html}}}]};

        await field.setValueFromHtml('<img src="/a.png">');
        assert.equal(sent, '<img src="/a.png">');
        assert.equal(field.value.blocks[0].type, 'image')
    });

    it('an empty required field without the editor does not block the form', async () => {
        client.hasCapability = () => false;
        const field = await mounted({value: null, required: true});

        assert.equal(field.validate(false), true)
    });

    it('without sf/editorjs shows the document as text and keeps the value', async () => {
        client.hasCapability = () => false;
        let imported = false;
        Neo.Main.importAddon = async () => { imported = true };

        const loaded = doc('<b>Hi</b>'),
              field  = await mounted({value: loaded});

        assert.equal(imported, false);
        assert.equal(field.fallback, true);
        assert.match(field.holderNode.html, /<b>Hi<\/b>/);
        assert.deepEqual(await field.flush(), loaded);
        assert.equal(field.isDirty, false);

        await field.setValueFromHtml('<p>x</p>');
        assert.deepEqual(field.value, loaded)
    });

    it('falls back to text when the library does not load', async () => {
        addon.createInstance = async () => { throw new Error('Failed to load') };
        const error = console.error;
        console.error = () => {};

        try {
            const field = await mounted({value: doc('Hi')});

            assert.equal(field.fallback, true);
            assert.match(field.holderNode.html, /Hi/)
        } finally {
            console.error = error
        }
    });
});
