import Field from './Field.mjs';
import {formatDate, userFormat} from '../../Format.mjs';
import {fmt, t} from '../../Translate.mjs';
import {parseYmd, toHi, toIsoLocal, toYmd} from '../../DateUtil.mjs';

const LOCAL = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::\d{2})?)?$/;

/**
 * GOUI DateTimeField: a date and a time input in one field.
 *
 * Value (GOUI outputFormat()):
 * - withTime, withTimeZone (default): ISO 8601 with the local offset, "2026-10-16T10:30:00+02:00"
 * - withTime, no time zone: "2026-10-16T10:30:00" (local, e.g. a calendar event in its own zone)
 * - without time: "2026-10-16"
 *
 * A value with another offset ("…Z") is shown in the browser's time zone. Switching
 * withTime on adds defaultTime (or the current time).
 *
 *     {module: DateTimeField, name: 'start', labelText: t('Start'), withTime: true, minValue: '2026-01-01'}
 */
class DateTimeField extends Field {
    static config = {
        className: 'GO.form.field.DateTimeField',
        ntype    : 'go-datetimefield',
        baseCls  : ['go-field', 'go-datetimefield'],
        /**
         * "H:i" used when the value has no time
         * @member {String|null} defaultTime=null
         */
        defaultTime: null,
        /**
         * Earliest value (same formats as value, or a Date)
         * @member {String|Date|null} minValue_=null
         */
        minValue_: null,
        /**
         * Latest value (same formats as value, or a Date)
         * @member {String|Date|null} maxValue_=null
         */
        maxValue_: null,
        /**
         * @member {Boolean} withTime_=true
         */
        withTime_: true,
        /**
         * @member {Boolean} withTimeZone_=true
         */
        withTimeZone_: true
    }

    /** Shown in the inputs, also while only one of them is filled */
    dateText = ''
    timeText = ''

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({change: me.onInputChange, delegate: '.go-field-input', scope: me})
    }

    afterSetMaxValue() {
        this.renderControl()
    }

    afterSetMinValue() {
        this.renderControl()
    }

    afterSetValue(value, oldValue) {
        let me = this;

        if (value) {
            me.dateText = value.substring(0, 10);
            me.timeText = me.withTime ? me.toDate(value) && toHi(me.toDate(value)) : me.timeText
        } else {
            me.dateText = ''
        }

        super.afterSetValue(value, oldValue);
        // the first value: the inputs were rendered before it was there
        oldValue === undefined && me.renderControl()
    }

    afterSetWithTime(value, oldValue) {
        let me = this;

        if (oldValue !== undefined) {
            !me.timeText && (me.timeText = me.defaultTime || toHi(new Date()));
            me.value = me.compose()
        }
    }

    afterSetWithTimeZone(value, oldValue) {
        oldValue !== undefined && (this.value = this.compose())
    }

    beforeSetValue(value) {
        return this.normalize(value)
    }

    /**
     * @param {String|Date|null} value
     * @returns {String|null} the value in the output format
     * @protected
     */
    normalize(value) {
        let me = this,
            date;

        if (value === null || value === undefined || value === '') {
            return null
        }

        if (value instanceof Date) {
            date = isNaN(value) ? null : value
        } else {
            const local = LOCAL.exec(String(value));

            if (local) {
                date = parseYmd(local[1]);

                if (date && me.withTime) {
                    const [h, i] = (local[2] || me.timeText || me.defaultTime || toHi(new Date())).split(':');
                    date.setHours(Number(h), Number(i))
                }
            } else {
                // an offset or Z: the browser's time zone
                date = new Date(value);
                isNaN(date) && (date = null)
            }
        }

        return date ? me.format(date) : null
    }

    /**
     * @param {Date} date
     * @returns {String}
     * @protected
     */
    format(date) {
        if (!this.withTime) {
            return toYmd(date)
        }

        return this.withTimeZone ? toIsoLocal(date) : toIsoLocal(date).substring(0, 19)
    }

    /**
     * @param {String|null} value a value of this field
     * @returns {Date|null}
     * @protected
     */
    toDate(value) {
        if (!value) {
            return null
        }

        if (!this.withTime) {
            return parseYmd(value)
        }

        const date = LOCAL.exec(value) ? null : new Date(value);

        if (date && !isNaN(date)) {
            return date
        }

        // no offset: local
        const [, ymd, hi = '00:00'] = LOCAL.exec(value) || [],
              local = parseYmd(ymd);

        local?.setHours(...hi.split(':').map(Number));

        return local
    }

    /**
     * @returns {String|null} value from the inputs
     * @protected
     */
    compose() {
        let me = this;

        if (!me.dateText) {
            return null
        }

        return me.normalize(me.withTime ? `${me.dateText}T${me.timeText || me.defaultTime || toHi(new Date())}` : me.dateText)
    }

    createControl() {
        let me       = this,
            flags    = me.inputFlags(),
            min      = me.normalize(me.minValue),
            max      = me.normalize(me.maxValue),
            items    = [{
                tag  : 'input',
                type : 'date',
                cls  : ['go-field-input', 'go-datetime-date'],
                name : 'date',
                value: me.dateText,
                min  : min ? min.substring(0, 10) : null,
                max  : max ? max.substring(0, 10) : null,
                ...flags
            }];

        me.withTime && items.push({
            tag  : 'input',
            type : 'time',
            cls  : ['go-field-input', 'go-datetime-time'],
            name : 'time',
            value: me.timeText || '',
            ...flags
        });

        return items
    }

    onInputChange(data) {
        let me = this;

        if (data.target?.cls?.includes('go-datetime-time')) {
            me.timeText = data.value || ''
        } else {
            me.dateText = data.valid === false ? '' : (data.value || '')
        }

        me.userChange(me.compose())
    }

    /**
     * @returns {Date|null} GOUI getValueAsDateTime()
     */
    getValueAsDate() {
        return this.toDate(this.value)
    }

    getError() {
        let me    = this,
            error = super.getError(),
            date  = me.getValueAsDate(),
            min   = me.toDate(me.normalize(me.minValue)),
            max   = me.toDate(me.normalize(me.maxValue)),
            show  = d => formatDate(d, me.withTime ? userFormat.dateFormat + ' ' + userFormat.timeFormat : userFormat.dateFormat);

        if (error || !date) {
            return error
        }

        if (max && date > max) {
            return fmt(t('Please select a value that is no later than {max}'), {max: show(max)})
        }

        if (min && date < min) {
            return fmt(t('Please select a value that is not earlier than {min}'), {min: show(min)})
        }

        return null
    }
}

export default Neo.setupClass(DateTimeField);
