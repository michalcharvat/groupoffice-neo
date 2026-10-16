import BoolCheckBox  from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import ChipsField    from '../../../../../../../views/neo/src/form/field/ChipsField.mjs';
import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import SettingsPanel from '../../../../../../../views/neo/src/systemsettings/SettingsPanel.mjs';
import {t}           from '../util.mjs';
import {select}      from './fields.mjs';

/**
 * Address book card of System settings (ExtJS SystemSettingsPanel): personal address
 * books for new users and the automatic linking of e-mail (needs the savemailas module).
 * The address book list only matters for "exclude" and "only".
 */
class SystemSettingsPanel extends SettingsPanel {
    static config = {
        className    : 'GO.addressbook.view.SystemSettingsPanel',
        modulePackage: 'community',
        moduleName   : 'addressbook'
    }

    createItems() {
        const saveMailAs = client.hasCapability('go:legacy:savemailas');

        return [{
            module    : BoolCheckBox,
            name      : 'settings.createPersonalAddressBooks',
            valueLabel: t('Create personal address book for each user'),
            flex      : 'none'
        }, select('settings.autoLink', t('Automatic e-mail linking'), [
            ['off', t("Don't link automatically to contacts")],
            ['on', t('Link to all contacts')],
            ['excl', t('Exclude contacts from the address books below')],
            ['incl', t('Only link to the contacts from the address books below')]
        ], {
            reference: 'autoLink',
            clearable: false,
            disabled : !saveMailAs,
            flex     : 'none'
        }), {
            ntype: 'component',
            cls  : ['go-field-hint'],
            flex : 'none',
            text : t('Warning: this will copy e-mails to the Group-Office storage and will therefore increase disk space usage. The e-mail will be visible to all people that can view the contact too.')
        }, {
            module          : ChipsField,
            name            : 'settings.autoLinkAddressBookIds',
            reference       : 'autoLinkAddressBookIds',
            labelText       : t('Address book'),
            placeholder     : t('Type a name and press Enter'),
            disabled        : !saveMailAs,
            hidden          : true,
            flex            : 'none',
            textInputToValue: async name => {
                const {list} = await client.queryGet('AddressBook', {filter: {text: String(name || '').trim()}, limit: 1, properties: ['id']});
                return list[0]?.id || null
            },
            chipRenderer    : async id => (await client.get('AddressBook', [id], ['id', 'name']))[0]?.name || String(id)
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.on({
            load       : () => me.syncAddressBooks(),
            fieldChange: ({component}) => component?.name === 'settings.autoLink' && me.syncAddressBooks()
        })
    }

    /**
     * ExtJS toggleSibling(): the address books only for "excl" and "incl"
     */
    async syncAddressBooks() {
        const mode = await this.getSetting('autoLink');
        this.isDestroyed || (this.getReference('autoLinkAddressBookIds').hidden = !['excl', 'incl'].includes(mode))
    }
}

export default Neo.setupClass(SystemSettingsPanel);
