import Base      from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';
import DomAccess from '../../../node_modules/neo.mjs/src/main/DomAccess.mjs';
import DomEvents from '../../../node_modules/neo.mjs/src/main/DomEvents.mjs';
import {resolveOptions} from '../canvasJsOptions.mjs';

/**
 * @summary Main thread side of Neo.component.wrapper.CanvasJS: CanvasJS draws on canvases in the real DOM.
 *
 * - The library loads on the first create() from the wrapper's `downloadPath` (default: {@link #downloadPath}),
 *   and from `fallbackPath` when that fails.
 * - Options arrive as JSON; formatter names are turned into functions by resolveOptions() (src/main/canvasJsOptions.mjs).
 *   Formatter `event` sends the CanvasJS event to the worker as the DOM event `canvasJsEvent` {name, dataPoint, …}.
 * - A chart draws again when its host changes size (ResizeObserver).
 * - Theme: a CanvasJS theme name, or {light, dark, darkClass}: the dark theme while `<body>` has darkClass, followed live.
 *
 * Loaded per window by the wrapper: `await Neo.Main.importAddon({name: wrapper.addonName, windowId})`.
 * @class Neo.main.addon.CanvasJS
 * @extends Neo.main.addon.Base
 */
class CanvasJS extends Base {
    static config = {
        className: 'Neo.main.addon.CanvasJS',
        /**
         * CanvasJS script used when the wrapper names none
         * @member {String} downloadPath='https://cdn.canvasjs.com/canvasjs.min.js'
         */
        downloadPath: 'https://cdn.canvasjs.com/canvasjs.min.js',
        /**
         * Script tried when the download fails; null: none
         * @member {String|null} fallbackPath=null
         */
        fallbackPath: null,
        // the library loads on the first create(), from the path the wrapper sends
        preloadFilesDelay: false,
        remote: {
            app: [
                'create',
                'destroy',
                'setProperty',
                'updateData'
            ]
        }
    }

    /**
     * host id → {chart, ctx, observer, theme}
     * @member {Object} charts={}
     */
    charts = {}

    /**
     * host id → data series that arrived while its chart was still being created
     * @member {Object} dataMap={}
     */
    dataMap = {}

    /**
     * host id → token of its latest create(); destroy() drops it, so a create that was waiting for the library gives up
     * @member {Object} tokens={}
     */
    tokens = {}

    /**
     * JSON of a culture → name it was registered under
     * @member {Object} cultures={}
     */
    cultures = {}

    /**
     * The library load while or after it runs; a failed load is forgotten so the next create tries again
     * @member {Promise<void>|null} loading=null
     */
    loading = null

    /**
     * Watches the body's class for the charts with a {light, dark, darkClass} theme
     * @member {MutationObserver|null} themeObserver=null
     */
    themeObserver = null

    /**
     * @summary Loads CanvasJS once per window, from the fallback path when the download fails.
     * @param {String} [downloadPath=this.downloadPath]
     * @param {String|null} [fallbackPath=this.fallbackPath]
     * @returns {Promise<void>}
     */
    loadFiles(downloadPath = this.downloadPath, fallbackPath = this.fallbackPath) {
        let me = this;

        me.loading ??= DomAccess.loadScript(downloadPath).catch(e => {
            if (!fallbackPath || fallbackPath === downloadPath) {
                throw e
            }

            console.warn('CanvasJS: download failed, using the fallback path', downloadPath);
            return DomAccess.loadScript(fallbackPath)
        }).then(() => {
            if (!globalThis.CanvasJS?.Chart) {
                throw new Error('CanvasJS did not load')
            }
        }).catch(e => {
            me.loading = null;
            throw new Error('CanvasJS: ' + (e?.message || 'the script did not load'))
        });

        return me.loading
    }

    /**
     * @summary Creates (or replaces) the chart in a host element and draws it.
     * @param {Object} data
     * @param {String} data.id                  host element id
     * @param {Object} data.options             CanvasJS options with `data`, formatters by name
     * @param {String|Object|null} [data.theme] CanvasJS theme or {light, dark, darkClass}
     * @param {Object|null} [data.culture]      CanvasJS culture info (texts of the export menu, separators)
     * @param {String|null} [data.locale]       locale of the named formatters
     * @param {String|null} [data.timeZone]     time zone of the date formatters
     * @param {String|null} [data.downloadPath]
     * @param {String|null} [data.fallbackPath]
     * @returns {Promise<Boolean>} false when the host is gone or a newer create or a destroy came first
     */
    async create({id, options, theme = null, culture = null, locale = null, timeZone = null, downloadPath, fallbackPath}) {
        let me    = this,
            token = me.tokens[id] = {},
            ctx   = {locale, timeZone, emit: (name, eventData) => me.emit(id, name, eventData)},
            host, opts, chart, entry;

        // data buffered for an earlier create is older than these options
        delete me.dataMap[id];

        await me.loadFiles(downloadPath ?? me.downloadPath, fallbackPath ?? me.fallbackPath);

        host = DomAccess.getElement(id);

        if (me.tokens[id] !== token || !host) {
            return false
        }

        me.removeChart(id);

        opts = resolveOptions(options || {}, ctx);

        if (me.dataMap[id]) {
            opts.data = resolveOptions(me.dataMap[id], ctx);
            delete me.dataMap[id]
        }

        if (culture) {
            opts.culture = me.registerCulture(culture)
        }

        if (theme) {
            opts.theme = me.resolveTheme(theme)
        }

        chart = new globalThis.CanvasJS.Chart(host, opts);
        entry = me.charts[id] = {chart, ctx, theme, observer: null, frame: 0};

        // the first callback also draws the chart, once the host has a size
        entry.observer = new ResizeObserver(() => {
            cancelAnimationFrame(entry.frame);
            entry.frame = requestAnimationFrame(() => host.clientWidth && host.clientHeight && chart.render())
        });
        entry.observer.observe(host);

        theme && typeof theme === 'object' && me.watchTheme();

        return true
    }

    /**
     * @summary Removes the chart of a host and anything still waiting for it.
     * @param {Object} data
     * @param {String} data.id
     */
    destroy({id}) {
        let me = this;

        delete me.tokens[id];
        delete me.dataMap[id];
        me.removeChart(id)
    }

    /**
     * @summary Destroys a drawn chart and stops watching its host.
     * @param {String} id
     */
    removeChart(id) {
        const entry = this.charts[id];

        if (entry) {
            cancelAnimationFrame(entry.frame);
            entry.observer?.disconnect();
            entry.chart.destroy?.();
            delete this.charts[id]
        }
    }

    /**
     * @summary Sends a CanvasJS event to the App worker as the DOM event `canvasJsEvent`.
     * @param {String} id host id
     * @param {String} name option that fired, e.g. 'click'
     * @param {Object} eventData see eventData() in canvasJsOptions.mjs
     */
    emit(id, name, eventData) {
        const host = DomAccess.getElement(id);

        host && DomEvents.sendMessageToApp({
            ...eventData,
            id,
            name,
            path: DomEvents.getPathFromElement(host).map(el => DomEvents.getTargetData(el)),
            type: 'canvasJsEvent'
        })
    }

    /**
     * @summary Registers a culture once and answers its name.
     * @param {Object} culture CanvasJS culture info
     * @returns {String}
     */
    registerCulture(culture) {
        let me  = this,
            key = JSON.stringify(culture);

        if (!me.cultures[key]) {
            me.cultures[key] = 'neo' + Object.keys(me.cultures).length;
            globalThis.CanvasJS.addCultureInfo(me.cultures[key], culture)
        }

        return me.cultures[key]
    }

    /**
     * @summary The CanvasJS theme name for a theme config.
     * @param {String|Object} theme name or {light, dark, darkClass}
     * @returns {String}
     */
    resolveTheme(theme) {
        return typeof theme === 'string' ? theme : document.body.classList.contains(theme.darkClass) ? theme.dark : theme.light
    }

    /**
     * @summary Sets an option (dot path below the options, e.g. 'axisY.maximum') and draws the chart again.
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.path
     * @param {*} data.value formatters by name, like in create()
     * @returns {Boolean} false without a chart
     */
    setProperty({id, path, value}) {
        const entry = this.charts[id];

        if (!entry || /(^|\.)(__proto__|constructor|prototype)(\.|$)/.test(path)) {
            return false
        }

        const keys = path.split('.'),
              last = keys.pop(),
              scope = keys.reduce((o, k) => o[k] ??= {}, entry.chart.options);

        scope[last] = resolveOptions(value, entry.ctx, last);
        entry.chart.render();
        return true
    }

    /**
     * @summary Replaces the data series and draws the chart again; kept for create() while the chart is not there yet.
     * @param {Object} data
     * @param {String} data.id
     * @param {Object[]} data.data CanvasJS data series
     */
    updateData({id, data}) {
        let me    = this,
            entry = me.charts[id];

        if (entry) {
            entry.chart.options.data = resolveOptions(data || [], entry.ctx);
            entry.chart.render()
        } else if (me.tokens[id]) {
            me.dataMap[id] = data
        }
    }

    /**
     * @summary Follows the body's dark class for the charts with a {light, dark, darkClass} theme.
     */
    watchTheme() {
        let me = this;

        me.themeObserver ??= new MutationObserver(() => {
            Object.values(me.charts).forEach(({chart, theme}) => {
                if (theme && typeof theme === 'object') {
                    const name = me.resolveTheme(theme);

                    if (chart.options.theme !== name) {
                        chart.options.theme = name;
                        chart.render()
                    }
                }
            })
        });

        me.themeObserver.observe(document.body, {attributes: true, attributeFilter: ['class']})
    }
}

export default Neo.setupClass(CanvasJS);
