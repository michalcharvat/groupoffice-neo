import client       from '../../../../../../views/neo/src/jmap/Client.mjs';
import SelectSearchDialog from '../../../../../../views/neo/src/link/SelectSearchDialog.mjs';
import {resolveRoute} from '../../../../../../views/neo/src/link/linkTypes.mjs';
import MenuList     from '../../../../../../views/neo/src/menu/List.mjs';
import {notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import {fmt, t as coreT} from '../../../../../../views/neo/src/Translate.mjs';
import {compose}    from '../composer/compose.mjs';
import {imapText, t} from '../../util.mjs';
import {hasModule}  from './attachments.mjs';

const ADDRESS_BOOK = '../../../../../../go/modules/community/addressbook/views/neo/view/ContactDialog.mjs';

/**
 * Menu of an e-mail address in a message (ExtJS AddressContextMenu): compose, search through
 * GroupOffice, show the messages of the sender in the open folder, create a contact or add the
 * address to one, and open the contacts that have the address.
 *
 * @param {GO.email.message.MessagePanel} panel
 * @param {Object} address {email, name, query} (query: "subject=…&body=…" of a mailto: link)
 * @param {String} target DOM id to align the menu to
 */
export async function showAddressMenu(panel, {email, name='', query=''}, target) {
    const host  = panel.getHost(),
          items = [
              {text: t('Compose'), icon: 'edit', handler: () => composeTo(panel, email, name, query)},
              {text: fmt(t('Search through {product_name}'), {product_name: Neo.config.goTitle || 'GroupOffice'}), icon: 'search', handler: () => globalSearch(panel, email)}
          ];

    host && items.push({text: t('Show messages in current folder'), icon: 'filter_list', handler: () => {
        // ExtJS GO.email.searchSender: an IMAP search on the sender in the open folder
        host.advancedSearch = {query: `FROM "${imapText(email)}"`, searchIn: 'current'};
        host.applySearchParams();
        host.reload()
    }});

    if (hasModule('addressbook')) {
        let contacts = [];

        try {
            ({list: contacts} = await client.queryGet('Contact', {
                filter    : {email},
                limit     : 10,
                properties: ['id', 'name', 'isOrganization']
            }))
        } catch (e) {
            console.error('Contacts of', email, e)
        }

        if (panel.isDestroyed) {
            return
        }

        contacts.length && items.push({separator: true}, ...contacts.map(contact => ({
            text   : `${coreT('Open')}: ${contact.name}`,
            icon   : contact.isOrganization ? 'business' : 'person',
            handler: () => openContact(panel, contact.id)
        })));

        items.push({separator: true},
            {text: t('Create contact'), icon: 'person_add', handler: () => createContact(panel, email, name)},
            {text: t('Add to contact'), icon: 'add', handler: () => addToContact(panel, email)});
    }

    MenuList.showAt({appName: panel.appName, windowId: panel.windowId, target, items})
}

/**
 * ExtJS: values from the mailto: query string; the composer opens in the shown account
 * @param {GO.email.message.MessagePanel} panel
 * @param {String} email
 * @param {String} name
 * @param {String} query
 */
function composeTo(panel, email, name, query) {
    const values = {to: name ? `"${name.replace(/["\\]/g, '')}" <${email}>` : email};

    new URLSearchParams(query || '').forEach((value, key) => {
        ['subject', 'body', 'cc', 'bcc'].includes(key.toLowerCase()) && (values[key.toLowerCase()] = value)
    });

    compose({appName: panel.appName, windowId: panel.windowId, accountId: panel.message?.accountId, values})
}

/**
 * The header search of the window with the address (ExtJS go.util.search)
 * @param {GO.email.message.MessagePanel} panel
 * @param {String} email
 */
function globalSearch(panel, email) {
    const search = Neo.manager.Component.find('className', 'GO.view.GlobalSearch')
        .find(c => c.windowId === panel.windowId && !c.isDestroyed);

    if (search) {
        search.open();
        search.getReference('field').value = `"${email}"`
    }
}

/**
 * @param {GO.email.message.MessagePanel} panel
 * @param {Number} id
 */
function openContact(panel, id) {
    const route = resolveRoute('Contact', id);
    route && Neo.Main.setRoute({value: route, windowId: panel.windowId})
}

/**
 * ExtJS: a new contact with the name split in first and last name
 * @param {GO.email.message.MessagePanel} panel
 * @param {String} email
 * @param {String} name
 */
async function createContact(panel, email, name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean),
          {default: ContactDialog} = await import(ADDRESS_BOOK);

    Neo.create(ContactDialog, {
        appName : panel.appName,
        windowId: panel.windowId,
        values  : {
            firstName     : parts.shift() || '',
            lastName      : parts.join(' '),
            emailAddresses: [{type: 'work', email}]
        }
    })
}

/**
 * ExtJS: pick a contact, its dialog opens with the address added
 * @param {GO.email.message.MessagePanel} panel
 * @param {String} email
 */
function addToContact(panel, email) {
    const dialog = Neo.create(SelectSearchDialog, {appName: panel.appName, windowId: panel.windowId, title: t('Add to contact')});

    dialog.on('select', async ({records}) => {
        const contact = records.find(r => r.entity === 'Contact');

        if (!contact) {
            return
        }

        try {
            const [current] = await client.get('Contact', [contact.entityId], ['id', 'emailAddresses']),
                  addresses = current?.emailAddresses || [];

            addresses.some(a => String(a.email).toLowerCase() === email.toLowerCase()) || await client.set('Contact', {
                update: {[contact.entityId]: {emailAddresses: [...addresses, {type: 'work', email}]}}
            });

            const {default: ContactDialog} = await import(ADDRESS_BOOK);
            Neo.create(ContactDialog, {appName: panel.appName, windowId: panel.windowId, entityId: contact.entityId})
        } catch (e) {
            notifyError(panel, e)
        }
    })
}
