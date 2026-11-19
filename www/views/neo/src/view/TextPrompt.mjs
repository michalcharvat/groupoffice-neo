import Button        from '../button/Button.mjs';
import Dialog, {headerTools} from './Dialog.mjs';
import FormContainer from '../../node_modules/neo.mjs/src/form/Container.mjs';
import TextField     from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {t} from '../Translate.mjs';

/**
 * Asks for one line of text (GOUI prompt(), ExtJS Ext.Msg.prompt), e.g. a new name.
 *
 *     const name = await TextPrompt.ask({appName, windowId, title, label: t('Name'), value: 'New folder',
 *         validator: value => value.includes('/') ? t('Invalid name') : null})   // null: cancelled
 */
class TextPrompt extends Dialog {
    static config = {
        className: 'GO.view.TextPrompt',
        cls      : ['go-confirm-dialog', 'go-text-prompt'],
        modal    : true,
        headerConfig: headerTools('close'),
        resizable: false,
        title    : '',
        // no animateTarget: position explicitly, .neo-floating parks it off-screen
        wrapperStyle: {left: 'calc(50vw - 200px)', top: '30vh', width: '400px'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * Text above the field
         * @member {String} message=''
         */
        message: '',
        /**
         * @member {String} label=''
         */
        label: '',
        /**
         * @member {String} value=''
         */
        value: '',
        /**
         * Text to select when the dialog opens: 'all' or the part before the last dot
         * (a file name without its extension)
         * @member {String} select='all'
         */
        select: 'all',
        /**
         * (value) => error text or null
         * @member {Function|null} validator=null
         */
        validator: null
    }

    /**
     * Entered text, null when cancelled
     * @member {String|null} answer=null
     */
    answer = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype : 'component',
            cls   : ['go-confirm-message'],
            text  : me.message,
            hidden: !me.message
        }, {
            module   : FormContainer,
            reference: 'form',
            keys     : {Enter: () => me.onOk()},
            items    : [{
                module       : TextField,
                name         : 'text',
                reference    : 'text',
                labelText    : me.label,
                labelPosition: 'inline',
                value        : me.value,
                required     : true
            }]
        }, {
            ntype    : 'component',
            reference: 'error',
            cls      : ['go-form-error'],
            text     : ''
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

        me.timeout(100).then(async () => {
            const field = !me.isDestroyed && me.getReference('text');

            if (!field) {
                return
            }

            const inputId = field.getInputElId(),
                  value   = String(me.value || ''),
                  dot     = value.lastIndexOf('.');

            await field.focus(inputId);

            // the name of a file without its extension, like a file manager
            Neo.main.DomAccess.selectNode({id: inputId, start: 0, end: me.select !== 'all' && dot > 0 ? dot : value.length, windowId: me.windowId})
        })
    }

    onOk() {
        let me    = this,
            value = String(me.getReference('text').value ?? '').trim(),
            error = !value ? t('This field is required') : me.validator?.(value) || null;

        me.getReference('error').text = error || '';

        if (error) {
            return
        }

        me.answer = value;
        me.close()
    }

    /**
     * @param {Object} config appName, windowId, title, message, label, value, select, validator
     * @returns {Promise<String|null>}
     */
    static ask(config) {
        return new Promise(resolve => {
            const dialog = Neo.create(TextPrompt, config);
            dialog.on('close', () => resolve(dialog.answer))
        })
    }
}

export default Neo.setupClass(TextPrompt);
