// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: JmapStore} = await import('../src/data/JmapStore.mjs');
const {default: client}    = await import('../src/jmap/Client.mjs');

describe('JmapStore scopeKeys', () => {
    let store, queryGet, queries;

    beforeEach(() => {
        queries  = [];
        queryGet = client.queryGet;
        client.queryGet = async (entity, params) => {
            queries.push(params.filter);
            await new Promise(resolve => setTimeout(resolve, 5));
            return {list: [{id: '1'}], total: 3}
        };
        store = Neo.create(JmapStore, {
            entity    : 'AmdPmsJob',
            autoLoad  : false,
            scrollLoad: true,
            pageSize  : 1,
            model     : {fields: [{name: 'id'}]},
            scopeKeys : ['componentIn', 'vessel']
        });
    });
    afterEach(() => {
        client.queryGet = queryGet;
        store.destroy()
    });

    it('hasScope() follows PHP empty()', () => {
        for (const value of [undefined, null, '', 0, '0', false]) {
            store.jmapFilter = {vessel: value, text: 'x'};
            assert.equal(store.hasScope(), false, String(value));
        }
        store.jmapFilter = {componentIn: []};
        assert.equal(store.hasScope(), false, '[]');
        store.jmapFilter = {componentIn: ['5']};
        assert.equal(store.hasScope(), true);
        store.jmapFilter = {vessel: 7};
        assert.equal(store.hasScope(), true);
    });

    it('loads with a scope, empties the store without one and drops a running answer', async () => {
        store.jmapFilter = {vessel: 7};
        await store.load();
        assert.equal(store.count, 1);
        assert.equal(store.isLoaded, true);

        const running = store.load();
        store.jmapFilter = {vessel: ''};

        let loads = 0;
        store.on('load', () => loads++);
        assert.deepEqual(await store.load(), []);

        assert.equal(await running, null);
        assert.equal(store.count, 0);
        assert.equal(loads, 1);
        assert.equal(store.isLoaded, false);
        assert.equal(store.isLoading, false);
        assert.equal(queries.length, 2);
    });

    it('loadMore() queries nothing without a scope', async () => {
        store.jmapFilter = {vessel: 7};
        await store.load();
        store.jmapFilter = {};
        assert.equal(await store.loadMore(), null);
        assert.equal(queries.length, 1);
    });

    it('without scopeKeys every filter loads', async () => {
        store.scopeKeys = null;
        store.jmapFilter = {};
        await store.load();
        assert.equal(queries.length, 1);
    });
});
