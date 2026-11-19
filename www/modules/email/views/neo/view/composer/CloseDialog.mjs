import Button                from '../../../../../../views/neo/src/button/Button.mjs';
import Dialog, {headerTools} from '../../../../../../views/neo/src/view/Dialog.mjs';
import Toolbar               from '../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {t as coreT}          from '../../../../../../views/neo/src/Translate.mjs';
import {t}                   from '../../util.mjs';

/**
 * Asked when a composer with changes closes: save the message as a draft, discard it, or
 * go back to it.
 *
 *     const answer = await CloseDialog.ask({appName, windowId, canSave: true})
 *     // 'save', 'discard' or null (cancel)
 */
class CloseDialog extends Dialog {
    static config = {
        className   : 'GO.email.composer.CloseDialog',
        cls         : ['go-confirm-dialog', 'go-email-composer-close-dialog'],
        modal       : true,
        headerConfig: headerTools('close'),
        resizable   : false,
        title       : t('Close message'),
        // no animateTarget: position explicitly, .neo-floating parks it off-screen
        wrapperStyle: {left: 'max(0px, calc(50vw - 210px))', top: '30vh', width: 'min(420px, 100vw)'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * The account has a Drafts folder: offer "Save draft"
         * @member {Boolean} canSave=true
         */
        canSave: true
    }

    /**
     * 'save', 'discard' or null
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
            text : me.canSave
                ? t('Do you want to save this message as a draft before closing it?')
                : coreT('Are you sure you want to close this window and discard your changes?')
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            items : ['->', {
                module : Button,
                text   : coreT('Cancel'),
                handler: () => me.close()
            }, {
                module : Button,
                text   : t('Discard'),
                handler: answer('discard')
            }, ...me.canSave ? [{
                module : Button,
                ui     : 'primary',
                text   : t('Save draft'),
                handler: answer('save')
            }] : []]
        }]
    }

    /**
     * @param {Object} config appName, windowId, canSave
     * @returns {Promise<String|null>}
     */
    static ask(config) {
        return new Promise(resolve => {
            const dialog = Neo.create(CloseDialog, config);
            dialog.on('close', () => resolve(dialog.answer))
        })
    }
}

export default Neo.setupClass(CloseDialog);
