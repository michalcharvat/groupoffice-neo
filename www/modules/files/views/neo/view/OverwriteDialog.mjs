import Toolbar from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button  from '../../../../../views/neo/src/button/Button.mjs';
import Dialog, {headerTools} from '../../../../../views/neo/src/view/Dialog.mjs';
import {fmt, translator} from '../../../../../views/neo/src/Translate.mjs';

const t = translator('legacy', 'files');

/**
 * "Do you wish to overwrite the file '{file}'?" with Yes / Yes to all / No / No to all
 * (ExtJS FileBrowser.sendOverwrite()). The answer is the legacy `overwrite` parameter.
 *
 *     const overwrite = await OverwriteDialog.ask({appName, windowId, file: 'a.txt'}) // null: cancelled
 */
class OverwriteDialog extends Dialog {
    static config = {
        className: 'GO.files.view.OverwriteDialog',
        cls      : ['go-confirm-dialog'],
        modal    : true,
        headerConfig: headerTools('close'),
        resizable: false,
        title    : t('File exists'),
        wrapperStyle: {left: 'calc(50vw - 240px)', top: '30vh', width: '480px'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * @member {String} file=''
         */
        file: ''
    }

    /**
     * 'yes', 'yestoall', 'no', 'notoall' or null (cancelled)
     * @member {String|null} answer=null
     */
    answer = null

    construct(config) {
        super.construct(config);

        let me     = this,
            answer = value => () => {
                me.answer = value;
                me.close()
            };

        me.items = [{
            ntype: 'component',
            cls  : ['go-confirm-message'],
            text : fmt(t("Do you wish to overwrite the file '{file}'?"), {file: me.file})
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            items : [{
                module : Button,
                text   : t('Cancel'),
                handler: () => me.close()
            }, '->', {
                module : Button,
                text   : t('No to all'),
                handler: answer('notoall')
            }, {
                module : Button,
                text   : t('No'),
                handler: answer('no')
            }, {
                module : Button,
                text   : t('Yes to all'),
                handler: answer('yestoall')
            }, {
                module : Button,
                ui     : 'primary',
                text   : t('Yes'),
                handler: answer('yes')
            }]
        }]
    }

    /**
     * @param {Object} config appName, windowId, file
     * @returns {Promise<String|null>}
     */
    static ask(config) {
        return new Promise(resolve => {
            const dialog = Neo.create(OverwriteDialog, config);
            dialog.on('close', () => resolve(dialog.answer))
        })
    }
}

export default Neo.setupClass(OverwriteDialog);
