import NumberField  from '../../node_modules/neo.mjs/src/form/field/Number.mjs';
import TextField    from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox from '../form/field/BoolCheckBox.mjs';
import LocalCombo   from '../form/field/LocalCombo.mjs';
import TextList     from '../list/TextList.mjs';

/**
 * Field configs of System settings cards. Names are setting keys: "settings.<name>"
 * (GO.systemsettings.SettingsPanel binds them to Module.settings).
 */

/**
 * @param {String} name
 * @param {String} labelText
 * @param {Object} [config]
 * @returns {Object}
 */
export function textField(name, labelText, config = {}) {
    return {module: TextField, name: 'settings.' + name, labelText, labelPosition: 'inline', ...config}
}

/**
 * Whole numbers; no upper limit unless given (neo's NumberField defaults to 100; null would clamp to 0 on blur)
 * @param {String} name
 * @param {String} labelText
 * @param {Object} [config]
 * @returns {Object}
 */
export function numberField(name, labelText, config = {}) {
    return {module: NumberField, name: 'settings.' + name, labelText, labelPosition: 'inline', stepSize: 1, maxValue: Number.MAX_SAFE_INTEGER, ...config}
}

/**
 * @param {String} name
 * @param {String} valueLabel
 * @param {Object} [config]
 * @returns {Object}
 */
export function checkField(name, valueLabel, config = {}) {
    return {module: BoolCheckBox, name: 'settings.' + name, valueLabel, ...config}
}

/**
 * Combo over fixed options
 * @param {String} name
 * @param {String} labelText
 * @param {Array[]} options [[value, text]]
 * @param {Object} [config]
 * @returns {Object}
 */
export function selectField(name, labelText, options, config = {}) {
    return {
        module       : LocalCombo,
        name         : 'settings.' + name,
        labelText,
        labelPosition: 'inline',
        width        : null,
        displayField : 'name',
        valueField   : 'id',
        editable     : false,
        listConfig   : {module: TextList},
        store        : {keyProperty: 'id', data: options.map(([id, name]) => ({id, name}))},
        ...config
    }
}

/**
 * Explanation below a field (ExtJS hint)
 * @param {String} text
 * @returns {Object}
 */
export function hint(text) {
    return {ntype: 'component', cls: ['go-field-hint'], flex: 'none', text}
}
