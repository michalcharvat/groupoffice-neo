// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {decodeServerTabs, encodeServerTabs, parseWindowTabs, pickLastTabs, restoredTabs, serializeWindowTabs,
    withClassicOnly} from '../src/moduleTabs.mjs';

const available = ['summary', 'email', 'addressbook', 'calendar', 'notes'];

describe('moduleTabs', () => {
    it('restores the window tabs before the user\'s last ones, in GO module order', () => {
        assert.deepEqual(restoredTabs({windowTabs: ['notes', 'email'], lastTabs: ['calendar'], available}), ['email', 'notes']);
        assert.deepEqual(restoredTabs({windowTabs: null, lastTabs: ['calendar'], available}), ['calendar']);
        assert.deepEqual(restoredTabs({windowTabs: null, lastTabs: null, available}), []);
        // an empty window set is the window's choice (all closed), not "none stored"
        assert.deepEqual(restoredTabs({windowTabs: [], lastTabs: ['calendar'], available}), []);
    });

    it('leaves out modules held by a workspace and modules without access', () => {
        assert.deepEqual(restoredTabs({windowTabs: ['notes', 'email', 'files'], lastTabs: null, available, claimed: ['email']}), ['notes']);
    });

    it('keeps the modules the address opened while restoring', () => {
        assert.deepEqual(restoredTabs({windowTabs: ['notes'], lastTabs: null, available, open: ['email']}), ['email', 'notes']);
    });

    it('reads only the own user\'s stored tabs', () => {
        const value = serializeWindowTabs(['summary', 'notes'], 5);

        assert.deepEqual(parseWindowTabs(value, 5), ['summary', 'notes']);
        assert.equal(parseWindowTabs(value, 6), null);
        assert.equal(parseWindowTabs(null, 5), null);
        assert.equal(parseWindowTabs('{broken', 5), null);
        assert.deepEqual(parseWindowTabs(JSON.stringify({userId: 5, tabs: ['notes', 3]}), 5), ['notes']);
    });

    it('stores the last tabs like the classic client (Ext state encoding)', () => {
        // Ext.state.Provider.encodeValue(['notes', 'email']), also go\core\webclient\OpenModules::encode()
        assert.equal(encodeServerTabs(['notes', 'email']), 'a%3As%253Anotes%5Es%253Aemail');
        assert.equal(encodeServerTabs([]), 'a%3A');
        assert.equal(encodeServerTabs(['bookmarks-42']), 'a%3As%253Abookmarks-42');
        assert.deepEqual(decodeServerTabs('a%3As%253Anotes%5Es%253Aemail'), ['notes', 'email']);
        assert.deepEqual(decodeServerTabs('a%3A'), []);
    });

    it('ignores a server value that is no list, and items that are no module name', () => {
        [undefined, null, 5, '', 's%3Anotes', '%E0%A4%A'].forEach(value =>
            assert.equal(decodeServerTabs(value), null, String(value)));
        assert.deepEqual(decodeServerTabs(encodeURIComponent('a:n%3A5^s%3A^s%3Ano%2520tes^s%3Abookmarks-42^s%3Anotes^s%3A%E0%A4%A')),
            ['bookmarks-42', 'notes']);
    });

    it('prefers the local copy only while the server doesn\'t have it', () => {
        assert.deepEqual(pickLastTabs({server: ['email'], local: {tabs: ['notes'], pending: true}}), ['notes']);
        assert.deepEqual(pickLastTabs({server: ['email'], local: {tabs: ['notes'], pending: false}}), ['email']);
        assert.deepEqual(pickLastTabs({server: [], local: {tabs: ['notes']}}), []);
        // nothing on the server yet (a copy of an older build)
        assert.deepEqual(pickLastTabs({server: null, local: {tabs: ['notes', 5]}}), ['notes']);
        assert.equal(pickLastTabs({server: null, local: {}}), null);
    });

    it('keeps the classic client\'s modules that neo has no view of', () => {
        const isNeo = name => available.includes(name);

        assert.deepEqual(withClassicOnly(['notes'], ['summary', 'billing', 'notes', 'projects2'], isNeo), ['notes', 'billing', 'projects2']);
        assert.deepEqual(withClassicOnly(['notes'], null, isNeo), ['notes']);
    });
});
