import TextArea       from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import {LEVEL_WRITE}  from '../../../../../../../views/neo/src/Acl.mjs';
import BoolCheckBox   from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import AutocompleteChips from '../../../../../../../views/neo/src/form/field/AutocompleteChips.mjs';
import DateField      from '../../../../../../../views/neo/src/form/field/DateField.mjs';
import JmapComboBox   from '../../../../../../../views/neo/src/form/field/JmapComboBox.mjs';
import {fieldset}     from '../../../../../../../views/neo/src/form/fieldset.mjs';
import client         from '../../../../../../../views/neo/src/jmap/Client.mjs';
import FormWindow     from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import {t}            from '../util.mjs';
import ColorField     from '../../../../../../../views/neo/src/form/field/ColorField.mjs';
import ImageField     from '../../../../../../../views/neo/src/form/field/ImageField.mjs';
import {icdOptions}   from './icd.mjs';
import {addressBookNames, addressList, dateList, emailList, phoneList, select, text, urlList} from './fields.mjs';

const NAME_PARTS = ['firstName', 'middleName', 'lastName'];

/**
 * Create or edit a contact or organization (ExtJS ContactDialog): name (with its parts
 * for persons), photo, colour, job, organizations, address book, e-mail addresses, phone
 * numbers, addresses, dates, URLs; "Business" (organizations) and "Notes" tabs, custom
 * fields.
 *
 * New contacts pass values: {addressBookId, isOrganization}.
 */
class ContactDialog extends FormWindow {
    static config = {
        className : 'GO.addressbook.view.ContactDialog',
        cls       : ['go-form-window', 'go-addressbook-contact-dialog'],
        entityName: 'Contact',
        hasLinks  : true,
        title     : t('Contact'),
        wrapperStyle: {
            height   : '85vh',
            left     : 'calc(50vw - 400px)',
            maxHeight: '90vh',
            top      : '7vh',
            width    : '800px'
        }
    }

    /**
     * The contact is an organization (no field: from values or the loaded entity)
     * @member {Boolean} isOrganization=false
     */
    isOrganization = false

    onConstructed() {
        const result = super.onConstructed(),
              me     = this;

        me.addCard({
            header   : {text: t('Business')},
            reference: 'businessCard',
            cls      : ['go-form-card', 'go-scroll'],
            items    : [
                fieldset(t('Information'), [
                    // ExtJS ICDCombo: the schemes of the first address's country
                    select('icd', t('ICD'), [], {reference: 'icdField', editable: true}),
                    text('registrationNumber', t('Registration number')),
                    text('debtorNumber', t('Customer number'))
                ]),
                fieldset(t('Bank details'), [
                    text('nameBank', t('Name bank')),
                    text('IBAN', 'IBAN'),
                    text('BIC', 'BIC'),
                    {module: BoolCheckBox, name: 'vatReverseCharge', valueLabel: t('Reverse charge VAT')},
                    text('vatNo', t('VAT number'))
                ])
            ]
        });

        me.addCard({
            header: {text: t('Notes')},
            items : [{module: TextArea, name: 'notes', labelText: t('Notes'), labelPosition: 'inline', flex: 1}]
        });

        me.form.on('fieldChange', me.onFieldChange, me);

        // the ICD options before the values are set, so the loaded scheme shows its name
        me.form.on('beforeload', ({data}) => me.updateIcdOptions(data.addresses, data.icd));
        me.updateIcdOptions();

        // another address book: the groups belong to the old one (ExtJS onBeforeSubmit)
        me.form.on('beforesave', ({data, isNew}) => {
            !isNew && 'addressBookId' in data && (data.groups = [])
        });

        me.on('formReady', () => {
            const data = me.form.entityData || {};

            me.isOrganization = !!data.isOrganization;
            me.setOrganization(me.isOrganization);

            me.getReference('saveButton').disabled = !!me.form.currentId && (data.permissionLevel ?? LEVEL_WRITE) < LEVEL_WRITE
        });

        return result
    }

    /**
     * @summary The fields of the contact form.
     * @returns {Object[]}
     */
    createFormItems() {
        const genders = [[null, t('Unknown')], ['M', t('Male')], ['F', t('Female')], ['N', t('Non-binary')], ['P', t("Won't say")]];

        return [{
            ntype : 'container',
            cls   : ['go-scroll', 'go-ab-dialog-scroll'],
            flex  : 1,
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                ntype : 'container',
                flex  : 'none',
                layout: {ntype: 'hbox', align: 'start'},
                style : {gap: '16px'},
                items : [{
                    ntype : 'container',
                    flex  : 1,
                    layout: {ntype: 'vbox', align: 'stretch'},
                    style : {gap: '8px'},
                    items : [{
                        ntype : 'container',
                        flex  : 'none',
                        layout: {ntype: 'hbox', align: 'start'},
                        style : {gap: '8px'},
                        items : [
                            text('name', t('Name'), {reference: 'nameField', required: true, flex: 1}),
                            {module: ColorField, name: 'color', labelText: t('Color'), width: 120, flex: 'none'}
                        ]
                    }, {
                        // NameField's menu in ExtJS: the parts give the name
                        ntype    : 'container',
                        reference: 'nameParts',
                        flex     : 'none',
                        layout   : {ntype: 'vbox', align: 'stretch'},
                        style    : {gap: '8px'},
                        items    : [{
                            ntype : 'container',
                            layout: {ntype: 'hbox', align: 'start'},
                            style : {gap: '8px'},
                            items : [
                                text('firstName', t('First'), {flex: 1}),
                                text('middleName', t('Middle'), {width: 120, flex: 'none'}),
                                text('lastName', t('Last'), {flex: 1}),
                                text('initials', t('Initials'), {width: 90, flex: 'none'})
                            ]
                        }, {
                            ntype : 'container',
                            layout: {ntype: 'hbox', align: 'start'},
                            style : {gap: '8px'},
                            items : [
                                text('prefixes', t('Prefix'), {flex: 1}),
                                text('suffixes', t('Suffix'), {flex: 1}),
                                text('salutation', t('Salutation'), {flex: 2})
                            ]
                        }]
                    }, {
                        ntype : 'container',
                        flex  : 'none',
                        layout: {ntype: 'hbox', align: 'start'},
                        style : {gap: '8px'},
                        items : [
                            text('jobTitle', t('Job title'), {reference: 'jobTitleField', flex: 1}),
                            select('gender', t('Gender'), genders, {reference: 'genderField', width: 160, flex: 'none'})
                        ]
                    }, text('department', t('Department'), {reference: 'departmentField', flex: 'none'})]
                }, {
                    module   : ImageField,
                    name     : 'photoBlobId',
                    reference: 'photoField',
                    flex     : 'none'
                }]
            }, {
                // ExtJS OrganizationCombo: ▾ lists the organizations matching the typed text
                module          : AutocompleteChips,
                name            : 'organizationIds',
                reference       : 'organizationsField',
                labelText       : t('Organizations'),
                flex            : 'none',
                placeholder     : t('Type a name and press Enter'),
                entity          : 'Contact',
                jmapFilter      : {isOrganization: true},
                jmapSort        : [{property: 'name', isAscending: true}],
                // an AclItemEntity: Contact/get needs addressBookId among the properties
                properties      : ['id', 'name', 'addressBookId'],
                // the address book of each organization: equal names in personal address books
                recordDetails   : addressBookNames,
                // Enter: an existing organization or a new one (ExtJS Chips allowNew)
                textInputToValue: text => this.findOrCreateOrganization(text)
            }, {
                module       : JmapComboBox,
                name         : 'addressBookId',
                reference    : 'addressBookField',
                entity       : 'AddressBook',
                jmapFilter   : {permissionLevel: LEVEL_WRITE},
                jmapSort     : [{property: 'name', isAscending: true}],
                properties   : ['id', 'name'],
                labelText    : t('Address book'),
                labelPosition: 'inline',
                required     : true,
                flex         : 'none'
            },
            fieldset(t('Communication'), [
                ...emailList(),
                ...phoneList(),
                select('language', t('Language'), Neo.config.goLanguages || [], {editable: true})
            ]),
            fieldset(t('Addresses'), addressList()),
            fieldset(t('Other'), [
                {module: DateField, name: 'actionAt', labelText: t('Action date'), labelPosition: 'inline', width: 200, flex: 'none'},
                ...dateList(),
                ...urlList()
            ])]
        }]
    }

    /**
     * Organizations chips: the typed name is an existing organization or becomes a new
     * one in the contact's address book (ExtJS Chips allowNew)
     * @param {String} name
     * @returns {Promise<String|null>} organization id
     */
    async findOrCreateOrganization(name) {
        name = String(name || '').trim();

        if (!name) {
            return null
        }

        const {list} = await client.queryGet('Contact', {
            filter    : {isOrganization: true, name, permissionLevel: LEVEL_WRITE},
            sort      : [{property: 'name', isAscending: true}],
            limit     : 10,
            properties: ['id', 'name', 'addressBookId']
        });

        // the name filter matches whole names: anything else is a new organization
        const match = list.find(c => c.name.toLowerCase() === name.toLowerCase());

        if (match) {
            return match.id
        }

        const addressBookId = this.getReference('addressBookField').getSubmitValue(),
              response      = await client.set('Contact', {create: {org: {name, isOrganization: true, addressBookId}}});

        return response.created?.org?.id || null
    }

    /**
     * Name parts → name; the title follows the name
     * @param {Object} data {component, value}
     */
    onFieldChange({component}) {
        let me = this;

        if (me.settingName) {
            return
        }

        if (!me.isOrganization && NAME_PARTS.includes(component?.name)) {
            const name = me.buildFullName();

            if (name) {
                me.settingName = true;
                me.getReference('nameField').value = name;
                me.settingName = false
            }
        }

        if (['addresses', 'countryCode'].includes(component?.name)) {
            const icd = me.getReference('icdField');
            me.updateIcdOptions(me.getReference('addressesField').getSubmitValue(), icd.getSubmitValue())
        }

        component?.name === 'name' || NAME_PARTS.includes(component?.name) ? me.updateTitle() : null
    }

    /**
     * ICD combo: the schemes of the first address with a country (ExtJS loadCountry() on
     * focus, with a "Please add an address with a country" alert when there is none)
     * @param {Object[]} [addresses]
     * @param {String|null} [value] the current ICD, kept as an option
     */
    updateIcdOptions(addresses, value = null) {
        const field       = this.getReference('icdField'),
              countryCode = (addresses || []).find(a => a?.countryCode)?.countryCode || null,
              options     = icdOptions(countryCode, value);

        field.store.data      = options;
        field.placeholderText = countryCode ? '' : t('Please add an address with a country');

        // the store's records changed: select the value's new record
        if (value && options.some(o => o.id === value)) {
            field.value = value
        }
    }

    /**
     * @returns {String} "First Middle Last"
     */
    buildFullName() {
        const fields = this.getReference('nameParts');

        return NAME_PARTS.map(name => fields.down({name})?.value).filter(Boolean).join(' ')
    }

    updateTitle() {
        let me   = this,
            name = me.getReference('nameField')?.value;

        me.title = (me.isOrganization ? t('Organization') : t('Contact')) + (name ? ': ' + name : '')
    }

    /**
     * ExtJS setOrganization(): persons have name parts, gender, department and
     * organizations; organizations a "Business" tab and a line of business
     * @param {Boolean} isOrganization
     */
    setOrganization(isOrganization) {
        let me = this;

        ['nameParts', 'genderField', 'departmentField', 'organizationsField'].forEach(ref => {
            const cmp = me.getReference(ref);
            cmp && (cmp.hidden = isOrganization)
        });

        me.getReference('jobTitleField').labelText = isOrganization ? t('LOB') : t('Job title');
        me.getReference('photoField').placeholderIcon = isOrganization ? 'business' : 'person';

        const cards = me.cards,
              index = cards.getCardContainer().items.indexOf(me.getReference('businessCard'));

        if (index > -1) {
            cards.getTabBar().items[index].hidden = !isOrganization
        }

        me.updateTitle()
    }
}

export default Neo.setupClass(ContactDialog);
