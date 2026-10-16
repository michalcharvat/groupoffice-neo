import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}  from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'addressbook');

const userSettings = [{
    title  : t('Address book'),
    iconCls: 'fa fa-address-book',
    panel  : () => import('./view/SettingsPanel.mjs')
}, {
    title  : t('Profile'),
    iconCls: 'fa fa-id-card',
    panel  : () => import('./view/ProfilePanel.mjs')
}];

ModuleRegistry.register({
    package   : 'community',
    name      : 'addressbook',
    title     : t('Address book'),
    iconCls   : 'fa fa-address-book',
    capability: 'go:community:addressbook',
    // Material icon in the header's main menu
    icon      : 'import_contacts',
    // header "+" menu: calls the main view's onQuickAdd()
    quickAdd  : {text: t('Contact'), icon: 'person'},
    // header search results: entity → route below "#addressbook/"
    routes    : {Contact: id => 'contact/' + id},
    // the user's address book settings first: the grid's name column and sort follow sortBy
    mainView  : async () => {
        const [view, {settings}] = await Promise.all([import('./view/AddressBookMain.mjs'), import('./util.mjs')]);

        await settings.load().catch(e => console.error('addressBookSettings', e));
        return view
    },
    // cards in My account (ExtJS userSettingsPanels); an array of cards needs
    // ModuleRegistry.loadSettingsPanels() (neo-ui "system settings" card), before that only the first
    userSettings: typeof ModuleRegistry.loadSettingsPanels === 'function' ? userSettings : userSettings[0],
    // Contact field types and the contact field set filter for the custom fields admin
    customFieldsAdmin: () => import('./customFieldsAdmin.mjs'),
    // card in System settings (ExtJS systemSettingsPanels)
    systemSettings: {
        title  : t('Address book'),
        iconCls: 'fa fa-address-book',
        panel  : () => import('./view/SystemSettingsPanel.mjs')
    }
});
