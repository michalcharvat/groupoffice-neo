import Field from './Field.mjs';
import {fmt, t} from '../../Translate.mjs';

const pad = n => String(n).padStart(2, '0');

/**
 * GOUI DurationField: hours and minutes ("1:05").
 *
 * outputFormat (GOUI constructor argument):
 * - 'h:I' (default) "1:05"
 * - 'j'   total minutes as a number (65)
 * - 'iso' ISO 8601 duration ("PT1H5M"), as JMAP durations (calendar events)
 *
 * minValue / maxValue in minutes.
 *
 *     {module: DurationField, name: 'duration', labelText: t('Duration'), outputFormat: 'j', maxValue: 24 * 60}
 */
class DurationField extends Field {
    static config = {
        className: 'GO.form.field.DurationField',
        ntype    : 'go-durationfield',
        baseCls  : ['go-field', 'go-durationfield'],
        /**
         * @member {Number|null} maxValue=null minutes
         */
        maxValue: null,
        /**
         * @member {Number|null} minValue=null minutes
         */
        minValue: null,
        /**
         * 'h:I', 'j' or 'iso'
         * @member {String} outputFormat='h:I'
         */
        outputFormat: 'h:I'
    }

    /** Inputs as typed (onInputChange) */
    hoursText   = ''
    minutesText = ''

    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {change : me.onInputChange, delegate: '.go-field-input', scope: me},
            // GOUI: the whole number is selected on focus, typing replaces it
            {focusin: me.onInputFocus,  delegate: '.go-field-input', scope: me}
        ])
    }

    /**
     * @param {String|Number|null} value
     * @returns {Number|null} minutes
     */
    static toMinutes(value) {
        if (value === null || value === undefined || value === '') {
            return null
        }

        if (typeof value === 'number') {
            return isNaN(value) ? null : Math.round(value)
        }

        let m = /^(-)?(\d+):(\d{1,2})$/.exec(value);

        if (m) {
            return (m[1] ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
        }

        // ISO 8601: P1DT2H30M (days count as 24 hours, seconds are dropped)
        m = /^(-)?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:[\d.]+S)?)?$/.exec(value);

        if (m && value !== 'P' && value !== 'PT') {
            return (m[1] ? -1 : 1) * ((Number(m[2] || 0) * 24 + Number(m[3] || 0)) * 60 + Number(m[4] || 0))
        }

        return /^\d+$/.test(value) ? Number(value) : null
    }

    /**
     * @param {Number|null} minutes
     * @returns {String|Number|null} in outputFormat
     */
    formatMinutes(minutes) {
        if (minutes === null) {
            return null
        }

        const sign = minutes < 0 ? '-' : '',
              abs  = Math.abs(minutes),
              h    = Math.floor(abs / 60),
              i    = abs % 60;

        switch (this.outputFormat) {
            case 'j'  : return minutes;
            case 'iso': return `${sign}PT${h ? h + 'H' : ''}${i || !h ? i + 'M' : ''}`;
            default   : return `${sign}${h}:${pad(i)}`
        }
    }

    beforeSetValue(value) {
        return this.formatMinutes(DurationField.toMinutes(value))
    }

    afterSetValue(value, oldValue) {
        // the inputs show the value; typing updates them in onInputChange()
        [this.hoursText, this.minutesText] = this.shownText();
        super.afterSetValue(value, oldValue)
    }

    /**
     * @returns {Number|null} GOUI getValueAsDateInterval(), in minutes
     */
    getMinutes() {
        return DurationField.toMinutes(this.value)
    }

    createControl() {
        let me       = this,
            [h, i]   = me.shownText(),
            flags    = me.inputFlags(),
            input    = (name, value, maxLength) => ({
                tag         : 'input',
                id          : me.id + '__' + name,
                type        : 'text',
                inputmode   : 'numeric',
                autocomplete: 'off',
                cls         : ['go-field-input', 'go-duration-' + name],
                name,
                maxLength,
                placeholder : '--',
                value,
                ...flags
            });

        return [
            input('hours', h, 5),
            {tag: 'span', cls: ['go-duration-sep'], text: ':'},
            input('minutes', i, 2)
        ]
    }

    onInputFocus({target}) {
        target?.id && Neo.main.DomAccess.selectNode({id: target.id, windowId: this.windowId}).catch(() => {})
    }

    async onInputChange({target, value}) {
        let me      = this,
            isHours = target?.cls?.includes('go-duration-hours'),
            node    = me.boxNode.cn.find(n => n.name === (isHours ? 'hours' : 'minutes'));

        // the inputs as typed, before any await: a change of the other input may follow at once
        isHours ? (me.hoursText = String(value ?? '').trim()) : (me.minutesText = String(value ?? '').replace(/\D/g, ''));

        const hText    = me.hoursText,
              mText    = me.minutesText,
              digits   = hText.replace(/\D/g, ''),
              negative = hText.startsWith('-'),
              minutes  = Math.min(59, parseInt(mText, 10) || 0);

        // the vnode must hold what was typed, else a normalised value equal to the old
        // one (typed "x" → "") leaves the typed text in the input
        if (node) {
            node.value = value ?? '';
            await me.promiseUpdate()
        }

        if (me.isDestroyed) {
            return
        }

        me.userChange(!digits && !mText ? null : me.formatMinutes((negative ? -1 : 1) * ((parseInt(digits, 10) || 0) * 60 + minutes)));

        // "7" → "07", "75" → "59": the inputs show the parsed value
        me.renderControl()
    }

    /**
     * @returns {String[]} [hours, minutes] as shown for the value
     * @protected
     */
    shownText() {
        const minutes = this.getMinutes(),
              abs     = minutes === null ? null : Math.abs(minutes);

        return abs === null ? ['', ''] : [(minutes < 0 ? '-' : '') + Math.floor(abs / 60), pad(abs % 60)]
    }

    getError() {
        let me      = this,
            error   = super.getError(),
            minutes = me.getMinutes(),
            show    = m => `${Math.floor(m / 60)}:${pad(m % 60)}`;

        if (error || minutes === null) {
            return error
        }

        if (me.maxValue !== null && minutes > me.maxValue) {
            return fmt(t('The maximum duration is {duration}'), {duration: show(me.maxValue)})
        }

        if (me.minValue !== null && minutes < me.minValue) {
            return fmt(t('The minimum duration is {duration}'), {duration: show(me.minValue)})
        }

        return null
    }
}

export default Neo.setupClass(DurationField);
