import Button  from '../button/Button.mjs';
import Dialog, {headerTools} from './Dialog.mjs';
import Toolbar from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {t} from '../Translate.mjs';

/**
 * Yes/no question.
 *
 * const ok = await ConfirmDialog.ask({appName, windowId, message: 'Delete?'})
 */
class ConfirmDialog extends Dialog {
    static config = {
        className: 'GO.view.ConfirmDialog',
        cls      : ['go-confirm-dialog'],
        modal    : true,
        headerConfig: headerTools('close'),
        resizable: false,
        title    : t('Please confirm'),
        // no animateTarget: position explicitly, .neo-floating parks it off-screen
        wrapperStyle: {left: 'calc(50vw - 200px)', top: '30vh', width: '400px'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * HTML: escape names and other user text in it
         * @member {String} message=''
         */
        message: ''
    }

    answer = false

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype: 'component',
            cls  : ['go-confirm-message'],
            text : me.message
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            items : ['->', {
                module : Button,
                text   : t('No'),
                handler: () => me.close()
            }, {
                module : Button,
                ui     : 'primary',
                text   : t('Yes'),
                handler: () => {
                    me.answer = true;
                    me.close()
                }
            }]
        }]
    }

    static ask(config) {
        return new Promise(resolve => {
            const dialog = Neo.create(ConfirmDialog, config);
            dialog.on('close', () => resolve(dialog.answer))
        })
    }
}

export default Neo.setupClass(ConfirmDialog);
