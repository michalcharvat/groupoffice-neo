import DateField    from '../../form/field/DateField.mjs';
import Display      from '../../../node_modules/neo.mjs/src/form/field/Display.mjs';
import NeoTextField from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';
import FormDemo, {option, optionRow} from './FormDemo.mjs';
import {formatDate, userFormat} from '../../Format.mjs';
import {parseYmd}   from '../../DateUtil.mjs';
import {t}          from '../../Translate.mjs';

/**
 * Container of two fields side by side
 * @param {Object[]} items
 * @returns {Object}
 */
function pair(items) {
    return {ntype: 'container', layout: {ntype: 'hbox', align: 'start'}, style: {gap: '16px'}, itemDefaults: {flex: 1}, items}
}

/**
 * Dev demo: GOUI DisplayField (goui-docs form/DisplayFieldPage.ts) with neo's Display
 * field: forms also present data. The display fields follow the edit fields next to them.
 */
class DisplayFieldDemo extends FormDemo {
    static config = {
        className: 'GO.dev.demo.DisplayField',
        intro    : `<p>${t('Forms can also present data with display fields: read only, part of getValues() / setValues(). Change the fields on the right, the display fields follow.')}</p>`,
        fields   : [
            pair([{
                module       : Display,
                reference    : 'nameDisplay',
                name         : 'nameDisplay',
                labelText    : t('Name'),
                labelPosition: 'inline',
                value        : 'Don Doe'
            }, {
                module       : NeoTextField,
                reference    : 'name',
                name         : 'name',
                labelText    : t('Name'),
                labelPosition: 'inline',
                value        : 'Don Doe'
            }]),
            pair([{
                module       : Display,
                reference    : 'dateDisplay',
                name         : 'dateDisplay',
                labelText    : t('Date (display, user format)'),
                labelPosition: 'inline'
            }, {
                module       : DateField,
                reference    : 'date',
                name         : 'date',
                labelText    : t('Date'),
                labelPosition: 'inline'
            }])
        ],
        sample: {name: 'Jane Roe', nameDisplay: 'Jane Roe', date: '2026-12-24'},
        extra : [
            optionRow([
                option(t('Show display fields'), (demo, checked) => {
                    demo.getReference('nameDisplay').hidden = !checked;
                    demo.getReference('dateDisplay').hidden = !checked
                }, {checked: true})
            ])
        ]
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('name').on('change', ({value}) => {me.getReference('nameDisplay').value = value});
        me.getReference('date').on('change', ({value}) => me.showDate(value));
        me.showDate(me.getReference('date').value)
    }

    /**
     * The display field shows the date in the user's format, the server sends Y-m-d
     * @param {String|null} value Y-m-d
     */
    showDate(value) {
        const date = value && parseYmd(value);

        this.getReference('dateDisplay').value = date ? formatDate(date, userFormat.dateFormat) : ''
    }
}

export default Neo.setupClass(DisplayFieldDemo);
