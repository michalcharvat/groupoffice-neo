import Container     from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_MANAGE} from '../Acl.mjs';
import Button        from '../button/Button.mjs';
import client        from '../jmap/Client.mjs';
import {escapeHtml}  from '../Format.mjs';
import JmapStore     from '../data/JmapStore.mjs';
import CheckList     from '../list/CheckList.mjs';
import EntityFilter  from '../model/EntityFilter.mjs';
import {notifyError} from '../Notify.mjs';
import ConfirmDialog from './ConfirmDialog.mjs';
import FilterDialog  from './FilterDialog.mjs';
import {customFieldFilters, variableCondition, variableField} from './filterTypes.mjs';
import VariableFilterDialog from './VariableFilterDialog.mjs';
import {fmt, t} from '../Translate.mjs';

/**
 * "Filters" in a module's west panel, the neo version of go.filter.FilterPanel (which GOUI's
 * filterpanel() wraps): the user's saved filters for an entity (core EntityFilter, type
 * "fixed"). Checked filters are combined with AND and fired as `filterChange`.
 *
 * Below them a field per "Input field" (EntityFilter type "variable", go.filter.VariableFilterPanel):
 * the values typed or picked in a field match with OR, the fields and the checked filters with AND.
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
                // GO's FilterAddButton
                menu   : [
                    {text: t('Filter'),      icon: 'filter_list', handler: () => me.openDialog(null)},
                    {text: t('Input field'), icon: 'search',      handler: () => me.openVariableDialog(null)}
                ]
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
        }, {
            ntype    : 'container',
            reference: 'variables',
            cls      : ['go-variable-filters'],
            flex     : 'none',
            layout   : {ntype: 'vbox', align: 'stretch'},
            items    : []
        }];

        me.variableStore = Neo.create(JmapStore, {
            entity    : 'EntityFilter',
            model     : EntityFilter,
            jmapFilter: {entity: me.entity, type: 'variable'},
            jmapSort  : [{property: 'name', isAscending: true}]
        })
    }

    /**
     * Values per input field (EntityFilter id): they survive a reload of the fields
     * @member {Map<String, Array>} variableValues
     */
    variableValues = new Map()

    destroy(...args) {
        this.variableStore?.destroy();
        super.destroy(...args)
    }

    onConstructed() {
        super.onConstructed();

        let me   = this,
            list = me.getReference('list');

        list.selectionModel.on('selectionChange', me.onSelectionChange, me);
        // an edited filter changes what the checked ones match
        list.store.on('load', me.onSelectionChange, me);
        list.store.on('loadError', ({error}) => notifyError(me, error));
        list.store.load().catch(() => {});

        me.variableStore.on('load', me.loadVariableFields, me);
        me.variableStore.on('loadError', ({error}) => notifyError(me, error));
        me.variableStore.load().catch(() => {})
    }

    /**
     * Filter definitions of the entity with its custom fields
     * @returns {Promise<Object[]>}
     * @protected
     */
    async getDefinitions() {
        let me = this;

        try {
            const custom = await customFieldFilters(me.entity),
                  known  = new Set(me.filters.map(f => f.name.toLowerCase()));

            return [...me.filters, ...custom.filter(f => !known.has(f.name.toLowerCase()))]
        } catch (e) {
            console.error(e);
            return me.filters
        }
    }

    /**
     * A field per input field (go.filter.VariableFilterPanel.loadFilters()); a filter the
     * module doesn't define (any more) is skipped
     * @protected
     */
    async loadVariableFields() {
        let me         = this,
            generation = me.variableGeneration = (me.variableGeneration || 0) + 1,
            defs       = await me.getDefinitions(),
            container  = me.getReference('variables');

        // destroyed, or a newer load meanwhile
        if (me.isDestroyed || generation !== me.variableGeneration) {
            return
        }

        const rows    = [],
              oldDefs = me.variableDefs || new Map();

        me.variableDefs = new Map();

        me.variableStore.items.forEach(record => {
            const def = defs.find(f => f.name.toLowerCase() === String(record.name).toLowerCase());

            if (!def) {
                console.warn('No such filter: ' + record.name);
                return
            }

            me.variableDefs.set(record.id, def);

            // edited to another filter: the values were for the old one
            oldDefs.get(record.id) && oldDefs.get(record.id).name !== def.name && me.variableValues.delete(record.id);

            rows.push({
                module: Container,
                cls   : ['go-variable-filter'],
                layout: {ntype: 'hbox', align: 'center'},
                items : [{
                    ...variableField(def),
                    labelText    : def.title || def.name,
                    labelPosition: 'inline',
                    flex         : 1,
                    goFilterId   : record.id,
                    value        : me.variableValues.get(record.id) || [],
                    listeners    : {userChange: ({value}) => me.onVariableChange(record.id, value)}
                }, {
                    module : Button,
                    icon   : 'more_vert',
                    flex   : 'none',
                    tooltip: t('More options'),
                    menu   : [{
                        text    : t('Edit'),
                        icon    : 'edit',
                        disabled: record.permissionLevel < LEVEL_MANAGE,
                        handler : () => me.openVariableDialog(record)
                    }, {
                        text    : t('Delete'),
                        icon    : 'delete',
                        disabled: record.permissionLevel < LEVEL_MANAGE,
                        handler : () => me.deleteFilter(record)
                    }]
                }]
            })
        });

        // values of deleted fields or fields of another filter no longer filter
        [...me.variableValues.keys()].forEach(id => me.variableDefs.has(id) || me.variableValues.delete(id));

        container.removeAll(true, false);
        container.add(rows);

        me.onSelectionChange()
    }

    /**
     * @param {String} id EntityFilter id
     * @param {Array} value
     * @protected
     */
    onVariableChange(id, value) {
        value?.length ? this.variableValues.set(id, [...value]) : this.variableValues.delete(id);
        this.onSelectionChange()
    }

    async openVariableDialog(record) {
        let me = this;

        Neo.create(VariableFilterDialog, {
            appName : me.appName,
            windowId: me.windowId,
            entity  : me.entity,
            filters : await me.getDefinitions(),
            record
        })
    }

    /**
     * @returns {Object|undefined} JMAP filter of the checked filters and the input fields
     */
    getFilter() {
        let me        = this,
            list      = me.getReference('list'),
            checked   = list.getCheckedIds().map(id => list.store.get(id)).filter(Boolean),
            variables = [...me.variableValues]
                .map(([id, values]) => me.variableDefs?.has(id) && variableCondition(me.variableDefs.get(id), values))
                .filter(Boolean),
            conditions = [...checked.map(r => r.filter), ...variables];

        return conditions.length
            ? {operator: 'AND', conditions}
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
            message : fmt(t("Are you sure you want to delete '{item}'?"), {item: escapeHtml(record.name)})
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
