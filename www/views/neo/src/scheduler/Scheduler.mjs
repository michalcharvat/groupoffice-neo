import NeoScheduler  from '../../node_modules/neo.mjs/src/scheduler/Container.mjs';
import TreeStore     from '../../node_modules/neo.mjs/src/data/TreeStore.mjs';
import {resolveTimeZone, toUserTime} from '../DateUtil.mjs';
import {setDataAndFireLoad} from '../data/setData.mjs';
import {language, t} from '../Translate.mjs';
import {isDescriptor} from '../../node_modules/neo.mjs/src/core/ConfigSymbols.mjs';
import ResourceModel from './ResourceModel.mjs';
import TimelineColumn from './TimelineColumn.mjs';
import Column from '../grid/Column.mjs';
import TreeColumn from '../grid/TreeColumn.mjs';

/**
 * @summary Reads one mapped value of a source record: a field name or a function of the record.
 * @param {Object} record
 * @param {String|Function} field
 * @returns {*}
 */
const read = (record, field) => typeof field === 'function' ? field(record) : record[field];

/**
 * @summary The user's GO language as a BCP 47 locale for the header labels ("en_uk" => "en-UK").
 * @returns {String|undefined} undefined: the browser's
 */
const userLocale = () => {
    try {
        return Intl.getCanonicalLocales(language().replace('_', '-'))[0]
    } catch (e) {
        return undefined
    }
};

const dayMinutes = 1440;

/**
 * @summary Resource-by-time scheduler over GO data: tree resources, events from a JMAP store or an array, a
 * read-only mode that also stops keyboard moves.
 * @description Generic: the caller passes the resources and how its records map to events
 * (docs/neo-core-components.md, "GO.scheduler.Scheduler"). The resources are projected into a neo TreeStore, the
 * events into a `Neo.timeline.store.Events`, because neo's lookup reads the literal fields `resourceId`, `startDate`
 * and `endDate`. Dates show in the user's time zone, or in `timeZone` when set.
 * @class GO.scheduler.Scheduler
 * @extends Neo.scheduler.Container
 */
class Scheduler extends NeoScheduler {
    /**
     * neo's column types; the plain `column` and `tree` escape the value (GO.grid.Column, GO.grid.TreeColumn,
     * htmlValue for trusted HTML)
     * @member {Object} columnTypes
     * @static
     */
    static columnTypes = {...NeoScheduler.columnTypes, column: Column, tree: TreeColumn}

    /**
     * neo's hour, day and week plus month, quarter and year; day ticks are one day wide (snapMinutes)
     * @member {Object} zoomPresets
     * @static
     */
    static zoomPresets = {
        ...NeoScheduler.zoomPresets,
        month  : {majorTickStep: 1, majorTickUnit: 'month', pxPerMinute: 0.03,   snapMinutes: dayMinutes, tickStep: 1, tickUnit: 'day'},
        quarter: {majorTickStep: 1, majorTickUnit: 'month', pxPerMinute: 0.01,   snapMinutes: dayMinutes, tickStep: 1, tickUnit: 'week'},
        year   : {majorTickStep: 3, majorTickUnit: 'month', pxPerMinute: 0.0025, snapMinutes: dayMinutes, tickStep: 1, tickUnit: 'month'}
    }

    static config = {
        className: 'GO.scheduler.Scheduler',
        baseCls  : ['neo-scheduler', 'neo-grid-container', 'go-scheduler'],
        eventStore: {},
        timelineText: t('Timeline'),
        resourceColumns: [{dataField: 'name', text: t('Name'), type: 'tree', width: 200, locked: 'start'}],
        /**
         * Resource tree: [{id, parentId, name, bookable, cls, collapsed}] in display order
         * @member {Object[]} resources_=[]
         * @reactive
         */
        resources_: [],
        // a resourceModel with more fields: store: {module: TreeStore, model: MyModel}
        store: {module: TreeStore, model: ResourceModel},
        /**
         * Source of the events: a GO.data.JmapStore (not loaded by the scheduler) or an array of objects
         * @member {Neo.data.Store|Object[]|null} events_=null
         * @reactive
         */
        // not cloned: getSourceRecord() returns the caller's own records
        events_: {[isDescriptor]: true, clone: 'none', cloneOnGet: 'none', isEqual: (a, b) => a === b, value: null},
        /**
         * Event field => source field name or function(record): startDate, endDate, resourceId, title, cls
         * @member {Object} eventFields={}
         */
        eventFields: {},
        /**
         * True: no drag, resize, event editor or keyboard moves
         * @member {Boolean} readOnly_=false
         * @reactive
         */
        readOnly_: false,
        /**
         * (record, descriptor) => {html, cls} or a label string, merged into neo's bar node
         * @member {Function|null} eventRenderer=null
         */
        eventRenderer: null,
        /**
         * Bands behind the bars: [{resourceId, startDate, endDate, cls, inherit}]; inherit paints the descendants too
         * @member {Object[]} backgrounds_=[]
         * @reactive
         */
        backgrounds_: [],
        /**
         * True: the time axis grows by whole months when the view comes near its start or end (rangeChange)
         * @member {Boolean} growRange=false
         */
        growRange: false,
        /**
         * Zoom preset applied at construction and on change: hour, day, week, month, quarter, year
         * @member {String|null} zoom_=null
         * @reactive
         */
        zoom_: null,
        /**
         * IANA zone of the bars, bands, axis and slotClick dates, e.g. one vessel's day in its own zone; null: the
         * user's. The axis range is a wall time in this zone; convert a date back with fromUserTime(date, timeZone).
         * @member {String|null} timeZone_=null
         * @reactive
         */
        timeZone_: null
    }

    /**
     * Source record per event id
     * @member {Map} sourceRecords
     */
    sourceRecords = new Map()

    /** True from onConstructed(): a store load before the grid is built fails */
    #built = false

    /** Background bands per resource id, inherited ones included */
    #rowBackgrounds = new Map()

    /** True while a grown range scrolls back to its date */
    #growing = false

    /**
     * @summary Normalises source records into neo event data: {id, resourceId, startDate, endDate, title, cls}.
     * @param {Object[]} records source records (neo records or plain objects)
     * @param {Object} fields mapping, see eventFields
     * @param {String|null} [timeZone] IANA name; null: the user's
     * @returns {Object[]} events with an id, a resource and a valid range; dates as the wall time in timeZone
     */
    static normalizeEvents(records, fields={}, timeZone=null) {
        const map = {startDate: 'startDate', endDate: 'endDate', resourceId: 'resourceId', title: 'title', cls: 'cls', ...fields},
              events = [];

        records.forEach(record => {
            const resourceId = read(record, map.resourceId),
                  start      = read(record, map.startDate),
                  end        = read(record, map.endDate),
                  startDate  = toUserTime(start, timeZone),
                  endDate    = toUserTime(end, timeZone);

            // the range is checked on the instants: wall times go backwards when the clock is turned back
            if (record.id == null || resourceId == null || !startDate || !endDate || +new Date(end) < +new Date(start)) {
                return
            }

            events.push({
                id        : String(record.id),
                resourceId: String(resourceId),
                startDate,
                endDate,
                title     : String(read(record, map.title) ?? ''),
                cls       : read(record, map.cls) || null
            })
        });

        return events
    }

    /**
     * @summary Turns the flat resource list into TreeStore data: string ids, isLeaf from the children.
     * @param {Object[]} resources [{id, parentId, ...}]
     * @returns {Object[]}
     */
    static toTreeData(resources) {
        const parents = new Set(resources.filter(r => r.parentId != null).map(r => String(r.parentId)));

        return resources.map(resource => ({
            collapsed: false,
            ...resource,
            id      : String(resource.id),
            parentId: resource.parentId == null ? null : String(resource.parentId),
            isLeaf  : !parents.has(String(resource.id))
        }))
    }

    /**
     * @summary Merges an eventRenderer result into neo's bar node: html replaces the label, cls is added.
     * @param {Object} node neo's bar vdom
     * @param {Object|String|null} result {html, cls} or a label text
     * @returns {Object} the node
     */
    static mergeBar(node, result) {
        if (result == null || result === false) {
            return node
        }

        const label = node.cn.find(child => child.id === `${node.id}__label`);

        if (typeof result === 'string') {
            label && (label.text = result);
            return node
        }

        if (label && result.html != null) {
            delete label.text;
            label.html = result.html
        }

        result.cls && node.cls.push(...[].concat(result.cls));

        return node
    }

    /**
     * @summary Groups the background bands by the row they paint: inherit adds each descendant of the resource.
     * @param {Object[]} backgrounds [{resourceId, startDate, endDate, cls, inherit}], dates as instants
     * @param {Object[]} resources [{id, parentId}]
     * @param {String|null} [timeZone] IANA name; null: the user's
     * @returns {Map<String, Object[]>} resource id => [{startDate, endDate, cls: String[]}] in the wall time of timeZone
     */
    static mapBackgrounds(backgrounds, resources, timeZone=null) {
        const children = new Map(),
              rows     = new Map(),
              add      = (id, band) => rows.has(id) ? rows.get(id).push(band) : rows.set(id, [band]);

        resources.forEach(r => {
            const parent = r.parentId == null ? null : String(r.parentId);
            children.has(parent) ? children.get(parent).push(String(r.id)) : children.set(parent, [String(r.id)])
        });

        backgrounds.forEach(bg => {
            const startDate = toUserTime(bg.startDate, timeZone),
                  endDate   = toUserTime(bg.endDate, timeZone);

            // the range is checked on the instants: wall times go backwards when the clock is turned back
            if (bg.resourceId == null || !startDate || !endDate || +new Date(bg.endDate) < +new Date(bg.startDate)) {
                return
            }

            const band = {startDate, endDate, cls: [].concat(bg.cls || [])},
                  ids  = new Set([String(bg.resourceId)]);

            // breadth first over the descendants; a Set iterates what is added meanwhile and stops a parent cycle
            ids.forEach(id => {
                add(id, band);
                bg.inherit && (children.get(id) || []).forEach(child => ids.add(child))
            })
        });

        return rows
    }

    /**
     * @summary The range the axis grows to when the visible window is less than a window away from an edge.
     * @param {Neo.timeline.TimeAxis} axis
     * @param {Number} left axis offset of the visible window's left edge
     * @param {Number} width visible width in px
     * @returns {{start: Date, end: Date}|null} null: far enough from both edges
     */
    static grownRange(axis, left, width) {
        // whole months keep the axis start's day of the month: month ticks are anchored to it
        const months = Math.max(1, Math.ceil(2 * width / (30 * dayMinutes * axis.pxPerMinute))),
              start  = left < width ? axis.addTick(axis.start, 'month', -months) : null,
              end    = axis.totalSize - left - width < width ? axis.addTick(axis.end, 'month', months) : null;

        return start || end ? {start: start || axis.start, end: end || axis.end} : null
    }

    /**
     * @summary The range the axis grows to so that it contains date, in whole months plus one to scroll in.
     * @param {Neo.timeline.TimeAxis} axis
     * @param {Date} date wall time
     * @returns {{start: Date, end: Date}|null} null: date is already inside
     */
    static rangeIncluding(axis, date) {
        // the axis returns a new Date on every read
        const axisStart = axis.start,
              axisEnd   = axis.end;

        let start = axisStart,
            end   = axisEnd,
            n     = 0;

        while (+start > +date) {
            start = axis.addTick(axisStart, 'month', -(++n))
        }

        n = 0;

        while (+end <= +date) {
            end = axis.addTick(axisEnd, 'month', ++n)
        }

        return start === axisStart && end === axisEnd ? null : {
            start: start === axisStart ? start : axis.addTick(start, 'month', -1),
            end  : end === axisEnd ? end : axis.addTick(end, 'month', 1)
        }
    }

    /**
     * @summary Hands neo a barRenderer that merges eventRenderer() into the default bar.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.barRenderer = (descriptor, {vdom}) => {
            const record = me.getSourceRecord(descriptor.bar?.id);

            // neo marks every bar draggable (move cursor)
            me.readOnly && (vdom.cls = vdom.cls.filter(cls => cls !== 'neo-draggable'));

            return record && me.eventRenderer ? Scheduler.mergeBar(vdom, me.eventRenderer(record, descriptor)) : vdom
        };

        // bars sit inside the track: one listener tells a bar from the empty track
        me.addDomListeners({click: me.onTrackClick, delegate: '.neo-timeline-track', scope: me})
    }

    /**
     * @summary The timeline column of GO: backgrounds, header locale, growing range.
     * @returns {Neo.timeline.Column}
     */
    getTimelineColumnClass() {
        return TimelineColumn
    }

    /**
     * @summary Gives the timeline column the user's locale unless timelineColumnConfig names one.
     * @param {Object[]|null} extraColumns
     * @returns {Object[]}
     */
    buildSchedulerColumns(extraColumns=null) {
        const built = super.buildSchedulerColumns(extraColumns),
              timeline = built[built.length - 1];

        timeline.locale ??= userLocale();

        return built
    }

    /**
     * @summary Regroups the background bands and repaints the rows.
     * @param {Object[]} value
     * @param {Object[]} oldValue
     */
    afterSetBackgrounds(value, oldValue) {
        this.#built && this.updateBackgrounds()
    }

    /**
     * @summary Checks the zone name: an unknown one falls back to the user's (with a console warning).
     * @param {String|null} value
     * @returns {String|null}
     */
    beforeSetTimeZone(value) {
        return resolveTimeZone(value)
    }

    /**
     * @summary Shows the bars and bands in the new zone.
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetTimeZone(value, oldValue) {
        if (this.#built) {
            this.updateBackgrounds();
            this.rebuildEvents()
        }
    }

    /**
     * @summary Applies a zoom preset.
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetZoom(value, oldValue) {
        this.#built && value && this.zoomTo(value)
    }

    /**
     * @summary Projects the resource list into the TreeStore of the rows.
     * @param {Object[]} value
     * @param {Object[]} oldValue
     */
    afterSetResources(value, oldValue) {
        if (this.#built) {
            setDataAndFireLoad(this.store, Scheduler.toTreeData(value || []));
            // inherited bands follow the tree
            this.updateBackgrounds()
        }
    }

    /**
     * @summary Rebuilds the events on every change of a source store.
     * @param {Neo.data.Store|Object[]|null} value
     * @param {Neo.data.Store|Object[]|null} oldValue
     */
    afterSetEvents(value, oldValue) {
        const listeners = {load: this.rebuildEvents, loadMore: this.rebuildEvents, recordChange: this.rebuildEvents, scope: this};

        Array.isArray(oldValue) || oldValue?.un(listeners);
        Array.isArray(value) || value?.on(listeners);
        this.rebuildEvents()
    }

    /**
     * @summary Read-only turns off drag, resize and the event editor; the keyboard is guarded in onBarKeyDown().
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetReadOnly(value, oldValue) {
        let me = this;

        // false at construction keeps the caller's own barDraggable, resizableBars and editable
        if (value || oldValue) {
            me.barDraggable  = !value;
            me.resizableBars = !value;
            me.editable      = !value
        }
    }

    /**
     * @summary Applies the configs whose stores did not exist yet in their hooks.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.#built = true;
        me.readOnly && me.afterSetReadOnly(true);
        me.zoom && me.zoomTo(me.zoom);
        me.afterSetResources(me.resources);
        me.rebuildEvents()
    }

    /**
     * @summary The background bands of one row.
     * @param {String|Number|null} resourceId
     * @returns {Object[]|null} [{startDate, endDate, cls}] in wall time
     */
    getRowBackgrounds(resourceId) {
        return resourceId == null ? null : this.#rowBackgrounds.get(String(resourceId)) || null
    }

    /**
     * @summary Regroups the background bands by row and repaints the mounted rows.
     */
    updateBackgrounds() {
        this.#rowBackgrounds = Scheduler.mapBackgrounds(this.backgrounds || [], this.resources || [], this.timeZone);
        this.timelineColumn?.refreshMountedRows()
    }

    /**
     * @summary The bookable resource and the date under a click on the empty track (not a bar).
     * @param {Object} data click data: path with the nodes' rects, clientX
     * @returns {{resource: Neo.data.Record, date: Date}|null} date as the wall time in timeZone; null on a bar, a
     * grouping row or without a position
     */
    getSlotTarget(data) {
        let me                  = this,
            path                = data.path || [],
            {barNode, trackNode} = me.extractBarTarget(path),
            rowNode             = path.find(node => [].concat(node?.cls || []).includes('neo-grid-row')),
            resource            = rowNode ? me.body?.getRecord(rowNode.data?.recordId || rowNode.id) : null,
            left                = trackNode?.rect?.left ?? trackNode?.rect?.x;

        if (barNode || !resource || resource.bookable === false || !Number.isFinite(left) || !Number.isFinite(data.clientX)) {
            return null
        }

        return {resource, date: me.timeAxis.xToDate(data.clientX - left)}
    }

    /**
     * @summary A click on the timeline: eventClick on a bar, slotClick on the empty track of a bookable row.
     * @param {Object} data
     */
    onTrackClick(data) {
        const target = this.getSlotTarget(data);

        target ? this.fire('slotClick', target) : this.onBarClick(data)
    }

    /**
     * @summary Grows the axis when the view comes near its start or end and keeps the visible date in place.
     * @param {Neo.timeline.Column} column
     * @param {Date|null} edgeDate the date at the visible left edge when the scroll position is stale (zoom)
     */
    async onTimelineScroll(column, edgeDate=null) {
        let me    = this,
            axis  = me.timeAxis,
            left  = edgeDate ? Math.max(0, axis.dateToOffset(edgeDate)) : column.scrollLeft - column.axisLeft,
            width = column.effectiveViewportWidth,
            range = me.growRange && !me.#growing && axis && width > 0 ? Scheduler.grownRange(axis, left, width) : null;

        if (range) {
            await me.applyRange(range, axis.offsetToDate(Math.max(0, left)))
        }
    }

    /**
     * @summary Sets a new axis range, fires rangeChange and scrolls date back to the left edge.
     * @param {{start: Date, end: Date}} range
     * @param {Date|null} date
     */
    async applyRange(range, date) {
        let me = this;

        me.#growing = true;

        try {
            me.timeAxis.set(range);
            date && await super.scrollToDate(date)
        } finally {
            me.#growing = false
        }

        // after the scroll back: a listener's own scrollToDate() is not undone
        me.fire('rangeChange', {start: me.timeAxis.start, end: me.timeAxis.end})
    }

    /**
     * @summary Applies a zoom preset or axis config; with growRange a range that got short for the new scale grows.
     * @param {String|Object} presetOrConfig
     * @returns {Neo.timeline.TimeAxis|null}
     */
    zoomTo(presetOrConfig) {
        const column = this.mounted && this.timelineColumn,
              before = this.timeAxis,
              // read before the scale changes, as neo's zoomTo() does
              edge   = column && before ? before.offsetToDate(Math.max(0, column.scrollLeft - column.axisLeft)) : null,
              axis   = super.zoomTo(presetOrConfig);

        // zooming out can leave the whole range in view, without a scrollbar that would grow it
        edge && this.onTimelineScroll(column, edge);

        return axis
    }

    /**
     * @summary Scrolls date to the visible left edge; with growRange the axis first grows to contain it.
     * @param {Date} date wall time
     * @returns {Promise<void>}
     */
    async scrollToDate(date) {
        const me    = this,
              range = me.growRange && me.timeAxis ? Scheduler.rangeIncluding(me.timeAxis, date) : null;

        return range ? me.applyRange(range, date) : super.scrollToDate(date)
    }

    /**
     * @summary The source record an event came from.
     * @param {String|Number|null} eventId
     * @returns {Object|null}
     */
    getSourceRecord(eventId) {
        return eventId == null ? null : this.sourceRecords.get(String(eventId)) || null
    }

    /**
     * @summary Fires eventClick with the source record of the clicked bar.
     * @param {Object} data
     */
    onBarClick(data) {
        let me        = this,
            {barNode} = me.extractBarTarget(data.path || []),
            eventId   = barNode?.data?.eventId,
            record    = me.getSourceRecord(eventId);

        record && me.fire('eventClick', {record, eventRecord: me.eventStore?.get(eventId) || null})
    }

    /**
     * @summary Read-only: arrow keys on a bar don't move or resize it (neo checks neither editable nor barDraggable).
     * @param {Object} data
     * @returns {*}
     */
    onBarKeyDown(data={}) {
        if (this.readOnly && (data.key === 'ArrowLeft' || data.key === 'ArrowRight')) {
            return
        }

        return super.onBarKeyDown(data)
    }

    /**
     * @summary Read-only: refuses every move, also from code and the editor (neo's single writer of event dates).
     * @param {...*} args see Neo.scheduler.Container.moveEvent()
     * @returns {*} null when read-only
     */
    moveEvent(...args) {
        return this.readOnly ? null : super.moveEvent(...args)
    }

    /**
     * @summary Stops listening to the events source store.
     * @param {...*} args
     */
    destroy(...args) {
        // no rebuild while going away
        this.#built = false;
        this.events = null;
        super.destroy(...args)
    }

    /**
     * @summary Normalises the current events source into the event store.
     */
    rebuildEvents() {
        let me      = this,
            source  = me.events,
            records = Array.isArray(source) ? source : [...(source?.items || [])];

        if (me.isDestroyed || !me.#built || !me.eventStore) {
            return
        }

        me.sourceRecords = new Map(records.map(record => [String(record.id), record]));
        setDataAndFireLoad(me.eventStore, Scheduler.normalizeEvents(records, me.eventFields, me.timeZone))
    }
}

export default Neo.setupClass(Scheduler);
