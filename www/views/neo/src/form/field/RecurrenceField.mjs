import Button       from '../../button/Button.mjs';
import CheckBox     from '../../../node_modules/neo.mjs/src/form/field/CheckBox.mjs';
import Dialog, {headerTools} from '../../view/Dialog.mjs';
import DateField    from './DateField.mjs';
import Field        from './Field.mjs';
import LocalCombo   from './LocalCombo.mjs';
import MenuList     from '../../menu/List.mjs';
import NumberField  from '../../../node_modules/neo.mjs/src/form/field/Number.mjs';
import TextList     from '../../list/TextList.mjs';
import Toolbar      from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {formatDate, userFormat} from '../../Format.mjs';
import {lookup, t}  from '../../Translate.mjs';
import {addDays, DAY_KEYS, parseYmd, toYmd} from '../../DateUtil.mjs';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** GOUI RecurrencePicker.frequencies: [singular, plural, count default, until default, text] */
const frequencies = () => ({
    daily  : [t('day'),   t('days'),   30, [30, 'd'], t('Daily')],
    weekly : [t('week'),  t('weeks'),  13, [91, 'd'], t('Weekly')],
    monthly: [t('month'), t('months'), 12, [1, 'y'],  t('Monthly')],
    yearly : [t('year'),  t('years'),  5,  [5, 'y'],  t('Annually')]
});

const dayName = key => lookup('full_days')?.[DAY_KEYS.indexOf(key)] || t(DAYS[DAY_KEYS.indexOf(key)]);

/** Words joined by one space: GO's "at " keys lose their space in some translations */
const words = (...parts) => parts.map(part => String(part ?? '').trim()).filter(Boolean).join(' ');

const nth = n => [t('first'), t('second'), t('third'), t('fourth'), t('fifth')][n - 1] || t('last');

/**
 * groupoffice-core RecurrenceField + RecurrencePicker: a JMAP RecurrenceRule picked from
 * presets for the start date (daily, weekly on its weekday, monthly on its day or nth
 * weekday, yearly, working days) or customised in a dialog (interval, weekdays, monthly
 * type, ends never / after n times / at a date).
 *
 * Value: {frequency, interval?, byDay?: [{day, nthOfPeriod?}], byMonthDay?, count?, until?}
 * or null (not recurring). setStartDate() when the event's start changes.
 *
 *     {module: RecurrenceField, name: 'recurrenceRule', labelText: t('Repeat'), startDate: '2026-10-16'}
 */
class RecurrenceField extends Field {
    static config = {
        className: 'GO.form.field.RecurrenceField',
        ntype    : 'go-recurrencefield',
        baseCls  : ['go-field', 'go-recurrencefield'],
        /**
         * Start of the series, "Y-m-d" or a Date (default today)
         * @member {String|Date|null} startDate_=null
         */
        startDate_: null
    }

    /** @member {GO.menu.List|null} menu=null */
    menu = null

    construct(config) {
        super.construct(config);
        this.addDomListeners({click: this.onBoxClick, scope: this})
    }

    destroy(...args) {
        this.menu?.isDestroyed === false && this.menu.destroy();
        super.destroy(...args)
    }

    beforeSetStartDate(value) {
        return parseYmd(value || new Date()) || parseYmd(new Date())
    }

    afterSetStartDate(value, oldValue) {
        oldValue !== undefined && this.renderControl()
    }

    beforeSetValue(value) {
        return value && value.frequency ? Neo.clone(value, true) : null
    }

    /**
     * GOUI setStartDate()
     * @param {String|Date} date
     */
    setStartDate(date) {
        this.startDate = date
    }

    /**
     * Week of the month of the start date, -1 for its last week (GOUI weekOfMonth)
     * @returns {Number}
     */
    weekOfMonth() {
        const start = this.startDate;
        return addDays(start, 7).getMonth() !== start.getMonth() ? -1 : Math.ceil(start.getDate() / 7)
    }

    /**
     * GOUI RecurrenceField.toText()
     * @param {Object|null} rule
     * @param {Date} start
     * @returns {String}
     */
    static toText(rule, start) {
        if (!rule || !rule.frequency) {
            return t('Not recurring')
        }

        const record = frequencies()[rule.frequency];

        if (!record) {
            return 'Unsupported frequency: ' + rule.frequency
        }

        let str = record[4];

        if (rule.interval > 1) {
            str = words(t('Every'), rule.interval, record[1])
        }

        if (rule.byDay?.length) {
            let workdays = rule.byDay.length === 5,
                days     = rule.byDay.map((nDay, i) => {
                    const day = String(nDay.day).toLowerCase();
                    (day === 'sa' || day === 'su') && (workdays = false);

                    const n = nDay.nthOfPeriod || rule.bySetPosition?.[i];
                    return words(n && t('the'), n && nth(n === -1 ? 6 : n), dayName(day))
                });

            str = words(str, t('at '), workdays ? t('Workdays') : days.join(', '))
        } else if (rule.frequency === 'weekly') {
            str = words(str, t('at '), dayName(DAY_KEYS[start.getDay()]))
        }

        if (rule.byMonthDay?.length) {
            str = words(str, t('at day'), rule.byMonthDay.join(', '))
        }

        if (rule.count) {
            str += ', ' + words(rule.count, t('times'))
        }

        if (rule.until) {
            const until = parseYmd(rule.until);
            str += ', ' + words(t('until'), until ? formatDate(until, userFormat.dateFormat) : rule.until)
        }

        return str
    }

    createControl() {
        let me    = this,
            items = [{cls: ['go-recurrence-text'], text: RecurrenceField.toText(me.value, me.startDate)}];

        !me.readOnly && !me.disabled && items.push({
            tag: 'button', type: 'button', cls: ['go-field-tool'], title: t('Select'), cn: [{tag: 'i', cls: ['go-icon'], text: 'expand_more'}]
        });

        return items
    }

    onBoxClick({path}) {
        let me = this;

        if (!me.readOnly && !me.disabled && path.some(node => node.cls?.includes('go-field-box'))) {
            me.showMenu()
        }
    }

    /**
     * Presets for the start date (GOUI quickMenuItems())
     * @returns {Object[]}
     * @protected
     */
    menuItems() {
        let me      = this,
            start   = me.startDate,
            dayKey  = DAY_KEYS[start.getDay()],
            week    = me.weekOfMonth(),
            pick    = rule => () => me.userChange(rule);

        return [
            {id: 'none', text: t('Not recurring'), handler: pick(null)},
            {id: 'sep1', separator: true},
            {id: 'daily', text: t('Daily'), handler: pick({frequency: 'daily'})},
            {id: 'weekly', text: words(t('Weekly'), t('at '), dayName(dayKey)), handler: pick({frequency: 'weekly'})},
            {id: 'monthday', text: words(t('Monthly'), t('at day'), start.getDate()), handler: pick({frequency: 'monthly', byMonthDay: [start.getDate()]})},
            {id: 'monthnth', text: words(t('Monthly'), t('at the'), nth(week === -1 ? 6 : week), dayName(dayKey)),
                handler: pick({frequency: 'monthly', byDay: [{day: dayKey, nthOfPeriod: week}]})},
            {id: 'yearly', text: words(t('Annually'), t('at '), formatDate(start, 'j F')), handler: pick({frequency: 'yearly'})},
            {id: 'workdays', text: t('Each working day'), handler: pick({frequency: 'weekly', byDay: ['mo', 'tu', 'we', 'th', 'fr'].map(day => ({day}))})},
            {id: 'sep2', separator: true},
            {id: 'custom', text: t('Customize') + '...', handler: () => me.openDialog()}
        ]
    }

    showMenu() {
        let me = this;

        if (me.menu && !me.menu.isDestroyed) {
            return
        }

        me.menu = MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : me.id,
            align   : {edgeAlign: 't0-b0', axisLock: true},
            width   : 320,
            items   : me.menuItems()
        });

        me.menu.on('destroy', () => {me.menu = null})
    }

    openDialog() {
        let me = this;

        const dialog = Neo.create(RecurrenceDialog, {
            appName  : me.appName,
            windowId : me.windowId,
            rule     : me.value,
            startDate: me.startDate,
            week     : me.weekOfMonth()
        });

        dialog.on('select', ({rule}) => me.userChange(rule))
    }
}

/**
 * Custom rule (GOUI RecurrencePicker card 2)
 */
class RecurrenceDialog extends Dialog {
    static config = {
        className   : 'GO.form.field.RecurrenceDialog',
        cls         : ['go-recurrence-dialog'],
        modal       : true,
        headerConfig: headerTools('close'),
        resizable   : false,
        wrapperStyle: {left: 'calc(50vw - 260px)', top: '20vh', width: '520px'},
        containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}},
        rule     : null,
        startDate: null,
        week     : 1
    }

    construct(config) {
        super.construct(config);

        let me    = this,
            freqs = frequencies(),
            combo = (reference, data, width, value) => ({
                module       : LocalCombo,
                reference,
                displayField : 'name',
                valueField   : 'id',
                listConfig   : {module: TextList},
                store        : {keyProperty: 'id', data},
                width,
                value,
                labelPosition: 'inline',
                labelText    : '',
                hideLabel    : true,
                clearable    : false
            });

        me.title = t('Customize');

        me.items = [{
            ntype : 'container',
            cls   : ['go-recurrence-form'],
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                ntype : 'container',
                layout: {ntype: 'hbox', align: 'center'},
                cls   : ['go-recurrence-row'],
                items : [
                    {ntype: 'component', cls: ['go-recurrence-caption'], text: t('Every')},
                    {module: NumberField, reference: 'interval', minValue: 1, stepSize: 1, value: 1, width: 110, clearable: false, labelPosition: 'inline', labelText: ''},
                    combo('frequency', Object.keys(freqs).map(id => ({id, name: freqs[id][1]})), 160, 'yearly'),
                    combo('monthlyType', [
                        {id: 'byMonthDay', name: me.startDate.getDate() + '.'},
                        {id: 'byDay', name: words(nth(me.week === -1 ? 6 : me.week), dayName(DAY_KEYS[me.startDate.getDay()]))}
                    ], 200, 'byMonthDay')
                ]
            }, {
                ntype    : 'container',
                reference: 'weekdays',
                layout   : {ntype: 'hbox', align: 'center', wrap: 'wrap'},
                cls      : ['go-recurrence-row', 'go-recurrence-weekdays'],
                items    : [1, 2, 3, 4, 5, 6, 0].map(i => ({
                    module    : CheckBox,
                    reference : 'day-' + DAY_KEYS[i],
                    name      : DAY_KEYS[i],
                    hideLabel : true,
                    valueLabel: dayName(DAY_KEYS[i]).substring(0, 2)
                }))
            }, {
                ntype : 'container',
                layout: {ntype: 'hbox', align: 'center'},
                cls   : ['go-recurrence-row'],
                items : [
                    {ntype: 'component', cls: ['go-recurrence-caption'], text: t('Ends')},
                    combo('ends', [{id: 'forever', name: t('Never')}, {id: 'count', name: t('After')}, {id: 'until', name: t('At')}], 160, 'forever'),
                    {module: NumberField, reference: 'count', minValue: 1, maxValue: 1000, stepSize: 1, width: 120, clearable: false, labelPosition: 'inline', labelText: t('times')},
                    {module: DateField, reference: 'until', width: 180, labelPosition: 'inline', labelText: t('Until'), minValue: toYmd(me.startDate)}
                ]
            }]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            items : [{
                module : Button,
                text   : t('Cancel'),
                handler: () => me.close()
            }, '->', {
                module : Button,
                ui     : 'primary',
                text   : t('Ok'),
                handler: () => me.onOk()
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me   = this,
            rule = me.rule;

        me.getReference('frequency').on('change', () => me.syncFields());
        me.getReference('ends').on('change', () => me.syncFields());

        if (rule) {
            me.getReference('frequency').value = rule.frequency;
            me.getReference('interval').value  = rule.interval || 1;
            me.getReference('ends').value      = rule.until ? 'until' : (rule.count ? 'count' : 'forever');
            rule.count && (me.getReference('count').value = rule.count);
            rule.until && (me.getReference('until').value = rule.until);

            if (rule.frequency === 'weekly') {
                (rule.byDay || []).forEach(({day}) => {
                    const box = me.getReference('day-' + String(day).toLowerCase());
                    box && (box.checked = true)
                })
            } else if (rule.frequency === 'monthly') {
                me.getReference('monthlyType').value = rule.byDay ? 'byDay' : 'byMonthDay'
            }
        }

        me.initialMonthlyType = me.comboValue('monthlyType');
        me.syncFields(true)
    }

    /**
     * @param {String} reference combo
     * @returns {String|null} its option id
     */
    comboValue(reference) {
        return this.getReference(reference).getSubmitValue?.() ?? null
    }

    /**
     * Shows the fields of the frequency and the end type; fills defaults (GOUI changeFrequency())
     * @param {Boolean} [initial]
     * @protected
     */
    syncFields(initial = false) {
        let me        = this,
            frequency = me.comboValue('frequency') || 'yearly',
            ends      = me.comboValue('ends') || 'forever',
            defaults  = frequencies()[frequency],
            count     = me.getReference('count'),
            until     = me.getReference('until');

        me.getReference('weekdays').hidden    = frequency !== 'weekly';
        me.getReference('monthlyType').hidden = frequency !== 'monthly';
        count.hidden = ends !== 'count';
        until.hidden = ends !== 'until';

        if (!initial || !me.rule) {
            count.value || (count.value = defaults[2]);

            if (!until.value) {
                const [n, unit] = defaults[3],
                      date      = new Date(me.startDate);

                unit === 'd' ? date.setDate(date.getDate() + n) : date.setFullYear(date.getFullYear() + n);
                until.value = toYmd(date)
            }
        }
    }

    onOk() {
        let me        = this,
            frequency = me.comboValue('frequency') || 'yearly',
            interval  = Number(me.getReference('interval').value) || 1,
            ends      = me.comboValue('ends'),
            rule      = {frequency};

        interval !== 1 && (rule.interval = interval);

        if (ends === 'count') {
            rule.count = Number(me.getReference('count').value) || 1
        } else if (ends === 'until') {
            const until = me.getReference('until').value;
            until && (rule.until = until)
        }

        const original = me.rule;

        if (frequency === 'monthly' && original?.frequency === 'monthly' && me.comboValue('monthlyType') === me.initialMonthlyType) {
            // an unchanged monthly pattern keeps its own days (byMonthDay [1, 15], nth weekdays, …)
            original.byDay      && (rule.byDay      = Neo.clone(original.byDay, true));
            original.byMonthDay && (rule.byMonthDay = [...original.byMonthDay]);
            original.bySetPosition && (rule.bySetPosition = [...original.bySetPosition])
        } else if (frequency === 'monthly') {
            if (me.comboValue('monthlyType') === 'byDay') {
                rule.byDay = [{day: DAY_KEYS[me.startDate.getDay()], nthOfPeriod: me.week}]
            } else {
                rule.byMonthDay = [me.startDate.getDate()]
            }
        }

        if (frequency === 'weekly') {
            const byDay = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].filter(day => me.getReference('day-' + day).checked).map(day => ({day}));
            byDay.length && (rule.byDay = byDay)
        }

        me.fire('select', {rule});
        me.close()
    }
}

Neo.setupClass(RecurrenceDialog);

export default Neo.setupClass(RecurrenceField);
