import Container from '../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Button    from '../../../../../views/neo/src/button/Button.mjs';
import {escapeHtml} from '../../../../../views/neo/src/Format.mjs';

/**
 * A line above the message body (ExtJS smi-encrypt-notification / smi-sign-notification): an
 * icon, a text and optionally a button. setState() shows the verify result.
 *
 *     {module: SmimeBar, iconName: 'lock', message: t('This message is encrypted.')}
 *     {module: SmimeBar, iconName: 'security', message: '…', buttonText: t('Verify'), onButton: bar => …}
 */
class SmimeBar extends Container {
    static config = {
        className: 'GO.smime.SmimeBar',
        cls      : ['go-smime-bar'],
        layout   : {ntype: 'hbox', align: 'center'},
        flex     : 'none',
        /**
         * Material icon
         * @member {String} iconName='security'
         */
        iconName: 'security',
        /**
         * Plain text (escaped here)
         * @member {String} message=''
         */
        message: '',
        /**
         * Text of the button, null for none
         * @member {String|null} buttonText=null
         */
        buttonText: null,
        /**
         * (bar) => void, the button's handler
         * @member {Function|null} onButton=null
         */
        onButton: null
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype    : 'component',
            reference: 'icon',
            cls      : ['go-icon', 'go-smime-bar-icon'],
            flex     : 'none',
            tag      : 'span',
            html     : escapeHtml(me.iconName)
        }, {
            ntype    : 'component',
            reference: 'text',
            cls      : ['go-smime-bar-text'],
            flex     : 1,
            tag      : 'span',
            html     : escapeHtml(me.message)
        }, ...me.buttonText ? [{
            module   : Button,
            reference: 'button',
            text     : me.buttonText,
            flex     : 'none',
            handler  : () => me.onButton?.(me)
        }] : []]
    }

    /**
     * Shows a result: 'valid' | 'mismatch' | 'invalid' (colours the icon)
     * @param {Object} result {state, icon, text}
     */
    setState({state, icon, text}) {
        let me     = this,
            iconCmp = me.getReference('icon'),
            textCmp = me.getReference('text');

        me.cls = ['go-smime-bar', 'go-smime-' + state];
        iconCmp.html = escapeHtml(icon);
        textCmp.html = escapeHtml(text)
    }
}

export default Neo.setupClass(SmimeBar);
