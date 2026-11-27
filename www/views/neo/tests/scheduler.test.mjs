// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
// neo's own unit-test globals (no browser): setup.mjs first, then the engine
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: Scheduler} = await import('../src/scheduler/Scheduler.mjs');

// other test files stub Neo.getComponent when they are imported: the instance tests need neo's own
const getComponent = Neo.getComponent;

const resources = [
    {id: 'c1', parentId: null, name: 'Company', bookable: false},
    {id: 'v1', parentId: 'c1', name: 'Vessel', bookable: false},
    {id: 'r1', parentId: 'v1', name: 'Master'},
    {id: 'r2', parentId: 'v1', name: 'Cook'}
];

const voyages = [
    {id: 7, rankKey: 'r1', startTime: '2026-11-02T08:00:00Z', endTime: '2026-11-20T08:00:00Z', name: 'Ann'},
    {id: 8, rankKey: 'r2', startTime: '2026-11-05T00:00:00Z', endTime: '2026-11-03T00:00:00Z', name: 'reversed'},
    {id: 9, rankKey: null, startTime: '2026-11-05T00:00:00Z', endTime: '2026-11-06T00:00:00Z', name: 'no rank'}
];

const eventFields = {startDate: 'startTime', endDate: 'endTime', resourceId: r => r.rankKey, title: 'name'};

describe('GO.scheduler.Scheduler', () => {
    it('normalises source records into neo events, dropping those without a resource or range', () => {
        const events = Scheduler.normalizeEvents(voyages, eventFields);

        assert.equal(events.length, 1);
        assert.deepEqual({...events[0], startDate: +events[0].startDate, endDate: +events[0].endDate},
            {id: '7', resourceId: 'r1', startDate: Date.parse('2026-11-02T08:00:00Z'), endDate: Date.parse('2026-11-20T08:00:00Z'), title: 'Ann', cls: null});
    });

    it('checks the range on the instants and skips records without an id', () => {
        // 30 minutes over the end of summer time in Prague: wall times run backwards, the event stays
        const dst = Scheduler.normalizeEvents([{id: 1, resourceId: 'r', startDate: '2026-10-25T00:45:00Z', endDate: '2026-10-25T01:15:00Z'}]);
        assert.equal(dst.length, 1);
        assert.equal(Scheduler.normalizeEvents([{resourceId: 'r', startDate: '2026-10-25T00:45:00Z', endDate: '2026-10-25T01:15:00Z'}]).length, 0);
    });

    it('derives isLeaf and string ids for the tree', () => {
        const data = Scheduler.toTreeData([{id: 1, parentId: null}, {id: 2, parentId: 1}]);

        assert.deepEqual(data.map(r => [r.id, r.parentId, r.isLeaf, r.collapsed]), [['1', null, false, false], ['2', '1', true, false]]);
    });

    it('merges an eventRenderer result into the bar node', () => {
        const node = () => ({id: 'b', cls: ['neo-timeline-bar'], cn: [{id: 'b__label', text: 'x'}, {id: 'b__resize-end'}]});

        const merged = Scheduler.mergeBar(node(), {html: '<b>Ann</b>', cls: 'crew-type-1'});
        assert.deepEqual(merged.cls, ['neo-timeline-bar', 'crew-type-1']);
        assert.deepEqual(merged.cn[0], {id: 'b__label', html: '<b>Ann</b>'});
        assert.equal(merged.cn.length, 2);
        assert.equal(Scheduler.mergeBar(node(), 'Bob').cn[0].text, 'Bob');
    });

    it('paints a band on its row and, with inherit, on every descendant', () => {
        const rows = Scheduler.mapBackgrounds([
            {resourceId: 'v1', startDate: '2026-11-03T00:00:00Z', endDate: '2026-11-05T00:00:00Z', cls: 'port', inherit: true},
            {resourceId: 'r2', startDate: '2026-11-10T00:00:00Z', endDate: '2026-11-10T00:30:00Z', cls: ['change', 'off']},
            {resourceId: 'r1', startDate: '2026-11-10T00:00:00Z', endDate: '2026-11-09T00:00:00Z'}
        ], resources);

        assert.deepEqual([...rows.keys()].sort(), ['r1', 'r2', 'v1']);
        assert.equal(rows.has('c1'), false);
        assert.deepEqual(rows.get('r2').map(b => b.cls), [['port'], ['change', 'off']]);
        assert.equal(rows.get('r1').length, 1);
        assert.equal(+rows.get('v1')[0].startDate, Date.parse('2026-11-03T00:00:00Z'));

        // a band over the end of summer time stays; a parent cycle does not loop
        const dst   = {resourceId: 'a', startDate: '2026-10-25T00:45:00Z', endDate: '2026-10-25T01:15:00Z', inherit: true},
              cycle = Scheduler.mapBackgrounds([dst], [{id: 'a', parentId: 'b'}, {id: 'b', parentId: 'a'}]);
        assert.deepEqual([...cycle.keys()], ['a', 'b']);
    });

    it('grows the range by whole months near an edge only', async () => {
        const {default: TimeAxis} = await import('../node_modules/neo.mjs/src/timeline/TimeAxis.mjs'),
              axis = Neo.create(TimeAxis, {start: new Date(2026, 10, 1), end: new Date(2027, 10, 1), pxPerMinute: 0.01, tickUnit: 'week'}),
              month = 30 * 1440 * 0.01;   // 432 px

        assert.equal(Scheduler.grownRange(axis, 1000, 400), null);
        const atStart = Scheduler.grownRange(axis, 100, 400);
        assert.deepEqual([atStart.start.getFullYear(), atStart.start.getMonth(), atStart.start.getDate()], [2026, 8, 1]);
        assert.equal(+atStart.end, +axis.end);
        const atEnd = Scheduler.grownRange(axis, axis.totalSize - 500, 400);
        assert.equal(+atEnd.start, +axis.start);
        assert.deepEqual([atEnd.end.getFullYear(), atEnd.end.getMonth()], [2028, 0]);
        assert.ok(month > 400);

        assert.equal(Scheduler.rangeIncluding(axis, new Date(2026, 11, 24)), null);
        const back = Scheduler.rangeIncluding(axis, new Date(2026, 5, 15));
        assert.deepEqual([back.start.getFullYear(), back.start.getMonth(), back.start.getDate()], [2026, 4, 1]);
        assert.equal(Scheduler.rangeIncluding(axis, new Date(2027, 10, 1)).end.getMonth(), 0);
        axis.destroy();
    });

    it('has month, quarter and year zoom presets next to neo\'s', () => {
        assert.deepEqual(Object.keys(Scheduler.zoomPresets), ['hour', 'day', 'week', 'month', 'quarter', 'year']);
        assert.equal(Scheduler.zoomPresets.year.tickUnit, 'month');
    });

    describe('instance', () => {
        let scheduler, stub;

        before(() => {
            stub = Neo.getComponent;
            Neo.getComponent = getComponent;
            scheduler = Neo.create(Scheduler, {
                appName  : 'test',
                readOnly : true,
                resources,
                events   : voyages,
                eventFields,
                backgrounds: [{resourceId: 'v1', startDate: '2026-11-03T00:00:00Z', endDate: '2026-11-05T00:00:00Z', cls: 'port', inherit: true}],
                timeAxis : {start: '2026-11-01', end: '2026-12-01', tickUnit: 'day', pxPerMinute: 0.05, snapMinutes: 60},
                resourceColumns: [{dataField: 'name', text: 'Resource', type: 'tree', width: 200, locked: 'start'}]
            });
        });

        it('keeps the caller\'s editable when not read-only', () => {
            const other = Neo.create(Scheduler, {appName: 'test', editable: false, resources, events: []});

            assert.equal(other.editable, false);
            assert.equal(other.barDraggable, true);
            other.destroy()
        });

        after(() => {
            scheduler?.destroy();
            Neo.getComponent = stub
        });

        it('projects the resources into a tree store and collapses a parent', () => {
            assert.equal(scheduler.store.isTreeStore, true);
            assert.deepEqual(scheduler.store.items.map(r => r.id), ['c1', 'v1', 'r1', 'r2']);
            assert.equal(scheduler.store.get('c1').bookable, false);

            scheduler.store.collapse(scheduler.store.get('v1'));
            assert.deepEqual(scheduler.store.items.map(r => r.id), ['c1', 'v1']);
            scheduler.store.expand(scheduler.store.get('v1'));
            assert.deepEqual(scheduler.store.items.map(r => r.id), ['c1', 'v1', 'r1', 'r2']);
        });

        it('keeps the source record of an event', () => {
            assert.equal(scheduler.eventStore.getCount(), 1);
            assert.equal(scheduler.getSourceRecord(7), voyages[0]);
            assert.equal(scheduler.eventStore.getRangeRecords('2026-11-01', '2026-12-01', 'r1').length, 1);
        });

        it('rebuilds the events when a source store loads', async () => {
            const {default: Store} = await import('../node_modules/neo.mjs/src/data/Store.mjs'),
                  {setDataAndFireLoad} = await import('../src/data/setData.mjs'),
                  store = Neo.create(Store, {model: {fields: ['id', 'rankKey', 'startTime', 'endTime', 'name'].map(name => ({name}))}});

            scheduler.events = store;
            assert.equal(scheduler.eventStore.getCount(), 0);
            setDataAndFireLoad(store, [{...voyages[0], id: 11, rankKey: 'r2'}]);
            assert.deepEqual(scheduler.eventStore.items.map(e => [e.id, e.resourceId, e.title]), [['11', 'r2', 'Ann']]);
            assert.equal(scheduler.getSourceRecord(11), store.get(11));

            scheduler.events = voyages;
            store.destroy()
        });

        it('turns off drag, resize and the editor when read-only', () => {
            assert.equal(scheduler.barDraggable, false);
            assert.equal(scheduler.resizableBars, false);
            assert.equal(scheduler.editable, false);
        });

        it('refuses moveEvent() when read-only', () => {
            const start = +scheduler.eventStore.get('7').startDate;

            assert.equal(scheduler.moveEvent('7', {startDate: new Date(start + 3600000)}), null);
            assert.equal(+scheduler.eventStore.get('7').startDate, start);
        });

        it('turns the click position on the empty track of a bookable row into a date', () => {
            const axis  = scheduler.timeAxis,
                  x     = axis.dateToX(new Date(2026, 10, 10, 12)),
                  track = {cls: ['neo-timeline-track'], rect: {left: 300}},
                  row   = id => ({cls: ['neo-grid-row'], id: 'row-' + id, data: {recordId: id}}),
                  slot  = scheduler.getSlotTarget({clientX: 300 + x, path: [track, {cls: ['neo-timeline-cell']}, row('r1')]});

            assert.equal(slot.resource.id, 'r1');
            assert.equal(+slot.date, +new Date(2026, 10, 10, 12));
            // a bar, a grouping row and a click without a position are no slot
            assert.equal(scheduler.getSlotTarget({clientX: 300 + x, path: [{cls: ['neo-timeline-bar'], data: {eventId: '7'}}, track, row('r1')]}), null);
            assert.equal(scheduler.getSlotTarget({clientX: 300 + x, path: [track, row('v1')]}), null);
            assert.equal(scheduler.getSlotTarget({path: [track, row('r1')]}), null);
        });

        it('paints inherited background bands behind the bars of a row', () => {
            const record = scheduler.store.get('r1'),
                  track  = scheduler.timelineColumn.cellRenderer({record, row: {id: 'row'}}).cn[0];

            assert.deepEqual(track.cn[0].cls, ['go-scheduler-background', 'port']);
            assert.equal(track.cn[0].style.left, `${scheduler.timeAxis.dateToX(new Date(Date.parse('2026-11-03T00:00:00Z')))}px`);
            assert.equal(scheduler.timelineColumn.cellRenderer({record: scheduler.store.get('c1'), row: {id: 'c'}}).cn[0].cn
                .some(node => node.cls.includes('go-scheduler-background')), false);
        });

        it('zooms to a GO preset and grows the axis to a date out of range', async () => {
            let changed = null;

            scheduler.zoomTo('quarter');
            assert.equal(scheduler.timeAxis.tickUnit, 'week');
            assert.equal(scheduler.majorTickUnit, 'month');

            scheduler.growRange = true;
            scheduler.on('rangeChange', range => changed = range);
            await scheduler.scrollToDate(new Date(2027, 2, 10));
            assert.ok(+scheduler.timeAxis.end > +new Date(2027, 2, 10));
            assert.equal(scheduler.timeAxis.start.getDate(), 1);
            assert.equal(+changed.end, +scheduler.timeAxis.end);
            scheduler.growRange = false;
        });

        it('does not move a read-only bar with the arrow keys', () => {
            const event = scheduler.eventStore.get('7'),
                  start = +event.startDate,
                  path  = [{cls: ['neo-timeline-bar'], data: {eventId: '7'}}];

            scheduler.onBarKeyDown({key: 'ArrowRight', path});
            scheduler.onBarKeyDown({key: 'ArrowLeft', shiftKey: true, path});
            assert.equal(+scheduler.eventStore.get('7').startDate, start);

            // the guard is what stops it: an editable scheduler moves the same bar
            scheduler.readOnly = false;
            scheduler.onBarKeyDown({key: 'ArrowRight', path});
            assert.notEqual(+scheduler.eventStore.get('7').startDate, start);
            scheduler.readOnly = true;
        });
    });
});
