import Component from '../../../node_modules/neo.mjs/src/component/Base.mjs';

/**
 * @summary Renders a CanvasJS chart through the main thread's CanvasJS addon (src/main/addon/CanvasJS.mjs).
 *
 * `chartConfig` holds the CanvasJS options and `chartData` the data series. Both are JSON: an option CanvasJS
 * calls as a function (labelFormatter, contentFormatter, itemclick, click …) takes a formatter name, see
 * src/main/canvasJsOptions.mjs; `'event'` fires `chartEvent` {name, dataPoint, dataPointIndex, dataSeriesIndex,
 * seriesName, trigger, axisX, axisY} here.
 *
 *     {module: CanvasJS, chartConfig: {axisX: {labelFormatter: 'date'}}, chartData: [{type: 'line', click: 'event', dataPoints}]}
 *
 * A new `chartConfig` creates the chart again, a new `chartData` only draws it again. The chart draws again
 * when the component changes size.
 * @class Neo.component.wrapper.CanvasJS
 * @extends Neo.component.Base
 */
class CanvasJS extends Component {
    static config = {
        className: 'Neo.component.wrapper.CanvasJS',
        ntype    : 'canvasjs',
        /**
         * Name of the main thread addon for Neo.Main.importAddon(); 'WS/': the addon lives in this workspace
         * @member {String} addonName='WS/CanvasJS'
         */
        addonName: 'WS/CanvasJS',
        /**
         * CanvasJS options without `data`, see https://canvasjs.com/docs/charts/chart-options/
         * @member {Object|null} chartConfig_=null
         * @reactive
         */
        chartConfig_: null,
        /**
         * CanvasJS data series; null: `chartConfig.data`
         * @member {Object[]|null} chartData_=null
         * @reactive
         */
        chartData_: null,
        /**
         * CanvasJS culture info (export menu texts, separators); null: CanvasJS' English
         * @member {Object|null} culture=null
         */
        culture: null,
        /**
         * URL of canvasjs.min.js; null: the addon's downloadPath (the CanvasJS CDN)
         * @member {String|null} downloadPath=null
         */
        downloadPath: null,
        /**
         * URL tried when downloadPath fails; null: the addon's fallbackPath
         * @member {String|null} fallbackPath=null
         */
        fallbackPath: null,
        /**
         * Locale of the named formatters; null: the browser's
         * @member {String|null} locale=null
         */
        locale: null,
        style: {
            height: '100%'
        },
        /**
         * Maps the Neo theme onto the CanvasJS theme a chart is created in; a theme not listed keeps CanvasJS' default
         * @member {Object} themeMap
         */
        themeMap: {
            'neo-theme-cyberpunk': 'dark2',
            'neo-theme-dark'     : 'dark2',
            'neo-theme-light'    : 'light2',
            'neo-theme-neo-dark' : 'dark2',
            'neo-theme-neo-light': 'light2'
        },
        /**
         * Time zone of the date formatters; null: the browser's
         * @member {String|null} timeZone=null
         */
        timeZone: null,
        /**
         * The addon draws into the child; it has no vdom children, so an update leaves the chart alone
         * @member {Object} _vdom
         */
        _vdom:
        {style: {position: 'relative'}, cn: [
            {style: {position: 'absolute', inset: 0}}
        ]}
    }

    /**
     * Counts the creates and removals; an older create that is still waiting for its addon gives up
     * @member {Number} #request=0
     * @private
     */
    #request = 0

    /**
     * Window of the chart the addon holds, null when it holds none
     * @member {String|null} #chartWindowId=null
     * @private
     */
    #chartWindowId = null

    /**
     * @summary The addon's remote methods, once imported.
     * @returns {Object|null}
     */
    get addon() {
        return Neo.ns('Neo.main.addon.CanvasJS')
    }

    /**
     * @summary Id of the element the addon draws into.
     * @returns {String}
     */
    get chartId() {
        return this.id + '__chart'
    }

    /**
     * @summary Gives the chart element its id and listens for the addon's events.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.vdom.cn[0].id = me.chartId;
        me.addDomListeners([{canvasJsEvent: me.onCanvasJsEvent, scope: me}])
    }

    /**
     * @summary Creates the chart again with the new options.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetChartConfig(value, oldValue) {
        oldValue !== undefined && this.mounted && this.createChart()
    }

    /**
     * @summary Hands new data series to a created chart (a create still on its way reads them itself).
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @protected
     */
    afterSetChartData(value, oldValue) {
        let me = this;

        if (oldValue !== undefined && me.#chartWindowId) {
            me.addon?.updateData({id: me.chartId, data: me.getOptions().data, windowId: me.#chartWindowId}).catch(() => {})
        }
    }

    /**
     * @summary Creates the chart on mount, removes it on unmount.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (value) {
            this.createChart()
        } else if (oldValue !== undefined) {
            this.removeChart()
        }
    }

    /**
     * @summary Creates the chart again when its CanvasJS theme changes.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTheme(value, oldValue) {
        super.afterSetTheme(value, oldValue);
        oldValue !== undefined && this.mounted && this.createChart()
    }

    /**
     * @summary Imports the addon of this window and creates the chart there. Only the latest create goes out.
     * @returns {Promise<void>}
     * @protected
     */
    async createChart() {
        let me        = this,
            request   = ++me.#request,
            {windowId} = me,
            created;

        try {
            await Neo.Main.importAddon({name: me.addonName, windowId});
            // the chart element may still be on its way to the DOM
            await me.promiseUpdate();

            if (request !== me.#request || !me.mounted || me.isDestroyed || me.windowId !== windowId) {
                return
            }

            me.#chartWindowId = windowId;

            created = await me.addon.create({
                id          : me.chartId,
                culture     : me.culture,
                downloadPath: me.downloadPath,
                fallbackPath: me.fallbackPath,
                locale      : me.locale,
                options     : me.getOptions(),
                theme       : me.resolveTheme(),
                timeZone    : me.timeZone,
                windowId
            })
        } catch (e) {
            request === me.#request && !me.isDestroyed && me.handleLoadError(String(e?.message || e));
            return
        }

        created && request === me.#request && !me.isDestroyed && me.onChartMounted()
    }

    /**
     * @summary Removes the chart from the addon.
     * @param {...*} args
     */
    destroy(...args) {
        this.removeChart();
        super.destroy(...args)
    }

    /**
     * @summary The CanvasJS options sent to the addon: chartConfig with the data series.
     * @returns {Object}
     */
    getOptions() {
        const config = this.chartConfig || {};
        return {...config, data: this.chartData ?? config.data ?? []}
    }

    /**
     * @summary Fires `chartEvent` for a CanvasJS event of an option set to `'event'`.
     * @param {Object} data {name, dataPoint, dataPointIndex, dataSeriesIndex, seriesName, trigger, axisX, axisY}
     * @protected
     */
    onCanvasJsEvent(data) {
        const {name, dataPoint, dataPointIndex, dataSeriesIndex, seriesName, trigger, axisX, axisY} = data;
        this.fire('chartEvent', {name, dataPoint, dataPointIndex, dataSeriesIndex, seriesName, trigger, axisX, axisY})
    }

    /**
     * @summary Hook: the chart is created in the main thread.
     */
    onChartMounted() {
    }

    /**
     * @summary Fires `loadError` {error} when the library or the chart could not be created.
     * @param {String} error
     */
    handleLoadError(error) {
        console.warn(error);
        this.fire('loadError', {error})
    }

    /**
     * @summary Removes the chart the addon holds; a create still waiting gives up.
     * @protected
     */
    removeChart() {
        let me = this;

        me.#request++;

        if (me.#chartWindowId) {
            me.addon?.destroy({id: me.chartId, windowId: me.#chartWindowId}).catch(() => {});
            me.#chartWindowId = null
        }
    }

    /**
     * @summary The CanvasJS theme of the Neo theme ({@link #themeMap}).
     * @returns {String|Object|null} a theme name, or {light, dark, darkClass} for the addon to follow
     * @protected
     */
    resolveTheme() {
        return this.themeMap[this.getTheme()] ?? null
    }

    /**
     * @summary Sets an option of the created chart and draws it again, e.g. setProperty('axisY.maximum', 100).
     * Not kept in chartConfig: a new chartConfig starts over from it.
     * @param {String} path dot path below the options
     * @param {*} value formatters by name
     * @returns {Promise<Boolean>} false without a chart
     */
    async setProperty(path, value) {
        let me = this;
        return me.#chartWindowId ? me.addon.setProperty({id: me.chartId, path, value, windowId: me.#chartWindowId}) : false
    }
}

export default Neo.setupClass(CanvasJS);
