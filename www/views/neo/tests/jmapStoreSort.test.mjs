// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: JmapStore} = await import('../src/data/JmapStore.mjs');

describe('JmapStore server sort names', () => {
    it('keeps serverSortProperties after a header sort and sends the mapped name', () => {
        const store = Neo.create(JmapStore, {
            entity              : 'Contact',
            autoLoad            : false,
            model               : {fields: [{name: 'id'}, {name: 'createdBy'}]},
            serverSortProperties: {createdBy: 'creator'}
        });

        try {
            store.load = () => {};  // no server here
            store.sorters = [{property: 'createdBy', direction: 'DESC'}];

            assert.deepEqual(store.serverSortProperties, {createdBy: 'creator'});
            assert.deepEqual(store.getJmapSort(), [{property: 'creator', isAscending: false}]);
        } finally {
            store.destroy()
        }
    });
});
