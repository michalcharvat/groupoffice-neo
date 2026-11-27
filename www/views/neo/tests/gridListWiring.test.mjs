// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: Grid}     = await import('../src/grid/Grid.mjs'),
      {default: MenuList} = await import('../src/menu/List.mjs');
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

    describe('column sizing', () => {
        const cols = () => [
            {dataField: 'id', text: 'ID', width: 160},
            {dataField: 'type', text: 'Type', width: 100},
            {dataField: 'rowMenu', text: '', width: 48},
            {dataField: 'pin', text: 'Pin', width: 80, locked: 'end'}
        ],
            byField = columns => Object.fromEntries(columns.map(c => [c.dataField, c]));

        it('without a flex column the last text column fills the row', () => {
            const c = byField(Grid.visibleColumns(cols()));

            assert.deepEqual([c.type.flex, c.type.minWidth], [1, 100]);
            assert.equal(c.id.flex, undefined);
            assert.equal(c.rowMenu.flex, undefined);
            assert.equal(c.pin.flex, undefined)
        });

        it('a configured flex column fills instead', () => {
            const columns = cols();

            columns[0].flex = 1;
            assert.equal(byField(Grid.visibleColumns(columns)).type.flex, undefined)
        });

        it('autoExpandColumn picks the column, forceFit flexes by width', () => {
            assert.deepEqual(byField(Grid.visibleColumns(cols(), {autoExpandColumn: 'id'})).id.minWidth, 160);
            assert.equal(byField(Grid.visibleColumns(cols(), {autoExpandColumn: 'id'})).type.flex, undefined);

            const fit = byField(Grid.visibleColumns(cols(), {forceFit: true}));
            assert.deepEqual([fit.id.flex, fit.type.flex, fit.rowMenu.flex], [160, 100, undefined])
        });

        it('does not change the given columns', () => {
            const columns = cols();

            Grid.visibleColumns(columns);
            assert.equal(columns[1].flex, undefined)
        })
    });

    it('the header ⋮ clicked again closes its menu instead of opening a second one', () => {
        const shown = [],
              show  = MenuList.showAt;

        MenuList.showAt = config => {
            const menu = {config, hidden: false, isDestroyed: false};
            shown.push(menu);
            return menu
        };

        try {
            const grid = {appName: 'test', windowId: 1, headerMenu: null};

            proto.showHeaderMenuList.call(grid, 'trigger', []);
            proto.showHeaderMenuList.call(grid, 'trigger', []);
            assert.equal(shown.length, 1);
            assert.equal(shown[0].hidden, true);

            // closed by the press on the ⋮ (focus left the menu) just before this click
            proto.showHeaderMenuList.call(grid, 'trigger', []);
            shown[1].onClose();
            proto.showHeaderMenuList.call(grid, 'trigger', []);
            assert.equal(shown.length, 2);

            // another header: the open menu goes, the new one opens
            proto.showHeaderMenuList.call(grid, 'trigger', []);
            proto.showHeaderMenuList.call(grid, 'other', []);
            assert.equal(shown.length, 4);
            assert.equal(shown[2].hidden, true)
        } finally {
            MenuList.showAt = show
        }
    })
});
