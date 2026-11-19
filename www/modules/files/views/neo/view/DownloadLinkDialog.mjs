import FormContainer from '../../../../../views/neo/node_modules/neo.mjs/src/form/Container.mjs';
import Toolbar       from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../views/neo/src/button/Button.mjs';
import {addDays, parseYmd, toYmd} from '../../../../../views/neo/src/DateUtil.mjs';
import BoolCheckBox  from '../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import DateField     from '../../../../../views/neo/src/form/field/DateField.mjs';
import client        from '../../../../../views/neo/src/jmap/Client.mjs';
import {t as coreT, translator} from '../../../../../views/neo/src/Translate.mjs';
import Dialog, {headerTools} from '../../../../../views/neo/src/view/Dialog.mjs';

const t = translator('legacy', 'files');

/**
 * Expiry of a download link (ExtJS GO.files.ExpireDateDialog): a date and, when the cron
 * job that deletes expired files is active, "delete the file when the link expires".
 *
 *     const link = await DownloadLinkDialog.ask({appName, windowId})
 *     // {expire_time: <unix time of the chosen day>, delete_when_expired: 0|1}, null when cancelled
 *
 * The server adds a day to expire_time (FileController::actionEmailDownloadLink), so the
 * link works until the end of the chosen day like in ExtJS.
 */
class DownloadLinkDialog extends Dialog {
    static config = {
        className   : 'GO.files.view.DownloadLinkDialog',
        cls         : ['go-confirm-dialog', 'go-files-link-dialog'],
        modal       : true,
        headerConfig: headerTools('close'),
        resizable   : false,
        title       : t('Download link expire time'),
        wrapperStyle: {left: 'max(0px, calc(50vw - 180px))', top: '25vh', width: 'min(360px, 100vw)'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        }
    }

    /**
     * {expire_time, delete_when_expired} once OK was clicked, null otherwise
     * @member {Object|null} answer=null
     */
    answer = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module   : FormContainer,
            reference: 'form',
            cls      : ['go-files-link-form'],
            keys     : {Enter: () => me.onOk()},
            items    : [{
                module       : DateField,
                reference    : 'expireDate',
                name         : 'expireDate',
                labelText    : coreT('Date'),
                labelPosition: 'inline',
                required     : true,
                minValue     : toYmd(new Date()),
                // ExtJS showed this month's calendar without a choice; a week is a common term
                value        : toYmd(addDays(new Date(), 7))
            }, {
                module    : BoolCheckBox,
                reference : 'deleteWhenExpired',
                name      : 'deleteWhenExpired',
                valueLabel: t('Automatically delete file when download link expires'),
                hidden    : true
            }]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            items : ['->', {
                module : Button,
                text   : coreT('Cancel'),
                handler: () => me.close()
            }, {
                module : Button,
                ui     : 'primary',
                text   : coreT('Ok'),
                handler: () => me.onOk()
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        // only offered when the cron job that deletes the files runs (ExtJS checkDeleteCron)
        client.legacy('files/email/checkDeleteCron').then(response => {
            const box = !me.isDestroyed && me.getReference('deleteWhenExpired');
            box && (box.hidden = !response?.data?.enabled)
        }).catch(e => console.warn('checkDeleteCron', e))
    }

    async onOk() {
        let me    = this,
            field = me.getReference('expireDate'),
            date  = parseYmd(field.value),
            box   = me.getReference('deleteWhenExpired');

        if (!date || !await me.getReference('form').validate()) {
            return
        }

        me.answer = {
            expire_time        : Math.floor(date.getTime() / 1000),
            delete_when_expired: !box.hidden && box.checked ? 1 : 0
        };

        me.close()
    }

    /**
     * @param {Object} config appName, windowId
     * @returns {Promise<Object|null>} {expire_time, delete_when_expired}, null when cancelled
     */
    static ask(config) {
        return new Promise(resolve => {
            const dialog = Neo.create(DownloadLinkDialog, config);
            dialog.on('close', () => resolve(dialog.answer))
        })
    }
}

export default Neo.setupClass(DownloadLinkDialog);
