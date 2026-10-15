import NumberField   from '../../node_modules/neo.mjs/src/form/field/Number.mjs';
import PasswordField from '../../node_modules/neo.mjs/src/form/field/Password.mjs';
import TextField     from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox  from '../form/field/BoolCheckBox.mjs';
import ChipsField    from '../form/field/ChipsField.mjs';
import LocalCombo    from '../form/field/LocalCombo.mjs';
import client        from '../jmap/Client.mjs';
import TextList      from '../list/TextList.mjs';
import {t}           from '../Translate.mjs';

/**
 * Fields of the server profiles of the IMAP and LDAP authenticators (ServerForm.js of both
 * modules), entity properties by name
 */

/**
 * @param {Object} module neo field class
 * @param {String} name
 * @param {String|null} labelText
 * @param {Object} [config]
 * @returns {Object}
 */
export function field(module, name, labelText, config = {}) {
    return {module, name, labelText, labelPosition: 'inline', ...config}
}

export const text     = (name, label, config) => field(TextField, name, label, config);
export const password = (name, label, config) => field(PasswordField, name, label, {autoComplete: 'new-password', ...config});
export const number   = (name, label, config) => field(NumberField, name, label, {stepSize: 1, minValue: 0, ...config});
export const check    = (name, valueLabel, config = {}) => ({module: BoolCheckBox, name, valueLabel, ...config});

/**
 * Explanation below a field
 * @param {String} text
 * @returns {Object}
 */
export function hint(text) {
    return {ntype: 'component', cls: ['go-field-hint'], flex: 'none', text}
}

/**
 * TLS / SSL / None
 * @param {String} name
 * @returns {Object}
 */
export function encryption(name) {
    return field(LocalCombo, name, t('Encryption'), {
        width       : null,
        displayField: 'name',
        valueField  : 'id',
        editable    : false,
        listConfig  : {module: TextList},
        store       : {keyProperty: 'id', data: [{id: 'tls', name: 'TLS'}, {id: 'ssl', name: 'SSL'}, {id: '', name: t('None')}]}
    })
}

/**
 * Mail domains of the profile: [{name}], typed as chips
 * @returns {Object}
 */
export function domains() {
    return field(ChipsField, 'domains', t('Domains'), {
        textInputToValue: text => text.trim() ? {name: text.trim().toLowerCase()} : null,
        chipRenderer    : value => value?.name || ''
    })
}

/**
 * Groups new users join: [{groupId}], a typed name picks the first matching group
 * @returns {Object}
 */
export function groups() {
    return field(ChipsField, 'groups', t('Groups'), {
        placeholder     : t('Type a group name and press Enter'),
        textInputToValue: async text => {
            const {ids} = await client.queryGet('Group', {filter: {text, hideUsers: true}, limit: 1, properties: ['id']});
            return ids.length ? {groupId: parseInt(ids[0])} : null
        },
        chipRenderer    : async value => (await client.get('Group', [value.groupId], ['id', 'name']))[0]?.name || String(value.groupId)
    })
}

/**
 * The encryption combos show '' for "None", the server stores null
 * @param {Object} data values to send (mutated)
 * @param {String[]} names encryption properties
 */
export function encryptionToServer(data, names) {
    names.forEach(name => name in data && data[name] === '' && (data[name] = null))
}
