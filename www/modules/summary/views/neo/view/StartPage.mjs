import Container      from '../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar        from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button         from '../../../../../views/neo/src/button/Button.mjs';
import client         from '../../../../../views/neo/src/jmap/Client.mjs';
import ModuleRegistry from '../../../../../views/neo/src/ModuleRegistry.mjs';
import {getState, setState} from '../../../../../views/neo/src/State.mjs';
import {t as coreT, translator} from '../../../../../views/neo/src/Translate.mjs';
import Portlet        from './Portlet.mjs';

const t = translator('legacy', 'summary');

/** localStorage key (state-…) of the portlets and their columns, like the ExtJS state */
const STATE_ID = 'summary-active-portlets';

/** MainPanel.js: the portlets of a new user */
const DEFAULT = [
    {id: 'portlet-announcements', col: 0}, {id: 'portlet-tasks', col: 0},
    {id: 'portlet-calendar', col: 1}, {id: 'portlet-note', col: 1}
];

/**
 * The start page (legacy summary module, GO.summary.MainPanel): portlets in two columns
 * (one on small screens). Modules register portlets with `portlets` in their registry
 * entry; "Add" lists the ones not on the page. Every portlet can move up, down or to the
 * other column and be removed; the layout is saved per browser (state-summary-active-portlets).
 */
class StartPage extends Container {
    static config = {
        className: 'GO.summary.StartPage',
        cls      : ['go-start-page'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * Route prefix, set by the shell
         * @member {String|null} moduleName=null
         */
        moduleName: null
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            cls   : ['go-start-page-tbar'],
            flex  : 'none',
            items : [{
                ntype: 'component',
                cls  : ['go-start-page-title'],
                text : t('Start page')
            }, '->', {
                module   : Button,
                reference: 'manageButton',
                icon     : 'campaign',
                text     : t('Manage announcements'),
                // GO.settings.modules.summary.write_permission
                hidden   : !(client.isAdmin || client.session?.capabilities?.['go:legacy:summary']?.mayManage),
                handler  : () => me.manageAnnouncements()
            }, {
                module   : Button,
                reference: 'addButton',
                icon     : 'add',
                text     : coreT('Add'),
                menu     : []
            }]
        }, {
            ntype    : 'container',
            reference: 'columns',
            cls      : ['go-start-columns'],
            flex     : 1,
            layout   : 'base',
            items    : [0, 1].map(col => ({
                ntype : 'container',
                cls   : ['go-start-column'],
                layout: {ntype: 'vbox', align: 'stretch'},
                items : []
            }))
        }]
    }

    onConstructed() {
        super.onConstructed();
        this.load()
    }

    /**
     * Portlets of modules the user has, keyed by id
     * @returns {Map<String, Object>}
     */
    get available() {
        return new Map(ModuleRegistry.getConfigs('portlets').flat()
            .filter(p => !p.available || p.available())
            .map(p => [p.id, p]))
    }

    get columns() {
        return this.getReference('columns').items
    }

    async load() {
        let me = this;

        const state     = await getState(STATE_ID, me.windowId),
              available = me.available,
              portlets  = Array.isArray(state.portlets) ? state.portlets : DEFAULT;

        if (me.isDestroyed) {
            return
        }

        portlets.filter(p => available.has(p.id)).forEach(p => {
            me.columns[p.col === 1 ? 1 : 0].add(me.portletConfig(available.get(p.id)))
        });

        me.updateAddMenu()
    }

    portletConfig(portlet) {
        return {module: Portlet, portlet, startPage: this, flex: 'none'}
    }

    /**
     * Ids on the page
     * @returns {Set<String>}
     */
    activeIds() {
        return new Set(this.columns.flatMap(col => col.items.map(item => item.portlet.id)))
    }

    updateAddMenu() {
        let me     = this,
            active = me.activeIds(),
            items  = [...me.available.values()].filter(p => !active.has(p.id));

        me.getReference('addButton').menu = items.length
            ? items.map(p => ({text: p.title, icon: p.icon || 'widgets', handler: () => me.addPortlet(p)}))
            : [{text: coreT('No items to display'), disabled: true}]
    }

    addPortlet(portlet) {
        let me = this;

        // GO adds to the top of the first column
        me.columns[0].insert(0, me.portletConfig(portlet));
        me.saveState()
    }

    /**
     * @param {GO.summary.Portlet} portlet
     * @param {String} direction 'up', 'down' or 'column'
     */
    movePortlet(portlet, direction) {
        let me     = this,
            column = portlet.parent,
            index  = column.indexOf(portlet);

        if (direction === 'column') {
            const other = me.columns[me.columns[0] === column ? 1 : 0];
            other.insert(0, portlet)
        } else {
            const target = direction === 'up' ? index - 1 : index + 1;

            if (target < 0 || target >= column.items.length) {
                return
            }

            // insert() leaves an item in place when its parent stays the same
            column.moveTo(index, target)
        }

        me.saveState()
    }

    removePortlet(portlet) {
        portlet.parent.remove(portlet);
        this.saveState()
    }

    saveState() {
        let me = this;

        me.updateAddMenu();
        setState(STATE_ID, {
            portlets: me.columns.flatMap((col, i) => col.items.map(item => ({id: item.portlet.id, col: i})))
        }, me.windowId)
    }

    async manageAnnouncements() {
        let me = this;

        const {default: AnnouncementsDialog} = await import('./AnnouncementsDialog.mjs');

        Neo.create(AnnouncementsDialog, {appName: me.appName, windowId: me.windowId}).on('changed', () => {
            me.columns.flatMap(col => col.items).filter(p => p.portlet.id === 'portlet-announcements').forEach(p => p.view?.refresh())
        })
    }

    /**
     * Shell routing: "#summary" has no sub routes
     */
    route() {}
}

export default Neo.setupClass(StartPage);
