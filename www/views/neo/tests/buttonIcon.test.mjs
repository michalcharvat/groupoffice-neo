// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: Button}       = await import('../src/button/Button.mjs'),
      {default: HeaderButton} = await import('../src/tab/HeaderButton.mjs');

// one glyph only: the Material ligature and the Font Awesome ::before would overlap
[Button, HeaderButton].forEach(cls => describe(`${cls.prototype.className} icon / iconCls`, () => {
    const glyph = b => ({material: b.iconNode.cls.includes('go-icon'), text: b.iconNode.text, fa: b.iconNode.cls.includes('fa-gear'), shown: !b.iconNode.removeDom});

    it('shows only the Font Awesome glyph when iconCls is set', () => {
        const b = Neo.create(cls, {icon: 'settings', iconCls: 'fa-gear'});
        assert.deepEqual(glyph(b), {material: false, text: undefined, fa: true, shown: true});
        b.destroy()
    });

    it('shows the Material icon when there is no iconCls', () => {
        const b = Neo.create(cls, {icon: 'settings'});
        assert.deepEqual(glyph(b), {material: true, text: 'settings', fa: false, shown: true});
        b.destroy()
    });

    it('switches when iconCls is set or cleared later', () => {
        const b = Neo.create(cls, {icon: 'settings'});
        b.iconCls = 'fa-gear';
        assert.deepEqual(glyph(b), {material: false, text: undefined, fa: true, shown: true});
        b.icon = 'tune'; // a new Material icon under an active iconCls stays hidden
        assert.deepEqual(glyph(b), {material: false, text: undefined, fa: true, shown: true});
        b.iconCls = null;
        assert.deepEqual(glyph(b), {material: true, text: 'tune', fa: false, shown: true});
        b.icon = null;
        assert.equal(glyph(b).shown, false);
        b.destroy()
    });
}));
