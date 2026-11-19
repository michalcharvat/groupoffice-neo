import Toolbar       from '../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../../views/neo/src/button/Button.mjs';
import {escapeHtml}  from '../../../../../../views/neo/src/Format.mjs';
import {notify, notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import {t as coreT}  from '../../../../../../views/neo/src/Translate.mjs';
import Tree          from '../../../../../../views/neo/src/tree/Tree.mjs';
import ConfirmDialog from '../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import Dialog, {headerTools} from '../../../../../../views/neo/src/view/Dialog.mjs';
import * as api      from '../../api.mjs';
import {t}           from '../../util.mjs';
import PromptDialog  from '../PromptDialog.mjs';
import * as accountApi from './accountApi.mjs';
import {centered}    from './RecordDialog.mjs';

/**
 * "Folders" of an account (ExtJS GO.email.FoldersDialog): every folder on the server with a
 * check box for the subscription (email/account/subscribtionsTree, email/folder/subscribe |
 * unsubscribe), "Select all" / "Deselect all", and add, rename and delete for the selected
 * folder. The tree of the e-mail module shows subscribed folders only.
 *
 * Fires `changed` after any change: the e-mail tree reloads when the dialog closes.
 */
class FoldersDialog extends Dialog {
    static config = {
        className   : 'GO.email.account.FoldersDialog',
        cls         : ['go-email-folders-dialog'],
        modal       : true,
        headerConfig: headerTools('close'),
        resizable   : true,
        title       : t('Folders'),
        wrapperStyle: centered(480, 640),
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * @member {Number|null} accountId=null
         */
        accountId: null
    }

    /**
     * The clicked folder node
     * @member {Object|null} selected=null
     */
    selected = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            cls   : ['go-border-bottom'],
            flex  : 'none',
            items : [{
                module : Button,
                icon   : 'create_new_folder',
                text   : coreT('Add'),
                handler: () => me.addFolder()
            }, {
                module   : Button,
                reference: 'renameButton',
                icon     : 'edit',
                tooltip  : t('Rename folder'),
                disabled : true,
                handler  : () => me.renameFolder()
            }, {
                module   : Button,
                reference: 'deleteButton',
                icon     : 'delete',
                tooltip  : coreT('Delete'),
                disabled : true,
                handler  : () => me.deleteFolder()
            }, {
                module : Button,
                icon   : 'refresh',
                tooltip: coreT('Refresh'),
                handler: () => me.reload()
            }, '->', {
                module : Button,
                icon   : 'check_box',
                text   : t('Select all'),
                handler: () => me.setAll(true)
            }, {
                module : Button,
                icon   : 'check_box_outline_blank',
                text   : t('Deselect all'),
                handler: () => me.setAll(false)
            }]
        }, {
            module      : Tree,
            reference   : 'tree',
            flex        : 1,
            cls         : ['go-scroll', 'go-email-folders-tree'],
            defaultIcon : 'folder',
            nodeProvider: node => me.loadNodes(node),
            listeners   : {
                itemClick  : ({record}) => me.onSelect(record),
                checkChange: ({node, checked}) => me.onCheck(node, checked)
            }
        }]
    }

    /**
     * @returns {GO.tree.Tree}
     */
    get tree() {
        return this.getReference('tree')
    }

    /**
     * @param {Object|null} node
     * @returns {Promise<Object[]>}
     */
    async loadNodes(node) {
        const children = await accountApi.subscriptionsTree(this.accountId, node ? node.serverId : 'root');

        return children.map(f => ({
            id      : 'f:' + f.mailbox,
            serverId: f.id,
            text    : f.name,
            icon    : f.mailbox === 'INBOX' ? 'inbox' : 'folder',
            mailbox : f.mailbox,
            noselect: !!+f.noselect,
            noinferiors: !!+f.noinferiors,
            // a namespace without own messages can't be subscribed
            check   : f.disabled ? undefined : !!f.checked,
            children: Array.isArray(f.children) && !f.children.length ? [] : undefined,
            expanded: Array.isArray(f.children) && f.children.length > 0
        }))
    }

    onSelect(record) {
        let me    = this,
            node  = record ? me.tree.getNode(record.id) : null,
            inbox = node?.mailbox === 'INBOX';

        me.selected = node || null;
        me.getReference('renameButton').disabled = !node || inbox;
        me.getReference('deleteButton').disabled = !node || inbox
    }

    /**
     * Subscribes or unsubscribes at once (ExtJS checkchange)
     * @param {Object} node
     * @param {Boolean} checked
     */
    async onCheck(node, checked) {
        let me = this;

        try {
            await accountApi.setSubscribed(me.accountId, [node.mailbox], checked);
            me.fire('changed')
        } catch (e) {
            notifyError(me, e);
            me.reload()
        }
    }

    /**
     * Subscribes or unsubscribes every folder loaded in the tree (ExtJS treeToMailboxList)
     * @param {Boolean} subscribe
     */
    async setAll(subscribe) {
        let me        = this,
            mailboxes = [...me.tree.nodes.values()].filter(n => n.check !== undefined).map(n => n.mailbox);

        if (!mailboxes.length) {
            return
        }

        try {
            await accountApi.setSubscribed(me.accountId, mailboxes, subscribe);
            me.fire('changed')
        } catch (e) {
            notifyError(me, e)
        }

        me.reload()
    }

    reload() {
        let me = this;

        me.onSelect(null);
        return me.tree.reload().catch(e => notifyError(me, e))
    }

    /**
     * A new folder below the selected one, or at the top level
     */
    async addFolder() {
        let me     = this,
            parent = me.selected;

        if (parent?.noinferiors) {
            notify(me, t("This folder can't have subfolders"));
            return
        }

        const name = await PromptDialog.ask({appName: me.appName, windowId: me.windowId, title: coreT('Name'), labelText: t('Enter the folder name:')});

        if (!name || me.isDestroyed) {
            return
        }

        try {
            await api.createFolder(me.accountId, parent?.mailbox || '', name);
            me.fire('changed');
            await me.reload();
            parent && me.tree.expand(parent.id)
        } catch (e) {
            notifyError(me, e)
        }
    }

    async renameFolder() {
        let me   = this,
            node = me.selected;

        if (!node) {
            return
        }

        const name = await PromptDialog.ask({appName: me.appName, windowId: me.windowId, title: t('Rename folder'), labelText: coreT('Name'), value: node.text});

        if (!name || name === node.text || me.isDestroyed) {
            return
        }

        try {
            await api.renameFolder(me.accountId, node.mailbox, name);
            me.fire('changed')
        } catch (e) {
            notifyError(me, e)
        }

        me.reload()
    }

    async deleteFolder() {
        let me   = this,
            node = me.selected;

        if (!node) {
            return
        }

        const ok = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : escapeHtml(coreT('Are you sure you want to delete the selected item?')) + '<br><br>' + escapeHtml(node.mailbox)
        });

        if (!ok || me.isDestroyed) {
            return
        }

        try {
            await api.deleteFolder(me.accountId, node.mailbox);
            me.fire('changed')
        } catch (e) {
            notifyError(me, e)
        }

        me.reload()
    }
}

export default Neo.setupClass(FoldersDialog);
