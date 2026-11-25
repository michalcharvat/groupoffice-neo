// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {parseWindowTabs, restoredTabs, serializeWindowTabs} from '../src/moduleTabs.mjs';

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
});
