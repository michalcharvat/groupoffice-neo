// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: LookupListPanel, lookupFilter, mayEditLookup, mayDeleteLookup} = await import('../src/systemsettings/LookupListPanel.mjs'),
      {default: LookupSettingsDialog} = await import('../src/systemsettings/LookupSettingsDialog.mjs'),
      {default: client}               = await import('../src/jmap/Client.mjs');

const proto = LookupListPanel.prototype;

/**
 * A stand-in for a LookupListPanel: its search field and table as plain objects, load() of the class
 */
function fakePanel(config = {}) {
    const refs  = {search: {value: ''}, table: {records: null}},
          panel = {
              entity      : 'TestLookup',
              properties  : ['id', 'name', 'permissionLevel'],
              jmapSort    : [{property: 'name', isAscending: true}],
              jmapFilter  : null,
              loadCounter : 0,
              prepare     : null,
              getReference: name => refs[name],
              refs,
              ...config
          };

    panel.load           = proto.load;
    panel.prepareRecords = proto.prepareRecords;
    return panel
}

describe('GO.systemsettings.LookupListPanel', () => {
    const queryGet = client.queryGet;

    afterEach(() => client.queryGet = queryGet);

    it('searches with a trimmed text filter, none when empty', () => {
        assert.equal(lookupFilter(''), null);
        assert.equal(lookupFilter('   '), null);
        assert.equal(lookupFilter(undefined), null);
        assert.deepEqual(lookupFilter(' usd '), {text: 'usd'});
    });

    it('gates edit and delete by the record permission level', () => {
        assert.equal(mayEditLookup({permissionLevel: 10}), false);
        assert.equal(mayEditLookup({permissionLevel: 30}), true);
        assert.equal(mayDeleteLookup({permissionLevel: 30}), false);
        assert.equal(mayDeleteLookup({permissionLevel: 40}), true);
        assert.equal(mayEditLookup(null), false);
    });

    it('combines jmapFilter with the search text', async () => {
        const filters = [];

        client.queryGet = async (entity, {filter}) => (filters.push(filter), {list: []});

        const panel = fakePanel({jmapFilter: {companyId: 3}});

        await panel.load();
        panel.refs.search.value = 'abc';
        await panel.load();
        panel.jmapFilter = null;
        await panel.load();
        panel.refs.search.value = '';
        await panel.load();

        assert.deepEqual(filters, [{companyId: 3}, {operator: 'AND', conditions: [{companyId: 3}, {text: 'abc'}]}, {text: 'abc'}, undefined]);
    });

    it('drops the answer of an older load', async () => {
        const answers = [];

        client.queryGet = () => new Promise(resolve => answers.push(resolve));

        const panel = fakePanel(),
              first  = panel.load(),
              second = panel.load();

        answers[1]({list: [{id: 2}]});
        await second;
        answers[0]({list: [{id: 1}]});
        await first;

        assert.deepEqual(panel.refs.table.records, [{id: 2}]);
    });

    it('applies the definition prepare() to the rows', async () => {
        client.queryGet = async () => ({list: [{id: 1}]});

        const panel = fakePanel({prepare: async list => list.map(r => ({...r, extra: 'x'}))});

        await panel.load();
        assert.deepEqual(panel.refs.table.records, [{id: 1, extra: 'x'}]);
    });

    it('passes defaults to a new record only', async () => {
        const configs = [],
              panel   = {
                  entity      : 'TestLookup',
                  dialogTitle : 'Lookup',
                  defaults    : {isActive: true},
                  createDialog: config => (configs.push(config), {on: () => {}})
              };

        await proto.edit.call(panel, null);
        await proto.edit.call(panel, '5');

        assert.deepEqual(configs[0].values, {isActive: true});
        assert.equal(configs[0].entityName, 'TestLookup');
        assert.equal('values' in configs[1], false);
        assert.equal(configs[1].entityId, '5');
    });
});

describe('GO.systemsettings.LookupSettingsDialog', () => {
    it('has no lookups by default', () => {
        assert.deepEqual(LookupSettingsDialog.config.lookups, []);
        assert.equal(LookupSettingsDialog.config.className, 'GO.systemsettings.LookupSettingsDialog');
    });
});
