// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {classify, contrast, literalColour, parseColor, risky, scanColours, tokenRisky} from '../buildScripts/auditDarkMode.mjs';

describe('auditDarkMode', () => {
    it('parses computed colours', () => {
        assert.deepEqual(parseColor('rgb(1, 2, 3)'), [1, 2, 3, 1]);
        assert.deepEqual(parseColor('rgba(255, 255, 255, 0.89)'), [255, 255, 255, 0.89]);
        assert.deepEqual(parseColor('color(srgb 1 0 0 / 0.5)'), [255, 0, 0, 0.5]);
        assert.equal(parseColor('oklch(0.5 0.1 200)'), null);
        assert.equal(Math.round(contrast([0, 0, 0, 1], [255, 255, 255])), 21)
    });

    it('flags a light background and dark text on dark, not light text or disabled text', () => {
        const dark = 'rgb(30, 32, 37)';

        assert.equal(classify({bg: 'rgb(255, 255, 255)'}), 'light-background');
        assert.equal(classify({bg: 'rgba(255, 255, 255, 0.1)'}), null);
        assert.equal(classify({bg: 'rgba(0, 0, 0, 0)', hasText: true, color: 'rgb(0, 0, 0)', effectiveBg: dark}), 'dark-text');
        assert.equal(classify({bg: 'rgba(0, 0, 0, 0)', hasText: true, color: 'rgba(255, 255, 255, 0.89)', effectiveBg: dark}), null);
        assert.equal(classify({bg: 'rgba(0, 0, 0, 0)', hasText: true, color: 'rgb(0, 0, 0)', effectiveBg: dark, disabled: true}), null)
    });

    it('rates literals: light backgrounds and dark text are risky, tints and white text are not', () => {
        assert.deepEqual(literalColour('1px solid #fff'), [255, 255, 255, 1]);
        assert.deepEqual(literalColour('rgba(0, 0, 0, .5)'), [0, 0, 0, 0.5]);
        assert.equal(risky('background', '#fff0'), false);
        assert.equal(risky('background', '#ffffff80'), true);
        assert.equal(risky('background-color', '#fff'), true);
        assert.equal(risky('background-color', 'rgba(255, 255, 255, .15)'), false);
        assert.equal(risky('color', '#000'), true);
        assert.equal(risky('color', '#fff'), false);
        assert.equal(tokenRisky('--neo-board-background', '#f3f5f8'), true);
        assert.equal(tokenRisky('--neo-board-card-border-color', '#d5dbe3'), false)
    });

    it('lists literals with their line, skips token fallbacks, comments, shadows and dark-ok lines', () => {
        const css = [
            '.a {',
            '    color: #000;',                              // 2: risky
            '    background: var(--bg-lowest, #fff);',       // defined token: skipped
            '    border: 1px solid var(--nope, #ccc);',      // 4: undefined token: its fallback shows
            '    box-shadow: 0 1px 2px rgba(0, 0, 0, .3);',  // shadow: skipped
            '    /* color: #123456; */',
            '    background: #fff; // dark-ok: paper',
            '    white-space: nowrap;',
            '}'
        ].join('\n');

        assert.deepEqual(scanColours(css, false, new Set(['--bg-lowest'])).map(h => [h.line, h.prop, h.risky]), [[2, 'color', true], [4, 'border', false]]);
        assert.deepEqual(scanColours("style: {color: '#000'}, cls: 'x'\nconst id = '#abc';", true).map(h => h.line), [1]);
        assert.deepEqual(scanColours(`style: {color: 'inherit', backgroundColor: '#fff'}\nhtml: '<b style="background: #fff">'`, true).map(h => [h.line, h.prop]), [[1, 'backgroundColor'], [2, 'background']]);
        assert.deepEqual(scanColours("style: {color: 'var(--fg-text, #000)'}", true, new Set(['--fg-text'])), [])
    })
});
