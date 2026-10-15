import Container     from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_MANAGE} from '../Acl.mjs';
import Button        from '../button/Button.mjs';
import client        from '../jmap/Client.mjs';
import JmapStore     from '../data/JmapStore.mjs';
import CheckList     from '../list/CheckList.mjs';
import EntityFilter  from '../model/EntityFilter.mjs';
import {notifyError} from '../Notify.mjs';
import ConfirmDialog from './ConfirmDialog.mjs';
import FilterDialog  from './FilterDialog.mjs';
import {fmt, t} from '../Translate.mjs';

/**
 * "Filters" in a module's west panel, the neo version of go.filter.FilterPanel (which GOUI's
 * filterpanel() wraps): the user's saved filters for an entity (core EntityFilter, type
 * "fixed"). Checked filters are combined with AND and fired as `filterChange`.
 *
 *     {module: FilterPanel, entity: 'Note', filters: [...definitions], listeners: {filterChange: ({filter}) => ...}}
 */
class FilterPanel extends Container {
    static config = {
        className: 'GO.view.FilterPanel',
        baseCls  : ['go-filter-panel', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {String|null} entity=null
         */
        entity: null,
        /**
         * Filter definitions for the dialog, see GO.view.FilterDialog
         * @member {Object[]} filters=[]
         */
        filters: []
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            flex  : 'none',
            items : [{
                ntype: 'component',
                tag  : 'h3',
                cls  : ['go-toolbar-title'],
                text : t('Filters')
            }, '->', {
                module : Button,
                icon   : 'add',
                cls    : ['go-menu-button'],
                tooltip: t('Add filter'),
                // GO's FilterAddButton; "Input field" (variable filters) is not supported here
                menu   : [{text: t('Filter'), icon: 'filter_list', handler: () => me.openDialog(null)}]
            }]
        }, {
            module      : CheckList,
            reference   : 'list',
            displayField: 'name',
            rowMenu     : record => [{
                text    : t('Edit'),
                icon    : 'edit',
                disabled: record.permissionLevel < LEVEL_MANAGE,
                handler : () => me.openDialog(record)
            }, {
                text    : t('Delete'),
                icon    : 'delete',
                disabled: record.permissionLevel < LEVEL_MANAGE,
                handler : () => me.deleteFilter(record)
            }],
            store: {
                module    : JmapStore,
                entity    : 'EntityFilter',
                model     : EntityFilter,
                jmapFilter: {entity: me.entity, type: 'fixed'},
                jmapSort  : [{property: 'name', isAscending: true}]
            }
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me   = this,
            list = me.getReference('list');

        list.selectionModel.on('selectionChange', me.onSelectionChange, me);
        // an edited filter changes what the checked ones match
        list.store.on('load', me.onSelectionChange, me);
        list.store.on('loadError', ({error}) => notifyError(me, error));
        list.store.load().catch(() => {})
    }

    /**
     * @returns {Object|undefined} JMAP filter of the checked filters
     */
    getFilter() {
        let list    = this.getReference('list'),
            checked = list.getCheckedIds().map(id => list.store.get(id)).filter(Boolean);

        return checked.length
            ? {operator: 'AND', conditions: checked.map(r => r.filter)}
            : undefined
    }

    onSelectionChange() {
        const filter = this.getFilter();

        // unchanged after a reload: nothing to do
        if (JSON.stringify(filter) !== JSON.stringify(this.lastFilter)) {
            this.lastFilter = filter;
            this.fire('filterChange', {filter})
        }
    }

    openDialog(record) {
        let me = this;

        Neo.create(FilterDialog, {
            appName : me.appName,
            windowId: me.windowId,
            entity  : me.entity,
            filters : me.filters,
            record
        })
    }

    async deleteFilter(record) {
        let me = this;

        const confirmed = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : fmt(t("Are you sure you want to delete '{item}'?"), {item: record.name})
        });

        if (confirmed) {
            try {
                await client.set('EntityFilter', {destroy: [record.id]})
            } catch (e) {
                notifyError(me, e)
            }
        }
    }
}

export default Neo.setupClass(FilterPanel);
