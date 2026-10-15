import NeoDateField from '../../../node_modules/neo.mjs/src/form/field/Date.mjs';
import {parseYmd, toYmd} from '../../DateUtil.mjs';

/**
 * GOUI DateField: native date input with neo's date picker, value "Y-m-d". A value
 * with a time part ("2026-10-16T10:00:00Z", a Date) keeps only the date.
 *
 *     {module: DateField, name: 'dueAt', labelText: t('Due'), labelPosition: 'inline', minValue: '2026-01-01'}
 */
class DateField extends NeoDateField {
    static config = {
        className: 'GO.form.field.DateField',
        ntype    : 'go-datefield'
    }

    beforeSetValue(value, oldValue) {
        if (value instanceof Date) {
            value = isNaN(value) ? null : toYmd(value)
        } else if (typeof value === 'string' && value.length > 10) {
            value = value.substring(0, 10)
        }

        return super.beforeSetValue(value || null, oldValue)
    }

    beforeSetMinValue(value) {
        return value instanceof Date ? toYmd(value) : value
    }

    beforeSetMaxValue(value) {
        return value instanceof Date ? toYmd(value) : value
    }

    reset(value = null) {
        super.reset(value instanceof Date ? toYmd(value) : (typeof value === 'string' ? value.substring(0, 10) : value))
    }

    /**
     * @returns {String|null} "Y-m-d"
     */
    getSubmitValue() {
        return this.value || null
    }

    /**
     * @returns {Date|null} local midnight
     */
    getValueAsDate() {
        return parseYmd(this.value)
    }
}

export default Neo.setupClass(DateField);
