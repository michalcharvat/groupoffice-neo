import Button        from '../../../../../views/neo/src/button/Button.mjs';
import Dialog, {headerTools} from '../../../../../views/neo/src/view/Dialog.mjs';
import FormContainer from '../../../../../views/neo/node_modules/neo.mjs/src/form/Container.mjs';
import TextField     from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar       from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {submitOnEnter} from '../../../../../views/neo/src/form/submitOnEnter.mjs';
import {t as coreT}  from '../../../../../views/neo/src/Translate.mjs';

/**
 * Asks for one line of text (ExtJS Ext.MessageBox.prompt), e.g. a folder name.
 *
 *     const name = await PromptDialog.ask({appName, windowId, title, labelText, value}) // null: cancelled
 */
class PromptDialog extends Dialog {
    static config = {
        className: 'GO.email.PromptDialog',
        cls      : ['go-confirm-dialog', 'go-email-prompt'],
        modal    : true,
        headerConfig: headerTools('close'),
        resizable: false,
        // no animateTarget: position explicitly, .neo-floating parks it off-screen
        wrapperStyle: {left: 'max(0px, calc(50vw - 200px))', top: '30vh', width: 'min(400px, 100vw)'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * @member {String} labelText=''
         */
        labelText: '',
        /**
         * @member {String} value=''
         */
        value: ''
    }

    /**
     * The entered text, null when cancelled
     * @member {String|null} answer=null
     */
    answer = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module   : FormContainer,
            reference: 'form',
            keys     : {Enter: submitOnEnter('up.onOk')},
            items    : [{
                module       : TextField,
                name         : 'text',
                reference    : 'text',
                labelText    : me.labelText,
                labelPosition: 'inline',
                value        : me.value,
                required     : true
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

        me.timeout(100).then(() => {
            const field = !me.isDestroyed && me.getReference('text');
            field && field.focus(field.getInputElId())
        })
    }

    onOk() {
        let me    = this,
            value = String(me.getReference('text').value ?? '').trim();

        if (!value) {
            return
        }

        me.answer = value;
        me.close()
    }

    /**
     * @param {Object} config appName, windowId, title, labelText, value
     * @returns {Promise<String|null>}
     */
    static ask(config) {
        return new Promise(resolve => {
            const dialog = Neo.create(PromptDialog, config);
            dialog.on('close', () => resolve(dialog.answer))
        })
    }
}

export default Neo.setupClass(PromptDialog);
