import TextArea from '../../../node_modules/neo.mjs/src/form/field/TextArea.mjs';

/**
 * A list of strings, one per line (instead of ExtJS FormGroup with a text field per
 * entry): the value is an array, empty lines are dropped.
 *
 *     {module: LinesField, name: 'settings.corsAllowOrigin', labelText: t('CORS origins')}
 */
class LinesField extends TextArea {
    static config = {
        className    : 'GO.form.field.LinesField',
        labelPosition: 'inline'
    }

    /**
     * @param {String[]|String|null} value
     * @param {String} oldValue
     * @returns {String}
     */
    beforeSetValue(value, oldValue) {
        Array.isArray(value) && (value = value.join('\n'));
        return super.beforeSetValue(value, oldValue)
    }

    /**
     * @returns {String[]}
     */
    getSubmitValue() {
        return String(super.getSubmitValue() ?? '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    }
}

export default Neo.setupClass(LinesField);
