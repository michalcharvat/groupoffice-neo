import TextField    from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar      from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button       from '../../../../../../../views/neo/src/button/Button.mjs';
import Dialog, {headerTools} from '../../../../../../../views/neo/src/view/Dialog.mjs';
import {notify, notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'apikeys');

/**
 * Shows a new API key's access token once, selected, with a copy button (GOUI KeyDialog.showToken())
 */
class TokenDialog extends Dialog {
    static config = {
        className   : 'GO.apikeys.view.TokenDialog',
        cls         : ['go-confirm-dialog'],
        modal       : true,
        resizable   : false,
        headerConfig: headerTools('close'),
        title       : t('Access token'),
        wrapperStyle: {left: 'calc(50vw - 260px)', top: '30vh', width: 'min(520px, 100vw)'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * @member {String} token=''
         */
        token: ''
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype: 'component',
            cls  : ['go-confirm-message'],
            text : t("Copy the access token now. It's not possible to view it again.")
        }, {
            module       : TextField,
            reference    : 'token',
            cls          : ['go-token-field'],
            labelText    : t('Access token'),
            labelPosition: 'inline',
            readOnly     : true,
            clearable    : false,
            value        : me.token
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
     * Selects the token and copies it to the clipboard
     */
    async copy() {
        let me    = this,
            field = me.getReference('token'),
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
            const field = !me.isDestroyed && me.getReference('token');

            if (field) {
                field.focus(field.getInputElId());
                Neo.main.DomAccess.selectNode({id: field.getInputElId(), windowId: me.windowId}).catch(() => {})
            }
        })
    }
}

export default Neo.setupClass(TokenDialog);
