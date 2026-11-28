// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: CodeField} = await import('../src/form/field/CodeField.mjs');

/**
 * A fake main thread addon: the editor's text, normalised like CodeMirror (line breaks → \n)
 */
function fakeAddon() {
    const addon = {
        text: null,
        createInstance: async ({value}) => ({baseline: addon.text = String(value).replace(/\r\n?/g, '\n')}),
        setValue      : async ({value}) => addon.text = String(value ?? '').replace(/\r\n?/g, '\n'),
        getValue      : async () => addon.text,
        setReadOnly   : async () => {},
        destroyInstance: async () => {}
    };
    return addon
}

describe('GO.form.field.CodeField', () => {
    let addon, importAddon, fields = [];

    beforeEach(() => {
        addon = fakeAddon();
        Neo.ns('GO.main.addon', true).CodeMirror = addon;
        importAddon = Neo.Main.importAddon;
        Neo.Main.importAddon = async () => {}
    });

    afterEach(() => {
        Neo.Main.importAddon = importAddon;
        fields.forEach(f => f.destroy());
        fields = []
    });

    async function mounted(config) {
        const field = Neo.create(CodeField, {appName: 'test', windowId: 1, name: 'configuration', ...config});
        fields.push(field);
        field.mounted = true;
        await new Promise(resolve => setTimeout(resolve, 0));
        return field
    }

    it('keeps the loaded value when the editor only normalised it', async () => {
        const field = await mounted({value: '{"a":\r\n1}'});

        assert.equal(await field.flush(), '{"a":\r\n1}');
        assert.equal(field.isDirty, false)
    });

    it('takes the edited text, and the loaded value back when edited back', async () => {
        const field = await mounted({value: '{"a": 1}'});

        addon.text = '{"a": 2}';
        assert.equal(await field.flush(), '{"a": 2}');
        assert.equal(field.isDirty, true);

        addon.text = '{"a": 1}';
        await field.flush();
        assert.equal(field.isDirty, false)
    });

    it('an empty editor of a null value stays null', async () => {
        const field = await mounted({value: null});

        assert.equal(await field.flush(), null);
        assert.equal(field.isDirty, false)
    });

    it('a change event of an older mount is dropped', async () => {
        const field = await mounted({value: 'x'});

        field.onEditorChange({id: field.id, token: -1, value: 'old'});
        assert.equal(field.value, 'x')
    });

    it('reports invalid JSON with the parse message, accepts valid or empty JSON', async () => {
        const field = await mounted({value: '{"a": }'});

        assert.equal(field.validate(false), false);
        assert.match(field.error, /^Invalid JSON: /);

        addon.text = '[1, 2]';
        await field.flush();
        assert.equal(field.validate(false), true);

        addon.text = '';
        await field.flush();
        assert.equal(field.validate(false), true);

        field.required = true;
        assert.equal(field.validate(false), false)
    });

    it('reset() shows the value again when the editor holds unsent typing', async () => {
        const field = await mounted({value: 'A'});

        addon.text = 'B';           // typed, debounce not fired yet
        field.reset('A');
        assert.equal(await field.flush(), 'A');
        assert.equal(field.isDirty, false)
    });

    it('a mode change while the editor is created recreates it in the new mode', async () => {
        const modes = [];
        let release;
        const create = addon.createInstance;
        addon.createInstance = async args => { modes.push(args.mode); if (modes.length === 1) await new Promise(r => release = r); return create(args) };

        const field = Neo.create(CodeField, {appName: 'test', windowId: 1, name: 'c', value: '{}'});
        fields.push(field);
        field.mounted = true;
        await new Promise(resolve => setTimeout(resolve, 0));
        field.mode = 'javascript';
        release();
        await new Promise(resolve => setTimeout(resolve, 0));

        assert.deepEqual(modes, ['json', 'javascript'])
    });

    it('whitespace only is empty for a required field', async () => {
        const field = await mounted({value: '   ', required: true});
        assert.equal(field.validate(false), false)
    });

    it('does not check JSON in another mode', async () => {
        const field = await mounted({value: 'function () {', mode: 'javascript'});
        assert.equal(field.validate(false), true)
    });

    it('falls back to a textarea when the library does not load', async () => {
        addon.createInstance = async () => { throw new Error('Failed to load') };
        const warn = console.warn;
        console.warn = () => {};

        try {
            const field = await mounted({value: '{}'});

            assert.equal(field.fallback, true);
            assert.equal(field.boxNode.cn[0].tag, 'textarea');

            field.syncInputValue = () => {};   // not rendered: no vnode
            field.onTextareaInput({value: '{"b": 1}'});
            assert.equal(field.value, '{"b": 1}');
            assert.equal(field.isDirty, true);

            // typed back to the loaded text
            field.onTextareaInput({value: '{}'});
            assert.equal(field.isDirty, false)
        } finally {
            console.warn = warn
        }
    });
});
