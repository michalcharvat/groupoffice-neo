import Container       from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Model           from '../../node_modules/neo.mjs/src/data/Model.mjs';
import TabContainer    from '../../node_modules/neo.mjs/src/tab/Container.mjs';
import Toolbar         from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button          from '../button/Button.mjs';
import SearchButton    from '../button/SearchButton.mjs';
import JmapStore       from '../data/JmapStore.mjs';
import EntityCheckList from '../form/field/EntityCheckList.mjs';
import Grid            from '../grid/Grid.mjs';
import client          from '../jmap/Client.mjs';
import ModuleRegistry  from '../ModuleRegistry.mjs';
import {avatarHtml, escapeHtml} from '../Format.mjs';
import {notifyError}   from '../Notify.mjs';
import {fmt, t, translator} from '../Translate.mjs';
import ConfirmDialog   from './ConfirmDialog.mjs';
import Dialog          from './Dialog.mjs';

/** Titles of the newsletters list tabs come from that module's language file */
const tNewsletters = translator('business', 'newsletters');

/** "Add all results" fetches the records in pages of this size */
const PAGE = 500;

class PrincipalModel extends Model {
    static config = {
        className  : 'GO.model.RecipientPickerPrincipal',
        keyProperty: 'id',
        fields     : [
            {name: 'id', type: 'String'},
            {name: 'name', type: 'String'},
            {name: 'email', type: 'String'},
            {name: 'avatarId'}
        ]
    }
}

Neo.setupClass(PrincipalModel);

class ContactModel extends Model {
    static config = {
        className  : 'GO.model.RecipientPickerContact',
        keyProperty: 'id',
        fields     : [
            {name: 'id', type: 'String'},
            {name: 'name', type: 'String'},
            {name: 'emailAddresses'},
            {name: 'isOrganization', type: 'Boolean'}
        ]
    }
}

Neo.setupClass(ContactModel);

/**
 * @summary An address list of the newsletters module (id and name)
 */
class AddressListModel extends Model {
    static config = {
        className  : 'GO.model.RecipientPickerAddressList',
        keyProperty: 'id',
        fields     : [
            {name: 'id', type: 'String'},
            {name: 'name', type: 'String'}
        ]
    }
}

Neo.setupClass(AddressListModel);

const userToRecipient    = r => ({entity: 'User', id: String(r.id), name: r.name || '', email: r.email || null, avatarId: r.avatarId || null}),
      contactToRecipient = r => ({entity: 'Contact', id: String(r.id), name: r.name || '', email: r.emailAddresses?.[0]?.email || null, avatarId: null});

/**
 * A tab of address lists of the newsletters module: the selected lists add their members
 * (classic SelectContactDialogPanel / SelectUserDialogPanel)
 * @param {String} listType 'Contact' or 'User'
 * @param {Function} title
 * @returns {Object} SOURCES entry
 */
const addressListSource = (listType, title) => ({
    title,
    entity    : 'AddressList',
    model     : AddressListModel,
    filter    : {listType},
    properties: ['id', 'name'],
    isList    : true,
    available : () => client.hasCapability('go:business:newsletters'),
    /**
     * @param {String[]} addressListIds
     * @returns {Promise<Object[]>} recipients
     */
    async members(addressListIds) {
        const filter = {addressListId: addressListIds, ...(listType === 'Contact' ? {hasEmailAddresses: true} : {})};

        // the server joins each list: a member of two selected lists comes twice
        if (listType === 'Contact') {
            const {ids} = await client.call('Contact/query', {filter});
            return ids.length ? (await client.get('Contact', [...new Set(ids)], SOURCES.Contact.properties)).map(contactToRecipient) : []
        }

        const {ids} = await client.call('User/query', {filter});
        return ids.length ? (await client.get('Principal', [...new Set(ids)], SOURCES.User.properties)).map(userToRecipient) : []
    }
});

/**
 * The kinds of people the picker offers, one tab each (GOUI UserPicker, AddressBookPicker).
 * toRecipient() turns a record into {entity, id, name, email, avatarId}.
 */
const SOURCES = {
    User: {
        title      : () => t('Users'),
        entity     : 'Principal',
        model      : PrincipalModel,
        filter     : {entity: 'User'},
        properties : ['id', 'name', 'email', 'avatarId'],
        emailColumn: {dataField: 'email', renderer: ({value}) => escapeHtml(value || '')},
        toRecipient: userToRecipient
    },
    Contact: {
        title      : () => t('Contacts'),
        entity     : 'Contact',
        model      : ContactModel,
        filter     : {hasEmailAddresses: true},
        properties : ['id', 'name', 'emailAddresses', 'isOrganization', 'addressBookId'],
        // the addressbook module may be off for this user
        available  : () => ModuleRegistry.getAvailable().some(m => m.name === 'addressbook'),
        emailColumn: {dataField: 'emailAddresses', sortable: false, renderer: ({value}) => escapeHtml((value || [])[0]?.email || '')},
        toRecipient: contactToRecipient
    },
    ContactList: addressListSource('Contact', () => tNewsletters('Contact lists')),
    UserList   : addressListSource('User', () => tNewsletters('User lists'))
};

/**
 * @summary "Select people" (GOUI RecipientPicker): users, filtered by group, contacts with an
 * e-mail address and, with the newsletters module, the members of contact and user lists.
 * "Add selected" and "Add all results" (not on the list tabs) fire `select` and close.
 *
 *     Neo.create(RecipientPicker, {appName, windowId, listeners: {select: ({recipients}) => ...}})
 *
 * Recipient: {entity: 'User'|'Contact', id, name, email, avatarId}
 */
class RecipientPicker extends Dialog {
    static config = {
        className   : 'GO.view.RecipientPicker',
        cls         : ['go-recipient-picker'],
        modal       : true,
        resizable   : true,
        title       : t('Select people'),
        wrapperStyle: {height: 'min(600px, 90vh)', left: 'calc(50vw - min(400px, 48vw))', top: 'max(5vh, calc(50vh - 300px))', width: 'min(800px, 96vw)'},
        containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}},
        /**
         * Tabs: keys of SOURCES
         * @member {String[]} sources=['User', 'Contact', 'ContactList', 'UserList']
         */
        sources: ['User', 'Contact', 'ContactList', 'UserList']
    }

    /**
     * @summary Builds one tab per available source and the buttons.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me      = this,
            sources = me.sources.filter(key => SOURCES[key] && (SOURCES[key].available?.() ?? true));

        me.tabSources = sources;

        me.items = [{
            module             : TabContainer,
            reference          : 'tabs',
            flex               : 1,
            removeInactiveCards: false,
            items              : sources.map(key => me.createTab(key)),
            listeners          : {activeIndexChange: () => me.getReference('addAll').hidden = !!SOURCES[me.activeSource]?.isList}
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : ['->', {
                module   : Button,
                reference: 'addAll',
                hidden   : !!SOURCES[sources[0]]?.isList,
                text     : t('Add all results'),
                handler  : () => me.addAll()
            }, {
                module : Button,
                ui     : 'primary',
                text   : t('Add selected'),
                handler: () => me.addSelected()
            }]
        }]
    }

    /**
     * @summary The tab of a source: a grid with a search, for users also the group filter.
     * @param {String} key of SOURCES
     * @returns {Object} tab config
     */
    createTab(key) {
        let me     = this,
            source = SOURCES[key],
            grid   = {
                module     : Grid,
                reference  : 'grid-' + key,
                flex       : 1,
                rowLines   : source.isList ? 1 : 2, // avatar column
                multiSelect: true,
                store      : {
                    module    : JmapStore,
                    entity    : source.entity,
                    model     : source.model,
                    jmapFilter: {...source.filter},
                    pageSize  : 100,
                    scrollLoad: true,
                    sorters   : [{property: 'name', direction: 'ASC'}],
                    properties: source.properties
                },
                columns: source.isList ? [{
                    dataField: 'name',
                    text     : t('Name'),
                    flex     : 1,
                    hideable : false,
                    renderer : ({value}) => escapeHtml(value || '')
                }] : [{
                    dataField: 'id',
                    text     : '',
                    width    : 56,
                    sortable : false,
                    hideable : false,
                    renderer : ({record}) => avatarHtml(record.name || '', ['go-avatar-small'])
                }, {
                    dataField: 'name',
                    text     : t('Name'),
                    flex     : 1,
                    hideable : false,
                    renderer : ({value}) => escapeHtml(value || '')
                }, {
                    text : t('E-mail'),
                    width: 280,
                    ...source.emailColumn
                }]
            },
            search = {
                module   : SearchButton,
                listeners: {search: ({text}) => me.getReference('grid-' + key).store.setFilter({text: text || undefined}).catch(() => {})}
            };

        const body = key === 'User' ? {
            ntype : 'container',
            layout: {ntype: 'hbox', align: 'stretch'},
            items : [{
                module    : EntityCheckList,
                reference : 'groups',
                cls       : ['go-recipient-picker-groups'],
                entity    : 'Group',
                jmapFilter: {hideUsers: true},
                title     : t('Groups'),
                flex      : 'none',
                listeners : {change: ({value}) => me.getReference('grid-User').store.setFilter({groupId: value?.length ? value : undefined}).catch(() => {})}
            }, {
                ntype : 'container',
                flex  : 1,
                layout: {ntype: 'vbox', align: 'stretch'},
                items : [{module: Toolbar, flex: 'none', items: ['->', search]}, grid]
            }]
        } : {
            ntype : 'container',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{module: Toolbar, flex: 'none', items: ['->', search]}, grid]
        };

        return {
            module: Container,
            header: {text: source.title()},
            layout: 'fit',
            items : [body]
        }
    }

    /**
     * @summary Loads the grids and wires their paging, errors and double click.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.tabSources.forEach(key => {
            const grid = me.getReference('grid-' + key);

            if (grid) {
                grid.body.on('scrollEdge', () => grid.store.loadMore().catch(() => {}));
                grid.store.on('loadError', ({error}) => notifyError(me, error));
                grid.store.load().catch(() => {});
                // classic list panels add the lists on double click
                SOURCES[key].isList && grid.on('rowDoubleClick', () => me.addSelected())
            }
        })
    }

    /**
     * Keys of SOURCES, one per tab
     * @member {String[]} tabSources=[]
     */
    tabSources = []

    /**
     * Key of SOURCES of the shown tab
     * @returns {String|null}
     */
    get activeSource() {
        return this.tabSources[this.getReference('tabs')?.activeIndex ?? 0] || null
    }

    /**
     * @param {Object[]} recipients
     */
    finish(recipients) {
        this.fire('select', {recipients});
        this.close()
    }

    /**
     * @summary The selected people, or the members of the selected lists, fire `select`.
     * @returns {Promise<void>}
     */
    async addSelected() {
        let me     = this,
            key    = me.activeSource,
            source = SOURCES[key];

        if (!source) {
            return
        }

        const records = me.getReference('grid-' + key).getSelectedRecords();

        if (!source.isList) {
            records.length && me.finish(records.map(source.toRecipient));
            return
        }

        if (!records.length) {
            return
        }

        try {
            const recipients = await source.members(records.map(r => r.id));

            me.isDestroyed || me.finish(recipients)
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * Everything the tab's filter finds (GOUI: after a confirm with the count)
     */
    async addAll() {
        let me     = this,
            key    = me.activeSource,
            source = SOURCES[key];

        if (!source) {
            return
        }

        const filter = me.getReference('grid-' + key).store.getJmapFilter();

        try {
            const {total} = await client.call(source.entity + '/query', {filter, limit: 0, calculateTotal: true});

            if (!total || me.isDestroyed) {
                return
            }

            const confirmed = await ConfirmDialog.ask({
                appName : me.appName,
                windowId: me.windowId,
                title   : t('Confirm'),
                message : fmt(t('Are you sure you want to select all {count} results?'), {count: total})
            });

            if (!confirmed || me.isDestroyed) {
                return
            }

            const records = [];

            for (let position = 0; position < total; position += PAGE) {
                const {list} = await client.queryGet(source.entity, {
                    filter,
                    sort      : [{property: 'name', isAscending: true}],
                    position,
                    limit     : PAGE,
                    properties: source.properties
                });

                records.push(...list);

                if (list.length < PAGE) {
                    break
                }
            }

            me.isDestroyed || me.finish(records.map(source.toRecipient))
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(RecipientPicker);
