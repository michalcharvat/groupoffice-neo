import Container  from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import AutocompleteChips from '../../../../../../../views/neo/src/form/field/AutocompleteChips.mjs';
import {fieldset} from '../../../../../../../views/neo/src/form/fieldset.mjs';
import {t}        from '../util.mjs';
import {addressBookNames, addressList, dateList, phoneList, select, text, urlList} from './fields.mjs';

/**
 * "Profile" card of My account (ExtJS SettingsProfilePanel): the user's own contact,
 * User.profile, saved with the User. The name follows the account's display name.
 */
class ProfilePanel extends Container {
    static config = {
        className: 'GO.addressbook.view.ProfilePanel',
        baseCls  : ['go-addressbook-profile', 'neo-container'],
        // the same fields (./fields.mjs) as the contact dialog, styled by its sheet: neo loads that
        // only with ContactDialog, and My account can open without one
        cls      : ['go-addressbook-contact-dialog'],
        additionalThemeFiles: ['GO.addressbook.view.ContactDialog'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        style    : {overflowY: 'auto'},
        items    : [
            fieldset('', [
                text('profile.jobTitle', t('Job title')),
                text('profile.department', t('Department')),
                select('profile.gender', t('Gender'), [[null, t('Unknown')], ['M', t('Male')], ['F', t('Female')],
                    ['N', t('Non-binary')], ['P', t("Won't say")]]),
                {
                    // ExtJS OrganizationCombo: ▾ lists the organizations with their address books;
                    // Enter adds the first match, existing organizations only
                    module       : AutocompleteChips,
                    name         : 'profile.organizationIds',
                    labelText    : t('Organizations'),
                    placeholder  : t('Type a name and press Enter'),
                    entity       : 'Contact',
                    jmapFilter   : {isOrganization: true},
                    jmapSort     : [{property: 'name', isAscending: true}],
                    // an AclItemEntity: Contact/get needs addressBookId among the properties
                    properties   : ['id', 'name', 'addressBookId'],
                    recordDetails: addressBookNames
                }
            ]),
            fieldset(t('Communication'), [...phoneList('profile.'), ...addressList('profile.')]),
            fieldset(t('Other'), [...dateList('profile.'), ...urlList('profile.')])
        ].map(item => ({flex: 'none', ...item}))
    }
}

export default Neo.setupClass(ProfilePanel);
