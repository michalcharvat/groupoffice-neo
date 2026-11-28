import CanvasJS      from '../component/wrapper/CanvasJS.mjs';
import client        from '../jmap/Client.mjs';
import {goUrl}       from '../pdf/PdfViewer.mjs';
import {language, lookup, t} from '../Translate.mjs';

/**
 * canvasjs.min.js of the sf/canvasjs module (licensed copy, also used by the classic client); the version busts the cache
 */
const LIBRARY = 'go/modules/sf/canvasjs/views/canvasjs.min.js?v=3.17.9';

/**
 * @summary A CanvasJS chart in GO's look: light2 / dark2 following the user's colour scheme (`body.dark`, set by
 * Preferences.applyTheme), a transparent background, translated export menu and month / day names, the
 * formatters in the user's language and time zone. CanvasJS comes from the sf/canvasjs module only; without it
 * the chart shows a message (no CDN request).
 *
 *     {module: Chart, chartConfig: {axisX: {labelFormatter: 'date'}, toolTip: {contentFormatter: {formatter: 'template', template: '{name}: {y:number}'}}},
 *      chartData: [{type: 'line', name: t('Temperature'), xValueType: 'dateTime', click: 'event', dataPoints}],
 *      listeners: {chartEvent: ({name, dataPoint}) => …}}
 *
 * Options and formatters: Neo.component.wrapper.CanvasJS, src/main/canvasJsOptions.mjs. Demo: Dev module, "Chart".
 * @class GO.chart.Chart
 * @extends Neo.component.wrapper.CanvasJS
 */
class Chart extends CanvasJS {
    static config = {
        className: 'GO.chart.Chart'
    }

    /**
     * @summary Sets the library path, culture, locale and time zone of the user.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.downloadPath ??= goUrl(LIBRARY);
        me.locale       ??= language().replace('_', '-');
        me.timeZone     ??= client.user?.timezone || null;
        me.culture      ??= me.defaultCulture()
    }

    /**
     * @summary Translated export menu texts and GO's month and day names.
     * @returns {Object} CanvasJS culture info
     */
    defaultCulture() {
        // GO's language files: full_months is {1: …, 12: …}, full_days an array from Sunday; CanvasJS wants all or none
        const names = (key, count) => {
            const list = Object.values(lookup(key) || {});
            return list.length === count ? list : undefined
        };

        return {
            menuText    : t('Options'),
            panText     : t('Pan'),
            printText   : t('Print'),
            resetText   : t('Reset'),
            saveJPGText : t('Save as JPEG'),
            savePNGText : t('Save as PNG'),
            zoomText    : t('Zoom'),
            days        : names('full_days', 7),
            months      : names('full_months', 12),
            shortDays   : names('short_days', 7),
            shortMonths : names('short_months', 12)
        }
    }

    /**
     * @summary GO's chart options: a transparent background under the chart's own options.
     * @returns {Object}
     */
    getOptions() {
        return {backgroundColor: 'transparent', ...super.getOptions()}
    }

    /**
     * @summary Removes the message of a failed load.
     */
    onChartMounted() {
        super.onChartMounted();
        this.setMessage(null)
    }

    /**
     * @summary Shows that the chart could not be shown.
     * @param {String} error
     */
    handleLoadError(error) {
        this.setMessage(t('The chart could not be shown: the CanvasJS module is not available.'));
        super.handleLoadError(error)
    }

    /**
     * @summary Shows a message in place of the chart, null removes it.
     * @param {String|null} text plain text
     */
    setMessage(text) {
        let me = this,
            cn = me.vdom.cn;

        if (!text && cn.length < 2) {
            return
        }

        cn.length = 1;
        text && cn.push({cls: ['go-empty'], text});
        me.update()
    }

    /**
     * @summary Light or dark CanvasJS theme, picked and followed by the addon from `body.dark`.
     * @returns {Object}
     */
    resolveTheme() {
        return {dark: 'dark2', darkClass: 'dark', light: 'light2'}
    }
}

export default Neo.setupClass(Chart);
