import SharePanel from '../../../../../../../views/neo/src/permissions/SharePanel.mjs';
import FormWindow from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import TextArea   from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField  from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import {t}        from '../util.mjs';

/**
 * Create or edit an address book (ExtJS AddressBookDialog): name, permissions and the
 * salutation template ("Advanced").
 */
class AddressBookDialog extends FormWindow {
    static config = {
        className : 'GO.addressbook.view.AddressBookDialog',
        cls       : ['go-form-window', 'go-addressbook-book-dialog'],
        entityName: 'AddressBook',
        properties: ['id', 'name', 'acl', 'salutationTemplate'],
        title     : t('Address book'),
        wrapperStyle: {height: '70vh', left: 'calc(50vw - 320px)', top: '15vh', width: '640px'}
    }

    construct(config) {
        // a new address book gets GO's default salutation template
        config.values ??= {name: '', salutationTemplate: t('salutationTemplate')};

        super.construct(config)
    }

    onConstructed() {
        const result = super.onConstructed();

        this.addSharePanel();
        this.addCard({
            header: {text: t('Advanced')},
            items : [{
                module       : TextArea,
                name         : 'salutationTemplate',
                labelText    : t('Salutation template'),
                labelPosition: 'inline',
                flex         : 1
            }]
        });

        return result
    }

    addSharePanel() {
        let me = this;

        me.addCard({
            header: {text: t('Permissions')},
            items : [{module: SharePanel, reference: 'sharePanel', flex: 1}]
        });

        me.on('formReady', async ({currentId}) => {
            const panel = me.getReference('sharePanel');

            await panel?.setEntity('AddressBook', currentId || null).catch(e => console.error('SharePanel', e));

            // a new address book's default ACL arrives after the form took its unmodified state
            !currentId && panel && !me.isDestroyed && me.form.setOriginalValue('acl', panel.getSubmitValue())
        })
    }

    createFormItems() {
        return [{
            module       : TextField,
            name         : 'name',
            labelText    : t('Name'),
            labelPosition: 'inline',
            required     : true,
            flex         : 'none'
        }]
    }
}

export default Neo.setupClass(AddressBookDialog);
