import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}  from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'addressbook');

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
    mainView  : () => import('./view/AddressBookMain.mjs')
});
