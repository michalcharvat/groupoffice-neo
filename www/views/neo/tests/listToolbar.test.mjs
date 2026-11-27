// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: ListToolbar, QUERY_FILTERS} = await import('../src/grid/ListToolbar.mjs'),
      {default: Grid}                       = await import('../src/grid/Grid.mjs');

const proto = ListToolbar.prototype;

/**
 * A stand-in for a list toolbar bound to a grid: the ListToolbar methods on it
 */
function fakeToolbar(config = {}, selected = []) {
    const deleteButton = {disabled: null},
          filters      = [],
          grid         = {
              store             : {entity: 'Group', setFilter: async filter => filters.push(filter)},
              getSelectedRecords: () => selected,
              canDelete         : Grid.prototype.canDelete,
              entityActions     : {}
          };

    grid.deleteSelectedMenuItem = Grid.prototype.deleteSelectedMenuItem.bind(grid);

    const toolbar = {
        searchFilters: QUERY_FILTERS,
        exportFormats: null,
        moreItems    : null,
        grid,
        filters,
        deleteButton,
        getReference : name => name === 'deleteSelectedButton' ? deleteButton : null,
        ...config
    };

    ['search', 'moreMenuItems', 'onSelectionChange'].forEach(name => toolbar[name] = proto[name]);
    return toolbar
}

describe('GO.grid.ListToolbar', () => {
    it('sets the query filter of the search text', async () => {
        const toolbar = fakeToolbar();

        await toolbar.search('piet');
        await toolbar.search('');
        assert.deepEqual(toolbar.filters, [{text: 'piet', search: undefined}, {text: undefined, search: undefined}]);
    });

    it('turns "name: value" into a tbsearch filter', async () => {
        const toolbar = fakeToolbar({searchFilters: [...QUERY_FILTERS, {name: 'name', type: 'string', title: 'Name'}]});

        toolbar.grid.store.entity = null; // no custom field filters from the server
        await toolbar.search('name: admins');
        assert.equal(toolbar.filters.length, 1);
        assert.equal(toolbar.filters[0].text, undefined);
        assert.ok(toolbar.filters[0].search?.operator);
    });

    it('applies only the latest search', async () => {
        const toolbar = fakeToolbar(),
              first   = toolbar.search('a'),
              second  = toolbar.search('ab');

        await Promise.all([first, second]);
        assert.deepEqual(toolbar.filters, [{text: 'ab', search: undefined}]);
    });

    it('offers delete selected in the ⋮, after the export when there is one', () => {
        const rows = [{id: 1, permissionLevel: 50}];

        assert.deepEqual(fakeToolbar({}, rows).moreMenuItems().map(item => item.text), ['Delete']);
        assert.deepEqual(fakeToolbar({exportFormats: ['csv']}, rows).moreMenuItems().map(item => item.text || 'sep'), ['Export', 'sep', 'Delete']);
    });

    it('lets the host order the ⋮ and drops the missing export', () => {
        const toolbar = fakeToolbar({moreItems: ({export: exp, delete: del}) => [{text: 'Import'}, exp, del]});

        assert.deepEqual(toolbar.moreMenuItems().map(item => item.text), ['Import', 'Delete']);
    });

    it('disables the bulk delete while no selected row may be deleted', () => {
        const none = fakeToolbar({}, [{id: 1, permissionLevel: 30}]),
              some = fakeToolbar({}, [{id: 1, permissionLevel: 30}, {id: 2, permissionLevel: 50}]);

        none.onSelectionChange();
        some.onSelectionChange();
        assert.equal(none.deleteButton.disabled, true);
        assert.equal(some.deleteButton.disabled, false);
    });
});
