import TextField    from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar      from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button       from '../../../../../../../views/neo/src/button/Button.mjs';
import Dialog, {headerTools} from '../../../../../../../views/neo/src/view/Dialog.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'apikeys');

/**
 * Shows an API key's access token, selected for copying (GOUI KeyGrid "View access token")
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
            items : ['->', {
                module : Button,
                ui     : 'primary',
                text   : t('Close'),
                handler: () => me.close()
            }]
        }]
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
