import {parseYmd}   from '../../../../../../views/neo/src/DateUtil.mjs';
import DescriptionList from '../../../../../../views/neo/src/component/DescriptionList.mjs';
import DateField    from '../../../../../../views/neo/src/form/field/DateField.mjs';
import LocalCombo   from '../../../../../../views/neo/src/form/field/LocalCombo.mjs';
import {formatDate, userFormat} from '../../../../../../views/neo/src/Format.mjs';
import TextList     from '../../../../../../views/neo/src/list/TextList.mjs';
import {notify}     from '../../../../../../views/neo/src/Notify.mjs';
import {fmt, t as coreT} from '../../../../../../views/neo/src/Translate.mjs';
import ConfirmDialog from '../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import {escapeHtml} from '../../../../../../views/neo/src/Format.mjs';
import {t}          from '../../util.mjs';
import * as accountApi from './accountApi.mjs';
import LegacyFormWindow from './LegacyFormWindow.mjs';
import {centered, field} from './RecordDialog.mjs';

/**
 * "Move old mails" (ExtJS GO.email.MoveOldMailDialog, email/message/moveOld): moves every
 * message of the folder that arrived before a date to another folder of the same account.
 * Needs "Use account" (CREATE) on the account.
 *
 *     MoveOldMailDialog.open({appName, windowId, accountId, mailbox})
 */
class MoveOldMailDialog extends LegacyFormWindow {
    static config = {
        className    : 'GO.email.account.MoveOldMailDialog',
        title        : t('Move old mails'),
        wrapperStyle : centered(480, 440),
        generalHeader: {text: t('Move old mails')},
        /**
         * @member {Number|null} accountId=null
         */
        accountId: null,
        /**
         * @member {String} mailbox=''
         */
        mailbox: '',
        /**
         * Folder names of the account
         * @member {String[]} folders=[]
         */
        folders: []
    }

    /**
     * @param {Object} config appName, windowId, accountId, mailbox
     * @returns {Promise<MoveOldMailDialog>}
     */
    static async open(config) {
        const folders = await accountApi.folderNames(config.accountId);
        return Neo.create(MoveOldMailDialog, {...config, folders, values: {target_mailbox: null, until_date: null}})
    }

    createFormItems() {
        let me = this;

        return [{
            module : DescriptionList,
            flex   : 'none',
            records: [[t('Folder'), me.mailbox]]
        }, {
            ntype: 'component',
            cls  : ['go-field-hint'],
            flex : 'none',
            text : t('Select a date. If you click OK after that, all the emails in the selected folder before that date will be moved to the selected target folder.')
        },
        field(LocalCombo, 'target_mailbox', t('Move to'), {
            required    : true,
            width       : null,
            displayField: 'name',
            valueField  : 'id',
            editable    : false,
            listConfig  : {module: TextList},
            store       : {keyProperty: 'id', data: me.folders.filter(name => name !== me.mailbox).map(name => ({id: name, name}))}
        }),
        field(DateField, 'until_date', t('All emails before'), {required: true})]
    }

    async save(modified, values) {
        let me     = this,
            // the legacy controller takes the date in the user's date format
            date   = formatDate(parseYmd(values.until_date), userFormat.dateFormat),
            target = values.target_mailbox;

        const ok = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : escapeHtml(t('Are you sure you want to move all the emails older then {date} from "{source}" to "{target}"?')
                .replace('{date}', date).replace('{source}', me.mailbox).replace('{target}', target))
        });

        if (!ok) {
            return false
        }

        const {total = 0} = await accountApi.moveOldMail({account_id: me.accountId, mailbox: me.mailbox, target_mailbox: target, until_date: date});

        notify(me, fmt('{text}: {total}', {text: t('The number of moved messages is'), total}), {title: coreT('Success')});
        return {total}
    }
}

export default Neo.setupClass(MoveOldMailDialog);
