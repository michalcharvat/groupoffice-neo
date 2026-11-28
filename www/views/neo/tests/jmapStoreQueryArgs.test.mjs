// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: JmapStore}    = await import('../src/data/JmapStore.mjs'),
      {default: JmapComboBox} = await import('../src/form/field/JmapComboBox.mjs'),
      {default: client}       = await import('../src/jmap/Client.mjs');

describe('JmapStore queryArgs', () => {
    it('Client.queryGet merges queryArgs into Entity/query only, filter and position win', async () => {
        const call  = client.call,
              calls = [];

        client.call = async (method, args) => {
            calls.push([method, args]);
            return method.endsWith('/query') ? {ids: [], total: 0} : {list: [], state: 's1'}
        };

        try {
            await client.queryGet('DmsFolder', {filter: {text: 'a'}, sort: [{property: 'name'}], properties: ['id'],
                queryArgs: {viewType: 'combo', filter: {x: 1}, sort: [], position: 9, calculateTotal: false}});
        } finally {
            client.call = call
        }

        assert.deepEqual(calls[0], ['DmsFolder/query', {viewType: 'combo', filter: {text: 'a'}, sort: [{property: 'name'}], position: 0, calculateTotal: true}]);
        assert.deepEqual(calls[1], ['DmsFolder/get', {'#ids': {resultOf: calls[1][1]['#ids'].resultOf, path: '/ids'}, properties: ['id']}]);
    });

    it('load() and loadMore() pass queryArgs, the combo hands its own to the store', async () => {
        const queryGet = client.queryGet,
              seen     = [];

        client.queryGet = async (entity, params) => {
            seen.push(params.queryArgs);
            return {list: [{id: String(seen.length)}], total: 2}
        };

        let combo;

        try {
            combo = Neo.create(JmapComboBox, {appName: 'test', name: 'folderId', entity: 'DmsFolder', queryArgs: {viewType: 'combo'}, pageSize: 1});
            const store = combo.store;
            assert.ok(store instanceof JmapStore);
            await store.load();
            await store.loadMore();
        } finally {
            client.queryGet = queryGet;
            combo?.destroy()
        }

        assert.deepEqual(seen, [{viewType: 'combo'}, {viewType: 'combo'}]);
    });
});
