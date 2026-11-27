// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: Grid} = await import('../src/grid/Grid.mjs');
const proto = Grid.prototype;

describe('GO.grid.Grid list wiring', () => {
    it('rowMenuColumn() is pinned to the row end', () => {
        assert.equal(Grid.rowMenuColumn().locked, 'end')
    });

    it('navigate fires on a plain row click only', () => {
        const fired = [],
              grid  = {fire: (name, data) => fired.push([name, data.record.id])},
              click = (data, record = {id: 1}) => proto.onNavigateRowClick.call(grid, {data, record});

        click({path: [{cls: ['neo-grid-cell']}]});
        click({path: [{cls: ['go-icon', 'go-row-menu']}]});
        click({path: [], ctrlKey: true});
        click({path: [], metaKey: true});
        click({path: [], shiftKey: true});
        click({path: []}, null);

        assert.deepEqual(fired, [['navigate', 1]])
    });

    it('keeps the last visible center column, a locked column may hide', async () => {
        const grid = {
            allColumns    : [
                {dataField: 'name', hideable: true, hidden: false},
                {dataField: 'mail', hideable: true, hidden: true},
                {dataField: 'pin', hideable: true, hidden: false, locked: 'end'}
            ],
            touchedColumns: new Set(),
            applied       : 0,
            applyColumns  : async () => grid.applied++,
            saveColumnState() {}
        };

        await proto.setColumnHidden.call(grid, 'name', true);
        assert.equal(grid.allColumns[0].hidden, false);

        await proto.setColumnHidden.call(grid, 'pin', true);
        assert.equal(grid.allColumns[2].hidden, true);

        await proto.setColumnHidden.call(grid, 'mail', false);
        await proto.setColumnHidden.call(grid, 'name', true);
        assert.equal(grid.allColumns[0].hidden, true);
        assert.equal(grid.applied, 3)
    })
});
