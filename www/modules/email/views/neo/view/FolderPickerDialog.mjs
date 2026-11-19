import Button   from '../../../../../views/neo/src/button/Button.mjs';
import Dialog, {headerTools} from '../../../../../views/neo/src/view/Dialog.mjs';
import Tree     from '../../../../../views/neo/src/tree/Tree.mjs';
import Toolbar  from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_CREATE} from '../../../../../views/neo/src/Acl.mjs';
import {t as coreT} from '../../../../../views/neo/src/Translate.mjs';
import * as api from '../api.mjs';
import {t}      from '../util.mjs';

/**
 * Picks a folder (the ExtJS drag target of messages and folders, and CopyMailToDialog):
 * the accounts the user may change mail of, with their folders.
 *
 *     const target = await FolderPickerDialog.ask({appName, windowId, title,
 *         accountId,     // only this account
 *         allowRoot,     // the account itself (mailbox '') may be picked: "top level"
 *         exclude        // a mailbox that can't be picked (with its subfolders), e.g. the folder to move
 *     }) // {accountId, mailbox} or null
 */
class FolderPickerDialog extends Dialog {
    static config = {
        className: 'GO.email.FolderPickerDialog',
        cls      : ['go-email-folder-picker'],
        modal    : true,
        headerConfig: headerTools('close'),
        resizable: true,
        wrapperStyle: {height: '70vh', left: 'calc(50vw - 200px)', top: '15vh', width: 'min(400px, 100vw)'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * @member {Number|null} accountId=null
         */
        accountId: null,
        /**
         * @member {Boolean} allowRoot=false
         */
        allowRoot: false,
        /**
         * @member {String|null} exclude=null
         */
        exclude: null
    }

    /**
     * {accountId, mailbox} or null
     * @member {Object|null} answer=null
     */
    answer = null

    /**
     * @member {Object|null} picked=null
     */
    picked = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.title ||= t('Select folder');

        me.items = [{
            module      : Tree,
            reference   : 'tree',
            flex        : 1,
            cls         : ['go-scroll'],
            defaultIcon : 'folder',
            nodeProvider: node => me.loadNodes(node),
            listeners   : {itemClick: ({record}) => me.onPick(record)}
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            items : ['->', {
                module : Button,
                text   : coreT('Cancel'),
                handler: () => me.close()
            }, {
                module   : Button,
                ui       : 'primary',
                reference: 'okButton',
                disabled : true,
                text     : coreT('Ok'),
                handler  : () => me.onOk()
            }]
        }]
    }

    /**
     * @param {Object|null} node
     * @returns {Promise<Object[]>}
     */
    async loadNodes(node) {
        let me = this;

        if (!node) {
            const accounts = await api.tree('root');

            return accounts
                .filter(a => Number(a.permission_level) >= LEVEL_CREATE && (!me.accountId || Number(a.account_id) === Number(me.accountId)))
                .map(a => ({
                    id       : 'a:' + a.account_id,
                    text     : a.name || a.text,
                    icon     : 'account_box',
                    accountId: Number(a.account_id),
                    mailbox  : '',
                    expanded : true
                }))
        }

        const children = await api.tree(node.mailbox === '' ? api.serverNodeId(node.accountId) : api.serverNodeId(node.accountId, node.mailbox));

        return children.filter(f => f.mailbox !== me.exclude).map(f => ({
            id       : `f:${f.account_id}:${f.mailbox}`,
            text     : f.name,
            icon     : f.mailbox === 'INBOX' ? 'inbox' : 'folder',
            accountId: Number(f.account_id),
            mailbox  : f.mailbox,
            noselect : !!f.noselect,
            // the server sends the children of expanded folders; we load on expand
            children : Array.isArray(f.children) && !f.children.length ? [] : undefined
        }))
    }

    onPick(record) {
        let me   = this,
            node = record && me.getReference('tree').getNode(record.id),
            ok   = !!node && (node.mailbox !== '' ? !node.noselect : me.allowRoot);

        me.picked = ok ? {accountId: node.accountId, mailbox: node.mailbox} : null;
        me.getReference('okButton').disabled = !ok
    }

    onOk() {
        let me = this;

        if (me.picked) {
            me.answer = me.picked;
            me.close()
        }
    }

    /**
     * @param {Object} config appName, windowId, title, accountId, allowRoot, exclude
     * @returns {Promise<{accountId: Number, mailbox: String}|null>}
     */
    static ask(config) {
        return new Promise(resolve => {
            const dialog = Neo.create(FolderPickerDialog, config);
            dialog.on('close', () => resolve(dialog.answer))
        })
    }
}

export default Neo.setupClass(FolderPickerDialog);
