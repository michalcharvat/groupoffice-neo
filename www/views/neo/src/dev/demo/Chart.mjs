import Button    from '../../button/Button.mjs';
import Chart     from '../../chart/Chart.mjs';
import Container from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Page, {code, h3, output, p} from './Page.mjs';

const DAY = 86400000;

/**
 * @summary Two series of a week of hourly values from a seed, so a reload shows other data.
 * @param {Number} seed
 * @returns {Object[]} CanvasJS data series
 */
function sampleSeries(seed) {
    const start = Date.UTC(2026, 10, 20),
          line  = (name, base, amp) => ({
              type: 'line', name, showInLegend: true, xValueType: 'dateTime', click: 'event', markerSize: 0,
              dataPoints: Array.from({length: 7 * 24}, (v, i) => ({
                  x: start + i * DAY / 24,
                  y: Math.round((base + amp * Math.sin((i + seed) / 12) + Math.sin(i * seed)) * 10) / 10
              }))
          });

    return [line('Air', 8, 4), line('Water', 11, 1.5)]
}

/**
 * @summary Dev demo of GO.chart.Chart: a time line chart with zoom and legend toggles, a column chart, new data
 * and clicks as worker events.
 * @class GO.dev.demo.Chart
 * @extends GO.dev.demo.Page
 */
class ChartDemo extends Page {
    static config = {
        className: 'GO.dev.demo.Chart',
        heading  : 'Chart'
    }

    /**
     * @summary The charts with buttons for new data and an option change.
     * @returns {Object[]}
     */
    pageItems() {
        return [
            p('GO.chart.Chart draws a CanvasJS chart (sf/canvasjs) in a main thread addon. Options are JSON: formatters by name, clicks come back as the chartEvent event. Switch the colour scheme in your settings: the chart follows it. Resize the window: it draws again.'),
            {
                module: Container,
                layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
                style : {gap: '8px'},
                items : [
                    {module: Button, ui: 'secondary', text: 'New data',          handler: 'up.onNewData'},
                    {module: Button, ui: 'secondary', text: 'Y axis 0 – 20',     handler: 'up.onAxis'},
                    {module: Button, ui: 'secondary', text: 'Column chart type', handler: 'up.onColumns'}
                ]
            },
            {
                module     : Chart,
                reference  : 'lineChart',
                style      : {height: '360px'},
                chartConfig: {
                    zoomEnabled  : true,
                    exportEnabled: true,
                    title  : {text: 'Temperature', fontSize: 16},
                    axisX  : {labelFormatter: 'date'},
                    axisY  : {suffix: ' °C', labelFormatter: {formatter: 'number', maximumFractionDigits: 1}},
                    toolTip: {shared: true, contentFormatter: {formatter: 'template', template: '{name}: {y:number} °C, {x:dateTime}'}},
                    legend : {cursor: 'pointer', itemclick: 'toggleSeries'}
                },
                chartData: sampleSeries(1),
                listeners: {chartEvent: 'up.onChartEvent', loadError: 'up.onLoadError'}
            },
            h3('Column chart'),
            {
                module     : Chart,
                reference  : 'columnChart',
                style      : {height: '280px'},
                chartConfig: {axisY: {labelFormatter: {formatter: 'number', style: 'currency', currency: 'EUR', maximumFractionDigits: 0}}},
                chartData  : [{type: 'column', click: 'event', indexLabel: '{y}', dataPoints: [
                    {label: 'Q1', y: 1200}, {label: 'Q2', y: 1850}, {label: 'Q3', y: 940}, {label: 'Q4', y: 2310}
                ]}],
                listeners: {chartEvent: 'up.onChartEvent'}
            },
            output(),
            code(`{module: Chart, style: {height: '360px'},
 chartConfig: {zoomEnabled: true, exportEnabled: true,
     axisX  : {labelFormatter: 'date'},                    // date, dateTime, time, number: Intl in the user's language / time zone
     axisY  : {labelFormatter: {formatter: 'number', maximumFractionDigits: 1}},
     toolTip: {contentFormatter: {formatter: 'template', template: '{name}: {y:number} °C, {x:dateTime}'}},
     legend : {itemclick: 'toggleSeries'}},
 chartData: [{type: 'line', xValueType: 'dateTime', click: 'event', dataPoints}],
 listeners: {chartEvent: ({name, dataPoint, dataSeriesIndex}) => …, loadError: ({error}) => …}}

chart.chartData = series;                    // draws again
chart.setProperty('axisY.maximum', 20);       // one option of the drawn chart
chart.chartConfig = {...};                    // creates the chart again`)
        ]
    }

    /**
     * @summary Logs a click on a data point.
     * @param {Object} data
     */
    onChartEvent({name, dataPoint, dataSeriesIndex, seriesName}) {
        this.log(`chartEvent ${name}: series ${seriesName ?? dataSeriesIndex}, ${JSON.stringify(dataPoint)}`)
    }

    /**
     * @summary Logs a failed load.
     * @param {Object} data
     * @param {String} data.error
     */
    onLoadError({error}) {
        this.log('loadError: ' + error)
    }

    /**
     * @summary Replaces the data series of the line chart.
     */
    onNewData() {
        this.getReference('lineChart').chartData = sampleSeries(Math.round(Math.random() * 20) + 2);
        this.log('chartData: new series')
    }

    /**
     * @summary Limits the y axis of the drawn line chart.
     */
    async onAxis() {
        const chart = this.getReference('lineChart');

        await chart.setProperty('axisY.minimum', 0);
        this.log('setProperty: ' + await chart.setProperty('axisY.maximum', 20))
    }

    /**
     * @summary Turns the line series into columns: a new chartConfig would recreate, new data only redraws.
     */
    onColumns() {
        const chart = this.getReference('lineChart');

        chart.chartData = sampleSeries(1).map(series => ({...series, type: 'column', dataPoints: series.dataPoints.filter((pt, i) => i % 24 === 12)}));
        this.log('chartData: column series')
    }
}

export default Neo.setupClass(ChartDemo);
