// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';
import Store from '../node_modules/neo.mjs/src/data/Store.mjs';
import {setDataAndFireLoad} from '../src/data/setData.mjs';

setup({appConfig: {name: 'test'}});

const {default: NavCheckList} = await import('../src/list/NavCheckList.mjs');
const {default: client} = await import('../src/jmap/Client.mjs');

/**
 * A plain store standing in for a JmapStore: setFilter() keeps the filter and loads the given rows.
 */
class FakeStore extends Store {
    static config = {
        className  : 'Test.NavCheckList.FakeStore',
        keyProperty: 'id',
        // string ids: without a model the store generates its own
        model      : {fields: [{name: 'id', type: 'String'}, {name: 'name', type: 'String'}]}
    }

    entity     = 'Thing'
    jmapFilter = {}
    more       = false

    hasMore() {
        return this.more
    }

    loadMore() {
        return Promise.resolve()
    }

    load() {
        return Promise.resolve()
    }

    show(rows, filter = {}) {
        this.jmapFilter = filter;
        setDataAndFireLoad(this, rows.map(([id, name]) => ({id, name})))
    }
}

Neo.setupClass(FakeStore);

// dropMissing() runs 50 ms after a load
const settle = () => new Promise(resolve => setTimeout(resolve, 80));

const ROWS = [['1', 'One'], ['2', 'Two'], ['3', 'Three']];

describe('GO.list.NavCheckList', () => {
    let nav, store, events, getComponent, clientGet;

    const box     = () => nav.getReference('selectAll'),
          clickRow = id => {
              const model = nav.list.selectionModel,
                    item  = nav.list.getItemId(id);

              model.isSelected(item) ? model.deselect(item) : model.select(item)
          };

    beforeEach(() => {
        // the selection model finds its view through the component manager; another test file stubs it
        getComponent = Neo.getComponent;
        Neo.getComponent = id => Neo.manager.Component.get(id);
        clientGet = client.get;

        nav = Neo.create(NavCheckList, {appName: 'test', heading: 'Things', store: {module: FakeStore}});
        store = nav.list.store;
        events = [];
        nav.on('selectionChange', ({ids}) => events.push([...ids].sort()));
        store.show(ROWS)
    });

    afterEach(() => {
        nav.destroy();
        client.get = clientGet;
        Neo.getComponent = getComponent
    });

    it('fires selectionChange with the checked ids and keeps the select-all box in sync', () => {
        clickRow('1');
        assert.deepEqual(events, [['1']]);
        assert.equal(box().checked, false);
        assert.equal(box().indeterminate, true);

        nav.onSelectAll(true);
        assert.deepEqual(events.at(-1), ['1', '2', '3']);
        assert.equal(box().checked, true);
        assert.equal(box().indeterminate, false);

        nav.onSelectAll(false);
        assert.deepEqual(events.at(-1), []);
        assert.equal(box().checked, false);
        assert.equal(box().indeterminate, false)
    });

    it('keeps checked rows hidden by a search, they count for the box', async () => {
        client.get = async (entity, ids) => ids.map(id => ({id}));
        clickRow('1');
        clickRow('3');

        store.show([['2', 'Two']], {text: 'tw'});
        await settle();
        assert.deepEqual(nav.getCheckedIds().sort(), ['1', '3']);
        assert.equal(box().indeterminate, true);
        assert.deepEqual(nav.getCheckedRecords().map(r => r.name).sort(), ['One', 'Three']);

        // checking a row while searching adds it to the hidden ones
        clickRow('2');
        assert.deepEqual(events.at(-1), ['1', '2', '3']);

        store.show(ROWS);
        assert.deepEqual(nav.list.getCheckedIds().sort(), ['1', '2', '3']);
        assert.equal(box().checked, true)
    });

    it('drops checked rows that are gone after an unfiltered complete load', async () => {
        clickRow('1');
        clickRow('3');
        store.show([['1', 'One'], ['2', 'Two']]);
        await settle();

        assert.deepEqual(nav.getCheckedIds(), ['1']);
        assert.deepEqual(events.at(-1), ['1'])
    });

    it('asks the server about hidden checked rows of a filtered or paged list', async () => {
        const asked = [];

        client.get = async (entity, ids) => {
            asked.push([entity, ids]);
            return ids.filter(id => id !== '3').map(id => ({id}))
        };
        clickRow('1');
        clickRow('3');
        store.more = true;
        store.show([['2', 'Two']], {text: 'tw'});
        await settle();

        assert.deepEqual(asked, [['Thing', ['1', '3']]]);
        assert.deepEqual(nav.getCheckedIds(), ['1']);
        assert.deepEqual(events.at(-1), ['1'])
    });

    it('asks the server, not drops, when a paged store shows another page', async () => {
        const asked = [];

        client.get = async (entity, ids) => (asked.push(ids), ids.map(id => ({id})));
        clickRow('1');
        store.totalCount = 4;
        store.show([['4', 'Four']]);
        await settle();

        assert.deepEqual(asked, [['1']]);
        assert.deepEqual(nav.getCheckedIds(), ['1'])
    });

    it('ignores an Entity/get answer of an older load', async () => {
        let answer;

        client.get = () => new Promise(resolve => answer = resolve);
        clickRow('1');
        store.show([['2', 'Two']], {text: 'tw'});
        await settle();
        store.show(ROWS, {text: 'o'});
        answer([]);
        await settle();

        assert.deepEqual(nav.getCheckedIds(), ['1']);
        assert.deepEqual(events, [['1']])
    });

    it('the half checked box clears hidden checks when the search shows nothing', async () => {
        client.get = async (entity, ids) => ids.map(id => ({id}));
        clickRow('1');
        store.show([], {text: 'none'});
        await settle();
        assert.equal(box().indeterminate, true);

        box().onClick();
        assert.deepEqual(nav.getCheckedIds(), []);
        assert.equal(box().indeterminate, false)
    });

    it('fires selectionChange after the list shows the checks', () => {
        const seen = [];

        nav.on('selectionChange', () => seen.push(nav.list.getCheckedIds().sort()));
        nav.onSelectAll(true);
        assert.deepEqual(seen, [['1', '2', '3']])
    });

    it('setCheckedIds() checks saved ids, silent without selectionChange', () => {
        nav.setCheckedIds(['2'], true);
        assert.deepEqual(events, []);
        assert.deepEqual(nav.list.getCheckedIds(), ['2']);

        nav.setCheckedIds([]);
        assert.deepEqual(events, [[]]);
        assert.deepEqual(nav.list.getCheckedIds(), [])
    });

    it('shows "Show more..." while the store has more', () => {
        assert.equal(nav.getReference('moreButton').hidden, true);
        store.more = true;
        store.show(ROWS, {text: 'x'});
        assert.equal(nav.getReference('moreButton').hidden, false)
    });
});
