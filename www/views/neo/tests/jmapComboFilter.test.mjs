// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: JmapComboBox} = await import('../src/form/field/JmapComboBox.mjs'),
      {default: client}       = await import('../src/jmap/Client.mjs');

describe('JmapComboBox setJmapFilter during a pending load', () => {
    const queryGet = client.queryGet;
    let pending;

    // every query waits until the test answers it with the rows of its filter
    beforeEach(() => {
        pending = [];
        client.queryGet = (entity, {filter}) => new Promise(resolve => pending.push({filter, resolve}))
    });
    afterEach(() => { client.queryGet = queryGet });

    const tick   = () => new Promise(resolve => setTimeout(resolve, 0)),
          answer = (query, ...ids) => query.resolve({list: ids.map(id => ({id, name: 'Row ' + id})), total: ids.length}),
          ids    = field => field.store.items.map(record => record.id),
          // a focused field without a DOM picker; returns whether the picker was opened
          opens  = field => {
              const state = {shown: false};
              field.showPicker = () => { state.shown = true };
              field.addScrollListener = () => {};
              Object.defineProperty(field, 'containsFocus', {value: true});
              Object.defineProperty(field, 'list', {value: {selectionModel: {select() {}, deselectAll() {}}}});
              return state
          };

    it('drops the answer of the old filter and queries with the new one', async () => {
        const field = Neo.create(JmapComboBox, {appName: 'test', name: 'activityId', entity: 'AmdDiaryActivity', jmapFilter: {vesselId: 1}});
        const picker = opens(field);

        const opening = field.doFilter('abc');
        await tick();
        assert.equal(pending.length, 1);
        assert.equal(pending[0].filter.vesselId, 1);

        field.setJmapFilter({vesselId: 2});
        await tick();
        assert.equal(pending.length, 2, 'the new filter queries while the old load is pending');
        assert.equal(pending[1].filter.vesselId, 2);
        assert.equal(pending[1].filter.text, 'abc', 'the typed text stays');

        // the new answer first: rows are there when the old doFilter() resumes
        answer(pending[1], 22);
        await tick();
        assert.deepEqual(ids(field), [22]);

        answer(pending[0], 11);
        await opening;
        assert.deepEqual(ids(field), [22], 'the old answer is dropped');
        assert.equal(picker.shown, false, 'the old doFilter() opens nothing');
        assert.equal(field.store.isLoaded, true);
        assert.equal(field.lastQuery, 'abc', 'a reopen with the same text reuses these rows');
        field.destroy()
    });

    it('queries again after a filter change of a loaded store, also when that query failed', async () => {
        const field = Neo.create(JmapComboBox, {appName: 'test', name: 'activityId', entity: 'AmdDiaryActivity', jmapFilter: {vesselId: 1}});
        opens(field);

        const first = field.doFilter('abc');
        await tick();
        answer(pending[0], 11);
        await first;
        assert.deepEqual(ids(field), [11]);

        // vessel B: its query fails
        field.setJmapFilter({vesselId: 2}).catch(() => {});
        await tick();
        assert.equal(pending.length, 2);
        pending[1].resolve(Promise.reject(new Error('offline')));
        await tick();

        // same text: no reuse of vessel A's rows
        field.doFilter('abc').catch(() => {});
        await tick();
        assert.equal(pending.length, 3, 'queries again');
        assert.equal(pending[2].filter.vesselId, 2);
        field.destroy()
    });

    it('opens nothing when a newer load replaced its query', async () => {
        const field = Neo.create(JmapComboBox, {appName: 'test', name: 'activityId', entity: 'AmdDiaryActivity', jmapFilter: {vesselId: 1}});
        const picker = opens(field);

        const first = field.doFilter('a');
        await tick();
        answer(pending[0], 11);
        await first;
        assert.equal(picker.shown, true);
        picker.shown = false;

        const typed = field.doFilter('ab');
        await tick();
        // a push reload replaces the query; its rows are not here yet
        field.store.load().catch(() => {});
        answer(pending[1], 12);
        await typed;
        assert.equal(picker.shown, false);
        field.destroy()
    });

    it('does not reuse the rows of another text while its query runs or after it failed', async () => {
        const field = Neo.create(JmapComboBox, {appName: 'test', name: 'activityId', entity: 'AmdDiaryActivity'});
        const picker = opens(field);

        const first = field.doFilter('a');
        await tick();
        answer(pending[0], 11);
        await first;
        picker.shown = false;

        field.doFilter('ab').catch(() => {});
        await tick();
        field.doFilter('ab').catch(() => {});
        await tick();
        assert.equal(pending.length, 3, 'the repeat queries again');
        assert.equal(picker.shown, false, 'the rows of "a" are not offered');

        pending[2].resolve(Promise.reject(new Error('offline')));
        await tick();
        field.doFilter('ab').catch(() => {});
        await tick();
        assert.equal(pending.length, 4, 'after a failure it queries again');
        assert.equal(picker.shown, false);
        field.destroy()
    });

    it('hides an open picker on a filter change', async () => {
        const field = Neo.create(JmapComboBox, {appName: 'test', name: 'activityId', entity: 'AmdDiaryActivity'});
        let hidden = false;
        field.store.isLoaded = true;
        field._pickerIsMounted = true;
        field.hidePicker = () => { hidden = true };

        field.setJmapFilter({vesselId: 2}).catch(() => {});
        assert.equal(hidden, true);
        field.destroy()
    });

    it('only merges the filter before the first load', async () => {
        const field = Neo.create(JmapComboBox, {appName: 'test', name: 'activityId', entity: 'AmdDiaryActivity'});

        await field.setJmapFilter({vesselId: 3});
        assert.equal(pending.length, 0);
        assert.equal(field.store.jmapFilter.vesselId, 3);
        field.destroy()
    });
});
