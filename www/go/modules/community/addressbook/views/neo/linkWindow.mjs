import {LEVEL_WRITE} from '../../../../../../views/neo/src/Acl.mjs';
import client        from '../../../../../../views/neo/src/jmap/Client.mjs';
import {settings}    from './util.mjs';

/**
 * "Add link" → "Contact" / "Organization" in another item's detail (ExtJS Module.js
 * linkWindow and ContactDialog.setLinkEntity()): a new contact in the item's address book
 * (a contact's), else the user's default one, else the first one the user may write in, linked to the item once it is saved.
 * A person created from an organization gets the organization as its employer instead of
 * a link. See ModuleRegistry `linkWindows`.
 *
 * @param {Object} ctx {appName, windowId, entity, entityId, record}
 * @param {Boolean} isOrganization
 * @returns {Promise<GO.addressbook.view.ContactDialog>}
 */
export default async function openLinkedContact({appName, windowId, entity, entityId, record}, isOrganization) {
    const [{default: ContactDialog}, , {ids: writable}] = await Promise.all([
        import('./view/ContactDialog.mjs'),
        settings.load().catch(e => console.error('addressBookSettings', e)),
        // like the dialog's address book combo
        client.call('AddressBook/query', {filter: {permissionLevel: LEVEL_WRITE}, sort: [{property: 'name', isAscending: true}]})
    ]);

    const ids           = writable.map(String),
          addressBookId = [record?.addressBookId, settings.value?.defaultAddressBookId].map(id => id == null ? null : String(id)).find(id => id && ids.includes(id)) || ids[0] || null,
          employer      = !isOrganization && entity === 'Contact' && !!record?.isOrganization,
          values        = {isOrganization, addressBookId};

    employer && (values.organizationIds = [String(entityId)]);

    const dialog = Neo.create(ContactDialog, {appName, windowId, values});

    employer || dialog.addLinkOnSave(entity, entityId);
    return dialog
}
