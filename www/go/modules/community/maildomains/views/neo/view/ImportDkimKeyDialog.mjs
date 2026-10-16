import FormContainer from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/Container.mjs';
import TextArea      from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar       from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../../../views/neo/src/button/Button.mjs';
import BoolCheckBox  from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import Dialog, {headerTools} from '../../../../../../../views/neo/src/view/Dialog.mjs';
import {dkimPatch, saveDkim} from './dkim.mjs';
import {t}           from './util.mjs';

/**
 * Imports an existing DKIM private key (PEM) under a selector (GOUI ImportDkimKeyDialog).
 * The server derives the public key and rejects an unreadable key.
 *
 *     Neo.create(ImportDkimKeyDialog, {appName, windowId, domain})  // domain: MailDomain
 */
class ImportDkimKeyDialog extends Dialog {
    static config = {
        className   : 'GO.maildomains.view.ImportDkimKeyDialog',
        cls         : ['go-md-dkim-import'],
        modal       : true,
        headerConfig: headerTools('close'),
        title       : t('DKIM key import'),
        wrapperStyle: {height: '600px', left: 'calc(50vw - 300px)', maxHeight: '90vh', maxWidth: '100vw', top: 'max(5vh, calc(50vh - 300px))', width: '600px'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * @member {Object|null} domain=null
         */
        domain: null
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module   : FormContainer,
            reference: 'form',
            cls      : ['go-md-dialog-form'],
            flex     : 1,
            layout   : {ntype: 'vbox', align: 'stretch'},
            items    : [{
                module    : BoolCheckBox,
                name      : 'enabled',
                valueLabel: t('Enabled'),
                flex      : 'none'
            }, {
                module         : TextField,
                name           : 'selector',
                labelText      : t('Selector'),
                labelPosition  : 'inline',
                placeholderText: 'mail1',
                required       : true,
                flex           : 'none'
            }, {
                module         : TextArea,
                name           : 'privateKey',
                labelText      : t('Private key') + ' (PEM)',
                labelPosition  : 'inline',
                placeholderText: '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----',
                required       : true,
                flex           : 1
            }]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : [{
                ntype    : 'component',
                cls      : ['go-form-error'],
                reference: 'error',
                flex     : 1
            }, {
                module : Button,
                text   : t('Cancel'),
                handler: () => me.close()
            }, {
                module   : Button,
                ui       : 'primary',
                reference: 'saveButton',
                text     : t('Save'),
                handler  : () => me.save()
            }]
        }]
    }

    async save() {
        let me     = this,
            form   = me.getReference('form'),
            button = me.getReference('saveButton');

        if (button.disabled || !await form.validate()) {
            return
        }

        const {enabled, selector, privateKey} = await form.getSubmitValues();

        button.disabled = true;
        me.getReference('error').text = '';

        try {
            await saveDkim(me.domain.id, {
                ...dkimPatch(me.domain.dkim),
                [selector.trim()]: {selector: selector.trim(), enabled: !!enabled, privateKey}
            });
            me.close()
        } catch (e) {
            me.isDestroyed || (me.getReference('error').text = e.message || String(e))
        } finally {
            me.isDestroyed || (button.disabled = false)
        }
    }
}

export default Neo.setupClass(ImportDkimKeyDialog);
