import ComboBox      from '../../node_modules/neo.mjs/src/form/field/ComboBox.mjs';
import Container     from '../../node_modules/neo.mjs/src/container/Base.mjs';
import FormContainer from '../../node_modules/neo.mjs/src/form/Container.mjs';
import TextField     from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../button/Button.mjs';
import client        from '../jmap/Client.mjs';
import TextList      from '../list/TextList.mjs';
import Dialog        from './Dialog.mjs';
import {t} from '../Translate.mjs';

/**
 * Create or edit a saved filter (core EntityFilter, type "fixed"), the neo version of
 * go.filter.FilterDialog: a name and conditions "<filter> <value>" combined with AND.
 *
 * Filter definitions come from the module (GOUI modules.register({entities: [{filters}]})):
 * [{name, title, type: 'string'|'date'|'number', multiple}]. String values match with
 * wildcards like GO's (go.util.Filters.normalize: every string filter but "text").
 * Sub groups and link filters are kept as they are but cannot be edited here.
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

        let me         = this,
            conditions = me.record?.filter?.conditions || [];

        // conditions this dialog cannot show (sub groups) are saved back unchanged
        me.keptConditions = [];

        conditions.forEach(condition => {
            const [name, value] = Object.entries(condition)[0] || [];

            if (condition.operator || !me.getDefinition(name)) {
                me.keptConditions.push(condition)
            } else {
                me.addCondition(name, me.toInput(name, value))
            }
        });

        conditions.length || me.addCondition()
    }

    getDefinition(name) {
        return this.filters.find(f => f.name.toLowerCase() === String(name).toLowerCase())
    }

    usesWildcards(name) {
        const def = this.getDefinition(name);
        return def?.type === 'string' && def.name.toLowerCase() !== 'text'
    }

    toInput(name, value) {
        let v = Array.isArray(value) ? value.join(', ') : String(value ?? '');

        // "contains" (%x%) shows as x; other patterns (x%, exact) keep their % so saving keeps them
        if (this.usesWildcards(name)) {
            v = v.split(', ').map(s => /^%.*%$/.test(s) ? s.slice(1, -1) : s).join(', ')
        }

        return v
    }

    fromInput(name, text) {
        const def = this.getDefinition(name);

        let values = def?.multiple ? text.split(',').map(s => s.trim()).filter(Boolean) : [text.trim()];

        // GO's wildcard filters: plain text means "contains", a value with % is a pattern
        if (this.usesWildcards(name)) {
            values = values.map(v => v.includes('%') ? v : `%${v}%`)
        }

        return def?.multiple ? values : values[0]
    }

    /**
     * @param {String} [name]
     * @param {String} [value]
     */
    addCondition(name, value='') {
        let me = this,
            id = ++me.rowCount;

        me.getReference('conditions').add({
            module   : Container,
            reference: 'condition-' + id,
            cls      : ['go-filter-condition'],
            layout   : {ntype: 'hbox', align: 'center'},
            style    : {gap: '8px'},
            items    : [{
                module       : ComboBox,
                reference    : 'field-' + id,
                labelText    : t('Field'),
                labelPosition: 'inline',
                width        : 200,
                flex         : 'none',
                editable     : false,
                displayField : 'title',
                valueField   : 'name',
                listConfig   : {module: TextList},
                value        : name || me.filters[0]?.name || null,
                store        : {
                    keyProperty: 'name',
                    data       : me.filters.map(f => ({name: f.name, title: f.title || f.name}))
                }
            }, {
                module       : TextField,
                reference    : 'value-' + id,
                labelText    : t('Value'),
                labelPosition: 'inline',
                flex         : 1,
                value
            }, {
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
            const id    = row.reference.split('-')[1],
                  name  = me.getReference('field-' + id)?.value,
                  text  = me.getReference('value-' + id)?.value || '';

            // a combo's value is the record when it was picked from the list
            const field = typeof name === 'object' && name ? name.name : name;

            return field && text.trim() ? {[field]: me.fromInput(field, text)} : null
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
