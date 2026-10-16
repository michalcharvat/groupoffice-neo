import BoolCheckBox      from '../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import AutocompleteChips from '../../../../../../views/neo/src/form/field/AutocompleteChips.mjs';
import {registerFieldSetExtension} from '../../../../../../views/neo/src/customfields/admin/FieldSetDialog.mjs';
import {registerFieldType, select, text} from '../../../../../../views/neo/src/customfields/admin/fieldTypes.mjs';
import {t} from './util.mjs';

/**
 * The address book's parts of the custom fields admin (loaded by the registry entry's
 * `customFieldsAdmin`): the Contact / Multiple Contacts field types
 * (customfield/ContactDialog.js, MultiContactDialog.js) and the contact field set's
 * "Enable for" and address book filter (CustomFieldSetDialog.js).
 */

const check = (name, valueLabel, config = {}) => ({module: BoolCheckBox, name, valueLabel, flex: 'none', ...config});

/**
 * "Show": all, contacts or organizations. options.isOrganization is null / false / true; the
 * combo works with 'all' / 0 / 1 (LocalCombo matches false and true loosely; '' would match 0)
 * @returns {Object}
 */
const showFor = () => select('options.isOrganization', t('Show'), [['all', t('All')], [0, t('Contacts')], [1, t('Organizations')]], {value: 0});

/**
 * A loaded field without isOrganization shows "All"
 * @param {Object} data
 */
function loadContactOptions(data) {
    data.id && data.options && (data.options.isOrganization ??= 'all')
}

const addressBooks = (name, config = {}) => ({
    module       : AutocompleteChips,
    name,
    entity       : 'AddressBook',
    jmapSort     : [{property: 'name', isAscending: true}],
    labelText    : t('Address books'),
    labelPosition: 'inline',
    flex         : 'none',
    ...config
});

/**
 * options.isOrganization back to null / false / true
 * @param {Object} data Field/set data
 */
function contactOptions(data) {
    if (data.options && 'isOrganization' in data.options) {
        const v = data.options.isOrganization;
        data.options.isOrganization = v === 'all' || v === '' || v === null || v === undefined ? null : !!Number(v)
    }
}

registerFieldType('Contact', {
    label: t('Contact'),
    icon : 'person',
    items: dialog => ({
        general: [
            // the type can only be chosen for a new field
            ...dialog.entityId ? [] : [select('type', t('Type'), [['Contact', t('Contact')], ['MultiContact', t('Multiple Contacts')]], {value: 'Contact'})],
            showFor(),
            check('options.allowNew', t('Allow new'), {value: true}),
            addressBooks('options.addressBookId')
        ],
        validation: [
            {ntype: 'component', tag: 'h3', cls: ['go-fieldset-legend'], flex: 'none', text: t('Information panel')},
            check('options.showInformationPanel', t('Show selections in the information panel'), {value: true}),
            check('options.expandByDefault', t('Expand panel by default'), {value: true}),
            text('options.informationPanelTitle', t('Title'))
        ]
    }),
    beforeLoad: loadContactOptions,
    beforeSave: data => {
        contactOptions(data);

        // the information panel is for a single contact
        if (data.type === 'MultiContact' && data.options) {
            delete data.options.showInformationPanel;
            delete data.options.expandByDefault;
            delete data.options.informationPanelTitle
        }
    }
});

registerFieldType('MultiContact', {
    label    : t('Multiple Contacts'),
    icon     : 'group',
    // chosen as "Multiple Contacts" in a new Contact field
    hideInNew: true,
    items    : () => ({validation: [
        showFor(),
        check('options.allowNew', t('Allow new'), {value: true}),
        addressBooks('options.addressBookId')
    ]}),
    beforeLoad: loadContactOptions,
    beforeSave: contactOptions
});

// field set: helper fields, turned into the filter on save
const HELPERS = ['enableFor', 'enableAddressBookFilter', 'filterAddressBookIds'];

registerFieldSetExtension('Contact', {
    items: dialog => [
        select('enableFor', t('Enable for'), [['all', t('All')], ['contacts', t('Contacts')], ['organizations', t('Organizations')]], {
            reference: 'cfEnableFor'
        }),
        check('enableAddressBookFilter', t('Only show this field set for selected address books'), {
            reference: 'cfEnableAddressBookFilter',
            listeners: {change: ({component}) => {
                const chips = dialog.getReference('cfAddressBooks');
                chips && (chips.disabled = !component.checked)
            }}
        }),
        addressBooks('filterAddressBookIds', {reference: 'cfAddressBooks', disabled: true})
    ],

    beforeLoad: data => {
        const filter = data.filter && !Array.isArray(data.filter) ? data.filter : {};

        data.enableFor               = filter.isOrganization === true ? 'organizations' : filter.isOrganization === false ? 'contacts' : 'all';
        data.enableAddressBookFilter = !!filter.addressBookId?.length;
        data.filterAddressBookIds    = filter.addressBookId || []
    },

    beforeSave: (data, dialog) => {
        const changed = HELPERS.some(key => key in data);

        HELPERS.forEach(key => delete data[key]);

        if (!changed) {
            return
        }

        const original  = dialog.form.entityData.filter,
              filter    = {...original && !Array.isArray(original) ? original : {}},
              enableFor = dialog.getReference('cfEnableFor').getSubmitValue(),
              ids       = dialog.getReference('cfAddressBooks').getSubmitValue() || [];

        delete filter.isOrganization;
        delete filter.addressBookId;

        enableFor === 'contacts'      && (filter.isOrganization = false);
        enableFor === 'organizations' && (filter.isOrganization = true);
        dialog.getReference('cfEnableAddressBookFilter').checked && ids.length && (filter.addressBookId = ids);

        data.filter = filter
    }
});
