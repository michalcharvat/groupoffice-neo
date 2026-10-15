import Button        from '../button/Button.mjs';
import Dialog, {headerTools} from './Dialog.mjs';
import FormContainer from '../../node_modules/neo.mjs/src/form/Container.mjs';
import PasswordField from '../../node_modules/neo.mjs/src/form/field/Password.mjs';
import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {t} from '../Translate.mjs';

/**
 * Asks for a password (go.PasswordPrompt).
 *
 * const password = await PasswordPrompt.ask({appName, windowId, title, message}) // null: cancelled
 */
class PasswordPrompt extends Dialog {
    static config = {
        className: 'GO.view.PasswordPrompt',
        cls      : ['go-confirm-dialog', 'go-password-prompt'],
        modal    : true,
        headerConfig: headerTools('close'),
        resizable: false,
        title    : t('Password'),
        // no animateTarget: position explicitly, .neo-floating parks it off-screen
        wrapperStyle: {left: 'calc(50vw - 200px)', top: '30vh', width: '400px'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * @member {String} message=''
         */
        message: ''
    }

    /**
     * Entered password, null when cancelled
     * @member {String|null} answer=null
     */
    answer = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype: 'component',
            cls  : ['go-confirm-message'],
            text : me.message
        }, {
            module   : FormContainer,
            reference: 'form',
            keys     : {Enter: 'up.onOk'},
            items    : [{
                module      : PasswordField,
                name        : 'password',
                reference   : 'password',
                labelText   : t('Password'),
                labelPosition: 'inline',
                autoComplete: 'current-password',
                required    : true
            }]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            items : ['->', {
                module : Button,
                text   : t('Cancel'),
                handler: () => me.close()
            }, {
                module : Button,
                ui     : 'primary',
                text   : t('Ok'),
                handler: () => me.onOk()
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.timeout(100).then(() => {
            const field = !me.isDestroyed && me.getReference('password');
            field && field.focus(field.getInputElId())
        })
    }

    async onOk() {
        let me    = this,
            value = me.getReference('password').value;

        if (!value) {
            return
        }

        me.answer = value;
        me.close()
    }

    /**
     * @param {Object} config appName, windowId, title, message
     * @returns {Promise<String|null>}
     */
    static ask(config) {
        return new Promise(resolve => {
            const dialog = Neo.create(PasswordPrompt, config);
            dialog.on('close', () => resolve(dialog.answer))
        })
    }
}

export default Neo.setupClass(PasswordPrompt);
