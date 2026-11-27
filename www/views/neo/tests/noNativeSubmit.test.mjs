// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

await import('../src/form/noNativeSubmit.mjs');

const {default: TabHeaderButton} = await import('../node_modules/neo.mjs/src/tab/header/Button.mjs'),
      {default: SplitButton}     = await import('../node_modules/neo.mjs/src/button/Split.mjs'),
      {default: TableHeader}     = await import('../node_modules/neo.mjs/src/table/header/Button.mjs'),
      {default: FormContainer}   = await import('../node_modules/neo.mjs/src/form/Container.mjs');

describe('noNativeSubmit', () => {
    it('renders tab header, split and table header buttons as type="button"', () => {
        [TabHeaderButton, SplitButton, TableHeader].forEach(module => {
            const button = Neo.create(module, {text: 'Tab'});

            try {
                assert.equal(button.getVdomRoot().tag, 'button');
                assert.equal(button.getVdomRoot().type, 'button', module.config.className);
                // table header: the <th> wrapper stays untyped, its native button is the root
                assert.equal(button.vdom.tag === 'button' || button.vdom.type === undefined, true)
            } finally {
                button.destroy()
            }
        })
    });

    it('keeps an explicit submit type and leaves url buttons as links', () => {
        const submit = Neo.create(TabHeaderButton, {text: 'Save', vdom: {tag: 'button', type: 'submit', cn: []}}),
              link   = Neo.create(TabHeaderButton, {text: 'Link', url: 'https://example.com'});

        try {
            submit.disabled = true;
            assert.equal(submit.getVdomRoot().type, 'submit');
            assert.equal(link.getVdomRoot().tag, 'a');
            assert.equal(link.getVdomRoot().type, undefined);

            link.url = null;
            assert.equal(link.getVdomRoot().tag, 'button');
            assert.equal(link.getVdomRoot().type, 'button')
        } finally {
            submit.destroy();
            link.destroy()
        }
    });

    it('renders forms with novalidate and their tab header buttons as type="button"', () => {
        const form = Neo.create(FormContainer, {items: [{module: TabHeaderButton, text: 'A'}]});

        try {
            assert.equal(form.vdom.novalidate, true);
            assert.equal(form.items[0].vdom.type, 'button')
        } finally {
            form.destroy()
        }
    });
});
