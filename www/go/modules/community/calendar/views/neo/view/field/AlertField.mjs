import {translator} from '../../../../../../../../views/neo/src/Translate.mjs';
import {durationText, parseDuration} from '../../util/date.mjs';
import SelectField  from '../../../../../../../../views/neo/src/form/field/SelectField.mjs';

const t = translator('community', 'calendar');

/**
 * Reminder of an event or a calendar's default reminders (GOUI AlertField).
 *
 * Form value: {1: {trigger: {offset: '-PT15M'}}}, {} for "Default" (useDefaultAlerts) or
 * null for none. Internally the selected option is the offset, 'default' or null.
 */
class AlertField extends SelectField {
    static config = {
        className: 'GO.calendar.field.AlertField',
        name     : 'alerts',
        /**
         * Options for full day events (at 9:00)
         * @member {Boolean} fullDay_=false
         */
        fullDay_: false,
        /**
         * The calendar's default reminders: no "Default" option
         * @member {Boolean} isForDefault=false
         */
        isForDefault: false
    }

    /** @member {String} defaultText label of the "Default" option */
    defaultText = ''

    construct(config) {
        config.labelText ??= t('Reminder');
        super.construct(config);
        this.drawOptions()
    }

    /**
     * The event uses the calendar's reminders
     * @returns {Boolean}
     */
    get useDefault() {
        return this.value === 'default'
    }

    afterSetFullDay(value, oldValue) {
        oldValue !== undefined && this.drawOptions()
    }

    drawOptions() {
        let me   = this,
            opts = me.fullDay ? [
                {value: 'P0D',   text: t('At the start day') + ' (9:00)'},
                {value: '-P1D',  text: `1 ${t('day')} ${t('before')} (9:00)`},
                {value: '-P2D',  text: `2 ${t('days')} ${t('before')} (9:00)`},
                {value: '-P7D',  text: `1 ${t('week')} ${t('before')} (9:00)`}
            ] : [
                {value: 'P0D',    text: t('At the start')},
                {value: '-PT5M',  text: `5 ${t('minutes')} ${t('before')}`},
                {value: '-PT10M', text: `10 ${t('minutes')} ${t('before')}`},
                {value: '-PT15M', text: `15 ${t('minutes')} ${t('before')}`},
                {value: '-PT1H',  text: `1 ${t('hour')} ${t('before')}`},
                {value: '-PT2H',  text: `2 ${t('hours')} ${t('before')}`},
                {value: '-P1D',   text: `1 ${t('day')} ${t('before')}`},
                {value: '-P2D',   text: `2 ${t('days')} ${t('before')}`},
                {value: '-P7D',   text: `1 ${t('week')} ${t('before')}`}
            ];

        if (!me.isForDefault) {
            opts.unshift({value: 'default', text: t('Default') + (me.defaultText ? ` (${me.defaultText})` : '')})
        }

        opts.unshift({value: null, text: t('None')});

        // a stored offset that is not in the list
        const v = me.value;
        v && v !== 'default' && !opts.some(o => o.value === v) && opts.push({value: v, text: durationText(v)});

        me.options = opts
    }

    beforeSetValue(value) {
        if (!value) {
            return null
        }

        if (typeof value === 'string') {
            return value
        }

        const first = Object.values(value)[0];

        if (!first) {
            // {}: the calendar's default
            return this.isForDefault ? null : 'default'
        }

        return first.trigger?.offset || first.trigger?.when || null
    }

    afterSetValue(value, oldValue) {
        super.afterSetValue(value, oldValue);
        value && value !== 'default' && !this.options.some(o => o.value === value) && this.drawOptions()
    }

    getSubmitValue() {
        const v = this.value;
        return v && v !== 'default' ? {1: {trigger: {offset: v}}} : (v === 'default' ? {} : null)
    }

    /**
     * Shows the calendar's default in the "Default" option
     * @param {Object|null} alerts Calendar.defaultAlertsWithTime / WithoutTime
     */
    setDefaultLabel(alerts) {
        const first  = alerts && Object.values(alerts)[0],
              offset = first?.trigger?.offset;

        this.defaultText = offset && parseDuration(offset) ? durationText(offset) : t('None');
        this.drawOptions()
    }
}

export default Neo.setupClass(AlertField);
