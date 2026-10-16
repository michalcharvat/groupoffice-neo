import Container    from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import JmapComboBox from '../../../../../../../views/neo/src/form/field/JmapComboBox.mjs';
import {LEVEL_WRITE} from '../../../../../../../views/neo/src/Acl.mjs';
import {fieldset}   from '../../../../../../../views/neo/src/form/fieldset.mjs';
import {settings, t} from '../util.mjs';
import {select}     from './fields.mjs';

/**
 * Address book card of My account (ExtJS SettingsPanel): User.addressBookSettings,
 * saved with the User.
 */
class SettingsPanel extends Container {
    static config = {
        className: 'GO.addressbook.view.SettingsPanel',
        baseCls  : ['go-addressbook-settings', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [fieldset(t('Display options for address books'), [{
            module    : JmapComboBox,
            name      : 'addressBookSettings.defaultAddressBookId',
            entity    : 'AddressBook',
            jmapFilter: {permissionLevel: LEVEL_WRITE},
            jmapSort  : [{property: 'name', isAscending: true}],
            properties: ['id', 'name'],
            labelText : t('Default address book'),
            labelPosition: 'inline'
        }, select('addressBookSettings.startIn', t('Start in'), [
            ['allcontacts', t('All contacts')],
            ['starred', t('Starred')],
            ['default', t('Default address book')],
            ['remember', t('Last selected address book')]
        ], {clearable: false})])]
    }

    /**
     * After a save the address book module reads the new settings (UserSettingsDialog
     * calls onLoad() after every load)
     */
    onLoad(user) {
        user?.addressBookSettings && (settings.value = {...settings.value, ...user.addressBookSettings})
    }
}

export default Neo.setupClass(SettingsPanel);
