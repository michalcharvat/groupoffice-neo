// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
// src/main/canvasJsOptions.mjs: formatter names in CanvasJS options become functions on the main thread
import assert from 'node:assert/strict';
import {eventData, resolveOptions} from '../src/main/canvasJsOptions.mjs';

const ctx = {locale: 'en-US', timeZone: 'UTC'};

describe('canvasJsOptions (GO.chart.Chart)', () => {
    it('replaces formatter names of function options only, deep, and copies the rest', () => {
        const options = {
                  title: {text: 'labelFormatter'},
                  axisX: {labelFormatter: 'date', valueFormatString: 'DD'},
                  data : [{type: 'line', click: 'event', dataPoints: [{x: new Date(0), y: 1}]}]
              },
              out = resolveOptions(options, ctx);

        assert.equal(out.title.text, 'labelFormatter');
        assert.equal(typeof out.axisX.labelFormatter, 'function');
        assert.equal(out.axisX.valueFormatString, 'DD');
        assert.equal(typeof out.data[0].click, 'function');
        assert.ok(out.data[0].dataPoints[0].x instanceof Date);
        assert.notEqual(out.data, options.data);
        assert.equal(options.axisX.labelFormatter, 'date');
    });

    it('formats numbers and dates in the locale and time zone', () => {
        const {axisX, axisY} = resolveOptions({
            axisX: {labelFormatter: {formatter: 'date', dateStyle: 'short'}},
            axisY: {labelFormatter: {formatter: 'number', maximumFractionDigits: 1}}
        }, ctx);

        assert.equal(axisY.labelFormatter({value: 1234.56}), '1,234.6');
        assert.equal(axisX.labelFormatter({value: Date.UTC(2026, 10, 28, 23, 30)}), '11/28/26');
        assert.equal(axisX.labelFormatter({value: null}), '');
    });

    it('template: one escaped line per tool tip entry, fields with formatters', () => {
        const {toolTip} = resolveOptions({toolTip: {contentFormatter: {formatter: 'template', template: '{name}: {y:number} {meta.unit}'}}}, ctx);

        assert.equal(toolTip.contentFormatter({entries: [
            {dataSeries: {name: '<b>Air</b>'}, dataPoint: {y: 1000.5, meta: {unit: '°C'}}},
            {dataSeries: {name: 'Water'}, dataPoint: {y: 2}}
        ]}), '&lt;b&gt;Air&lt;/b&gt;: 1,000.5 °C<br>Water: 2 ');
    });

    it('event sends plain data to ctx.emit, unknown formatters are left to CanvasJS', () => {
        const sent = [],
              out  = resolveOptions({data: [{click: 'event', mouseover: 'nope'}]}, {...ctx, emit: (name, data) => sent.push([name, data])});

        assert.equal(out.data[0].mouseover, undefined);
        out.data[0].click({chart: {}, dataSeries: {name: 'Air', index: 1}, dataPoint: {x: 1, y: 2}, dataPointIndex: 4});
        assert.deepEqual(sent, [['click', {
            dataPoint: {x: 1, y: 2}, dataPointIndex: 4, dataSeriesIndex: 1, seriesName: 'Air', trigger: null, axisX: null, axisY: null
        }]]);
    });

    it('eventData drops what cannot be posted', () => {
        assert.deepEqual(eventData({dataPoint: {x: 1, click: () => 1}}).dataPoint, {x: 1});
        assert.equal(eventData({dataPoint: {s: Symbol('s')}}).dataPoint, null);
        assert.deepEqual(eventData({trigger: 'zoom', axisX: [{viewportMinimum: 1, viewportMaximum: 5, chart: {}}]}).axisX,
            [{viewportMinimum: 1, viewportMaximum: 5}]);
    });

    it('a point of its own with click: event sends its fields', () => {
        const sent = [],
              out  = resolveOptions({data: [{dataPoints: [{label: 'Q1', y: 3, click: 'event'}]}]}, {...ctx, emit: (name, data) => sent.push(data)}),
              point = out.data[0].dataPoints[0];

        point.click({dataPoint: point, dataPointIndex: 0, dataSeries: {index: 0}});
        assert.deepEqual(sent[0].dataPoint, {label: 'Q1', y: 3});
    });

    it('toggleSeries hides and shows a series', () => {
        let renders = 0;
        const {legend} = resolveOptions({legend: {itemclick: 'toggleSeries'}}, ctx),
              e = {chart: {render: () => renders++}, dataSeries: {}};

        legend.itemclick(e);
        assert.equal(e.dataSeries.visible, false);
        legend.itemclick(e);
        assert.equal(e.dataSeries.visible, true);
        assert.equal(renders, 2);
    });
});
