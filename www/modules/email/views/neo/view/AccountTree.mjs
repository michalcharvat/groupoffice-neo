import Tree          from '../../../../../views/neo/src/tree/Tree.mjs';
import MenuList      from '../../../../../views/neo/src/menu/List.mjs';
import ModuleRegistry from '../../../../../views/neo/src/ModuleRegistry.mjs';
import client        from '../../../../../views/neo/src/jmap/Client.mjs';
import {LEVEL_CREATE} from '../../../../../views/neo/src/Acl.mjs';
import * as api      from '../api.mjs';
import {t}           from '../util.mjs';
import {isImapAuthError, promptImapPassword} from './account/accountActions.mjs';

/**
 * Material icon per special folder (ExtJS AccountController::_getMailboxTreeNodes() iconCls)
 */
const SPECIAL_ICONS = {inbox: 'inbox', sent: 'send', drafts: 'drafts', trash: 'delete', spam: 'report'};

/**
 * West panel of the e-mail module (ExtJS GO.email.AccountsTree): the accounts with their
 * folders from email/account/tree, loaded lazily, unread counts, a row menu, expanded
 * state saved on the server (email/account/saveTreeState) and sections other modules add.
 *
 * Node ids:
 * - "a:<accountId>"                  account   {entity: 'account', accountId, data}
 * - "f:<accountId>:<mailbox>"        folder    {entity: 'folder', accountId, mailbox, unseen, special, data}
 * - "s:<sectionId>" / "s:<sectionId>:<id>"   section header / node of an `emailTreeSections` section
 * `data` is the email/account/tree node (permission_level, noselect, noinferiors, …).
 *
 * Extension point `emailTreeSections` (ModuleRegistry.getConfigs()): see docs/neo-email-module.md.
 *
 * Events: nodeSelect {node} (a row was clicked), menu {node, target} (the row menu icon or a
 * right click), load (Tree)
 */
class AccountTree extends Tree {
    static config = {
        className  : 'GO.email.AccountTree',
        baseCls    : ['go-tree', 'go-email-tree', 'neo-list'],
        defaultIcon: 'folder'
    }

    /**
     * Account ids in tree order
     * @member {Number[]} accountIds=[]
     */
    accountIds = []

    /**
     * The `emailTreeSections` configs of the modules the user has
     * @member {Object[]} sections=[]
     */
    sections = []

    construct(config) {
        config.nodeProvider ??= node => this.loadNodes(node);

        super.construct(config);

        let me = this;

        me.sections = ModuleRegistry.getConfigs('emailTreeSections').flat()
            .filter(section => section?.id && typeof section.nodes === 'function')
            .sort((a, b) => (a.order ?? 50) - (b.order ?? 50));

        const watch = me.sections.flatMap(section => section.watch || []);

        if (watch.length) {
            client.watch(watch);
            me.removeStateListener = client.on('stateChange', ({changed}) => {
                me.sections.filter(s => (s.watch || []).some(e => changed.includes(e))).forEach(s => me.reloadSection(s.id))
            })
        }

        me.on({expand: me.onExpandChange, collapse: me.onExpandChange, scope: me});

        Neo.main.DomEvents.registerPreventDefaultTargets({name: 'contextmenu', cls: ['go-email-tree'], windowId: me.windowId});
        me.addDomListeners({contextmenu: me.onContextMenu, scope: me})
    }

    destroy(...args) {
        clearTimeout(this.saveStateTimer);
        this.removeStateListener?.();
        super.destroy(...args)
    }

    /**
     * @param {Object|null} node
     * @returns {Promise<Object[]>}
     */
    async loadNodes(node) {
        let me = this;

        if (!node) {
            const [accounts, ...sections] = await Promise.all([
                api.tree('root'),
                ...me.sections.map(section => me.loadSectionNodes(section).catch(e => {
                    console.error('emailTreeSections ' + section.id, e);
                    return []
                }))
            ]);

            me.accountIds = accounts.map(account => Number(account.account_id));

            const accountNodes = accounts.map(account => me.toAccountNode(account)),
                  before       = [],
                  after        = [];

            me.sections.forEach((section, i) => {
                (section.order ?? 50) < 100 ? before.push(...me.sectionRoots(section, sections[i])) : after.push(...me.sectionRoots(section, sections[i]))
            });

            return [...before, ...accountNodes, ...after]
        }

        if (node.entity === 'account') {
            try {
                return (await api.tree(api.serverNodeId(node.accountId))).map(child => me.toFolderNode(child))
            } catch (e) {
                // one broken account must not break the tree; a wrong password is asked for (card 4)
                console.error('email/account/tree', e);
                me.onAccountError(node, e);
                return []
            }
        }

        if (node.entity === 'folder') {
            const children = await api.tree(node.data.id);
            return children.map(child => me.toFolderNode(child))
        }

        if (node.entity === 'section') {
            return me.loadSectionNodes(me.sections.find(s => s.id === node.sectionId))
        }

        return []
    }

    /**
     * The folders of an account failed to load. A failed IMAP login asks for the password once
     * per account (ExtJS AccountsTree imapLoginFailedDialog) and reloads the tree when saved.
     * @param {Object} node account node
     * @param {Error} error
     * @protected
     */
    async onAccountError(node, error) {
        let me = this;

        if (!isImapAuthError(error) || me.passwordAsked?.has(node.accountId)) {
            return
        }

        (me.passwordAsked ??= new Set()).add(node.accountId);

        if (await promptImapPassword(me, node.accountId, node.data?.text || node.text) && !me.isDestroyed) {
            me.passwordAsked.delete(node.accountId);
            me.reload().catch(e => console.error('AccountTree', e))
        }
    }

    /**
     * @param {Object} section
     * @param {Object[]} nodes
     * @returns {Object[]} the header node with the nodes, or the nodes as roots
     */
    sectionRoots(section, nodes) {
        if (!section.text) {
            return nodes
        }

        return [{
            id       : 's:' + section.id,
            text     : section.text,
            icon     : section.icon || 'star',
            entity   : 'section',
            sectionId: section.id,
            expanded : true,
            children : nodes
        }]
    }

    /**
     * @param {Object} section
     * @returns {Promise<Object[]>}
     */
    async loadSectionNodes(section) {
        if (!section) {
            return []
        }

        const nodes = await section.nodes(this) || [];

        return nodes.map(node => ({
            ...node,
            id       : `s:${section.id}:${node.id}`,
            entity   : 'sectionNode',
            sectionId: section.id,
            nodeId   : String(node.id),
            accountId: node.accountId !== undefined && node.accountId !== null ? Number(node.accountId) : undefined,
            unseen   : node.unseen || 0,
            children : []
        }))
    }

    /**
     * Reloads the nodes of one section (e.g. after a change of its entity)
     * @param {String} sectionId
     */
    async reloadSection(sectionId) {
        let me      = this,
            section = me.sections.find(s => s.id === sectionId);

        if (!section) {
            return
        }

        const nodes = await me.loadSectionNodes(section).catch(e => {
            console.error('emailTreeSections ' + sectionId, e);
            return null
        });

        if (!nodes || me.isDestroyed) {
            return
        }

        // nodes of a folder take its current count
        nodes.forEach(node => node.mailbox && (node.unseen = me.getFolderNode(node.accountId, node.mailbox)?.unseen || node.unseen));

        if (section.text) {
            const header = me.getNode('s:' + sectionId);

            if (!header) {
                return
            }

            (header.children || []).forEach(child => me.nodes.delete(child.id));
            header.children = nodes;
            me.register(nodes, header)
        } else {
            const old = me.roots.filter(node => node.sectionId === sectionId),
                  at  = me.roots.indexOf(old[0]);

            old.forEach(node => me.nodes.delete(node.id));
            me.roots = me.roots.filter(node => node.sectionId !== sectionId);
            me.roots.splice(at < 0 ? me.roots.length : at, 0, ...nodes);
            me.register(nodes, null)
        }

        me.refresh();
        me.fire('sectionLoad', {sectionId})
    }

    /**
     * @param {Object} account email/account/tree root node
     * @returns {Object}
     */
    toAccountNode(account) {
        return {
            id       : 'a:' + account.account_id,
            text     : account.name || account.text,
            icon     : 'account_box',
            entity   : 'account',
            accountId: Number(account.account_id),
            data     : account,
            expanded : !!account.expanded
        }
    }

    /**
     * @param {Object} folder email/account/tree folder node
     * @returns {Object}
     */
    toFolderNode(folder) {
        let me      = this,
            special = me.specialOf(folder);

        return {
            id       : `f:${folder.account_id}:${folder.mailbox}`,
            text     : folder.name,
            icon     : SPECIAL_ICONS[special] || 'folder',
            entity   : 'folder',
            accountId: Number(folder.account_id),
            mailbox  : folder.mailbox,
            special,
            unseen   : api.nodeUnseen(folder),
            cls      : folder.noselect ? ['go-email-noselect'] : [],
            data     : folder,
            // [] = no subfolders, an array = sent along (expanded), null = load on expand
            children : Array.isArray(folder.children) ? folder.children.map(child => me.toFolderNode(child)) : undefined,
            expanded : Array.isArray(folder.children) && folder.children.length > 0
        }
    }

    /**
     * The special folder a tree node is, from its icon (the server knows the account's
     * sent, trash, drafts and spam folders)
     * @param {Object} folder email/account/tree folder node
     * @returns {String|null} 'inbox', 'sent', 'drafts', 'trash', 'spam' or null
     */
    specialOf(folder) {
        const cls = folder.iconCls || '';

        return folder.mailbox === 'INBOX' ? 'inbox'
            : cls.includes('ic-send') ? 'sent'
            : cls.includes('ic-drafts') ? 'drafts'
            : cls.includes('ic-delete') ? 'trash'
            : cls.includes('ic-new-releases') ? 'spam'
            : null
    }

    /**
     * @param {Number|String} accountId
     * @param {String} mailbox
     * @returns {Object|undefined}
     */
    getFolderNode(accountId, mailbox) {
        return this.getNode(`f:${accountId}:${mailbox}`)
    }

    /**
     * @param {Number|String} accountId
     * @returns {Object|undefined}
     */
    getAccountNode(accountId) {
        return this.getNode('a:' + accountId)
    }

    /**
     * The folder nodes of an account that are loaded, depth first
     * @param {Number|String} accountId
     * @returns {Object[]}
     */
    getFolderNodes(accountId) {
        const result = [],
              walk   = nodes => (nodes || []).forEach(node => {
                  result.push(node);
                  Array.isArray(node.children) && walk(node.children)
              });

        walk(this.getAccountNode(accountId)?.children);
        return result
    }

    /**
     * Updates the unread count of a folder and of section nodes that point to it
     * @param {Number|String} accountId
     * @param {String} mailbox
     * @param {Number} unseen
     */
    setUnseen(accountId, mailbox, unseen) {
        let me = this;

        unseen = Number(unseen) || 0;

        me.nodes.forEach(node => {
            if (node.mailbox === mailbox && Number(node.accountId) === Number(accountId) && node.unseen !== unseen) {
                node.unseen = unseen;
                me.updateItem(node.id)
            }
        })
    }

    /**
     * Selects (highlights) a node without firing nodeSelect
     * @param {String|null} id
     */
    selectNode(id) {
        let me     = this,
            record = id && me.store.get(id);

        if (record) {
            me.selectionModel.select(record)
        } else {
            me.selectionModel.deselectAll?.()
        }
    }

    /**
     * Saves which accounts and folders are expanded (ExtJS AccountsTree saveTreeState)
     * @protected
     */
    onExpandChange() {
        let me = this;

        clearTimeout(me.saveStateTimer);
        me.saveStateTimer = setTimeout(() => {
            if (me.isDestroyed) {
                return
            }

            const ids = [...me.expandedIds].map(id => me.getNode(id)).filter(node => node && (node.entity === 'account' || (node.entity === 'folder' && !(Array.isArray(node.children) && !node.children.length))))
                .map(node => node.entity === 'account' ? api.serverNodeId(node.accountId) : node.data.id);

            api.saveTreeState(ids).catch(e => console.error('email/account/saveTreeState', e))
        }, 500)
    }

    rowState(node) {
        return super.rowState(node) + '|' + (node.unseen || 0) + '|' + (node.cls || []).join(' ')
    }

    createItemContent(record) {
        let me      = this,
            node    = me.getNode(record.id) || {},
            content = super.createItemContent(record),
            label   = content.find(item => item.cls?.includes('go-tree-label'));

        if (node.unseen > 0 && label) {
            label.cls = [...label.cls, 'go-email-unseen']
        }

        if (node.entity === 'account' || node.entity === 'section') {
            label && (label.cls = [...label.cls, 'go-email-tree-heading'])
        }

        node.unseen > 0 && content.push({tag: 'span', cls: ['go-email-tree-count'], text: String(node.unseen)});

        if (node.entity !== 'section' || me.sections.find(s => s.id === node.sectionId)?.rowMenu) {
            content.push({tag: 'i', cls: ['go-icon', 'go-row-menu'], text: 'more_vert', title: t('More options')})
        }

        return content
    }

    /**
     * Tree's item (with the node's cls) plus the drag and drop classes
     * (EmailMain.enableMessageDragDrop())
     */
    createItem(record, ...args) {
        const item = super.createItem(record, ...args),
              cls  = this.dragDropCls(this.getNode(record.id));

        cls.length && (item.cls = [...(item.cls || []), ...cls]);
        return item
    }

    /**
     * Accounts can be dragged (sort order) and folders the user may move (ExtJS: not trash,
     * sent, drafts, spam or INBOX). Accounts, folders and section nodes of a folder (e.g. a
     * favourite) are drop targets.
     * @param {Object|undefined} node
     * @returns {String[]} "go-email-drag", "go-email-drop"
     */
    dragDropCls(node) {
        const cls = [];

        if (node?.entity === 'account') {
            cls.push('go-email-drag', 'go-email-drop')
        } else if (node?.entity === 'folder') {
            !node.special && (Number(node.data?.permission_level) || 0) >= LEVEL_CREATE && cls.push('go-email-drag');
            cls.push('go-email-drop')
        } else if (node?.entity === 'sectionNode' && node.mailbox) {
            cls.push('go-email-drop')
        }

        return cls
    }

    getInteractiveItemIndex(path) {
        if (path.some(node => node.cls?.includes('go-row-menu'))) {
            return undefined
        }

        return super.getInteractiveItemIndex(path)
    }

    /**
     * @param {Object[]} path DOM event path
     * @returns {Object|null} the node of the row
     * @protected
     */
    nodeFromPath(path) {
        let me       = this,
            itemNode = path.find(node => node.cls?.includes(me.itemCls)),
            id       = itemNode && me.getItemRecordId(itemNode.id);

        return id !== undefined && id !== null ? me.getNode(id) || null : null
    }

    onClick(data) {
        let me    = this,
            icon  = data.path.find(node => node.cls?.includes('go-row-menu')),
            caret = data.path.find(node => node.cls?.includes('go-tree-caret')),
            node  = me.nodeFromPath(data.path);

        if (icon && node) {
            me.fire('menu', {node, target: icon.id || data.path[0]?.id});
            return
        }

        super.onClick(data);

        node && !caret && me.fire('nodeSelect', {node})
    }

    onContextMenu(data) {
        const node = this.nodeFromPath(data.path || []);

        node && this.fire('menu', {node, target: data.path[0]?.id})
    }

    /**
     * Shows a menu below a DOM element
     * @param {Object[]} items
     * @param {String} target DOM id
     */
    showMenu(items, target) {
        items?.length && MenuList.showAt({appName: this.appName, windowId: this.windowId, target, items})
    }
}

export default Neo.setupClass(AccountTree);
