import DescriptionList from '../../../../../../views/neo/src/component/DescriptionList.mjs';
import BoolCheckBox from '../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import {t}          from '../../util.mjs';
import * as accountApi from './accountApi.mjs';
import LegacyFormWindow from './LegacyFormWindow.mjs';
import {centered}   from './RecordDialog.mjs';

/**
 * Folder properties (ExtJS GO.email.FolderDialog, email/folder/load|submit): "Automatically
 * check this folder for new messages" (the account's check_mailboxes; the unread count of such
 * a folder is polled with the INBOX). Saving changes the account: write permission.
 *
 *     FolderDialog.open({appName, windowId, accountId, mailbox})
 */
class FolderDialog extends LegacyFormWindow {
    static config = {
        className    : 'GO.email.account.FolderDialog',
        title        : t('Mail box'),
        wrapperStyle : centered(460, 300),
        generalHeader: {text: t('Mail box')},
        /**
         * @member {Number|null} accountId=null
         */
        accountId: null,
        /**
         * @member {String} mailbox=''
         */
        mailbox: ''
    }

    /**
     * @param {Object} config appName, windowId, accountId, mailbox
     * @returns {Promise<FolderDialog>}
     */
    static async open(config) {
        const data = await accountApi.loadFolder(config.accountId, config.mailbox);
        return Neo.create(FolderDialog, {...config, values: {checkUnseen: !!data.checkUnseen}})
    }

    createFormItems() {
        return [{
            module : DescriptionList,
            flex   : 'none',
            records: [[t('Folder'), this.mailbox]]
        }, {
            module    : BoolCheckBox,
            name      : 'checkUnseen',
            flex      : 'none',
            valueLabel: t('Automatically check this folder for new messages')
        }]
    }

    async save(modified, values) {
        let me = this;

        await accountApi.submitFolder(me.accountId, me.mailbox, !!values.checkUnseen);
        return {accountId: me.accountId, mailbox: me.mailbox}
    }
}

export default Neo.setupClass(FolderDialog);
