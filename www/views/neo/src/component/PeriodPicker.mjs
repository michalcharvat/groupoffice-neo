import Component from '../../node_modules/neo.mjs/src/component/Base.mjs';
import {t}       from '../Translate.mjs';

/**
 * Base of MonthPicker and WeekPicker (GOUI picker/MonthPicker, WeekPicker): the year with
 * previous / next buttons above a grid of periods of that year. The selected period is
 * filled, the current one outlined. A click selects a period and fires `select` with
 * {date} (its first day, local midnight).
 *
 * Subclasses return the periods of a year from periods(year): [{date, html, title}].
 */
class PeriodPicker extends Component {
    static config = {
        className: 'GO.component.PeriodPicker',
        baseCls  : ['go-periodpicker'],
        /**
         * First day of the selected period
         * @member {Date} value_=null
         */
        value_: null,
        /**
         * Shown year, the value's year by default
         * @member {Number|null} year_=null
         */
        year_: null,
        _vdom: {cn: [
            {cls: ['go-periodpicker-head'], cn: []},
            {cls: ['go-periodpicker-grid'], cn: []}
        ]}
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([{click: me.onPickerClick, scope: me}]);
        me.year ??= (me.value || new Date()).getFullYear();
        me.renderPicker()
    }

    beforeSetValue(value) {
        if (!value) {
            return null
        }

        const date = value instanceof Date ? value : new Date(value);

        return isNaN(date) ? null : this.periodStart(date)
    }

    afterSetValue(value, oldValue) {
        if (oldValue !== undefined) {
            value && (this.year = value.getFullYear());
            this.renderPicker()
        }
    }

    afterSetYear(value, oldValue) {
        oldValue !== undefined && oldValue !== null && this.renderPicker()
    }

    /**
     * @param {Date} date
     * @returns {Date} first day of the period date is in
     * @protected
     */
    periodStart(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate())
    }

    /**
     * @param {Number} year
     * @returns {Object[]} [{date, html, title}]
     * @protected
     */
    periods(year) {
        return []
    }

    /**
     * @protected
     */
    renderPicker() {
        let me       = this,
            [head, grid] = me.vdom.cn,
            selected = me.value?.getTime(),
            current  = me.periodStart(new Date()).getTime();

        head.cn = [
            {tag: 'button', type: 'button', cls: ['go-periodpicker-nav'], data: {step: '-1'}, title: t('Previous'), cn: [{tag: 'i', cls: ['go-icon'], text: 'chevron_left'}]},
            {tag: 'span', cls: ['go-periodpicker-year'], text: String(me.year)},
            {tag: 'button', type: 'button', cls: ['go-periodpicker-nav'], data: {step: '1'}, title: t('Next'), cn: [{tag: 'i', cls: ['go-icon'], text: 'chevron_right'}]}
        ];

        grid.cn = me.periods(me.year).map(({date, html, title}) => ({
            tag        : 'button',
            type       : 'button',
            cls        : ['go-periodpicker-cell',
                          date.getTime() === selected ? 'go-periodpicker-selected' : '',
                          date.getTime() === current ? 'go-periodpicker-current' : ''].filter(Boolean),
            data       : {date: String(date.getTime())},
            title      : title || null,
            html
        }));

        me.update()
    }

    onPickerClick({path}) {
        let me   = this,
            nav  = path.find(node => node.cls?.includes('go-periodpicker-nav')),
            cell = path.find(node => node.cls?.includes('go-periodpicker-cell'));

        if (nav) {
            me.year += Number(me.dataOf(nav, 'step'));
            return
        }

        if (cell) {
            me.value = new Date(Number(me.dataOf(cell, 'date')));
            me.fire('select', {date: me.value})
        }
    }

    /**
     * @param {Object} node event path node
     * @param {String} name data attribute without "data-"
     * @returns {String|undefined}
     * @protected
     */
    dataOf(node, name) {
        return node.data?.[name]
    }
}

export default Neo.setupClass(PeriodPicker);
