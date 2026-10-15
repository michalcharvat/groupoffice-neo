import TextField from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';

const pad = n => String(n).padStart(2, '0');

/**
 * Date and time in one native datetime-local input. The API value is ISO 8601 with
 * a time zone ("2026-10-15T10:30:00+02:00"); the input shows and edits it in the
 * browser's time zone.
 */
class DateTimeField extends TextField {
    static config = {
        className: 'GO.customfields.DateTimeField',
        inputType: 'datetime-local'
    }

    /**
     * @param {String|null} value ISO 8601 or datetime-local
     * @returns {String|null} "YYYY-MM-DDTHH:mm"
     */
    static toLocal(value) {
        if (!value) {
            return null
        }

        // already local (typed by the user)
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) {
            return value.slice(0, 16)
        }

        const d = new Date(value);

        return isNaN(d) ? null : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    beforeSetValue(value, oldValue) {
        return DateTimeField.toLocal(super.beforeSetValue?.(value, oldValue) ?? value)
    }

    reset(value = null) {
        super.reset(DateTimeField.toLocal(value))
    }

    /**
     * @returns {String|null} ISO 8601 (UTC)
     */
    getSubmitValue() {
        const value = this.value;

        if (!value) {
            return null
        }

        const d = new Date(value);

        return isNaN(d) ? null : d.toISOString().replace(/\.\d{3}Z$/, 'Z')
    }
}

export default Neo.setupClass(DateTimeField);
