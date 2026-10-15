import Tree     from '../../../../../../../views/neo/src/tree/Tree.mjs';
import MenuList from '../../../../../../../views/neo/src/menu/List.mjs';
import client   from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {LEVEL_READ} from '../../../../../../../views/neo/src/Acl.mjs';
import {t}      from '../util.mjs';

/**
 * West panel tree (ExtJS AddressBookTree + TreeLoader): address books with a checkbox,
 * their groups below them, a row menu (more_vert) per node.
 *
 * Node ids: "AddressBook-<id>" and "AddressBookGroup-<id>"; node.entity is 'AddressBook'
 * or 'AddressBookGroup', node.data the entity.
 *
 * Events: nodeSelect {node} (a row was clicked), checkChange {node, checked} (Tree)
 */
class AddressBookTree extends Tree {
    static config = {
        className: 'GO.addressbook.view.AddressBookTree',
        baseCls  : ['go-tree', 'go-addressbook-tree', 'neo-list'],
        /**
         * (node) => menu items, null for no row menu
         * @member {Function|null} rowMenu=null
         */
        rowMenu: null,
        /**
         * Text filter on the address books (the sidebar search)
         * @member {String} searchText=''
         */
        searchText: ''
    }

    construct(config) {
        config.nodeProvider ??= node => this.loadNodes(node);

        super.construct(config);

        let me = this;

        client.watch(['AddressBook', 'AddressBookGroup']);

        me.removeStateListener = client.on('stateChange', ({changed}) => {
            if (changed.includes('AddressBook') || changed.includes('AddressBookGroup')) {
                me.reloadKeepingChecks()
            }
        })
    }

    destroy(...args) {
        this.removeStateListener?.();
        super.destroy(...args)
    }

    /**
     * Address books (readable ones, like the ExtJS tree), or the groups of one
     * @param {Object|null} node
     * @returns {Promise<Object[]>}
     */
    async loadNodes(node) {
        let me = this;

        if (!node) {
            const filter = {permissionLevel: LEVEL_READ};
            me.searchText && (filter.text = me.searchText);

            const {list} = await client.queryGet('AddressBook', {
                filter,
                sort: [{property: 'name', isAscending: true}]
            });

            return list.map(ab => ({
                id      : 'AddressBook-' + ab.id,
                text    : ab.name,
                entity  : 'AddressBook',
                data    : ab,
                check   : me.checkedIds?.has(String(ab.id)) || false,
                // without groups a leaf
                children: ab.groups?.length ? undefined : []
            }))
        }

        if (node.entity !== 'AddressBook') {
            return []
        }

        const {list} = await client.queryGet('AddressBookGroup', {
            filter: {addressBookId: node.data.id},
            sort  : [{property: 'name', isAscending: true}]
        });

        return list.map(group => ({
            id      : 'AddressBookGroup-' + group.id,
            text    : group.name,
            icon    : 'group',
            entity  : 'AddressBookGroup',
            data    : {...group, permissionLevel: node.data.permissionLevel},
            children: []
        }))
    }

    /**
     * Reload after a change on the server; checked address books stay checked
     * @returns {Promise<void>}
     */
    reloadKeepingChecks() {
        let me = this;

        me.checkedIds = new Set(me.getCheckedAddressBookIds());
        return me.reload().catch(e => console.error('AddressBookTree', e))
    }

    /**
     * @param {String} text
     */
    search(text) {
        this.searchText = text || '';
        this.reloadKeepingChecks()
    }

    /**
     * @returns {String[]} ids of the checked address books
     */
    getCheckedAddressBookIds() {
        return this.getChecked().filter(node => node.entity === 'AddressBook').map(node => String(node.data.id))
    }

    /**
     * @returns {Object[]} address book nodes
     */
    getAddressBookNodes() {
        return this.roots
    }

    /**
     * Checks only the given address books (no checkChange events)
     * @param {String[]} ids
     */
    setCheckedAddressBooks(ids) {
        let me  = this,
            set = new Set(ids.map(String));

        me.roots.forEach(node => {
            const checked = set.has(String(node.data.id));

            if (node.check !== checked) {
                node.check = checked;
                me.updateItem(node.id)
            }
        })
    }

    createItemContent(record) {
        const content = super.createItemContent(record);

        if (this.rowMenu) {
            content.push({tag: 'i', cls: ['go-icon', 'go-row-menu'], text: 'more_vert', title: t('More options')})
        }

        return content
    }

    getInteractiveItemIndex(path) {
        if (path.some(node => node.cls?.includes('go-row-menu'))) {
            return undefined
        }

        return super.getInteractiveItemIndex(path)
    }

    onClick(data) {
        let me       = this,
            icon     = data.path.find(node => node.cls?.includes('go-row-menu')),
            caret    = data.path.find(node => node.cls?.includes('go-tree-caret')),
            check    = data.path.find(node => node.cls?.includes('go-check')),
            itemNode = data.path.find(node => node.cls?.includes(me.itemCls)),
            id       = itemNode && me.getItemRecordId(itemNode.id),
            node     = id !== undefined && id !== null && me.getNode(id);

        if (icon && node && me.rowMenu) {
            const items = me.rowMenu(node);

            items?.length && MenuList.showAt({
                appName : me.appName,
                windowId: me.windowId,
                target  : icon.id || itemNode.id,
                items
            });
            return
        }

        super.onClick(data);

        // a click on the row itself (not the caret or checkbox)
        node && !caret && !check && me.fire('nodeSelect', {node})
    }
}

export default Neo.setupClass(AddressBookTree);
