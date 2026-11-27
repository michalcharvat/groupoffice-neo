// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: Grid}          = await import('../src/grid/Grid.mjs'),
      {default: client}        = await import('../src/jmap/Client.mjs'),
      {default: ConfirmDialog} = await import('../src/view/ConfirmDialog.mjs'),
      {destroyEntities}        = await import('../src/data/destroyEntities.mjs');

const proto = Grid.prototype;

/**
 * A stand-in for a grid over a JmapStore: the entity action methods of GO.grid.Grid on it
 */
function fakeGrid(entityActions, selected = []) {
    const grid = {
        appName      : 'test',
        windowId     : 1,
        entityActions,
        reloads      : 0,
        cleared      : 0,
        store        : {entity: 'Group'},
        view         : {selectionModel: {clear: () => grid.cleared++}},
        getSelectedRecords: () => selected,
        reloadEntities    : () => grid.reloads++
    };

    ['canEdit', 'canDelete', 'deleteRecords', 'deleteSelectedMenuItem', 'recordsWith'].forEach(name => grid[name] = proto[name]);
    return grid
}

describe('GO.grid.Grid entity actions', () => {
    let asked, destroyed, answer, setError;
    const ask = ConfirmDialog.ask,
          set = client.set;

    beforeEach(() => {
        asked     = [];
        destroyed = [];
        answer    = true;
        setError  = null;

        ConfirmDialog.ask = async config => {
            asked.push(config);
            return answer
        };
        client.set = async (entity, {destroy}) => {
            if (setError) {
                throw setError
            }

            destroyed.push({entity, destroy})
        }
    });

    afterEach(() => {
        ConfirmDialog.ask = ask;
        client.set        = set
    });

    it('gates edit by write and delete by delete permission when the row has a level', () => {
        const grid = fakeGrid({dialog: () => {}});

        assert.equal(grid.canEdit({permissionLevel: 30}), true);
        assert.equal(grid.canEdit({permissionLevel: 20}), false);
        assert.equal(grid.canDelete({permissionLevel: 40}), true);
        assert.equal(grid.canDelete({permissionLevel: 30}), false);
        // no level: the list is one the server already limits (admin-only entities)
        assert.equal(grid.canEdit({}), true);
        assert.equal(grid.canDelete({}), true);
    });

    it('adds the mayEdit / mayDelete hooks and needs a dialog to edit', () => {
        const grid = fakeGrid({dialog: () => {}, mayEdit: r => r.id !== '1', mayDelete: r => Number(r.id) > 3});

        assert.equal(grid.canEdit({id: '1', permissionLevel: 50}), false);
        assert.equal(grid.canDelete({id: '2', permissionLevel: 50}), false);
        assert.equal(grid.canDelete({id: '4', permissionLevel: 50}), true);
        assert.equal(fakeGrid({}).canEdit({}), false);
    });

    it('deletes only the allowed rows after a confirmation, then clears and reloads', async () => {
        const grid = fakeGrid({displayField: 'name'}),
              rows = [{id: 1, name: 'A', permissionLevel: 50}, {id: 2, name: 'B', permissionLevel: 10}];

        assert.equal(await grid.deleteRecords(rows), true);
        assert.deepEqual(destroyed, [{entity: 'Group', destroy: [1]}]);
        // one allowed row: its name in the question
        assert.match(asked[0].message, /'A'/);
        assert.equal(grid.reloads, 1);
        assert.equal(grid.cleared, 1);
    });

    it('asks nothing when no row may be deleted, and nothing happens on "no"', async () => {
        const grid = fakeGrid({});

        assert.equal(await grid.deleteRecords([{id: 1, permissionLevel: 30}]), false);
        assert.equal(asked.length, 0);

        answer = false;
        assert.equal(await grid.deleteRecords([{id: 1}]), false);
        assert.equal(asked.length, 1);
        assert.equal(destroyed.length, 0);
        assert.equal(grid.reloads, 0);
    });

    it('does not reload when the server refuses', async () => {
        const grid = fakeGrid({});

        setError   = new Error('refused');
        // closed while the request ran: no error toast of a fake owner either
        client.set = async () => {
            grid.isDestroyed = true;
            throw setError
        };

        assert.equal(await grid.deleteRecords([{id: 1}]), false);
        assert.equal(grid.reloads, 0);
    });

    it('counts the rows of a multi delete and acts on the selection of a selected row', async () => {
        const a = {id: 1}, b = {id: 2}, c = {id: 3},
              grid = fakeGrid({}, [a, b]);

        assert.deepEqual(grid.recordsWith(a), [a, b]);
        assert.deepEqual(grid.recordsWith(c), [c]);

        await grid.deleteRecords(grid.recordsWith(a));
        assert.match(asked[0].message, /2/);
        assert.deepEqual(destroyed[0].destroy, [1, 2]);
    });

    it('offers "Delete" in the toolbar menu only when a selected row may be deleted', () => {
        assert.equal(fakeGrid({}, [{id: 1, permissionLevel: 30}]).deleteSelectedMenuItem().disabled, true);
        assert.equal(fakeGrid({}, [{id: 1, permissionLevel: 30}, {id: 2, permissionLevel: 40}]).deleteSelectedMenuItem().disabled, false);
    });

    it('destroyEntities() does nothing without records', async () => {
        assert.equal(await destroyEntities({appName: 'test', windowId: 1}, 'Group', []), false);
        assert.equal(asked.length, 0);
    });
});
