import TextField from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar   from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button    from '../button/Button.mjs';
import Dialog, {headerTools} from './Dialog.mjs';
import {notify, notifyError} from '../Notify.mjs';
import {t}       from '../Translate.mjs';

/**
 * Shows a secret the server returns only once (a new API key's access token, a new app
 * password), selected, with a copy button.
 *
 *     Neo.create(SecretDialog, {appName, windowId, title: t('App password created'),
 *         message: t("Copy this password now. You won't be able to see it again."), secret})
 */
class SecretDialog extends Dialog {
    static config = {
        className   : 'GO.view.SecretDialog',
        cls         : ['go-confirm-dialog', 'go-secret-dialog'],
        modal       : true,
        resizable   : false,
        headerConfig: headerTools('close'),
        wrapperStyle: {left: 'calc(50vw - 260px)', top: '30vh', width: 'min(520px, 100vw)'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * Text above the secret
         * @member {String} message=''
         */
        message: '',
        /**
         * Label of the secret field, none when empty
         * @member {String} label=''
         */
        label: '',
        /**
         * @member {String} secret=''
         */
        secret: ''
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype: 'component',
            cls  : ['go-confirm-message'],
            text : me.message
        }, {
            module       : TextField,
            reference    : 'secret',
            cls          : ['go-secret-field'],
            ...me.label ? {labelText: me.label, labelPosition: 'inline'} : {hideLabel: true},
            readOnly     : true,
            clearable    : false,
            value        : me.secret
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            items : [{
                module : Button,
                icon   : 'content_copy',
                text   : t('Copy'),
                handler: () => me.copy()
            }, '->', {
                module : Button,
                ui     : 'primary',
                text   : t('Close'),
                handler: () => me.close()
            }]
        }]
    }

    /**
     * Selects the secret and copies it to the clipboard
     */
    async copy() {
        let me    = this,
            field = me.getReference('secret'),
            opts  = {appName: me.appName, windowId: me.windowId};

        try {
            await Neo.main.DomAccess.selectNode({...opts, id: field.getInputElId()});
            await Neo.main.DomAccess.execCommand({...opts, command: 'copy'});
            notify(me, t('Copied!'))
        } catch (e) {
            notifyError(me, e)
        }
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        // selected: ctrl/⌘+C copies it
        me.timeout(100).then(() => {
            const field = !me.isDestroyed && me.getReference('secret');

            if (field) {
                field.focus(field.getInputElId());
                Neo.main.DomAccess.selectNode({id: field.getInputElId(), windowId: me.windowId}).catch(() => {})
            }
        })
    }
}

export default Neo.setupClass(SecretDialog);
