import Container  from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import ChipsField from '../../../../../../../views/neo/src/form/field/ChipsField.mjs';
import {fieldset} from '../../../../../../../views/neo/src/form/fieldset.mjs';
import client     from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {t}        from '../util.mjs';
import {addressList, dateList, phoneList, select, text, urlList} from './fields.mjs';

/**
 * "Profile" card of My account (ExtJS SettingsProfilePanel): the user's own contact,
 * User.profile, saved with the User. The name follows the account's display name.
 */
class ProfilePanel extends Container {
    static config = {
        className: 'GO.addressbook.view.ProfilePanel',
        baseCls  : ['go-addressbook-profile', 'neo-container'],
        cls      : ['go-addressbook-contact-dialog'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        style    : {overflowY: 'auto'},
        items    : [
            fieldset('', [
                text('profile.jobTitle', t('Job title')),
                text('profile.department', t('Department')),
                select('profile.gender', t('Gender'), [[null, t('Unknown')], ['M', t('Male')], ['F', t('Female')],
                    ['N', t('Non-binary')], ['P', t("Won't say")]]),
                {
                    module          : ChipsField,
                    name            : 'profile.organizationIds',
                    labelText       : t('Organizations'),
                    placeholder     : t('Type a name and press Enter'),
                    // existing organizations only: the profile card has no address book to create one in
                    textInputToValue: async name => {
                        const {list} = await client.queryGet('Contact', {
                            filter    : {isOrganization: true, name: String(name || '').trim()},
                            limit     : 1,
                            properties: ['id', 'name', 'addressBookId']
                        });
                        return list[0]?.id || null
                    },
                    // an AclItemEntity: Contact/get needs addressBookId among the properties
                    chipRenderer: async id => (await client.get('Contact', [id], ['id', 'name', 'addressBookId']))[0]?.name || String(id)
                }
            ]),
            fieldset(t('Communication'), [...phoneList('profile.'), ...addressList('profile.')]),
            fieldset(t('Other'), [...dateList('profile.'), ...urlList('profile.')])
        ].map(item => ({flex: 'none', ...item}))
    }
}

export default Neo.setupClass(ProfilePanel);
