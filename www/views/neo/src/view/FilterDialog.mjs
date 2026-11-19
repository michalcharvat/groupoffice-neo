import ComboBox      from '../../node_modules/neo.mjs/src/form/field/ComboBox.mjs';
import Container     from '../../node_modules/neo.mjs/src/container/Base.mjs';
import FormContainer from '../../node_modules/neo.mjs/src/form/Container.mjs';
import TextField     from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../button/Button.mjs';
import client        from '../jmap/Client.mjs';
import TextList      from '../list/TextList.mjs';
import Dialog        from './Dialog.mjs';
import {customFieldFilters, filterType} from './filterTypes.mjs';
import {t} from '../Translate.mjs';

/**
 * Create or edit a saved filter (core EntityFilter, type "fixed"), the neo version of
 * go.filter.FilterDialog: a name and conditions "<filter> <value>" combined with AND.
 *
 * Filter definitions come from the module (GOUI modules.register({entities: [{filters}]})):
 * [{name, title, type, multiple}], see filterTypes.mjs for the types and their editors.
 * The custom fields of the entity are added as filters. Sub groups and values an editor
 * can't show (e.g. more than one user) are kept as they are but cannot be edited here.
 */
class FilterDialog extends Dialog {
    static config = {
        className: 'GO.view.FilterDialog',
        cls      : ['go-filter-dialog'],
        modal    : true,
        resizable: true,
        title    : t('Filter'),
        // no animateTarget: position explicitly, .neo-floating parks it off-screen
        wrapperStyle: {left: 'calc(50vw - 300px)', top: '12vh', width: '600px'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * JMAP entity the filter is for, e.g. "Note"
         * @member {String|null} entity=null
         */
        entity: null,
        /**
         * Filter definitions of the entity
         * @member {Object[]} filters=[]
         */
        filters: [],
        /**
         * EntityFilter record when editing: {id, name, filter}
         * @member {Object|null} record=null
         */
        record: null
    }

    rowCount = 0

    construct(config) {
        super.construct(config);

        let me = this;

        me.title = me.record ? t('Edit filter') : t('New filter');

        me.items = [{
            module   : FormContainer,
            reference: 'form',
            layout   : {ntype: 'vbox', align: 'stretch'},
            style    : {padding: '16px', gap: '12px'},
            items    : [{
                module       : TextField,
                name         : 'name',
                labelText    : t('Name'),
                labelPosition: 'inline',
                required     : true,
                value        : me.record?.name || ''
            }, {
                ntype: 'component',
                tag  : 'h4',
                cls  : ['go-form-heading'],
                text : me.record?.filter?.operator === 'OR' ? t('Conditions (any must match)') : t('Conditions (all must match)')
            }, {
                ntype    : 'container',
                reference: 'conditions',
                layout   : {ntype: 'vbox', align: 'stretch'},
                style    : {gap: '8px'},
                items    : []
            }, {
                module : Button,
                icon   : 'add',
                text   : t('Add condition'),
                flex   : 'none',
                handler: () => me.addCondition()
            }]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : [{
                ntype    : 'component',
                cls      : ['go-form-error'],
                reference: 'error',
                flex     : 1
            }, {
                module : Button,
                text   : t('Cancel'),
                handler: () => me.close()
            }, {
                module   : Button,
                ui       : 'primary',
                reference: 'saveButton',
                text     : t('Save'),
                handler  : () => me.onSave()
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();
        this.loadConditions()
    }

    /**
     * Adds the custom field filters of the entity, then a row per saved condition
     * @protected
     */
    async loadConditions() {
        let me         = this,
            button     = me.getReference('saveButton'),
            conditions = me.record?.filter?.conditions || [];

        // conditions this dialog cannot show (sub groups, unknown filters) are saved back unchanged
        me.keptConditions = [];

        // a save before the rows are there would drop the conditions
        button.disabled = true;

        try {
            const custom = await customFieldFilters(me.entity),
                  known  = new Set(me.filters.map(f => f.name.toLowerCase()));

            me.filters = [...me.filters, ...custom.filter(f => !known.has(f.name.toLowerCase()))]
        } catch (e) {
            // without the custom fields their conditions are kept unchanged
            me.isDestroyed || (me.getReference('error').text = e.message)
        }

        if (me.isDestroyed) {
            return
        }

        conditions.forEach(condition => {
            const entries       = Object.entries(condition),
                  [name, value] = entries[0] || [],
                  // a condition with more than one filter ({gender, isOrganization}) is one group
                  def           = condition.operator || entries.length !== 1 ? null : me.getDefinition(name);

            if (def && filterType(def).accepts(value, def)) {
                me.addCondition(def.name, value)
            } else {
                me.keptConditions.push(condition)
            }
        });

        conditions.length || me.addCondition();

        button.disabled = false
    }

    getDefinition(name) {
        return this.filters.find(f => f.name.toLowerCase() === String(name).toLowerCase())
    }

    /**
     * Value editor of a condition, without a label
     * @param {String} name filter name
     * @param {*} [value] saved value, undefined for a new condition
     * @returns {Object}
     * @protected
     */
    createValueField(name, value) {
        const def = this.getDefinition(name);

        return {
            ...def ? filterType(def).field(def, value) : {module: TextField},
            labelText    : t('Value'),
            labelPosition: 'inline',
            flex         : 1,
            goFilter     : name
        }
    }

    /**
     * Another filter picked: its editor replaces the value field
     * @param {Neo.container.Base} row
     * @param {Object|String|null} picked a combo's value is the record when it was picked from the list
     * @protected
     */
    onFieldChange(row, picked) {
        const name = typeof picked === 'object' && picked ? picked.name : picked;

        if (name && row.items[1]?.goFilter !== name) {
            row.removeAt(1);
            row.insert(1, this.createValueField(name))
        }
    }

    /**
     * @param {String} [name]
     * @param {*} [value] saved value
     */
    addCondition(name, value) {
        let me   = this,
            id   = ++me.rowCount,
            def  = me.getDefinition(name || me.filters[0]?.name);

        me.getReference('conditions').add({
            module   : Container,
            reference: 'condition-' + id,
            cls      : ['go-filter-condition'],
            layout   : {ntype: 'hbox', align: 'center'},
            style    : {gap: '8px'},
            items    : [{
                module       : ComboBox,
                labelText    : t('Field'),
                labelPosition: 'inline',
                width        : 200,
                flex         : 'none',
                editable     : false,
                displayField : 'title',
                valueField   : 'name',
                listConfig   : {module: TextList},
                value        : def?.name || null,
                store        : {
                    keyProperty: 'name',
                    data       : me.filters
                        .map(f => ({name: f.name, title: f.title || f.name}))
                        .sort((a, b) => a.title.localeCompare(b.title))
                },
                listeners: {change: ({component, value}) => me.onFieldChange(component.up(), value)}
            }, me.createValueField(def?.name, value), {
                module : Button,
                icon   : 'delete',
                tooltip: t('Remove'),
                flex   : 'none',
                handler: () => me.getReference('conditions').remove(me.getReference('condition-' + id))
            }]
        })
    }

    getConditions() {
        let me = this;

        return me.getReference('conditions').items.map(row => {
            const valueField = row.items[1],
                  def        = me.getDefinition(valueField?.goFilter),
                  value      = def ? filterType(def).read(def, valueField) : undefined;

            return value === undefined ? null : {[def.name]: value}
        }).filter(Boolean)
    }

    async onSave() {
        let me     = this,
            form   = me.getReference('form'),
            button = me.getReference('saveButton'),
            error  = me.getReference('error');

        if (button.disabled || !await form.validate()) {
            return
        }

        const conditions = [...me.getConditions(), ...me.keptConditions];

        if (!conditions.length) {
            error.text = t('Add at least one condition.');
            return
        }

        const name   = me.getReference('form').items[0].value,
              // keeps an OR filter made in the classic UI an OR filter
              record = {name, filter: {operator: me.record?.filter?.operator || 'AND', conditions}};

        button.disabled = true;
        error.text = '';

        try {
            await client.set('EntityFilter', me.record
                ? {update: {[me.record.id]: record}}
                : {create: {new: {...record, entity: me.entity, type: 'fixed'}}});

            me.fire('saved', {});
            me.close()
        } catch (e) {
            error.text = e.message
        } finally {
            if (!me.isDestroyed) {
                button.disabled = false
            }
        }
    }
}

export default Neo.setupClass(FilterDialog);
