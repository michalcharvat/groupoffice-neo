// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {resolveTimeZone, setUserTimeZone, toIsoLocal, toUserTime} = await import('../src/DateUtil.mjs'),
      {formatUserDateTime, userFormat}          = await import('../src/Format.mjs'),
      {default: DateTimeField}                  = await import('../src/form/field/DateTimeField.mjs'),
      {default: Scheduler}                      = await import('../src/scheduler/Scheduler.mjs');

const field = config => Neo.create(DateTimeField, {appName: 'test', name: 'eta', ...config}),
      hi    = date => [date.getHours(), date.getMinutes()];

describe('a given time zone (DateTimeField, Format, Scheduler)', () => {
    let warn, warned;

    beforeEach(() => {
        setUserTimeZone('Europe/Amsterdam');
        warned = [];
        warn = console.warn;
        console.warn = msg => warned.push(msg)
    });

    afterEach(() => {
        setUserTimeZone(null);
        console.warn = warn
    });

    it('shows a value of Europe/Amsterdam in Asia/Singapore', () => {
        const f = field({timeZone: 'Asia/Singapore', value: '2026-06-15T10:00:00+02:00'});

        assert.equal(f.value, '2026-06-15T16:00:00+08:00');
        assert.equal(f.dateText, '2026-06-15');
        assert.equal(f.timeText, '16:00');
        assert.deepEqual(hi(f.getValueAsDate()), [16, 0]);
    });

    it('takes the offset of the zone at that instant across a DST change', () => {
        assert.equal(toIsoLocal(new Date(2026, 2, 28, 12, 0), 'Europe/Amsterdam'), '2026-03-28T12:00:00+01:00');
        assert.equal(toIsoLocal(new Date(2026, 2, 29, 12, 0), 'Europe/Amsterdam'), '2026-03-29T12:00:00+02:00');

        // the user is in Singapore, the field in Amsterdam: summer time starts at 01:00Z
        setUserTimeZone('Asia/Singapore');
        assert.equal(field({timeZone: 'Europe/Amsterdam', value: '2026-03-29T00:30:00Z'}).value, '2026-03-29T01:30:00+01:00');
        assert.equal(field({timeZone: 'Europe/Amsterdam', value: '2026-03-29T01:30:00Z'}).value, '2026-03-29T03:30:00+02:00');
    });

    it('keeps both instants of a repeated hour and moves a skipped one', () => {
        // summer time ends at 01:00Z: 02:30 happens at 00:30Z (+02:00) and at 01:30Z (+01:00)
        assert.equal(field({timeZone: 'Europe/Amsterdam', value: '2026-10-25T00:30:00Z'}).value, '2026-10-25T02:30:00+02:00');
        assert.equal(field({timeZone: 'Europe/Amsterdam', value: '2026-10-25T01:30:00Z'}).value, '2026-10-25T02:30:00+01:00');
        assert.equal(field({value: '2026-10-25T00:30:00Z'}).value, '2026-10-25T02:30:00+02:00');

        // 02:30 on 2026-03-29 does not exist in Amsterdam: value and inputs both say 03:30
        const f = field({timeZone: 'Europe/Amsterdam', value: '2026-03-29T02:30:00'});
        assert.equal(f.value, '2026-03-29T03:30:00+02:00');
        assert.equal(f.timeText, '03:30');
    });

    it('takes "now" from its own zone', () => {
        const f = field({timeZone: 'Asia/Singapore'});

        assert.equal(Math.abs(f.now() - toUserTime(Date.now(), 'Asia/Singapore')) < 1000, true);
        assert.equal(resolveTimeZone('constructor'), null);
        assert.equal(resolveTimeZone('__proto__'), null);
        // no offset: a wall time, not moved by the user's DST gap (a browser with that gap cannot hold it: DateUtil.mjs)
        new Date(2026, 2, 29, 2, 30).getHours() === 2 && assert.equal(field({timeZone: 'Asia/Singapore', withTimeZone: false, value: '2026-03-29T02:30:00'}).value, '2026-03-29T02:30:00');
    });

    it('reports no change for an untouched value', () => {
        const f       = field({timeZone: 'Asia/Singapore', value: '2026-06-15T16:00:00+08:00'}),
              changes = [];

        f.on('userChange', e => changes.push(e));
        // the inputs as they were rendered
        f.onInputChange({target: {cls: ['go-field-input', 'go-datetime-time']}, value: f.timeText});

        assert.equal(f.value, '2026-06-15T16:00:00+08:00');
        assert.equal(changes.length, 0);
    });

    it('edits the wall time of its zone', () => {
        const f       = field({timeZone: 'Asia/Singapore', value: '2026-06-15T16:00:00+08:00'}),
              changes = [];

        f.on('userChange', e => changes.push(e));
        f.onInputChange({target: {cls: ['go-field-input', 'go-datetime-time']}, value: '09:15'});

        assert.equal(f.value, '2026-06-15T09:15:00+08:00');
        assert.equal(changes.length, 1);
    });

    it('keeps the instant when the zone changes', () => {
        const f = field({timeZone: 'Asia/Singapore', value: '2026-06-15T16:00:00+08:00'});

        f.timeZone = 'America/New_York';
        assert.equal(f.value, '2026-06-15T04:00:00-04:00');
        assert.equal(f.timeText, '04:00');

        f.timeZone = null;
        assert.equal(f.value, '2026-06-15T10:00:00+02:00');
    });

    it('null zone: the user\'s, as before', () => {
        assert.equal(field({value: '2026-06-15T08:00:00Z'}).value, '2026-06-15T10:00:00+02:00');
        assert.equal(field({value: '2026-06-15T10:00:00'}).value, '2026-06-15T10:00:00+02:00');
    });

    it('an unknown zone falls back to the user\'s with a warning', () => {
        const f = field({timeZone: 'Mars/Olympus', value: '2026-06-15T08:00:00Z'});

        assert.equal(f.timeZone, null);
        assert.equal(f.value, '2026-06-15T10:00:00+02:00');
        assert.ok(warned.some(msg => msg.includes('Mars/Olympus')));
    });

    it('formats an instant in a given zone', () => {
        const {dateFormat, timeFormat} = userFormat;

        userFormat.dateFormat = 'd-m-Y';
        userFormat.timeFormat = 'H:i';

        try {
            assert.equal(formatUserDateTime('2026-06-15T08:00:00Z', 'Asia/Singapore'), '15-06-2026 16:00');
            assert.equal(formatUserDateTime('2026-06-15T08:00:00Z'), '15-06-2026 10:00');
        } finally {
            Object.assign(userFormat, {dateFormat, timeFormat})
        }
    });

    it('Scheduler: events and bands in a given zone', () => {
        const [event] = Scheduler.normalizeEvents([{id: 1, resourceId: 'v', startDate: '2026-06-15T08:00:00Z', endDate: '2026-06-15T09:00:00Z'}], {}, 'Asia/Singapore'),
              [band]  = Scheduler.mapBackgrounds([{resourceId: 'v', startDate: '2026-06-15T08:00:00Z', endDate: '2026-06-15T09:00:00Z'}], [{id: 'v'}], 'Asia/Singapore').get('v');

        assert.deepEqual(hi(event.startDate), [16, 0]);
        assert.deepEqual(hi(band.endDate), [17, 0]);
        assert.deepEqual(hi(toUserTime('2026-06-15T08:00:00Z')), [10, 0]);
    });
});
