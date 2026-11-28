// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';
import SelectionModel from '../node_modules/neo.mjs/src/selection/Model.mjs';

setup({appConfig: {name: 'test'}});

const {default: Tree} = await import('../src/tree/Tree.mjs');
const {default: TreeSelectionModel} = await import('../src/tree/SelectionModel.mjs');

const create = (nodeProvider, config = {}) => Neo.create(Tree, {appName: 'test', autoLoad: false, nodeProvider, selectionModel: {module: SelectionModel}, ...config}),
      ids    = tree => tree.store.items.map(record => record.id),
      find   = (content, cls) => content.find(item => item.cls?.includes(cls));

describe('GO.tree.Tree', () => {
    let tree, getComponent;

    // the selection model finds its view through the component manager; another test file stubs it
    before(() => {
        getComponent = Neo.getComponent;
        Neo.getComponent = id => Neo.manager.Component.get(id)
    });
    after(() => Neo.getComponent = getComponent);
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

    describe('multi-selection', () => {
        const nodes = () => [
                  {id: 'a', text: 'A', expanded: true, children: [{id: 'a1', text: 'A1', children: []}, {id: 'a2', text: 'A2', children: []}]},
                  {id: 'b', text: 'B', children: []},
                  {id: 'c', text: 'C', children: []}
              ],
              multi = (config = {}) => create(nodes, {multiSelect: true, selectionModel: {module: TreeSelectionModel}, ...config}),
              click = (id, keys = {}) => tree.selectionModel.onListClick({currentTarget: tree.id + '__' + id, ...keys}),
              selected = () => tree.getSelectedNodes().map(node => node.id);

        it('a click selects one node, Ctrl / Cmd toggles, Shift adds', async () => {
            tree = multi();
            await tree.reload();

            const fired = [];
            tree.on('selectionChange', ({nodes}) => fired.push(nodes.map(node => node.id)));

            click('a');
            click('b', {ctrlKey: true});
            click('c', {metaKey: true});
            assert.deepEqual(selected(), ['a', 'b', 'c']);

            click('b', {metaKey: true});
            assert.deepEqual(selected(), ['a', 'c']);

            click('a1', {shiftKey: true});
            // Shift never removes
            click('a1', {shiftKey: true});
            assert.deepEqual(selected(), ['a', 'c', 'a1']);

            const before = fired.length;
            click('b');
            assert.deepEqual(selected(), ['b']);
            // one event, no empty one in between
            assert.deepEqual(fired.slice(before), [['b']]);

            // a click on one of several selected nodes keeps only that one
            click('c', {ctrlKey: true});
            click('c');
            assert.deepEqual(selected(), ['c']);
            assert.deepEqual(fired.at(-1), ['c']);

            // selectNode() selects only that node
            click('c', {ctrlKey: true});
            tree.selectNode('a2');
            assert.deepEqual(selected(), ['a2']);
        });

        it('a click selects the node of an id with "__"; selectNode() of the selected one fires nothing', async () => {
            tree = create(() => [{id: 'a', text: 'A', children: []}, {id: 'a__b', text: 'AB', children: []}], {selectionModel: {module: TreeSelectionModel}});
            await tree.reload();

            click('a__b');
            assert.deepEqual(selected(), ['a__b']);

            let count = 0;
            tree.on('selectionChange', () => count++);
            tree.selectNode('a__b');
            assert.equal(count, 0);
        });

        it('without multiSelect the modifiers select one node', async () => {
            tree = create(nodes, {selectionModel: {module: TreeSelectionModel}});
            await tree.reload();

            click('a');
            click('b', {ctrlKey: true});
            click('c', {shiftKey: true});
            assert.deepEqual(selected(), ['c']);
        });

        it('the selection is locked while dragging', async () => {
            tree = multi();
            await tree.reload();

            click('a');
            tree.dragging = true;
            click('b');
            click('c', {ctrlKey: true});
            tree.selectNode('b');
            tree.selectionModel.deselectAll();
            assert.deepEqual(selected(), ['a']);

            tree.dragging = false;
            click('b');
            assert.deepEqual(selected(), ['b']);
        });

        it('a drag of a selected node drops all selected (topmost) nodes, not into their subtree', async () => {
            tree = multi();
            // set after creation: enableDragDrop() needs the main thread
            tree.dropOn = true;
            await tree.reload();

            const drops = [],
                  drop  = (target, source) => tree.onNodeDrop({targetId: tree.id + '__' + target, position: 'on', source: {rootId: tree.id, itemId: tree.id + '__' + source}});

            tree.on('drop', data => drops.push(data));

            click('a');
            click('a1', {ctrlKey: true});
            click('b', {ctrlKey: true});

            drop('c', 'b');
            assert.equal(drops.length, 1);
            assert.equal(drops[0].dragNode.id, 'b');
            // a1 goes with a
            assert.deepEqual(drops[0].dragNodes.map(node => node.id), ['a', 'b']);

            // c is not selected: only c is dragged
            drop('b', 'c');
            assert.deepEqual(drops[1].dragNodes.map(node => node.id), ['c']);

            // a2 is in the subtree of a, which is dragged along with b
            drop('a2', 'b');
            assert.equal(drops.length, 2);
        });

        it('the drag ghost lists up to five names and "and N more"', async () => {
            tree = create(() => Array.from({length: 7}, (_, i) => ({id: 'n' + i, text: 'N' + i, children: []})),
                {multiSelect: true, selectionModel: {module: TreeSelectionModel}});
            tree.dragNodes = true;
            await tree.reload();

            click('n0');
            assert.deepEqual(JSON.parse(tree.vdom.data.goDragGhost), []);

            for (let i = 1; i < 7; i++) {
                click('n' + i, {ctrlKey: true});
            }

            assert.deepEqual(JSON.parse(tree.vdom.data.goDragGhost), ['N0', 'N1', 'N2', 'N3', 'N4', 'and 2 more']);
        });
    });

    describe('search', () => {
        // r ─ p ─ hit1 ─ (lazy)
        //       └ q
        //   └ s
        const children = {r: ['p', 's'], p: ['hit1', 'q'], hit1: ['deep'], q: [], s: [], deep: []},
              provider = node => (node ? children[node.id] : ['r']).map(id => ({id, text: id.toUpperCase(), ...(children[id].length ? {} : {children: []})}));

        it('nests the flat hits and ancestors, marks the hits, keeps a hit lazy, puts an orphan on top', async () => {
            tree = create(provider, {searchProvider: query => [
                {id: 'r', parentId: null, text: 'R'},
                {id: 'p', parentId: 'r', text: 'P'},
                {id: 'hit1', parentId: 'p', text: 'HIT1', hit: true},
                // its parent is not readable
                {id: 'orphan', parentId: 'secret', text: 'ORPHAN', hit: true, children: []}
            ]});
            await tree.reload();

            const fired = [];
            tree.on('search', data => fired.push(data.query));

            await tree.search(' hit ');
            assert.equal(tree.isSearching(), true);
            assert.deepEqual(fired, ['hit']);
            assert.deepEqual(ids(tree), ['r', 'p', 'hit1', 'orphan']);
            assert.ok(tree.createItem(tree.store.get('hit1'), 2).cls.includes('go-tree-hit'));
            assert.ok(!tree.createItem(tree.store.get('p'), 1).cls.includes('go-tree-hit'));

            // the hit's own children come from the nodeProvider
            await tree.expand('hit1');
            assert.deepEqual(ids(tree), ['r', 'p', 'hit1', 'deep', 'orphan']);
        });

        it('drops an older answer', async () => {
            const answers = {};

            tree = create(provider, {searchProvider: query => new Promise(resolve => answers[query] = resolve)});

            const first  = tree.search('first'),
                  second = tree.search('second');

            answers.second([{id: 'b', text: 'B', hit: true, children: []}]);
            await second;
            answers.first([{id: 'a', text: 'A', hit: true, children: []}]);
            await first;

            assert.deepEqual(ids(tree), ['b']);
        });

        it('re-runs on reload() and, debounced, on reloadNode() / moveNode()', async () => {
            let runs = 0;

            tree = create(provider, {searchProvider: () => {
                runs++;
                return [{id: 'r', text: 'R'}, {id: 's', parentId: 'r', text: 'S', hit: true, children: []}]
            }});

            await tree.search('s');
            await tree.reload();
            assert.equal(runs, 2);

            tree.reloadNode('r');
            assert.equal(tree.moveNode('s', null), true);
            assert.equal(runs, 2);

            await new Promise(resolve => setTimeout(resolve, 350));
            await tree.loadPromise;
            assert.equal(runs, 3);
            assert.deepEqual(ids(tree), ['r', 's']);
        });

        it('reset restores the expanded nodes of before and reveals the node selected during the search', async () => {
            tree = create(provider, {
                selectionModel: {module: TreeSelectionModel},
                searchProvider: () => [
                    {id: 'r', text: 'R'},
                    {id: 'p', parentId: 'r', text: 'P'},
                    {id: 'q', parentId: 'p', text: 'Q', hit: true, children: []}
                ]
            });
            await tree.reload();
            await tree.expand('r');
            assert.deepEqual(ids(tree), ['r', 'p', 's']);

            await tree.search('q');
            tree.selectionModel.onListClick({currentTarget: tree.id + '__q'});

            await tree.search('');
            assert.equal(tree.isSearching(), false);
            // r was expanded before; p is expanded to reveal q
            assert.deepEqual(ids(tree), ['r', 'p', 'hit1', 'q', 's']);
            assert.deepEqual(tree.getSelectedNodes().map(node => node.id), ['q']);
        });
    });
});
