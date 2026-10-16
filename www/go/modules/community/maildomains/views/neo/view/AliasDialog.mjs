import TextField    from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import ChipsField   from '../../../../../../../views/neo/src/form/field/ChipsField.mjs';
import JmapComboBox from '../../../../../../../views/neo/src/form/field/JmapComboBox.mjs';
import FormWindow   from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import {t}          from './util.mjs';

/**
 * Create or edit an alias (GOUI AliasDialog): the address without the domain ("*" is a
 * catch all) and the recipients ("Goto") as chips. GOUI suggests the domain's mailboxes
 * while typing; here a mailbox combo below the chips adds one.
 *
 *     Neo.create(AliasDialog, {appName, windowId, domain: 'example.com', values: {domainId}})
 */
class AliasDialog extends FormWindow {
    static config = {
        className : 'GO.maildomains.view.AliasDialog',
        cls       : ['go-form-window', 'go-md-alias-dialog'],
        entityName: 'MailAlias',
        properties: ['id', 'domainId', 'address', 'recipients', 'active'],
        title     : t('Alias'),
        wrapperStyle: {height: '70vh', left: 'calc(50vw - 300px)', maxWidth: '100vw', top: '15vh', width: '600px'},
        /**
         * Domain name, shown after the address and appended to a new one
         * @member {String} domain=''
         */
        domain: ''
    }

    onConstructed() {
        // references exist from here on; the form loads later (FormWindow.readyPromise)
        const result = super.onConstructed();

        let me = this;

        me.form.on({
            beforeload: ({data}) => {
                // "info@example.com" → "info", "@example.com" (catch all) → "*"
                if (typeof data.address === 'string' && data.address.includes('@')) {
                    data.address = data.address.split('@')[0] || '*'
                }
            },
            beforesave: ({data, isNew}) => {
                // the server turns "*@example.com" into the catch all "@example.com"
                isNew && (data.address = data.address + '@' + me.domain)
            }
        });

        return result
    }

    onReady() {
        super.onReady();

        let me = this;

        me.getReference('address').readOnly = !!me.form.currentId;
        me.getReference('mailboxCombo').setJmapFilter?.({domainId: me.form.entityData.domainId})
    }

    /**
     * Mailbox picked in the combo: add it to the recipients
     * @param {Object|null} mailbox
     */
    async onMailboxPick(mailbox) {
        let me     = this,
            chips  = me.getReference('recipients'),
            combo  = me.getReference('mailboxCombo'),
            values = chips.value || [];

        if (!mailbox?.username) {
            return
        }

        values.includes(mailbox.username) || (chips.value = [...values, mailbox.username]);

        await me.timeout(1);
        me.isDestroyed || combo.clear()
    }

    createFormItems() {
        let me = this;

        const field = config => ({labelPosition: 'inline', flex: 'none', ...config});

        return [{
            ntype : 'container',
            cls   : ['go-md-address'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [field({
                module   : TextField,
                name     : 'address',
                reference: 'address',
                labelText: t('Address'),
                required : true,
                flex     : 1
            }), {
                ntype: 'component',
                cls  : ['go-md-at-domain'],
                flex : 'none',
                text : '@' + me.domain
            }]
        }, {
            ntype: 'component',
            cls  : ['go-field-hint'],
            flex : 'none',
            text : t("Use '*' for a catch all alias (not recommended).")
        }, field({
            module          : ChipsField,
            name            : 'recipients',
            reference       : 'recipients',
            labelText       : t('Goto'),
            placeholder     : t('E-mail'),
            textInputToValue: text => text.trim() || null
        }), field({
            // no name: only adds to the recipients
            module      : JmapComboBox,
            reference   : 'mailboxCombo',
            entity      : 'MailBox',
            displayField: 'username',
            properties  : ['id', 'username'],
            jmapSort    : [{property: 'username', isAscending: true}],
            labelText   : t('Add mailbox'),
            listeners   : {change: ({value}) => me.onMailboxPick(value)}
        }), {
            module    : BoolCheckBox,
            name      : 'active',
            valueLabel: t('Active')
        }]
    }
}

export default Neo.setupClass(AliasDialog);
