import Hidden         from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Hidden.mjs';
import TextArea       from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField      from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import Button         from '../../../../../../../views/neo/src/button/Button.mjs';
import ArrayField     from '../../../../../../../views/neo/src/form/field/ArrayField.mjs';
import ContainerField from '../../../../../../../views/neo/src/form/field/ContainerField.mjs';
import DateField      from '../../../../../../../views/neo/src/form/field/DateField.mjs';
import LocalCombo     from '../../../../../../../views/neo/src/form/field/LocalCombo.mjs';
import TextList       from '../../../../../../../views/neo/src/list/TextList.mjs';
import {lookup}       from '../../../../../../../views/neo/src/Translate.mjs';
import {t, typeOptions} from '../util.mjs';

/**
 * Field configs shared by the contact dialog and the profile card in My account
 * (ExtJS EmailAddressesField, PhoneNumbersField, AddressesField, DatesField, UrlsField).
 * `prefix` puts them below a property, e.g. 'profile.' for User.profile.
 */

/**
 * Combo over fixed options
 * @param {String} name
 * @param {String} labelText
 * @param {Array[]} options [[id, name]]
 * @param {Object} [config]
 * @returns {Object}
 */
export function select(name, labelText, options, config = {}) {
    return {
        module       : LocalCombo,
        name,
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
 * @param {String} name
 * @param {String} labelText
 * @param {Object} [config]
 * @returns {Object}
 */
export const text = (name, labelText, config = {}) => ({module: TextField, name, labelText, labelPosition: 'inline', ...config});

/**
 * ArrayField of typed values (FormGroup in ExtJS): type combo, the value field(s), remove
 * button; an "add" button below
 * @param {String} name e.g. 'emailAddresses'
 * @param {String} langKey e.g. 'emailTypes'
 * @param {String} defaultType
 * @param {Function} valueFields () => field configs
 * @param {String} addText
 * @param {String} addIcon
 * @returns {Object[]} the ArrayField and its add button
 */
export function typedList(name, langKey, defaultType, valueFields, addText, addIcon) {
    const reference = name.replace(/\./g, '-') + 'Field';

    return [{
        module    : ArrayField,
        name,
        reference,
        flex      : 'none',
        style     : {gap: '8px'},
        buildField: () => ({
            module: ContainerField,
            cls   : ['go-ab-row'],
            style : {gap: '8px'},
            items : [
                {module: Hidden, name: 'id'},
                select('type', t('Type'), typeOptions(langKey), {width: 140, flex: 'none', clearable: false}),
                ...valueFields(),
                ArrayField.removeButton({flex: 'none'})
            ]
        })
    }, {
        module : Button,
        ui     : 'secondary',
        icon   : addIcon,
        text   : addText,
        flex   : 'none',
        style  : {alignSelf: 'start'},
        // the ArrayField is the button's sibling
        handler: data => data.component.parent.getReference(reference).addValue({type: defaultType})
    }]
}

export const emailList = (prefix = '') => typedList(prefix + 'emailAddresses', 'emailTypes', 'work',
    () => [text('email', t('E-mail'), {flex: 1, required: true, inputType: 'email'})],
    t('Add e-mail address'), 'email');

export const phoneList = (prefix = '') => typedList(prefix + 'phoneNumbers', 'phoneTypes', 'work',
    () => [text('number', t('Number'), {flex: 1, required: true})],
    t('Add phone number'), 'phone');

export const dateList = (prefix = '') => typedList(prefix + 'dates', 'dateTypes', 'birthday',
    () => [{module: DateField, name: 'date', labelText: t('Date'), labelPosition: 'inline', required: true, flex: 1}],
    t('Add date'), 'event');

export const urlList = (prefix = '') => typedList(prefix + 'urls', 'urlTypes', 'homepage',
    () => [text('url', 'URL', {flex: 1, required: true})],
    t('Add online url'), 'home');

/**
 * Addresses: street, ZIP, city, state, country (the server fills the country name from
 * countryCode); latitude/longitude kept
 * @param {String} [prefix]
 * @returns {Object[]}
 */
export const addressList = (prefix = '') => typedList(prefix + 'addresses', 'addressTypes', 'work', () => [{
    ntype : 'container',
    flex  : 1,
    layout: {ntype: 'vbox', align: 'stretch'},
    style : {gap: '8px'},
    items : [
        {module: TextArea, name: 'address', labelText: t('Address'), labelPosition: 'inline', height: 72},
        {
            ntype : 'container',
            layout: {ntype: 'hbox', align: 'start'},
            style : {gap: '8px'},
            items : [
                text('zipCode', t('ZIP code'), {width: 120, flex: 'none'}),
                text('city', t('City'), {flex: 1})
            ]
        }, {
            ntype : 'container',
            layout: {ntype: 'hbox', align: 'start'},
            style : {gap: '8px'},
            items : [
                text('state', t('State'), {flex: 1}),
                select('countryCode', t('Country'), Object.entries(lookup('countries') || {})
                    .sort((a, b) => String(a[1]).localeCompare(String(b[1]))), {flex: 1, editable: true})
            ]
        },
        {module: Hidden, name: 'latitude'},
        {module: Hidden, name: 'longitude'}
    ]
}], t('Add street address'), 'add_location');
