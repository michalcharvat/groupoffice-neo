import Toolbar from '../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button  from '../../../../../../views/neo/src/button/Button.mjs';
import client  from '../../../../../../views/neo/src/jmap/Client.mjs';
import {notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import Tree    from '../../../../../../views/neo/src/tree/Tree.mjs';
import Dialog, {headerTools} from '../../../../../../views/neo/src/view/Dialog.mjs';
import {t, unescapeHtml} from '../../util.mjs';

/**
 * A node of email/portlet/portletTree as a GO.tree.Tree node: accounts, then their folders
 * with a checkbox (shown in the portlet or not); folders that can't be selected have none
 * @param {Object} n server node
 * @returns {Object}
 */
function treeNode(n) {
    const isAccount = !!n.isAccount || String(n.id).startsWith('account_');

    return {
        id       : n.id,
        text     : unescapeHtml(n.text),
        icon     : isAccount ? 'account_circle' : n.mailbox === 'INBOX' ? 'inbox' : 'folder',
        accountId: n.account_id,
        mailbox  : n.mailbox,
        ...!isAccount && !n.noselect ? {check: !!n.checked} : {},
        // [] = no subfolders, an array = loaded, null/undefined = load on expand
        children : Array.isArray(n.children) ? n.children.map(treeNode) : undefined,
        expanded : !!n.expanded && Array.isArray(n.children) && n.children.length > 0
    }
}

/**
 * Folders of the e-mail start page portlet (ExtJS GO.email.PortletSettingsDialog): the
 * accounts' folder tree, a checked folder is shown in the portlet
 * (email/portlet/enablePortletFolder | disablePortletFolder). Changes are saved at once;
 * the portlet reloads when the dialog closes.
 */
class PortletFoldersDialog extends Dialog {
    static config = {
        className   : 'GO.email.portlet.PortletFoldersDialog',
        title       : t('Folders'),
        modal       : true,
        headerConfig: headerTools('close'),
        wrapperStyle: {height: 'min(500px, 90vh)', left: 'max(0px, calc(50vw - 200px))', top: '15vh', width: 'min(400px, 100vw)'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        }
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module      : Tree,
            reference   : 'tree',
            flex        : 1,
            defaultIcon : 'folder',
            nodeProvider: async node => (await client.legacy('email/portlet/portletTree', {node: node?.id ?? 'root'})).map(treeNode),
            listeners   : {checkChange: ({node, checked}) => me.onCheckChange(node, checked)}
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : ['->', {
                module : Button,
                ui     : 'primary',
                text   : t('Close'),
                handler: () => me.close()
            }]
        }]
    }

    /**
     * @param {Object} node tree node
     * @param {Boolean} checked
     */
    async onCheckChange(node, checked) {
        let me = this;

        try {
            await client.legacy(checked ? 'email/portlet/enablePortletFolder' : 'email/portlet/disablePortletFolder',
                {account_id: node.accountId, mailbox: node.mailbox})
        } catch (e) {
            if (!me.isDestroyed) {
                notifyError(me, e);
                me.getReference('tree').reload().catch(() => {})
            }
        }
    }
}

export default Neo.setupClass(PortletFoldersDialog);
