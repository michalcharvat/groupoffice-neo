import NeoScheduler  from '../../node_modules/neo.mjs/src/scheduler/Container.mjs';
import TreeStore     from '../../node_modules/neo.mjs/src/data/TreeStore.mjs';
import {toUserTime}  from '../DateUtil.mjs';
import {setDataAndFireLoad} from '../data/setData.mjs';
import {t}           from '../Translate.mjs';
import {isDescriptor} from '../../node_modules/neo.mjs/src/core/ConfigSymbols.mjs';
import ResourceModel from './ResourceModel.mjs';

/**
 * @summary Reads one mapped value of a source record: a field name or a function of the record.
 * @param {Object} record
 * @param {String|Function} field
 * @returns {*}
 */
const read = (record, field) => typeof field === 'function' ? field(record) : record[field];

/**
 * @summary Resource-by-time scheduler over GO data: tree resources, events from a JMAP store or an array, a
 * read-only mode that also stops keyboard moves.
 * @description Generic: the caller passes the resources and how its records map to events
 * (docs/neo-core-components.md, "GO.scheduler.Scheduler"). The resources are projected into a neo TreeStore, the
 * events into a `Neo.timeline.store.Events`, because neo's lookup reads the literal fields `resourceId`, `startDate`
 * and `endDate`. Dates show in the user's time zone.
 * @class GO.scheduler.Scheduler
 * @extends Neo.scheduler.Container
 */
class Scheduler extends NeoScheduler {
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
        eventRenderer: null
    }

    /**
     * Source record per event id
     * @member {Map} sourceRecords
     */
    sourceRecords = new Map()

    /** True from onConstructed(): a store load before the grid is built fails */
    #built = false

    /**
     * @summary Normalises source records into neo event data: {id, resourceId, startDate, endDate, title, cls}.
     * @param {Object[]} records source records (neo records or plain objects)
     * @param {Object} fields mapping, see eventFields
     * @returns {Object[]} events with an id, a resource and a valid range; dates as the user's wall time
     */
    static normalizeEvents(records, fields={}) {
        const map = {startDate: 'startDate', endDate: 'endDate', resourceId: 'resourceId', title: 'title', cls: 'cls', ...fields},
              events = [];

        records.forEach(record => {
            const resourceId = read(record, map.resourceId),
                  start      = read(record, map.startDate),
                  end        = read(record, map.endDate),
                  startDate  = toUserTime(start),
                  endDate    = toUserTime(end);

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

        me.addDomListeners({click: me.onBarClick, delegate: '.neo-timeline-bar', scope: me})
    }

    /**
     * @summary Projects the resource list into the TreeStore of the rows.
     * @param {Object[]} value
     * @param {Object[]} oldValue
     */
    afterSetResources(value, oldValue) {
        this.#built && setDataAndFireLoad(this.store, Scheduler.toTreeData(value || []))
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
        me.afterSetResources(me.resources);
        me.rebuildEvents()
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
        setDataAndFireLoad(me.eventStore, Scheduler.normalizeEvents(records, me.eventFields))
    }
}

export default Neo.setupClass(Scheduler);
