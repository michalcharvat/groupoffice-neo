// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';

const {MIN_SEARCH_CHARS, searchesWhileTyping} = await import('../src/form/searchWhileTyping.mjs');

describe('searchesWhileTyping', () => {
    it('searches from 3 characters', () => {
        assert.equal(MIN_SEARCH_CHARS, 3);
        assert.equal(searchesWhileTyping('abc'), true);
        assert.equal(searchesWhileTyping('ab'), false);
        assert.equal(searchesWhileTyping('a'), false);
    });

    it('searches when the field is emptied', () => {
        assert.equal(searchesWhileTyping(''), true);
        assert.equal(searchesWhileTyping(null), true);
    });

    it('does not count surrounding spaces', () => {
        assert.equal(searchesWhileTyping('  ab '), false);
        assert.equal(searchesWhileTyping('   '), false);
    });
});
