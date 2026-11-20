import ComboBox      from '../../node_modules/neo.mjs/src/form/field/ComboBox.mjs';
import FormContainer from '../../node_modules/neo.mjs/src/form/Container.mjs';
import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../button/Button.mjs';
import client        from '../jmap/Client.mjs';
import TextList      from '../list/TextList.mjs';
import Dialog        from './Dialog.mjs';
import {t} from '../Translate.mjs';

/**
 * Create or edit an "Input field" (core EntityFilter, type "variable"), the neo version of
 * go.filter.VariableFilterDialog: the filter to type values for. Its name is the filter's
 * name; GO.view.FilterPanel shows a field for it below the saved filters.
 */
class VariableFilterDialog extends Dialog {
    static config = {
        className: 'GO.view.VariableFilterDialog',
        cls      : ['go-filter-dialog'],
        modal    : true,
        title    : t('Input field'),
        // no animateTarget: position explicitly, .neo-floating parks it off-screen
        wrapperStyle: {left: 'calc(50vw - 200px)', top: '15vh', width: '400px'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * JMAP entity, e.g. "Contact"
         * @member {String|null} entity=null
         */
        entity: null,
        /**
         * Filter definitions of the entity, custom fields included
         * @member {Object[]} filters=[]
         */
        filters: [],
        /**
         * EntityFilter record when editing: {id, name}
         * @member {Object|null} record=null
         */
        record: null
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module   : FormContainer,
            reference: 'form',
            layout   : {ntype: 'vbox', align: 'stretch'},
            style    : {padding: '16px'},
            items    : [{
                module       : ComboBox,
                reference    : 'name',
                labelText    : t('Filter'),
                labelPosition: 'inline',
                required     : true,
                // neo combos are 150px wide and flex in a vbox
                width        : null,
                flex         : 'none',
                editable     : false,
                displayField : 'title',
                valueField   : 'name',
                listConfig   : {module: TextList},
                value        : me.record?.name || null,
                store        : {
                    keyProperty: 'name',
                    data       : me.filters
                        .map(f => ({name: f.name, title: f.title || f.name}))
                        .sort((a, b) => a.title.localeCompare(b.title))
                }
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

    async onSave() {
        let me     = this,
            combo  = me.getReference('name'),
            button = me.getReference('saveButton'),
            error  = me.getReference('error'),
            value  = combo.value,
            name   = typeof value === 'object' && value ? value.name : value;

        if (button.disabled || !await me.getReference('form').validate() || !name) {
            return
        }

        button.disabled = true;
        error.text = '';

        try {
            await client.set('EntityFilter', me.record
                ? {update: {[me.record.id]: {name}}}
                : {create: {new: {name, entity: me.entity, type: 'variable'}}});

            me.close()
        } catch (e) {
            error.text = e.message
        } finally {
            me.isDestroyed || (button.disabled = false)
        }
    }
}

export default Neo.setupClass(VariableFilterDialog);
