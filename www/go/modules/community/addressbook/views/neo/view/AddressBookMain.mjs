import Toolbar       from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_CREATE, LEVEL_DELETE, LEVEL_MANAGE, LEVEL_WRITE} from '../../../../../../../views/neo/src/Acl.mjs';
import Button        from '../../../../../../../views/neo/src/button/Button.mjs';
import SearchButton  from '../../../../../../../views/neo/src/button/SearchButton.mjs';
import Grid          from '../../../../../../../views/neo/src/grid/Grid.mjs';
import MultiSelectToolbar from '../../../../../../../views/neo/src/grid/MultiSelectToolbar.mjs';
import {selectRow}   from '../../../../../../../views/neo/src/grid/selectRow.mjs';
import TableTitle    from '../../../../../../../views/neo/src/component/TableTitle.mjs';
import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import JmapStore     from '../../../../../../../views/neo/src/data/JmapStore.mjs';
import MenuList      from '../../../../../../../views/neo/src/menu/List.mjs';
import {parseYmd}    from '../../../../../../../views/neo/src/DateUtil.mjs';
import {escapeHtml, formatDate, formatUserDateTime, smartDateTime, userFormat} from '../../../../../../../views/neo/src/Format.mjs';
import {alertBlobId, dismissAlert, lastAlertId, waitForFinishedAlert} from '../../../../../../../views/neo/src/data/backgroundJob.mjs';
import {notify, notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import ConfirmDialog    from '../../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import FilterPanel      from '../../../../../../../views/neo/src/view/FilterPanel.mjs';
import MainThreeColumnPanel from '../../../../../../../views/neo/src/view/MainThreeColumnPanel.mjs';
import {fmt}         from '../../../../../../../views/neo/src/Translate.mjs';
import ContactModel  from '../model/Contact.mjs';
import {contactAvatarHtml, downloadUrl, indexChar, renderName, settings, t, typeName, userRights} from '../util.mjs';
import AddressBookDialog from './AddressBookDialog.mjs';
import AddressBookTree   from './AddressBookTree.mjs';
import ContactDetail     from './ContactDetail.mjs';
import GroupDialog       from './GroupDialog.mjs';
import NavList           from './NavList.mjs';

// GOUI loads 20 per scroll step; 40 fills a tall screen in one request
const PAGE_SIZE = 40;

const GENDERS = {M: 'Male', F: 'Female', N: 'Non-binary', P: "Won't say"};

const CONTACT_PROPERTIES = ['id', 'name', 'firstName', 'middleName', 'lastName', 'prefixes', 'suffixes', 'isOrganization',
    'addressBookId', 'jobTitle', 'department', 'gender', 'color', 'photoBlobId', 'starred', 'groups', 'organizationIds',
    'emailAddresses', 'phoneNumbers', 'addresses', 'dates', 'urls', 'notes', 'IBAN', 'BIC', 'nameBank', 'vatNo',
    'vatReverseCharge', 'registrationNumber', 'debtorNumber', 'age', 'birthday', 'actionAt', 'lastContactAt',
    'createdAt', 'modifiedAt', 'createdBy', 'modifiedBy', 'permissionLevel', 'filesFolderId', 'goUserId'];

/** Names of principals (created/modified by), organizations and address books by id */
const principalNames   = new Map(),
      organizationNames = new Map(),
      addressBookNames  = new Map();

const esc = escapeHtml;

const dateRenderer = ({value}) => value ? `<span title="${esc(formatUserDateTime(value))}">${esc(smartDateTime(value, false))}</span>` : '';

const ymdRenderer = ({value}) => {
    const date = parseYmd(value);
    return date ? esc(formatDate(date, userFormat.dateFormat)) : ''
};

/** "a, b" of a property of the contact's addresses (ExtJS ContactGrid convert functions) */
const addressPart = part => ({record}) => esc([...new Set((record.addresses || []).map(a => a[part]).filter(Boolean))].join(', '));

// filters for saved filters (ExtJS Module.js entities Contact filters; text, date and number types)
const CONTACT_FILTERS = [
    {name: 'text',          type: 'string', multiple: false, title: t('Query')},
    {name: 'name',          type: 'string', multiple: true,  title: t('Name')},
    {name: 'firstName',     type: 'string', multiple: true,  title: t('First name')},
    {name: 'lastName',      type: 'string', multiple: true,  title: t('Last name')},
    {name: 'email',         type: 'string', multiple: true,  title: t('E-mail')},
    {name: 'phone',         type: 'string', multiple: true,  title: t('Phone')},
    {name: 'address',       type: 'string', multiple: true,  title: t('Address')},
    {name: 'zip',           type: 'string', multiple: true,  title: t('ZIP code')},
    {name: 'city',          type: 'string', multiple: true,  title: t('City')},
    {name: 'state',         type: 'string', multiple: true,  title: t('State')},
    {name: 'country',       type: 'string', multiple: true,  title: t('Country')},
    {name: 'jobTitle',      type: 'string', multiple: true,  title: t('Job title') + '/' + t('LOB')},
    {name: 'department',    type: 'string', multiple: true,  title: t('Department')},
    {name: 'org',           type: 'string', multiple: true,  title: t('Organization')},
    {name: 'orgCity',       type: 'string', multiple: true,  title: t('Organization') + ': ' + t('City')},
    {name: 'orgCountry',    type: 'string', multiple: true,  title: t('Organization') + ': ' + t('Country')},
    {name: 'notes',         type: 'string', multiple: true,  title: t('Notes')},
    {name: 'comment',       type: 'string', multiple: true,  title: t('Comment')},
    {name: 'vatNo',         type: 'string', multiple: true,  title: t('VAT number')},
    {name: 'age',           type: 'number', multiple: false, title: t('Age')},
    {name: 'birthday',      type: 'date',   multiple: false, title: t('Birthday')},
    {name: 'dateofbirth',   type: 'date',   multiple: false, title: t('Date of birth')},
    {name: 'actionDate',    type: 'date',   multiple: false, title: t('Action date')},
    {name: 'lastcontactat', type: 'date',   multiple: false, title: t('Last contact at')},
    {name: 'commentedat',   type: 'date',   multiple: false, title: t('Commented at')},
    {name: 'modifiedat',    type: 'date',   multiple: false, title: t('Modified at')},
    {name: 'createdat',     type: 'date',   multiple: false, title: t('Created at')}
];

/**
 * Address book main panel: views, address books with groups and saved filters | contacts
 * grid | contact detail. ExtJS MainPanel in the GOUI module layout.
 */
class AddressBookMain extends MainThreeColumnPanel {
    static config = {
        className: 'GO.addressbook.view.AddressBookMain',
        cls      : ['go-addressbook'],
        stateName: 'addressbook',
        /**
         * Route prefix, set by the shell (GO.view.MainView)
         * @member {String|null} moduleName=null
         */
        moduleName: null
    }

    /**
     * Contact to select once the grid has loaded (deep link or after create)
     * @member {String|null} pendingContactId=null
     */
    pendingContactId = null
    /**
     * Address book a new contact goes to (ExtJS addAddressBookId)
     * @member {String|null} addAddressBookId=null
     */
    addAddressBookId = null
    /**
     * Group the grid is filtered on: {id, addressBookId} or null
     * @member {Object|null} groupFilter=null
     */
    groupFilter = null
    /**
     * Open dialogs: closing the module (MainView.closeModule) closes them too
     * @member {Set<GO.view.Dialog>} dialogs
     */
    dialogs = new Set()

    createWest() {
        const rights = userRights();

        return {
            ntype : 'container',
            cls   : ['go-scroll'],
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Toolbar,
                flex  : 'none',
                items : ['->', this.hideWestButton()]
            }, {
                module      : NavList,
                reference   : 'navList',
                flex        : 'none',
                store       : {
                    keyProperty: 'id',
                    model      : {fields: [{name: 'id', type: 'String'}, {name: 'name'}, {name: 'icon'}, {name: 'color'}]},
                    data       : [
                        {id: 'all',          name: t('All contacts'), icon: 'select_all', color: 'blue'},
                        {id: 'starred',      name: t('Starred'),      icon: 'star',       color: 'orange'},
                        {id: 'organization', name: t('Organization'), icon: 'business',   color: 'green'},
                        {id: 'contacts',     name: t('Contacts'),     icon: 'person',     color: 'blue'}
                    ]
                }
            }, {
                module: Toolbar,
                flex  : 'none',
                items : [{
                    ntype: 'component',
                    tag  : 'h4',
                    cls  : ['go-toolbar-heading'],
                    text : t('Address books')
                }, '->', {
                    module   : SearchButton,
                    cls      : ['small'],
                    listeners: {search: ({text}) => this.getReference('tree').search(text)}
                }, {
                    module   : Button,
                    icon     : 'add',
                    cls      : ['small'],
                    hidden   : !rights.mayChangeAddressbooks,
                    tooltip  : t('Add'),
                    handler  : () => this.openAddressBookDialog(null)
                }]
            }, {
                module   : AddressBookTree,
                reference: 'tree',
                flex     : 'none',
                rowMenu  : node => this.getTreeMenu(node)
            }, {
                module   : FilterPanel,
                reference: 'filterPanel',
                flex     : 'none',
                entity   : 'Contact',
                filters  : CONTACT_FILTERS,
                listeners: {filterChange: ({filter}) => this.onSavedFilterChange(filter)}
            }]
        }
    }

    createCenter() {
        let me = this;

        return {
            ntype : 'container',
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                ntype : 'container',
                flex  : 'none',
                cls   : ['go-mstb-host'],
                items : [{
                    module: Toolbar,
                    cls   : ['go-bg-mid', 'go-border-bottom'],
                    items : [me.showWestButton(), {
                        module   : TableTitle,
                        reference: 'tableTitle',
                        title    : t('All contacts')
                    }, '->', {
                        module   : SearchButton,
                        listeners: {search: ({text}) => me.onSearch(text)}
                    }, {
                        module   : Button,
                        icon     : 'add',
                        ui       : 'primary',
                        reference: 'newButton',
                        tooltip  : t('Add'),
                        menu     : [{
                            text   : t('Contact'),
                            icon   : 'person',
                            handler: () => me.openDialog(null, {isOrganization: false})
                        }, {
                            text   : t('Organization'),
                            icon   : 'business',
                            handler: () => me.openDialog(null, {isOrganization: true})
                        }]
                    }, {
                        module   : Button,
                        icon     : 'more_vert',
                        reference: 'moreButton',
                        tooltip  : t('More'),
                        handler  : () => me.showMoreMenu()
                    }]
                }, {
                    module   : MultiSelectToolbar,
                    reference: 'multiSelectToolbar',
                    items    : [{
                        module : Button,
                        icon   : 'star',
                        tooltip: t('Star'),
                        handler: () => me.setStarred(me.getReference('grid').getSelectedRecords(), true)
                    }, {
                        module : Button,
                        icon   : 'merge_type',
                        tooltip: t('Merge'),
                        handler: () => me.mergeSelected()
                    }, {
                        module : Button,
                        icon   : 'delete',
                        tooltip: t('Delete'),
                        handler: () => me.deleteContacts(me.getReference('grid').getSelectedRecords())
                    }]
                }]
            }, {
                module     : Grid,
                reference  : 'grid',
                cls        : ['go-addressbook-grid'],
                flex       : 1,
                multiSelect: true,
                store      : {
                    module    : JmapStore,
                    entity    : 'Contact',
                    model     : ContactModel,
                    pageSize  : PAGE_SIZE,
                    scrollLoad: true,
                    sortProperties: {createdBy: 'creator', modifiedBy: 'modifier', addressBookId: 'addressBook'},
                    sorters   : [{property: settings.sortBy === 'lastName' ? 'lastName' : 'name', direction: 'ASC'}],
                    properties: CONTACT_PROPERTIES
                },
                stateId: 'contact-grid',
                columns: me.createColumns()
            }]
        }
    }

    /**
     * ExtJS ContactGrid columns; name, organizations and last contact visible by default
     * @returns {Object[]}
     */
    createColumns() {
        const sortedByName = store => {
            const property = store.sorters?.[0]?.property;
            return !property || ['name', 'firstName', 'lastName'].includes(property)
        };

        return [{
            // letter of the alphabet when it changes (ExtJS index column)
            dataField: 'indexChar',
            text     : '',
            width    : 48,
            sortable : false,
            hideable : false,
            renderer : ({record, rowIndex, store}) => {
                if (!sortedByName(store)) {
                    return ''
                }

                const key  = c => c.isOrganization || settings.sortBy !== 'lastName' ? c.name : c.lastName,
                      char = indexChar(key(record)),
                      prev = rowIndex > 0 ? store.getAt(rowIndex - 1) : null;

                return char && (!prev || indexChar(key(prev)) !== char) ? `<span class="go-addressbook-index">${esc(char)}</span>` : ''
            }
        }, {
            dataField: 'photoBlobId',
            text     : '',
            width    : 56,
            sortable : false,
            hideable : false,
            renderer : ({record}) => contactAvatarHtml(record, ['go-avatar-small'])
        }, {
            dataField: 'id',
            text     : 'ID',
            width    : 80,
            hidden   : true
        }, {
            // the sort follows "sort names by" of the user (go.User.addressBookSettings.sortBy)
            dataField: settings.sortBy === 'lastName' ? 'lastName' : 'name',
            stateKey : 'name',
            text     : t('Name'),
            // ExtJS dp(220): the center is narrow next to the detail
            width    : 220,
            hideable : false,
            renderer : ({record}) => {
                const color = record.color ? ` style="color:#${esc(String(record.color).replace(/[^0-9a-f]/gi, ''))}"` : '';
                return `<span${color}>${esc(renderName(record))}</span>`
            }
        }, {
            dataField: 'gender',
            text     : t('Gender'),
            width    : 120,
            hidden   : true,
            renderer : ({value}) => GENDERS[value] ? esc(t(GENDERS[value])) : ''
        }, {
            dataField: 'organizationIds',
            stateKey : 'organizations',
            text     : t('Organizations'),
            width    : 240,
            sortable : false,
            renderer : ({value}) => esc((value || []).map(id => organizationNames.get(String(id)) ?? '').filter(Boolean).join(', '))
        }, {
            dataField: 'addressBookId',
            stateKey : 'addressbook',
            text     : t('Address Book'),
            width    : 200,
            hidden   : true,
            renderer : ({value}) => esc(addressBookNames.get(String(value)) ?? '')
        }, {
            dataField: 'lastContactAt',
            text     : t('Last contact at'),
            width    : 140,
            cellAlign: 'right',
            renderer : dateRenderer
        }, {
            dataField: 'createdAt',
            text     : t('Created at'),
            width    : 140,
            cellAlign: 'right',
            hidden   : true,
            renderer : dateRenderer
        }, {
            dataField: 'modifiedAt',
            text     : t('Modified at'),
            width    : 140,
            cellAlign: 'right',
            hidden   : true,
            renderer : dateRenderer
        }, {
            dataField: 'createdBy',
            stateKey : 'creator',
            text     : t('Created by'),
            width    : 160,
            hidden   : true,
            renderer : ({value}) => value ? esc(principalNames.get(String(value)) ?? '') : ''
        }, {
            dataField: 'modifiedBy',
            stateKey : 'modifier',
            text     : t('Modified by'),
            width    : 160,
            hidden   : true,
            renderer : ({value}) => value ? esc(principalNames.get(String(value)) ?? '') : ''
        }, ...[
            ['jobTitle', t('Job title')],
            ['department', t('Department')],
            ['registrationNumber', t('Registration number')],
            ['debtorNumber', t('Customer number')],
            ['IBAN', 'IBAN'],
            ['vatNo', t('VAT number')],
            ['firstName', t('First name')],
            ['middleName', t('Middle name')]
        ].map(([dataField, text]) => ({
            dataField, text, width: 160, hidden: true, renderer: ({value}) => esc(value)
        })), {
            // the name column already sorts by last name for "Last, First" users
            dataField: settings.sortBy === 'lastName' ? 'lastNameColumn' : 'lastName',
            stateKey : 'lastName',
            text     : t('Last name'),
            width    : 160,
            hidden   : true,
            sortable : settings.sortBy !== 'lastName',
            renderer : ({record}) => esc(record.lastName)
        }, {
            dataField: 'phoneNumbers',
            text     : t('Phone numbers'),
            width    : 240,
            hidden   : true,
            sortable : false,
            renderer : ({value}) => esc((value || []).map(p => p.number).join(', '))
        }, {
            dataField: 'emailAddresses',
            text     : t('E-mail addresses'),
            width    : 240,
            hidden   : true,
            sortable : false,
            renderer : ({value}) => esc((value || []).map(m => m.email).join(', '))
        }, ...[
            ['address', t('Address')],
            ['zipCode', t('ZIP code')],
            ['city', t('City')],
            ['state', t('State')],
            ['country', t('Country')]
        ].map(([dataField, text]) => ({
            dataField, text, width: 200, hidden: true, renderer: addressPart(dataField)
        })), {
            dataField: 'birthday',
            text     : typeName('dateTypes', 'birthday') || t('Birthday'),
            width    : 120,
            hidden   : true,
            renderer : ({record}) => ymdRenderer({value: (record.dates || []).find(d => d.type === 'birthday')?.date})
        }, {
            dataField: 'age',
            text     : t('Age'),
            width    : 80,
            hidden   : true
        }, {
            dataField: 'actionAt',
            text     : t('Action date'),
            width    : 120,
            hidden   : true,
            renderer : ymdRenderer
        }]
    }

    createEast() {
        return {
            module   : ContactDetail,
            reference: 'detail'
        }
    }

    destroy(...args) {
        // close(), not destroy(): it removes the modal mask and the dialog's DOM
        this.dialogs.forEach(dialog => dialog.isDestroyed || dialog.close());
        super.destroy(...args)
    }

    /**
     * @param {GO.view.Dialog} dialog
     * @returns {GO.view.Dialog}
     */
    trackDialog(dialog) {
        this.dialogs.forEach(d => d.isDestroyed && this.dialogs.delete(d));
        this.dialogs.add(dialog);
        return dialog
    }

    onConstructed() {
        super.onConstructed();

        let me     = this,
            grid   = me.getReference('grid'),
            store  = grid.store,
            tree   = me.getReference('tree'),
            detail = me.getReference('detail');

        me.getReference('navList').selectionModel.on('selectionChange', me.onNavChange, me);

        tree.on({
            nodeSelect : ({node}) => me.onTreeNodeSelect(node),
            checkChange: ()       => me.onTreeCheckChange(),
            load       : ()       => me.onTreeLoad()
        });

        grid.view.selectionModel.on('selectionChange', me.onContactSelectionChange, me);
        me.getReference('multiSelectToolbar').setGrid(grid);

        // a click on the open contact again (a phone after "close") shows it
        grid.on('rowClick', event => {
            const sm     = grid.view.selectionModel,
                  data   = event.data || {},
                  record = event.record || sm.getRecord(data.path),
                  id     = record && grid.view.getRecordId(record);

            if (record && !data.ctrlKey && !data.metaKey && !data.shiftKey && sm.selectedRows.length === 1 && sm.isSelectedRow(id)) {
                me.showInDetail(record);
                me.activatePanel('east')
            }
        });
        grid.on('rowDoubleClick', ({record}) => {
            record && record.permissionLevel >= LEVEL_WRITE && me.openDialog(record)
        });

        // right click on a row: the contact menu (ExtJS rowcontextmenu)
        Neo.main.DomEvents.registerPreventDefaultTargets({name: 'contextmenu', cls: ['go-addressbook-grid'], windowId: me.windowId});
        grid.addDomListeners({contextmenu: me.onGridContextMenu, scope: me});

        store.on('load', me.onContactsLoad, me);
        store.on('loadMore', me.updateCount, me);
        store.on('load', me.loadNames, me);
        store.on('loadMore', me.loadNames, me);
        store.on('loadError', ({error}) => me.showError(error));
        grid.body.on('scrollEdge', () => store.loadMore().catch(() => {}));

        detail.getReference('toolbar').insert(0, me.showCenterButton());

        detail.on({
            edit: ({contact}) => me.openDialog(contact),
            star: ({contact, starred}) => me.setStarred([contact], starred),
            more: ({contact, target}) => me.showContactMenu([contact], target)
        });

        me.initialLoad = me.loadInitial()
    }

    /**
     * Start view from the user's address book settings (ExtJS root node expand): all
     * contacts, starred, the default or the last address book
     */
    async loadInitial() {
        let me = this,
            abSettings;

        try {
            abSettings = await settings.load()
        } catch (e) {
            abSettings = {}
        }

        if (me.isDestroyed) {
            return
        }

        me.addAddressBookId = abSettings.defaultAddressBookId ? String(abSettings.defaultAddressBookId) : null;
        me.updateNewButton();

        const startIn = abSettings.startIn || 'allcontacts';

        let abId = null;

        if (startIn === 'remember' && abSettings.lastAddressBookId > 0) {
            abId = abSettings.lastAddressBookId
        } else if (startIn === 'default') {
            abId = abSettings.defaultAddressBookId
        }

        me.restoring = true;
        me.selectNav(startIn === 'starred' ? 'starred' : 'all');
        me.restoring = false;

        if (abId) {
            // checked when the tree has loaded its address books (onTreeLoad)
            me.pendingAddressBookIds = [String(abId)];
            me.applyAddressBookFilter([String(abId)])
        } else {
            me.reloadGrid()
        }
    }

    selectNav(id) {
        const list = this.getReference('navList'),
              record = list.store.get(id);

        record && list.selectionModel.select(record)
    }

    /**
     * Called by the shell for "#addressbook/<path>", e.g. "#addressbook/contact/5"
     * @param {String} path
     */
    route(path) {
        const match = path.match(/^contact\/(\d+)$/);

        match && this.showContact(match[1])
    }

    async showContact(id) {
        let me     = this,
            record = me.getReference('grid').store.get(id);

        me.activatePanel('east');

        if (record) {
            me.pendingContactId = null;
            selectRow(me.getReference('grid'), id);
            me.showInDetail(record);
            return
        }

        me.pendingContactId = id;
        me.fetchIntoDetail(id)
    }

    /**
     * Shows a contact that is not in the grid's page. A later selection wins.
     * @param {String} id
     */
    async fetchIntoDetail(id) {
        let me         = this,
            generation = me.detailGeneration = (me.detailGeneration || 0) + 1;

        try {
            const [contact] = await client.get('Contact', [id], CONTACT_PROPERTIES);

            if (!me.isDestroyed && generation === me.detailGeneration) {
                me.getReference('detail').setContact(contact || null)
            }
        } catch (e) {
            me.isDestroyed || me.showError(e)
        }
    }

    showInDetail(contact) {
        this.detailGeneration = (this.detailGeneration || 0) + 1;
        this.getReference('detail').setContact(contact)
    }

    /**
     * "All contacts", "Starred", "Organization", "Contacts"
     */
    onNavChange() {
        let me     = this,
            list   = me.getReference('navList'),
            [item] = list.selectionModel.getSelection(),
            id     = item ? String(list.getItemRecordId(item)) : 'all';

        me.nav = id;

        if (me.restoring) {
            me.navFilter = me.getNavFilter(id);
            return
        }

        me.navFilter = me.getNavFilter(id);
        me.updateTitle();
        me.reloadGrid()
    }

    /**
     * @param {String} id
     * @returns {Object} isOrganization and starred conditions
     */
    getNavFilter(id) {
        return {
            isOrganization: id === 'organization' ? true : (id === 'contacts' ? false : undefined),
            starred       : id === 'starred' ? true : undefined
        }
    }

    onTreeLoad() {
        let me   = this,
            tree = me.getReference('tree');

        tree.getAddressBookNodes().forEach(node => addressBookNames.set(String(node.data.id), node.data.name));

        if (me.pendingAddressBookIds) {
            tree.setCheckedAddressBooks(me.pendingAddressBookIds);
            me.pendingAddressBookIds = null
        }

        me.updateNewButton();
        me.updateTitle()
    }

    /**
     * A click on an address book shows only that one, on a group that group
     * (ExtJS tree selectionchange)
     * @param {Object} node
     */
    onTreeNodeSelect(node) {
        let me   = this,
            tree = me.getReference('tree');

        if (node.entity === 'AddressBook') {
            me.groupFilter = null;
            tree.setCheckedAddressBooks([node.data.id]);
            me.applyAddressBookFilter([String(node.data.id)])
        } else {
            const parent = tree.getParentNode(node.id);

            me.groupFilter = {id: String(node.data.id), name: node.data.name, addressBookId: String(node.data.addressBookId)};
            tree.setCheckedAddressBooks([node.data.addressBookId]);
            me.applyAddressBookFilter([String(parent?.data.id || node.data.addressBookId)])
        }
    }

    onTreeCheckChange() {
        let me = this;

        me.groupFilter = null;
        me.applyAddressBookFilter(me.getReference('tree').getCheckedAddressBookIds())
    }

    /**
     * ExtJS setAddressBookId(): the grid shows these address books (all when empty),
     * new contacts go to the first one, the last one is remembered
     * @param {String[]} ids
     */
    applyAddressBookFilter(ids) {
        let me = this;

        me.addressBookIds = ids;

        if (ids.length) {
            me.addAddressBookId = ids[0];
            me.rememberLastAddressBook(ids[0])
        } else {
            me.addAddressBookId = settings.value?.defaultAddressBookId ? String(settings.value.defaultAddressBookId) : null
        }

        me.updateNewButton();
        me.updateTitle();
        me.reloadGrid()
    }

    /**
     * startIn "remember": the selected address book is the next start
     * @param {String} id
     */
    rememberLastAddressBook(id) {
        const abSettings = settings.value;

        if (!this.restoring && abSettings?.startIn === 'remember' && String(abSettings.lastAddressBookId) !== String(id)) {
            abSettings.lastAddressBookId = Number(id);
            client.set('User', {update: {[client.user.id]: {addressBookSettings: {lastAddressBookId: Number(id)}}}}).catch(() => {})
        }
    }

    /**
     * Add (and import) only into an address book the user may create in
     */
    updateNewButton() {
        let me    = this,
            nodes = me.getReference('tree').getAddressBookNodes(),
            node  = nodes.find(n => String(n.data.id) === String(me.addAddressBookId));

        // the default address book may not be in the (searched) tree: the server decides
        if (!me.addAddressBookId && nodes.length) {
            const writable = nodes.find(n => n.data.permissionLevel >= LEVEL_CREATE);
            me.addAddressBookId = writable ? String(writable.data.id) : null
        }

        me.getReference('newButton').disabled = !me.addAddressBookId || (node ? node.data.permissionLevel < LEVEL_CREATE : false)
    }

    updateTitle() {
        let me    = this,
            names = (me.addressBookIds || []).map(id => addressBookNames.get(String(id))).filter(Boolean),
            nav   = me.getReference('navList').store.get(me.nav || 'all'),
            title = me.groupFilter ? me.groupFilter.name : (names.length ? names.join(', ') : nav?.name || t('All contacts'));

        me.getReference('tableTitle').title = title
    }

    reloadGrid() {
        let me = this;

        me.getReference('grid').store.setFilter({
            ...(me.navFilter || {}),
            addressBookId: me.addressBookIds?.length ? me.addressBookIds : undefined,
            groupId      : me.groupFilter ? me.groupFilter.id : undefined
        }).catch(() => {})
    }

    onSavedFilterChange(filter) {
        this.getReference('grid').store.setFilter({savedFilter: filter}).catch(() => {})
    }

    onSearch(text) {
        this.getReference('grid').store.setFilter({text: text || undefined}).catch(() => {})
    }

    onContactSelectionChange({records}) {
        if (records.length > 1) {
            return
        }

        let me      = this,
            contact = records[0] || null;

        contact && (me.pendingContactId = null);
        contact && me.activatePanel('east');
        me.showInDetail(contact);

        contact && me.moduleName && Neo.Main.setRoute({value: `${me.moduleName}/contact/${contact.id}`, windowId: me.windowId})
    }

    onContactsLoad() {
        if (this.isDestroyed || !this.getReference('grid')) {
            return
        }

        let me     = this,
            store  = me.getReference('grid').store,
            detail = me.getReference('detail'),
            id     = me.pendingContactId || detail.contact?.id;

        me.updateCount();
        me.pendingContactId = null;

        if (!id) {
            return
        }

        const record = store.get(id);

        if (record) {
            selectRow(me.getReference('grid'), id);
            me.showInDetail(record)
        } else {
            me.fetchIntoDetail(id)
        }
    }

    updateCount() {
        const total = this.getReference('grid').store.totalCount || 0;
        this.getReference('tableTitle').subtitle = String(total)
    }

    /**
     * Names for the organizations, address book and creator/modifier columns, then the
     * rows render again
     */
    async loadNames() {
        let me     = this,
            grid   = me.getReference('grid'),
            orgs   = new Set(),
            people = new Set(),
            books  = new Set();

        grid?.store.items.forEach(c => {
            (c.organizationIds || []).forEach(id => organizationNames.has(String(id)) || orgs.add(String(id)));
            [c.createdBy, c.modifiedBy].forEach(id => id && !principalNames.has(String(id)) && people.add(String(id)));
            c.addressBookId && !addressBookNames.has(String(c.addressBookId)) && books.add(String(c.addressBookId))
        });

        if (!orgs.size && !people.size && !books.size) {
            return
        }

        const fetch = async (entity, ids, map, props) => {
            if (!ids.size) {
                return
            }

            try {
                (await client.get(entity, [...ids], props)).forEach(e => map.set(String(e.id), e.name));
            } catch (e) {
                return
            }

            ids.forEach(id => map.has(id) || map.set(id, ''))
        };

        await Promise.all([
            fetch('Contact', orgs, organizationNames, ['id', 'name', 'addressBookId']),
            fetch('Principal', people, principalNames, ['id', 'name']),
            fetch('AddressBook', books, addressBookNames, ['id', 'name'])
        ]);

        !me.isDestroyed && !grid.isDestroyed && grid.body?.createViewData()
    }

    // ----- address books and groups -----

    /**
     * Row menu of a tree node (ExtJS showAddressBookMoreMenu / showGroupMoreMenu)
     * @param {Object} node
     * @returns {Object[]}
     */
    getTreeMenu(node) {
        let me    = this,
            level = node.data.permissionLevel || 0;

        if (node.entity === 'AddressBook') {
            return [{
                text    : t('Edit'),
                icon    : 'edit',
                disabled: level < LEVEL_MANAGE,
                handler : () => me.openAddressBookDialog(node.data)
            }, {
                text    : t('Delete'),
                icon    : 'delete',
                disabled: !userRights().mayChangeAddressbooks || level < LEVEL_MANAGE,
                handler : () => me.deleteAddressBook(node.data)
            }, {
                text    : t('Add group'),
                icon    : 'group_add',
                disabled: level < LEVEL_WRITE,
                handler : () => me.openGroupDialog(null, node.data.id)
            }]
        }

        return [{
            text    : t('Edit'),
            icon    : 'edit',
            disabled: level < LEVEL_DELETE,
            handler : () => me.openGroupDialog(node.data.id)
        }, {
            text    : t('Delete'),
            icon    : 'delete',
            disabled: level < LEVEL_MANAGE,
            handler : () => me.deleteGroup(node.data)
        }]
    }

    openAddressBookDialog(addressBook) {
        this.trackDialog(Neo.create(AddressBookDialog, {
            appName : this.appName,
            windowId: this.windowId,
            entityId: addressBook?.id || null
        }))
        // the tree reloads by itself (push of the AddressBook change)
    }

    openGroupDialog(groupId, addressBookId = null) {
        this.trackDialog(Neo.create(GroupDialog, {
            appName : this.appName,
            windowId: this.windowId,
            entityId: groupId || null,
            values  : {name: '', addressBookId}
        }))
    }

    async deleteAddressBook(addressBook) {
        let me = this;

        if (!await me.confirm(fmt(t("Are you sure you want to delete '{item}'?"), {item: addressBook.name}))) {
            return
        }

        try {
            await client.set('AddressBook', {destroy: [addressBook.id]})
        } catch (e) {
            me.showError(e)
        }
    }

    async deleteGroup(group) {
        let me = this;

        if (!await me.confirm(fmt(t("Are you sure you want to delete '{item}'?"), {item: group.name}))) {
            return
        }

        try {
            await client.set('AddressBookGroup', {destroy: [group.id]});

            if (me.groupFilter?.id === String(group.id)) {
                me.groupFilter = null;
                me.updateTitle();
                me.reloadGrid()
            }
        } catch (e) {
            me.showError(e)
        }
    }

    // ----- contacts -----

    onNew() {
        this.openDialog(null, {isOrganization: false})
    }

    /**
     * Header "+" menu (GO.view.MainView)
     */
    async onQuickAdd() {
        await this.initialLoad;
        this.isDestroyed || this.onNew()
    }

    /**
     * @param {Object|null} contact to edit, null for a new one
     * @param {Object} [values] initial values of a new contact
     */
    async openDialog(contact, values = {}) {
        let me = this,
            dialog;

        try {
            const {default: ContactDialog} = await import('./ContactDialog.mjs');

            if (me.isDestroyed) {
                return
            }

            dialog = Neo.create(ContactDialog, {
                appName : me.appName,
                windowId: me.windowId,
                entityId: contact?.id || null,
                values  : contact ? {} : {addressBookId: me.addAddressBookId, ...values}
            })
        } catch (e) {
            me.showError(e);
            return
        }

        me.trackDialog(dialog);

        dialog.on('save', ({data, isNew}) => {
            if (me.isDestroyed) {
                return
            }

            isNew && (me.pendingContactId = String(data.id));
            me.getReference('grid').store.load().catch(() => {})
        })
    }

    /**
     * Right click on a grid row: selects it (unless it is part of the selection) and
     * shows the contact menu
     * @param {Object} data DOM event
     */
    onGridContextMenu(data) {
        let me   = this,
            grid = me.getReference('grid'),
            row  = data.path.find(node => node.cls?.includes('neo-grid-row') && node.data?.recordId),
            record = row && grid.store.get(row.data.recordId);

        if (!record) {
            return
        }

        const selected = grid.getSelectedRecords(),
              records  = selected.includes(record) ? selected : [record];

        if (!selected.includes(record)) {
            selectRow(grid, record.id)
        }

        me.showContactMenu(records, data.path[0]?.id || row.id)
    }

    /**
     * ExtJS ContactContextMenu
     * @param {Object[]} records contacts
     * @param {String} target DOM id the menu aligns to
     */
    showContactMenu(records, target) {
        let me       = this,
            single   = records.length === 1 ? records[0] : null,
            starred  = records.every(r => r.starred),
            tree     = me.getReference('tree'),
            groupIds = [...new Set(records.flatMap(r => (r.groups || []).map(String)))],
            groups   = groupIds.map(id => tree.getNode('AddressBookGroup-' + id)?.data).filter(Boolean),
            books    = tree.getAddressBookNodes().filter(n => n.data.permissionLevel >= LEVEL_CREATE),
            items    = [];

        items.push({
            text    : t('Edit'),
            icon    : 'edit',
            disabled: !single || single.permissionLevel < LEVEL_WRITE,
            handler : () => me.openDialog(single)
        }, {
            text   : starred ? t('Unstar') : t('Star'),
            icon   : starred ? 'star_border' : 'star',
            handler: () => me.setStarred(records, !starred)
        });

        // drag and drop to the tree in ExtJS
        books.length && items.push({
            text    : t('Move to'),
            icon    : 'drive_file_move',
            disabled: records.some(r => r.permissionLevel < LEVEL_WRITE),
            items   : books.map(node => ({
                text   : node.data.name,
                icon   : 'import_contacts',
                handler: () => me.moveContacts(records, node.data.id)
            }))
        });

        groups.length && items.push({
            text : t('Remove from group'),
            icon : 'clear',
            items: groups.map(group => ({
                text   : group.name,
                icon   : 'clear',
                handler: () => me.removeFromGroup(records, String(group.id))
            }))
        });

        items.push({
            text    : t('Export') + ' (vCard)',
            icon    : 'cloud_download',
            handler : () => me.exportVCard(records)
        }, {
            text    : records.length > 1 ? t('Delete %d items').replace('%d', records.length) : t('Delete'),
            icon    : 'delete',
            disabled: records.some(r => r.permissionLevel < LEVEL_DELETE),
            handler : () => me.deleteContacts(records)
        });

        MenuList.showAt({appName: me.appName, windowId: me.windowId, target, items})
    }

    /**
     * The more button of the grid toolbar (import, export, labels, duplicates).
     * Extended by the import/export part.
     */
    showMoreMenu() {
        let me    = this,
            items = me.getMoreMenuItems();

        items.length && MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : me.getReference('moreButton').id,
            items
        })
    }

    /**
     * Import, export, labels and duplicates (ExtJS MainPanel "more" menu). Import and
     * export need create permission on the address book new contacts go to; export
     * also the module right mayExportContacts.
     * @returns {Object[]}
     */
    getMoreMenuItems() {
        let me     = this,
            node   = me.getReference('tree').getAddressBookNodes().find(n => String(n.data.id) === String(me.addAddressBookId)),
            locked = node ? node.data.permissionLevel < LEVEL_CREATE : false,
            mayExport = !!userRights().mayExportContacts && !locked,
            exportItem = (text, extension) => ({text, icon: 'description', handler: () => me.exportContacts(extension)});

        return [{
            text    : t('Import'),
            icon    : 'cloud_upload',
            disabled: locked,
            handler : () => me.openImportDialog()
        }, {
            text    : t('Export'),
            icon    : 'cloud_download',
            disabled: !mayExport,
            items   : [
                exportItem('vCard (Virtual Contact File)', 'vcf'),
                exportItem('Microsoft Excel', 'xlsx'),
                exportItem('Comma Separated Values', 'csv'),
                exportItem(t('Web page') + ' (HTML)', 'html'),
                exportItem('JSON', 'json'),
                {separator: true},
                {text: t('Labels'), icon: 'print', handler: () => me.openLabelsDialog()}
            ]
        }, {
            text   : t('Look for duplicates'),
            icon   : 'merge_type',
            handler: () => me.openDuplicateDialog()
        }]
    }

    /**
     * Contact/query filter and sort of the grid (ExtJS store baseParams + lastOptions)
     * @returns {Object} {filter, sort}
     */
    getGridQuery() {
        const store = this.getReference('grid').store;
        return {filter: store.getJmapFilter(), sort: store.getJmapSort()}
    }

    /**
     * go.util.exportToFile(): exports run in the background; their alert links the file
     * @param {String} extension
     * @param {String[]|null} [ids] the contacts, null for the grid's query
     */
    async exportContacts(extension, ids = null) {
        let me = this;

        try {
            ids ??= (await client.call('Contact/query', me.getGridQuery())).ids;

            if (!ids.length) {
                throw new Error(t("There's nothing to export"))
            }

            const since = await lastAlertId();

            await client.call('Contact/export', {extension, ids});
            notify(me, t('You will be notified when the export is complete. You can close this window now.'), {title: t('Export in progress')});

            const alert  = await waitForFinishedAlert(since),
                  blobId = alertBlobId(alert);

            dismissAlert(alert);
            blobId && !me.isDestroyed && Neo.Main.redirectTo({url: downloadUrl(blobId), windowId: me.windowId})
        } catch (e) {
            me.isDestroyed || me.showError(e)
        }
    }

    async openImportDialog() {
        const {default: ImportDialog} = await import('./ImportDialog.mjs');

        this.isDestroyed || this.trackDialog(Neo.create(ImportDialog, {
            appName      : this.appName,
            windowId     : this.windowId,
            addressBookId: this.addAddressBookId
        }))
    }

    async openLabelsDialog() {
        const {default: LabelsDialog} = await import('./LabelsDialog.mjs');

        this.isDestroyed || this.trackDialog(Neo.create(LabelsDialog, {
            appName : this.appName,
            windowId: this.windowId,
            ...this.getGridQuery()
        }))
    }

    async openDuplicateDialog() {
        const {default: DuplicateDialog} = await import('./DuplicateDialog.mjs');

        this.isDestroyed || this.trackDialog(Neo.create(DuplicateDialog, {
            appName  : this.appName,
            windowId : this.windowId,
            listeners: {merged: () => this.isDestroyed || this.getReference('grid').store.load().catch(() => {})}
        }))
    }

    async setStarred(records, starred) {
        if (!records.length) {
            return
        }

        try {
            await client.set('Contact', {update: Object.fromEntries(records.map(r => [r.id, {starred}]))});

            // the detail shows the star of its contact (the push reload brings the record)
            const detail = this.getReference('detail');

            detail.contact && records.some(r => r.id === detail.contact.id) && detail.showStarred(starred)
        } catch (e) {
            this.showError(e)
        }
    }

    /**
     * ExtJS onNodeDrop() on an address book: the contacts change address book and lose
     * their groups
     * @param {Object[]} records
     * @param {String} addressBookId
     */
    async moveContacts(records, addressBookId) {
        let me      = this,
            moving  = records.filter(r => String(r.addressBookId) !== String(addressBookId));

        if (!moving.length) {
            return
        }

        if (!await me.confirm(t('Are you sure you want to move the item(s)?'))) {
            return
        }

        try {
            await client.set('Contact', {update: Object.fromEntries(moving.map(r => [r.id, {addressBookId, groups: []}]))})
        } catch (e) {
            me.showError(e)
        }
    }

    async removeFromGroup(records, groupId) {
        const update = {};

        records.forEach(r => {
            const groups = (r.groups || []).map(String);

            groups.includes(groupId) && (update[r.id] = {groups: groups.filter(id => id !== groupId)})
        });

        if (!Object.keys(update).length) {
            return
        }

        try {
            await client.set('Contact', {update})
        } catch (e) {
            this.showError(e)
        }
    }

    /**
     * One contact: its vCard (vcard route); more: Contact/export as .vcf
     * @param {Object[]} records
     */
    exportVCard(records) {
        if (records.length > 1) {
            this.exportContacts('vcf', records.map(r => r.id));
            return
        }

        // the module's vcard download route (ExtJS go.Jmap.downloadUrl("community/addressbook/vcard/<id>"))
        Neo.Main.redirectTo({url: downloadUrl('community/addressbook/vcard/' + records[0].id), windowId: this.windowId})
    }

    async mergeSelected() {
        let me  = this,
            ids = me.getReference('grid').getSelectedRecords().map(r => r.id);

        if (ids.length < 2) {
            return
        }

        if (!await me.confirm(t('The selected items will be merged into one. The item you selected first will be used primarily. Are you sure?'))) {
            return
        }

        try {
            const result = await client.call('Contact/merge', {ids});

            me.getReference('grid').view.selectionModel.clear();
            me.pendingContactId = String(result.id);
            await me.getReference('grid').store.load();
            me.openDialog({id: result.id})
        } catch (e) {
            me.showError(e)
        }
    }

    async deleteContacts(records) {
        let me        = this,
            deletable = records.filter(r => r.permissionLevel >= LEVEL_DELETE);

        if (!deletable.length) {
            return
        }

        const message = deletable.length === 1
            ? fmt(t("Are you sure you want to delete '{item}'?"), {item: deletable[0].name})
            : fmt(t('Are you sure you want to delete the {count} items?'), {count: deletable.length});

        if (!await me.confirm(message)) {
            return
        }

        try {
            await client.set('Contact', {destroy: deletable.map(r => r.id)});
            me.getReference('grid').view.selectionModel.clear();
            me.showInDetail(null);
            me.getReference('grid').store.load().catch(() => {})
        } catch (e) {
            me.showError(e)
        }
    }

    /**
     * @param {String} message
     * @returns {Promise<Boolean>}
     */
    async confirm(message) {
        const confirmed = await ConfirmDialog.ask({appName: this.appName, windowId: this.windowId, message});
        return confirmed && !this.isDestroyed
    }

    showError(error) {
        notifyError(this, error)
    }
}

export default Neo.setupClass(AddressBookMain);
