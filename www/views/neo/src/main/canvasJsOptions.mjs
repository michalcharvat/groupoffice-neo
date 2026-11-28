/**
 * CanvasJS options as JSON: functions cannot cross from the App worker to the main thread, so an option that
 * CanvasJS expects as a function (FUNCTION_KEYS) is given as the name of a formatter instead and
 * resolveOptions() puts the function in on the main thread (Neo.main.addon.CanvasJS).
 *
 *     axisX  : {labelFormatter: 'date'}                                // or {formatter: 'date', dateStyle: 'long'}
 *     axisY  : {labelFormatter: {formatter: 'number', maximumFractionDigits: 1}}
 *     toolTip: {contentFormatter: {formatter: 'template', template: '{name}: {y:number} °C, {x:dateTime}'}}
 *     legend : {itemclick: 'toggleSeries'}
 *     data   : [{type: 'line', click: 'event', dataPoints: […]}]        // 'event': a chartEvent in the worker
 *
 * DOM-free, so the App worker tests can import it.
 */

/** Options CanvasJS calls as functions */
export const FUNCTION_KEYS = ['click', 'contentFormatter', 'indexLabelFormatter', 'itemclick', 'labelFormatter',
    'mousemove', 'mouseout', 'mouseover', 'rangeChanged', 'rangeChanging'];

/**
 * @summary The value a formatter shows: an axis label's value, else the (first) data point's y.
 * @param {Object} e CanvasJS event
 * @returns {*}
 */
function valueOf(e) {
    return e.value ?? e.dataPoint?.y ?? e.entries?.[0]?.dataPoint?.y
}

/**
 * @summary Escapes text for the innerHTML CanvasJS makes of a tool tip.
 * @param {*} value
 * @returns {String}
 */
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c])
}

/**
 * @summary Intl date formatter of a timestamp or Date.
 * @param {Object} defaults Intl.DateTimeFormat options of the formatter
 * @returns {Function} (opts, ctx) → (e → String)
 */
const dateFormatter = defaults => (opts, ctx) => {
    const format = new Intl.DateTimeFormat(ctx.locale || undefined, {...defaults, timeZone: ctx.timeZone || undefined, ...opts});

    return e => {
        const value = valueOf(e);
        return value === undefined || value === null || value === '' ? '' : format.format(new Date(value))
    }
};

/**
 * Named formatters: name → (options of the spec, ctx {locale, timeZone, emit}) → the function CanvasJS calls.
 * A main thread addon or module may add its own.
 * @type {Object<String, Function>}
 */
export const formatters = {
    date    : dateFormatter({dateStyle: 'medium'}),
    dateTime: dateFormatter({dateStyle: 'medium', timeStyle: 'short'}),
    time    : dateFormatter({timeStyle: 'short'}),

    number(opts, ctx) {
        const format = new Intl.NumberFormat(ctx.locale || undefined, opts);

        return e => {
            const value = valueOf(e);
            return value === undefined || value === null || value === '' ? '' : format.format(value)
        }
    },

    /**
     * "{name}: {y:number}": data point fields (dot paths), `name` of the series, `value` and `label` of an axis
     * label; ":formatter" formats a field with another formatter. One line per tool tip entry, values escaped;
     * the template itself is HTML written by the developer, never user input.
     */
    template({template = ''}, ctx) {
        const cache = {},
              field = (vars, path, name) => {
                  let value = path.split('.').reduce((o, k) => o?.[k], vars);

                  if (name && formatters[name]) {
                      value = (cache[name] ??= formatters[name]({}, ctx))({value})
                  }

                  return escapeHtml(value)
              };

        return e => (e.entries || [e]).map(entry => {
            const vars = {name: entry.dataSeries?.name, value: entry.value, label: entry.label, ...entry.dataPoint};
            return template.replace(/\{([\w.]+)(?::(\w+))?}/g, (m, path, name) => field(vars, path, name))
        }).join('<br>')
    },

    /** Legend item click: hides or shows its series */
    toggleSeries() {
        return e => {
            e.dataSeries.visible = e.dataSeries.visible === false;
            e.chart.render()
        }
    },

    /** Sends the event to the App worker (ctx.emit) */
    event(opts, ctx, key) {
        return e => ctx.emit?.(key, eventData(e))
    }
};

/**
 * @summary Copy of a value that can be posted to a worker, or null.
 * @param {*} value
 * @returns {*}
 */
function cloneable(value) {
    try {
        return structuredClone(value)
    } catch (e) {
        return null
    }
}

/**
 * @summary The plain, postable part of a CanvasJS event (no chart or series objects).
 * @param {Object} e
 * @returns {Object} {dataPoint, dataPointIndex, dataSeriesIndex, seriesName, trigger, axisX, axisY}
 */
export function eventData(e) {
    const axes = list => list?.map(a => ({viewportMinimum: a.viewportMinimum ?? null, viewportMaximum: a.viewportMaximum ?? null}));

    return {
        // a point's own click: 'event' is a function by now
        dataPoint      : e.dataPoint ? cloneable(Object.fromEntries(Object.entries(e.dataPoint).filter(([k, v]) => typeof v !== 'function'))) : null,
        dataPointIndex : e.dataPointIndex ?? null,
        dataSeriesIndex: e.dataSeriesIndex ?? e.dataSeries?.index ?? null,
        seriesName     : e.dataSeries?.name ?? null,
        trigger        : e.trigger ?? null,
        axisX          : axes(e.axisX) ?? null,
        axisY          : axes(e.axisY) ?? null
    }
}

/**
 * @summary The function for a formatter spec.
 * @param {String} key option name
 * @param {String|Object} spec name, or {formatter: name, ...options}
 * @param {Object} ctx {locale, timeZone, emit(name, data)}
 * @returns {Function|undefined} undefined for an unknown formatter (CanvasJS then uses its default)
 */
function createFunction(key, spec, ctx) {
    const {formatter, ...opts} = typeof spec === 'string' ? {formatter: spec} : spec,
          factory = formatters[formatter];

    if (!factory) {
        console.warn('CanvasJS: unknown formatter ' + formatter);
        return undefined
    }

    return factory(opts, ctx, key)
}

/**
 * @summary Copies options and puts the functions in for the formatter specs of FUNCTION_KEYS.
 * @param {*} value options, data series or one option value
 * @param {Object} ctx {locale, timeZone, emit(name, data)}
 * @param {String} [key] option name of value
 * @returns {*}
 */
export function resolveOptions(value, ctx, key) {
    if (key && FUNCTION_KEYS.includes(key) && (typeof value === 'string' || typeof value?.formatter === 'string')) {
        return createFunction(key, value, ctx)
    }

    if (Array.isArray(value)) {
        return value.map(item => resolveOptions(item, ctx))
    }

    if (value && typeof value === 'object' && !(value instanceof Date)) {
        const out = {};

        Object.entries(value).forEach(([k, v]) => {
            out[k] = resolveOptions(v, ctx, k)
        });

        return out
    }

    return value
}
