import Container     from '../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import CheckBox      from '../../../../../../views/neo/node_modules/neo.mjs/src/form/field/CheckBox.mjs';
import Toolbar       from '../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../../views/neo/src/button/Button.mjs';
import {LEVEL_WRITE} from '../../../../../../views/neo/src/Acl.mjs';
import BoolCheckBox  from '../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import JmapComboBox  from '../../../../../../views/neo/src/form/field/JmapComboBox.mjs';
import client        from '../../../../../../views/neo/src/jmap/Client.mjs';
import {notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import {t as coreT}  from '../../../../../../views/neo/src/Translate.mjs';
import Dialog, {headerTools} from '../../../../../../views/neo/src/view/Dialog.mjs';
import {settings as addressBookSettings} from '../../../../../../go/modules/community/addressbook/views/neo/util.mjs';
import {t}           from '../../util.mjs';

/**
 * JMAP values of a new contact for a recipient
 * @param {Object} recipient {email, name, first_name, middle_name, last_name}
 * @param {Number|String|null} addressBookId
 * @returns {Object}
 */
export function contactValues(recipient, addressBookId) {
    const values = {
        firstName     : recipient.first_name || '',
        middleName    : recipient.middle_name || '',
        lastName      : recipient.last_name || '',
        emailAddresses: [{type: 'work', email: recipient.email}]
    };

    // the server fills in the first name with the address when the recipient has no name
    values.firstName || values.lastName || (values.firstName = recipient.email);
    addressBookId && (values.addressBookId = addressBookId);

    return values
}

/**
 * Picks an existing contact the user may change (ExtJS go.util.SelectDialog of the
 * "edit" row action)
 */
class ContactPickerDialog extends Dialog {
    static config = {
        className: 'GO.email.message.ContactPickerDialog',
        cls      : ['go-email-contact-picker'],
        modal    : true,
        headerConfig: headerTools('close'),
        resizable: false,
        wrapperStyle: {left: 'max(0px, calc(50vw - 200px))', top: '30vh', width: 'min(400px, 100vw)'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        }
    }

    /**
     * The picked contact id, null when cancelled
     * @member {String|null} answer=null
     */
    answer = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.title ||= t('Add to existing contact');

        me.items = [{
            module       : JmapComboBox,
            reference    : 'contact',
            entity       : 'Contact',
            jmapFilter   : {permissionLevel: LEVEL_WRITE},
            jmapSort     : [{property: 'name', isAscending: true}],
            // an AclItemEntity: Contact/get needs addressBookId among the properties
            properties   : ['id', 'name', 'addressBookId'],
            labelText    : coreT('Contact'),
            labelPosition: 'inline',
            listeners    : {change: () => me.getReference('okButton').disabled = !me.getReference('contact').getSubmitValue()}
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            items : ['->', {
                module : Button,
                text   : coreT('Cancel'),
                handler: () => me.close()
            }, {
                module   : Button,
                ui       : 'primary',
                reference: 'okButton',
                disabled : true,
                text     : coreT('Ok'),
                handler  : () => me.onOk()
            }]
        }]
    }

    onOk() {
        let me = this,
            id = me.getReference('contact').getSubmitValue();

        if (id) {
            me.answer = String(id);
            me.close()
        }
    }

    /**
     * @param {Object} config appName, windowId
     * @returns {Promise<String|null>}
     */
    static ask(config) {
        return new Promise(resolve => {
            const dialog = Neo.create(ContactPickerDialog, config);
            dialog.on('close', () => resolve(dialog.answer))
        })
    }
}

Neo.setupClass(ContactPickerDialog);

/**
 * Recipients of a sent message that are no contact yet (ExtJS GO.email.UnknownRecipientsDialog),
 * shown by the composer after sending.
 *
 * - The checked recipients become contacts in the chosen address book (Contact/set) with
 *   "Add selected".
 * - A row's edit button opens the contact dialog with the recipient filled in, its other
 *   button adds the address to an existing contact.
 * - "Don't show this window next time" saves User.emailSettings.skip_unknown_recipients
 *   right away, like ExtJS.
 *
 *     UnknownRecipientsDialog.show({appName, windowId, recipients}) // [{email, name, first_name, middle_name, last_name}]
 */
class UnknownRecipientsDialog extends Dialog {
    static config = {
        className: 'GO.email.message.UnknownRecipientsDialog',
        cls      : ['go-email-unknown-recipients'],
        modal    : false,
        headerConfig: headerTools('close'),
        resizable: true,
        wrapperStyle: {
            height   : '450px',
            left     : 'max(0px, calc(50vw - 280px))',
            maxHeight: '90vh',
            top      : 'max(5vh, calc(50vh - 225px))',
            width    : 'min(560px, 100vw)'
        },
        containerConfig: {
            cls   : ['go-email-unknown-recipients-body'],
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * [{email, name, first_name, middle_name, last_name}]
         * @member {Object[]} recipients=[]
         */
        recipients: []
    }

    /**
     * Recipients still in the list by row reference
     * @member {Map<String, Object>} pending
     */
    pending = new Map()

    /**
     * Contact/set of "Add selected" is running
     * @member {Boolean} busy=false
     */
    busy = false

    construct(config) {
        super.construct(config);

        let me = this;

        me.title ||= t('Add unknown recipients');
        me.recipients.forEach((recipient, index) => me.pending.set('row-' + index, recipient));

        me.items = [{
            cls : ['go-email-unknown-recipients-text'],
            text: t('You sent an e-mail to recipients that are not in your address book. Select the ones you want to add as a contact.')
        }, {
            module   : Container,
            reference: 'list',
            cls      : ['go-email-unknown-recipients-list', 'go-scroll'],
            flex     : 1,
            layout   : {ntype: 'vbox', align: 'stretch'},
            items    : me.recipients.map((recipient, index) => me.createRow(recipient, index))
        }, {
            module   : JmapComboBox,
            reference: 'addressBook',
            cls      : ['go-email-unknown-recipients-addressbook'],
            entity   : 'AddressBook',
            jmapFilter: {permissionLevel: LEVEL_WRITE},
            jmapSort : [{property: 'name', isAscending: true}],
            properties: ['id', 'name'],
            labelText: coreT('Address book'),
            labelPosition: 'inline',
            listeners: {change: () => me.updateAddButton()}
        }, {
            module    : BoolCheckBox,
            cls       : ['go-email-unknown-recipients-skip'],
            valueLabel: t("Don't show this window next time"),
            listeners : {change: ({value}) => me.saveSkip(!!value)}
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            items : ['->', {
                module : Button,
                text   : coreT('Close'),
                handler: () => me.close()
            }, {
                module   : Button,
                ui       : 'primary',
                reference: 'addButton',
                disabled : true,
                text     : coreT('Add selected'),
                handler  : () => me.onAdd()
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();
        this.loadDefaultAddressBook()
    }

    /**
     * The user's default address book (User.addressBookSettings, ExtJS ContactDialog default)
     */
    async loadDefaultAddressBook() {
        let me = this;

        try {
            const {defaultAddressBookId} = await addressBookSettings.load(),
                  field = !me.isDestroyed && me.getReference('addressBook');

            if (field && defaultAddressBookId && !field.getSubmitValue()) {
                field.value = defaultAddressBookId
            }
        } catch (e) {
            console.warn('address book settings not loaded', e)
        }

        me.isDestroyed || me.updateAddButton()
    }

    /**
     * @param {Object} recipient
     * @param {Number} index
     * @returns {Object} row config
     */
    createRow(recipient, index) {
        let me = this;

        return {
            module   : Container,
            reference: 'row-' + index,
            cls      : ['go-email-unknown-recipients-row'],
            layout   : {ntype: 'hbox', align: 'center'},
            items    : [{
                module    : CheckBox,
                reference : 'check-' + index,
                flex      : 1,
                hideLabel : true,
                checked   : true,
                valueLabel: recipient.name || recipient.email,
                listeners : {change: () => me.updateAddButton()}
            }, {
                module : Button,
                icon   : 'edit',
                ui     : 'ghost',
                tooltip: coreT('Edit'),
                handler: () => me.onEdit(index)
            }, {
                module : Button,
                icon   : 'person_search',
                ui     : 'ghost',
                tooltip: t('Add to existing contact'),
                handler: () => me.onAddToExisting(index)
            }]
        }
    }

    /**
     * Rows still in the list
     * @returns {Neo.container.Base[]}
     */
    get rows() {
        return this.getReference('list').items.filter(row => this.pending.has(row.reference))
    }

    /**
     * @param {Neo.container.Base} row
     * @returns {Boolean}
     */
    isChecked(row) {
        return !!row.items[0]?.checked
    }

    updateAddButton() {
        let me = this;

        me.getReference('addButton').disabled = me.busy ||
            !me.getReference('addressBook').getSubmitValue() || !me.rows.some(row => me.isChecked(row))
    }

    /**
     * Removes a handled recipient, closes the dialog after the last one (ExtJS)
     * @param {Neo.container.Base} row
     */
    removeRow(row) {
        let me = this;

        if (me.isDestroyed) {
            return
        }

        me.pending.delete(row.reference);
        me.getReference('list').remove(row, true);

        if (!me.rows.length) {
            me.close()
        } else {
            me.updateAddButton()
        }
    }

    /**
     * @param {Number} index
     * @returns {Neo.container.Base|null}
     */
    findRow(index) {
        return this.rows.find(row => row.reference === 'row-' + index) || null
    }

    /**
     * Creates contacts of the checked recipients
     */
    async onAdd() {
        let me            = this,
            addressBookId = me.getReference('addressBook').getSubmitValue(),
            rows          = me.rows.filter(row => me.isChecked(row)),
            create        = {};

        if (me.busy || !addressBookId || !rows.length) {
            return
        }

        rows.forEach(row => create[row.reference] = contactValues(me.pending.get(row.reference), addressBookId));

        me.busy = true;
        me.updateAddButton();

        let response;

        try {
            // not client.set(): it throws on the first error, the others may be created
            response = await client.call('Contact/set', {create});
        } catch (e) {
            me.busy = false;
            me.isDestroyed || (notifyError(me, e), me.updateAddButton());
            return
        }

        me.busy = false;

        if (me.isDestroyed) {
            return
        }

        const created = response.created || {};

        rows.filter(row => created[row.reference]).forEach(row => me.removeRow(row));

        const failed = Object.values(response.notCreated || {});

        if (failed.length) {
            notifyError(me, new Error(client.constructor.describeSetError(failed[0])));
            me.isDestroyed || me.updateAddButton()
        }
    }

    /**
     * Opens the contact dialog with the recipient (ExtJS "add" row action)
     * @param {Number} index
     */
    async onEdit(index) {
        let me  = this,
            row = me.findRow(index);

        // the row may be in the running "Add selected"
        if (!row || me.busy) {
            return
        }

        try {
            const {default: ContactDialog} = await import('../../../../../../go/modules/community/addressbook/views/neo/view/ContactDialog.mjs');

            if (me.isDestroyed) {
                return
            }

            const dialog = Neo.create(ContactDialog, {
                appName : me.appName,
                windowId: me.windowId,
                entityId: null,
                values  : contactValues(me.pending.get(row.reference), me.getReference('addressBook').getSubmitValue())
            });

            dialog.on('save', () => me.removeRow(row))
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * Adds the recipient's address to a contact the user picks (ExtJS "edit" row action)
     * @param {Number} index
     */
    async onAddToExisting(index) {
        let me  = this,
            row = me.findRow(index);

        // the row may be in the running "Add selected"
        if (!row || me.busy) {
            return
        }

        const id = await ContactPickerDialog.ask({appName: me.appName, windowId: me.windowId});

        if (!id || me.isDestroyed) {
            return
        }

        try {
            const [contact] = await client.get('Contact', [id], ['id', 'addressBookId', 'emailAddresses']),
                  email     = me.pending.get(row.reference).email;

            if (!contact) {
                throw new Error(coreT('Not found'))
            }

            const addresses = contact.emailAddresses || [];

            if (!addresses.some(a => String(a.email).toLowerCase() === email.toLowerCase())) {
                await client.set('Contact', {update: {[id]: {
                    // the existing entries with their ids: without them the server recreates them
                    emailAddresses: [...addresses, {type: 'work', email}]
                }}})
            }

            me.removeRow(row)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * "Don't show this window next time": saved right away (ExtJS)
     * @param {Boolean} skip
     */
    async saveSkip(skip) {
        let me = this;

        try {
            const id = client.user.id;
            await client.set('User', {update: {[id]: {emailSettings: {skip_unknown_recipients: skip}}}});
            client.user.emailSettings && (client.user.emailSettings.skip_unknown_recipients = skip)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * @param {Object} config appName, windowId, recipients
     * @returns {UnknownRecipientsDialog}
     */
    static show(config) {
        return Neo.create(UnknownRecipientsDialog, config)
    }
}

export default Neo.setupClass(UnknownRecipientsDialog);
