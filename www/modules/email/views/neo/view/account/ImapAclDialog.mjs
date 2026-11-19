import Toolbar       from '../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../../views/neo/src/button/Button.mjs';
import {escapeHtml}  from '../../../../../../views/neo/src/Format.mjs';
import ActionTable   from '../../../../../../views/neo/src/list/ActionTable.mjs';
import {notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import {t as coreT}  from '../../../../../../views/neo/src/Translate.mjs';
import ConfirmDialog from '../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import Dialog, {headerTools} from '../../../../../../views/neo/src/view/Dialog.mjs';
import {t}           from '../../util.mjs';
import * as accountApi from './accountApi.mjs';
import ImapAclUserDialog from './ImapAclUserDialog.mjs';
import {centered}    from './RecordDialog.mjs';

/**
 * "Share" a folder on the IMAP server (ExtJS GO.email.ImapAclDialog): the folder's IMAP ACL
 * (email/folder/aclStore), add or edit a user's rights (ImapAclUserDialog, email/folder/setAcl),
 * delete. Only for servers with the ACL capability; needs manage permission on the account.
 *
 * Fires `changed` after a change.
 */
class ImapAclDialog extends Dialog {
    static config = {
        className   : 'GO.email.account.ImapAclDialog',
        cls         : ['go-email-imapacl-dialog'],
        modal       : true,
        headerConfig: headerTools('close'),
        resizable   : true,
        wrapperStyle: centered(560, 440),
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * @member {Number|null} accountId=null
         */
        accountId: null,
        /**
         * @member {String} mailbox=''
         */
        mailbox: ''
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.title = t('Share') + ': ' + me.mailbox;

        me.items = [{
            module: Toolbar,
            cls   : ['go-border-bottom'],
            flex  : 'none',
            items : ['->', {
                module : Button,
                icon   : 'add',
                text   : coreT('Add'),
                handler: () => me.openUser(null)
            }]
        }, {
            ntype: 'container',
            cls  : ['go-scroll'],
            flex : 1,
            items: [{
                module   : ActionTable,
                reference: 'table',
                flex     : 'none',
                keyProperty: 'identifier',
                columns  : [
                    {text: coreT('User'), field: 'identifier', flex: true},
                    {text: coreT('Permissions'), render: r => ImapAclDialog.rightsText(r)}
                ],
                actions  : [
                    {action: 'edit', icon: 'edit', tooltip: coreT('Edit')},
                    {action: 'delete', icon: 'delete', tooltip: coreT('Delete')}
                ]
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me    = this,
            table = me.getReference('table');

        table.on('action', ({action, record}) => action === 'edit' ? me.openUser(record) : me.deleteUser(record));
        table.on('rowDoubleClick', ({record}) => me.openUser(record));
        me.load()
    }

    /**
     * @param {Object} record aclStore record
     * @returns {String} the granted rights, e.g. "Read, Write"
     */
    static rightsText(record) {
        const labels = ImapAclUserDialog.rightLabels();
        return accountApi.IMAP_RIGHTS.filter(right => record[right]).map(right => labels[right]).join(', ') || record.permissions || ''
    }

    async load(deleteIdentifiers=null) {
        let me = this;

        try {
            const records = await accountApi.imapAcl(me.accountId, me.mailbox, deleteIdentifiers);
            me.isDestroyed || (me.getReference('table').records = records)
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * @param {Object|null} record null for a new user
     */
    openUser(record) {
        let me = this;

        const dialog = Neo.create(ImapAclUserDialog, {
            appName  : me.appName,
            windowId : me.windowId,
            accountId: me.accountId,
            mailbox  : me.mailbox,
            record
        });

        dialog.on('save', () => {
            me.load();
            me.fire('changed')
        })
    }

    async deleteUser(record) {
        let me = this;

        const ok = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : escapeHtml(coreT('Are you sure you want to delete the selected item?')) + '<br><br>' + escapeHtml(record.identifier)
        });

        if (ok && !me.isDestroyed) {
            await me.load([record.identifier]);
            me.fire('changed')
        }
    }
}

export default Neo.setupClass(ImapAclDialog);
