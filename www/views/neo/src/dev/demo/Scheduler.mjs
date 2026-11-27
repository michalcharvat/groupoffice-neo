import Component from '../../../node_modules/neo.mjs/src/component/Base.mjs';
import Container from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Button    from '../../button/Button.mjs';
import {escapeHtml} from '../../Format.mjs';
import Scheduler from '../../scheduler/Scheduler.mjs';

const resources = [
    {id: 'c1', parentId: null, name: 'North Shipping', bookable: false},
    {id: 'v1', parentId: 'c1', name: 'MV Aurora', bookable: false},
    {id: 'v1-1', parentId: 'v1', name: 'Master'},
    {id: 'v1-2', parentId: 'v1', name: 'Chief officer'},
    {id: 'v1-3', parentId: 'v1', name: 'Cook'},
    {id: 'v2', parentId: 'c1', name: 'MV Borealis', bookable: false},
    {id: 'v2-1', parentId: 'v2', name: 'Master'},
    {id: 'v2-2', parentId: 'v2', name: 'Engineer'},
    {id: 'c2', parentId: null, name: 'South Lines', bookable: false},
    {id: 'v3', parentId: 'c2', name: 'MV Cetus', bookable: false},
    {id: 'v3-1', parentId: 'v3', name: 'Master'},
    {id: 'v3-2', parentId: 'v3', name: 'Bosun'}
];

const day = d => `2026-11-${String(d).padStart(2, '0')}T08:00:00Z`;

// shaped like crew voyage records: other field names, the resource computed from two fields
const voyages = [
    [1, 'v1', 1, 'Ann Berg', 2, 20, 'onboard'],
    [2, 'v1', 2, 'Piet de Vries', 5, 26, 'onboard'],
    [3, 'v1', 3, 'Li Wei', 1, 12, 'travel'],
    [4, 'v1', 3, 'Omar <b>Haddad</b>', 14, 30, 'onboard'],
    [5, 'v2', 1, 'Jan Novák', 3, 24, 'onboard'],
    [6, 'v2', 2, 'Eva Lind', 8, 18, 'travel'],
    [7, 'v3', 1, 'Carlos Ruiz', 1, 15, 'onboard'],
    [8, 'v3', 2, 'Mia Svensson', 10, 28, 'onboard']
].map(([id, vesselId, rankId, name, from, to, type]) => ({id, vesselId, rankId, name, startTime: day(from), endTime: day(to), type}));

/**
 * @summary Dev demo of GO.scheduler.Scheduler: three resource levels as a tree, crew-like records mapped by
 * eventFields, read-only toggle, eventRenderer and eventClick.
 * @class GO.dev.demo.Scheduler
 * @extends Neo.container.Base
 */
class SchedulerDemo extends Container {
    static config = {
        className: 'GO.dev.demo.Scheduler',
        layout   : {ntype: 'vbox', align: 'stretch'},
        style    : {padding: '16px', gap: '8px'},
        items    : [{
            ntype : 'container',
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            style : {gap: '8px'},
            items : [{
                module : Button,
                ui     : 'secondary',
                text   : 'Toggle readOnly',
                handler: 'up.onToggleReadOnly'
            }, {
                module : Button,
                ui     : 'secondary',
                text   : 'Collapse / expand MV Aurora',
                handler: 'up.onToggleVessel'
            }, {
                module   : Component,
                reference: 'output',
                tag      : 'pre',
                cls      : ['go-dev-output'],
                style    : {margin: 0},
                text     : 'readOnly: true'
            }]
        }, {
            module         : Scheduler,
            reference      : 'scheduler',
            flex           : 1,
            readOnly       : true,
            resources,
            events         : voyages,
            eventFields    : {startDate: 'startTime', endDate: 'endTime', title: 'name', resourceId: r => `${r.vesselId}-${r.rankId}`},
            eventRenderer  : record => ({html: `<i class="go-icon">person</i> ${escapeHtml(record.name)}`, cls: `go-dev-scheduler-${record.type}`}),
            resourceColumns: [{dataField: 'name', text: 'Vessel', type: 'tree', width: 220, locked: 'start'}],
            timeAxis       : {start: '2026-11-01', end: '2026-12-01', tickUnit: 'day', tickStep: 1, majorTickUnit: 'week', pxPerMinute: 0.04, snapMinutes: 60},
            listeners      : {eventClick: 'up.onEventClick'}
        }]
    }

    /**
     * @summary Shows the clicked source record.
     * @param {Object} data
     */
    onEventClick({record}) {
        this.getReference('output').text = `eventClick: #${record.id} ${record.name}`
    }

    /**
     * @summary Switches read-only on and off.
     */
    onToggleReadOnly() {
        const scheduler = this.getReference('scheduler');

        scheduler.readOnly = !scheduler.readOnly;
        this.getReference('output').text = 'readOnly: ' + scheduler.readOnly
    }

    /**
     * @summary Collapses or expands one vessel through the grid, as its arrow does.
     */
    onToggleVessel() {
        const scheduler = this.getReference('scheduler');

        scheduler.toggleTreeNode(scheduler.store.get('v1'))
    }
}

export default Neo.setupClass(SchedulerDemo);
