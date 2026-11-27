// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: WeekView} = await import('../../../go/modules/community/calendar/views/neo/view/WeekView.mjs');

const day  = new Date(2026, 10, 27),
      at   = (h, m) => new Date(2026, 10, 27, h, m),
      item = (start, end) => ({start, end});

describe('GO.calendar.WeekView.calculateOverlap', () => {
    it('keeps back to back items in one lane without a minimum height', () => {
        const events = [item(at(9, 0), at(9, 10)), item(at(9, 10), at(9, 20))];

        WeekView.calculateOverlap(events, day);
        assert.deepEqual(events.map(e => [e.pos, e.lanes]), [[0, 1], [0, 1]]);
    });

    it('puts short items next to each other when their drawn height overlaps', () => {
        const events = [item(at(9, 0), at(9, 10)), item(at(9, 10), at(9, 20)), item(at(11, 0), at(12, 0))];

        WeekView.calculateOverlap(events, day, 30);
        assert.deepEqual(events.map(e => [e.pos, e.lanes]), [[0, 2], [1, 2], [0, 1]]);
    });
});
