import Button   from '../../button/Button.mjs';
import Dialog, {headerTools} from '../../view/Dialog.mjs';
import DateField from './DateField.mjs';
import Field    from './Field.mjs';
import MenuList from '../../menu/List.mjs';
import Toolbar  from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {smartDateTime} from '../../Format.mjs';
import {lookup, t} from '../../Translate.mjs';
import {addDays, addMonths, parseYmd, toYmd, weekStart} from '../../DateUtil.mjs';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const monthName = i => lookup('full_months')?.[i + 1] || t(MONTHS[i]);

/**
 * GOUI DateRangeField: a date filter value picked from presets.
 *
 * Value, as GO's date filters take it:
 * - "2026-10-01..2026-10-31" a range, both days included
 * - ">=2026-10-01"           from
 * - "<2026-11-01"            until 2026-10-31 (the day after, exclusive)
 * - null                     no filter
 *
 * The menu (▾ or a click on the field): today, yesterday, this / last week, this / last
 * month, this year (quarters, months), earlier years, and a custom range, from or until
 * (a small dialog with date fields; GOUI shows date pickers in submenus).
 *
 *     {module: DateRangeField, name: 'date', labelText: t('Date')}
 */
class DateRangeField extends Field {
    static config = {
        className: 'GO.form.field.DateRangeField',
        ntype    : 'go-daterangefield',
        baseCls  : ['go-field', 'go-daterangefield']
    }

    /** @member {GO.menu.List|null} menu=null */
    menu = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({click: me.onBoxClick, scope: me})
    }

    destroy(...args) {
        this.menu && !this.menu.isDestroyed && this.menu.destroy();
        super.destroy(...args)
    }

    beforeSetValue(value) {
        return value ? String(value) : null
    }

    /**
     * @param {String|null} value
     * @returns {String} the value as text ("Today", "1 Oct - 31 Oct", "> Yesterday")
     */
    static toText(value) {
        if (!value) {
            return ''
        }

        const show = ymd => {
            const date = parseYmd(ymd);
            return date ? smartDateTime(date, false) : ymd
        };

        if (value.includes('..')) {
            const [from, until] = value.split('..');
            return from === until ? show(from) : `${show(from)} - ${show(until)}`
        }

        let m;

        if ((m = /^>=(.+)$/.exec(value))) {return '>= ' + show(m[1])}
        if ((m = /^<=(.+)$/.exec(value))) {return '<= ' + show(m[1])}
        if ((m = /^<(.+)$/.exec(value)))  {return '<= ' + show(toYmd(addDays(parseYmd(m[1]) || new Date(), -1)))}
        if ((m = /^>(.+)$/.exec(value)))  {return '>= ' + show(toYmd(addDays(parseYmd(m[1]) || new Date(), 1)))}

        return value
    }

    /**
     * @returns {Object|null} {from, until} as Date (local midnight), either may be null
     */
    getRange() {
        let value = this.value,
            m;

        if (!value) {
            return null
        }

        if (value.includes('..')) {
            const [from, until] = value.split('..');
            return {from: parseYmd(from), until: parseYmd(until)}
        }

        if ((m = /^>=(.+)$/.exec(value))) {return {from: parseYmd(m[1]), until: null}}
        if ((m = /^>(.+)$/.exec(value)))  {return {from: addDays(parseYmd(m[1]), 1), until: null}}
        if ((m = /^<=(.+)$/.exec(value))) {return {from: null, until: parseYmd(m[1])}}
        if ((m = /^<(.+)$/.exec(value)))  {return {from: null, until: addDays(parseYmd(m[1]), -1)}}

        return null
    }

    createControl() {
        let me    = this,
            text  = DateRangeField.toText(me.value),
            items = [{cls: ['go-daterange-text'], text: text || ' '}];

        if (!me.readOnly && !me.disabled) {
            me.value && items.push({tag: 'button', type: 'button', cls: ['go-field-tool', 'go-daterange-clear'], title: t('Clear'), cn: [{tag: 'i', cls: ['go-icon'], text: 'clear'}]});
            items.push({tag: 'button', type: 'button', cls: ['go-field-tool', 'go-daterange-expand'], title: t('Select'), id: me.id + '__expand', cn: [{tag: 'i', cls: ['go-icon'], text: 'expand_more'}]})
        }

        return items
    }

    onBoxClick({path}) {
        let me = this;

        if (me.readOnly || me.disabled) {
            return
        }

        if (path.some(node => node.cls?.includes('go-daterange-clear'))) {
            me.userChange(null);
            return
        }

        path.some(node => node.cls?.includes('go-field-box')) && me.showMenu()
    }

    /** Opens the preset menu below the field */
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
            width   : 240,
            items   : me.menuItems()
        });

        me.menu.on('destroy', () => {me.menu = null})
    }

    closeMenu() {
        const menu = this.menu;

        if (menu && !menu.isDestroyed) {
            menu.getRootMenu().menuFocus = false;
            menu.mounted ? menu.unmount() : menu.destroy()
        }
    }

    /**
     * @returns {Object[]} menu items
     * @protected
     */
    menuItems() {
        let me    = this,
            today = parseYmd(new Date()),
            year  = today.getFullYear(),
            // a parent with a submenu: neo keeps the menu open after its handler
            pick  = (from, until) => () => {
                me.setRange(from, until);
                me.closeMenu()
            },
            years = [];

        for (let y = year - 1; y > year - 9; y--) {
            years.push({id: 'year-' + y, text: String(y), handler: pick(new Date(y, 0, 1), new Date(y, 11, 31)), items: me.quarterItems(y, pick)})
        }

        return [
            {id: 'today',     text: t('Today'),      handler: pick(today, today)},
            {id: 'yesterday', text: t('Yesterday'),  handler: pick(addDays(today, -1), addDays(today, -1))},
            {id: 'thisweek',  text: t('This week'),  handler: pick(weekStart(today), addDays(weekStart(today), 6))},
            {id: 'lastweek',  text: t('Last week'),  handler: pick(addDays(weekStart(today), -7), addDays(weekStart(today), -1))},
            {id: 'thismonth', text: t('This month'), handler: pick(new Date(year, today.getMonth(), 1), addDays(new Date(year, today.getMonth() + 1, 1), -1))},
            {id: 'lastmonth', text: t('Last month'), handler: pick(new Date(year, today.getMonth() - 1, 1), addDays(new Date(year, today.getMonth(), 1), -1))},
            {id: 'thisyear',  text: t('This year'),  handler: pick(new Date(year, 0, 1), new Date(year, 11, 31)), items: me.quarterItems(year, pick)},
            {id: 'years',     text: t('Year'),       items: years},
            {id: 'sep',       separator: true},
            {id: 'custom',    text: t('Custom'),     handler: () => me.openDialog('range')},
            {id: 'from',      text: t('From'),       handler: () => me.openDialog('from')},
            {id: 'until',     text: t('Until'),      handler: () => me.openDialog('until')}
        ]
    }

    /**
     * Q1–Q4 with their months
     * @protected
     */
    quarterItems(year, pick) {
        return [1, 2, 3, 4].map(q => {
            const start = new Date(year, (q - 1) * 3, 1);

            return {
                id     : `q${q}-${year}`,
                text   : 'Q' + q,
                handler: pick(start, addDays(addMonths(start, 3), -1)),
                items  : [0, 1, 2].map(i => {
                    const month = new Date(year, (q - 1) * 3 + i, 1);
                    return {id: `m${month.getMonth()}-${year}`, text: monthName(month.getMonth()), handler: pick(month, addDays(addMonths(month, 1), -1))}
                })
            }
        })
    }

    /**
     * @param {Date|null} from
     * @param {Date|null} until
     */
    setRange(from, until) {
        let value = null;

        if (from && until) {
            from > until && ([from, until] = [until, from]);
            value = toYmd(from) + '..' + toYmd(until)
        } else if (from) {
            value = '>=' + toYmd(from)
        } else if (until) {
            value = '<' + toYmd(addDays(until, 1))
        }

        this.userChange(value)
    }

    /**
     * @param {String} mode 'range', 'from' or 'until'
     * @protected
     */
    openDialog(mode) {
        let me    = this,
            range = me.getRange() || {};

        me.closeMenu();

        const dialog = Neo.create(DateRangeDialog, {
            appName : me.appName,
            windowId: me.windowId,
            mode,
            from    : range.from ? toYmd(range.from) : toYmd(new Date()),
            until   : range.until ? toYmd(range.until) : toYmd(new Date())
        });

        dialog.on('select', ({from, until}) => me.setRange(from, until))
    }
}

/**
 * Custom range / from / until of a DateRangeField
 */
class DateRangeDialog extends Dialog {
    static config = {
        className   : 'GO.form.field.DateRangeDialog',
        cls         : ['go-daterange-dialog'],
        modal       : true,
        headerConfig: headerTools('close'),
        resizable   : false,
        wrapperStyle: {left: 'calc(50vw - 180px)', top: '25vh', width: '360px'},
        containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}},
        /** 'range', 'from' or 'until' */
        mode : 'range',
        from : null,
        until: null
    }

    construct(config) {
        super.construct(config);

        let me    = this,
            mode  = me.mode,
            field = (reference, labelText, value) => ({module: DateField, reference, labelText, labelPosition: 'inline', value, required: true});

        me.title = {range: t('Custom'), from: t('From'), until: t('Until')}[mode];

        me.items = [{
            ntype : 'container',
            cls   : ['go-daterange-dialog-fields'],
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [
                mode !== 'until' && field('from', t('From'), me.from),
                mode !== 'from' && field('until', t('Until'), me.until)
            ].filter(Boolean)
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            items : ['->', {
                module : Button,
                text   : t('Cancel'),
                handler: () => me.close()
            }, {
                module : Button,
                ui     : 'primary',
                text   : t('Ok'),
                handler: () => me.onOk()
            }]
        }]
    }

    onOk() {
        let me    = this,
            from  = me.getReference('from')?.getValueAsDate() || null,
            until = me.getReference('until')?.getValueAsDate() || null;

        if ((me.mode !== 'until' && !from) || (me.mode !== 'from' && !until)) {
            return
        }

        me.fire('select', {from, until});
        me.close()
    }
}

Neo.setupClass(DateRangeDialog);

export default Neo.setupClass(DateRangeField);
