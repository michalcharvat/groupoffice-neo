// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';
import SelectionModel from '../node_modules/neo.mjs/src/selection/Model.mjs';

setup({appConfig: {name: 'test'}});

const {default: Tree} = await import('../src/tree/Tree.mjs');

const create = (nodeProvider, config = {}) => Neo.create(Tree, {appName: 'test', autoLoad: false, nodeProvider, selectionModel: {module: SelectionModel}, ...config}),
      ids    = tree => tree.store.items.map(record => record.id),
      find   = (content, cls) => content.find(item => item.cls?.includes(cls));

describe('GO.tree.Tree', () => {
    let tree;

    afterEach(() => tree?.destroy());

    it('renders a badge as escaped text, hidden at 0, and repaints on a change', async () => {
        tree = create(() => [
            {id: 'a', text: 'A', badge: 3, children: []},
            {id: 'b', text: 'B', badge: 0, children: []},
            {id: 'c', text: 'C', badge: '<b>x</b>', children: []}
        ]);
        await tree.reload();

        const content = id => tree.createItemContent(tree.store.get(id));

        assert.equal(find(content('a'), 'go-tree-badge').text, '3');
        assert.equal(find(content('b'), 'go-tree-badge'), undefined);
        // vdom text, not html: neo sets it as textContent
        assert.equal(find(content('c'), 'go-tree-badge').text, '<b>x</b>');
        assert.equal(find(content('c'), 'go-tree-badge').html, undefined);

        const state = tree.store.get('b').state;
        tree.setBadge('b', 5);
        assert.notEqual(tree.store.get('b').state, state);
        assert.equal(find(content('b'), 'go-tree-badge').text, '5');
    });

    it('shows a row menu icon per nodeMenu and fires menu on its click', async () => {
        tree = create(() => [{id: 'a', text: 'A', children: []}, {id: 'b', text: 'B', children: []}], {nodeMenu: node => node.id === 'a'});
        await tree.reload();

        assert.ok(find(tree.createItemContent(tree.store.get('a')), 'go-row-menu'));
        assert.equal(find(tree.createItemContent(tree.store.get('b')), 'go-row-menu'), undefined);

        const fired = [];
        tree.on('menu', data => fired.push(data));
        tree.onClick({path: [{id: 'icon-1', cls: ['go-row-menu']}, {id: tree.id + '__a', cls: [tree.itemCls]}]});

        assert.equal(fired.length, 1);
        assert.equal(fired[0].node.id, 'a');
        assert.equal(fired[0].target, 'icon-1');
    });

    it('openPath() loads lazy levels down the path and selects the last node', async () => {
        const asked = [];

        tree = create(async node => {
            asked.push(node?.id ?? null);
            await new Promise(resolve => setTimeout(resolve, 5));
            return node ? [{id: node.id + '/x', text: 'x'}, {id: node.id + '/y', text: 'y'}] : [{id: 'r', text: 'R'}]
        }, {autoLoad: true});

        let selected;
        tree.selectNode = id => selected = id;

        // autoLoad still runs: openPath waits for it
        const node = await tree.openPath(['r', 'r/y', 'r/y/x']);

        assert.equal(node.id, 'r/y/x');
        assert.equal(selected, 'r/y/x');
        assert.deepEqual(asked, [null, 'r', 'r/y']);
        assert.deepEqual(ids(tree), ['r', 'r/x', 'r/y', 'r/y/x', 'r/y/y']);

        assert.equal(await tree.openPath(['r', 'nope']), null);
        // a node that exists, but not under the previous one of the path
        assert.equal(await tree.openPath(['r/y', 'r/x']), null);
    });

    it('pages: "Show more..." loads the next page with its position, openPath() pages on', async () => {
        const positions = [];

        tree = create((node, {position}) => {
            positions.push(position);
            const all = ['1', '2', '3', '4', '5'];
            return {nodes: all.slice(position, position + 2).map(id => ({id, text: id, children: []})), hasMore: position + 2 < all.length}
        });
        await tree.reload();

        assert.deepEqual(ids(tree), ['1', '2', '__more__']);
        assert.ok(tree.createItem(tree.store.get('__more__'), 2).cls.includes('go-tree-more'));

        // a click on the row asks for the next page
        tree.onClick({path: [{id: tree.id + '____more__', cls: [tree.itemCls]}]});
        await tree.pending.get(tree.roots);
        assert.deepEqual(ids(tree), ['1', '2', '3', '4', '__more__']);

        tree.selectNode = () => {};
        assert.equal((await tree.openPath(['5'])).id, '5');
        assert.deepEqual(ids(tree), ['1', '2', '3', '4', '5']);
        assert.deepEqual(positions, [0, 2, 4]);
    });

    it('a page whose nodes are shown already ends the paging', async () => {
        tree = create(() => ({nodes: [{id: '1', text: '1', children: []}], hasMore: true}));
        await tree.reload();
        await tree.loadMore(null);

        assert.deepEqual(ids(tree), ['1']);
    });

    it('a badge change is part of the row state, also in reloadNode()', async () => {
        let badge = 1;

        tree = create(node => node ? [{id: 'c', text: 'C', badge, children: []}] : [{id: 'p', text: 'P', expanded: true}]);
        await tree.reload();

        const before = tree.store.get('c').state;
        badge = 2;
        await tree.reloadNode('p');

        assert.notEqual(tree.store.get('c').state, before);
        assert.ok(tree.expandedIds.has('p'));
    });
});
