import Container    from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import BoolCheckBox from './BoolCheckBox.mjs';

/**
 * GOUI CheckboxGroup: a legend above a row of checkboxes that look like toggle buttons
 * (GOUI checkbox type "button"), e.g. the weekdays of a recurrence. Every option is a
 * field of its own (BoolCheckBox): the form sees each name with true / false.
 *
 *     {module: CheckboxGroup, label: t('Days'), options: [
 *         {name: 'mo', label: t('Mon')}, {name: 'tu', label: t('Tue')}, ...
 *     ]}
 *
 * An option may carry more checkbox config (value, disabled, listeners, …).
 */
class CheckboxGroup extends Container {
    static config = {
        className: 'GO.form.field.CheckboxGroup',
        ntype    : 'go-checkboxgroup',
        baseCls  : ['go-checkboxgroup', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * Legend above the checkboxes
         * @member {String} label_=''
         */
        label_: '',
        /**
         * Checkbox configs: {name, label, ...}
         * @member {Object[]} options_=[]
         */
        options_: [],
        items: [{
            ntype    : 'component',
            tag      : 'h3',
            reference: 'legend',
            flex     : 'none',
            cls      : ['go-checkboxgroup-legend']
        }, {
            ntype    : 'container',
            reference: 'group',
            flex     : 'none',
            cls      : ['go-checkboxgroup-group'],
            layout   : {ntype: 'hbox', align: 'center', wrap: 'wrap'}
        }]
    }

    afterSetLabel(value) {
        const legend = this.getReference('legend');

        if (legend) {
            legend.text   = value || '';
            legend.hidden = !value
        }
    }

    afterSetOptions(value) {
        const group = this.getReference('group');

        if (group) {
            group.removeAll();
            group.add((value || []).map(({label, ...option}) => ({
                module        : BoolCheckBox,
                cls           : ['go-checkboxgroup-option'],
                flex          : 'none',
                valueLabel    : label ?? '',
                ...option
            })))
        }
    }

    onConstructed() {
        super.onConstructed();

        // the references exist now: apply what was set while constructing
        this.afterSetLabel(this.label);
        this.afterSetOptions(this.options)
    }
}

export default Neo.setupClass(CheckboxGroup);
