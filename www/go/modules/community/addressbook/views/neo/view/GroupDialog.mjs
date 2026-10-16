import FormWindow from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import TextField  from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import {t}        from '../util.mjs';

/**
 * Create or edit a group of an address book (ExtJS GroupDialog).
 * New groups pass values: {addressBookId}.
 */
class GroupDialog extends FormWindow {
    static config = {
        className : 'GO.addressbook.view.GroupDialog',
        cls       : ['go-form-window', 'go-addressbook-group-dialog'],
        entityName: 'AddressBookGroup',
        properties: ['id', 'name', 'addressBookId'],
        title     : t('Group'),
        wrapperStyle: {height: '240px', left: 'calc(50vw - 220px)', top: '20vh', width: '440px'}
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

export default Neo.setupClass(GroupDialog);
