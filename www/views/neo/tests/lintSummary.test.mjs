// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {addedLines, missingSummaries} from '../buildScripts/lintSummary.mjs';

const source = `import Base from './Base.mjs';

/**
 * @summary A documented class.
 * @class GO.x.Foo
 */
class Foo extends Base {
    static config = {
        className: 'GO.x.Foo'
    }

    /**
     * @summary Documented.
     */
    documented() {
        this.call(1);
    }

    /**
     * Docblock without the tag
     */
    async undocumented(a, b) {
        return a + b
    }

    bare() {
        return 1
    }
}

function helper() {
    foo();
}

class Bar {
}
`;

describe('lintSummary', () => {
    it('reads added line numbers of a diff', () => {
        const diff = [
            'diff --git a/x.mjs b/x.mjs',
            '--- a/x.mjs',
            '+++ b/x.mjs',
            '@@ -1,0 +2,3 @@',
            '+a', '+b', '+c',
            '@@ -9 +12 @@',
            '-old', '+new',
            '--- a/gone.mjs',
            '+++ /dev/null'
        ].join('\n');

        assert.deepEqual([...addedLines(diff).get('x.mjs')], [2, 3, 4, 12])
    });

    it('flags only touched methods and classes without @summary', () => {
        // a line in each method body and in Bar's class line
        const missing = missingSummaries(source, new Set([16, 23, 27, 35]));

        assert.deepEqual(missing.map(m => m.kind + ' ' + m.name), ['method undocumented', 'method bare', 'class Bar'])
    });

    it('ignores untouched code, a class whose body only changed, and functions outside classes', () => {
        assert.deepEqual(missingSummaries(source, new Set([32])), []);
        assert.deepEqual(missingSummaries(source, new Set([9])), [])
    });

    it('skips hunk content that looks like a file header', () => {
        const diff = ['+++ b/a.mjs', '@@ -0,0 +1,2 @@', '+x', '+++ literal', '@@ -9 +5 @@', '-old', '+new'].join('\n');

        assert.deepEqual([...addedLines(diff).keys()], ['a.mjs']);
        assert.deepEqual([...addedLines(diff).get('a.mjs')], [1, 2, 5])
    });

    it('reads private methods, skips keywords and does not borrow a plain comment', () => {
        const src = ['/**', ' * @summary Doc.', ' */', 'class A {', '    /* note */', '    #priv() {', '    if (x) {', '    }', '    }', '}'].join('\n');

        assert.deepEqual(missingSummaries(src, new Set([7])).map(m => m.name), ['#priv'])
    });

    it('counts a changed docblock as a change of its method', () => {
        assert.deepEqual(missingSummaries(source, new Set([20])).map(m => m.name), ['undocumented'])
    });
});
