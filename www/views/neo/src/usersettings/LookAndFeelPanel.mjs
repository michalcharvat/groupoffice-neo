import Container      from '../../node_modules/neo.mjs/src/container/Base.mjs';
import HiddenField    from '../../node_modules/neo.mjs/src/form/field/Hidden.mjs';
import TextField      from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Button         from '../button/Button.mjs';
import BoolCheckBox   from '../form/field/BoolCheckBox.mjs';
import LocalCombo     from '../form/field/LocalCombo.mjs';
import {fieldset}     from '../form/fieldset.mjs';
import TextList       from '../list/TextList.mjs';
import ModuleRegistry from '../ModuleRegistry.mjs';
import ConfirmDialog  from '../view/ConfirmDialog.mjs';
import {applyTheme, clearState} from '../Preferences.mjs';
import {t} from '../Translate.mjs';

/**
 * Combo over fixed options
 * @param {String} name
 * @param {String} labelText
 * @param {Array[]} options [[value, text]]
 * @param {Object} [config]
 * @returns {Object}
 */
function select(name, labelText, options, config = {}) {
    return {
        module      : LocalCombo,
        name,
        labelText,
        labelPosition: 'inline',
        // neo's default combo width
        width       : null,
        displayField: 'name',
        valueField  : 'id',
        editable    : false,
        listConfig  : {module: TextList},
        store       : {keyProperty: 'id', data: options.map(([id, name]) => ({id, name}))},
        ...config
    }
}

/**
 * @param {String} name
 * @param {String} text
 * @returns {Object}
 */
function check(name, text) {
    return {module: BoolCheckBox, name, valueLabel: text}
}

/** GO time zones: the browser's IANA list */
function timeZones() {
    try {
        return Intl.supportedValuesOf('timeZone')
    } catch (e) {
        return ['UTC']
    }
}

/** go.util.Format.dateFormats */
const DATE_FORMATS = () => [
    ['d-m-Y', t('Day-Month-Year')],
    ['m/d/Y', t('Month/Day/Year')],
    ['d/m/Y', t('Day/Month/Year')],
    ['d.m.Y', t('Day.Month.Year')],
    ['Y-m-d', t('Year-Month-Day')],
    ['Y.m.d', t('Year.Month.Day')]
];

/** colour schemes: value, Material icon, label */
const SCHEMES = () => [
    ['light',  'light_mode',      t('Light')],
    ['dark',   'dark_mode',       t('Dark')],
    ['system', 'brightness_auto', t('System default')]
];

/**
 * "Look & feel" card of My account (go.usersettings.LookAndFeelPanel): theme and
 * colour scheme (previewed right away), start module, list settings, regional
 * settings and number formatting.
 */
class LookAndFeelPanel extends Container {
    static config = {
        className: 'GO.usersettings.LookAndFeelPanel',
        baseCls  : ['go-usersettings-lookandfeel', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);

        let me    = this,
            zones = timeZones();

        me.items = [{
            ntype : 'container',
            cls   : ['go-usersettings-columns'],
            flex  : 'none',
            layout: 'base',
            items : [{
                ntype : 'container',
                layout: {ntype: 'vbox', align: 'stretch'},
                items : [
                    fieldset(t('Theme'), [
                        select('theme', t('Theme'), [['Paper', t('Paper')], ['Compact', t('Compact')]], {
                            listeners: {change: ({value}) => value && me.preview()}
                        }), {
                            module   : HiddenField,
                            name     : 'themeColorScheme',
                            reference: 'colorScheme'
                        }, {
                            ntype : 'container',
                            cls   : ['go-usersettings-schemes'],
                            flex  : 'none',
                            layout: {ntype: 'hbox'},
                            role  : 'group',
                            items : SCHEMES().map(([value, icon, text]) => ({
                                module   : Button,
                                reference: 'scheme-' + value,
                                cls      : ['go-usersettings-scheme'],
                                icon,
                                text,
                                handler  : () => me.setColorScheme(value)
                            }))
                        }]),

                    fieldset(t('Global'), [
                        select('start_module', t('Start in module'), ModuleRegistry.getAvailable().map(m => [m.name, m.title])),
                        select('max_rows_list', t('Maximum number of rows in lists'), [10, 15, 20, 25, 30, 50].map(n => [n, String(n)])),
                        select('sort_name', t('Sort names by'), [['first_name', t('First name')], ['last_name', t('Last name')]]),
                        check('enableSendShortcut', t('Use shortcut to send forms') + ' (Ctrl / ⌘ + Enter)'),
                        check('show_smilies', t('Show smilies')),
                        check('auto_punctuation', t('Capital after punctuation')),
                        check('confirmOnMove', t('Show confirmation dialog on move')), {
                            module : Button,
                            flex   : 'none',
                            cls    : ['go-usersettings-reset'],
                            icon   : 'restart_alt',
                            text   : t('Reset windows and grids'),
                            handler: () => me.resetState()
                        }])
                ]
            }, {
                ntype : 'container',
                layout: {ntype: 'vbox', align: 'stretch'},
                items : [
                    fieldset(t('Regional'), [
                        select('language', t('Language'), Neo.config.goLanguages || [], {editable: true}),
                        select('timezone', t('Timezone'), zones.map(zone => [zone, zone]), {editable: true}),
                        select('dateFormat', t('Date format'), DATE_FORMATS()),
                        select('timeFormat', t('Time format'), [['G:i', t('24 hour format')], ['g:i a', t('12 hour format')]]),
                        check('shortDateInList', t('Use short format for date and time in lists')),
                        select('firstWeekday', t('First day of week'), [[0, t('Sunday')], [1, t('Monday')]]),
                        select('holidayset', t('Holidays'), (Neo.config.goHolidaySets || []).map(s => [s.iso, s.label]))
                    ]),

                    fieldset(t('Formatting'), [
                        {module: TextField, labelPosition: 'inline', name: 'listSeparator',      labelText: t('List separator')},
                        {module: TextField, labelPosition: 'inline', name: 'textSeparator',      labelText: t('Text separator')},
                        {module: TextField, labelPosition: 'inline', name: 'thousandsSeparator', labelText: t('Thousand Separator')},
                        {module: TextField, labelPosition: 'inline', name: 'decimalSeparator',   labelText: t('Decimal Separator')},
                        {module: TextField, labelPosition: 'inline', name: 'currency',           labelText: t('Currency')}
                    ])
                ]
            }]
        }]
    }

    /**
     * Called by the dialog after loading the user
     * @param {Object} user
     */
    onLoad(user) {
        this.syncSchemeButtons(user.themeColorScheme)
    }

    /**
     * @param {String} value 'light', 'dark' or 'system'
     */
    setColorScheme(value) {
        this.getReference('colorScheme').value = value;
        this.syncSchemeButtons(value);
        this.preview()
    }

    /**
     * @param {String} value
     * @protected
     */
    syncSchemeButtons(value) {
        SCHEMES().forEach(([scheme]) => {
            this.getReference('scheme-' + scheme).pressed = scheme === value
        })
    }

    /**
     * Shows the chosen theme in this window; the dialog puts the saved one back on cancel
     * @protected
     */
    preview() {
        let me = this;

        applyTheme({theme: me.down({name: 'theme'})?.getSubmitValue(), colorScheme: me.getReference('colorScheme').value}, [me.windowId])
    }

    /**
     * "Reset windows and grids": GO's per-user grid columns, panel sizes etc.
     * live in this browser's localStorage
     * @protected
     */
    async resetState() {
        let me = this;

        const ok = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : t('Are you sure you want to reset all grid columns, windows, panel sizes etc. to the factory defaults?')
        });

        if (ok && !me.isDestroyed) {
            await clearState(me.windowId);
            Neo.Main.reloadWindow({windowId: me.windowId})
        }
    }
}

export default Neo.setupClass(LookAndFeelPanel);
