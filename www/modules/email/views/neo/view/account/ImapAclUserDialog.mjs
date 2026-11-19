import ComboBox     from '../../../../../../views/neo/node_modules/neo.mjs/src/form/field/ComboBox.mjs';
import TextField    from '../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox from '../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import {fieldset}   from '../../../../../../views/neo/src/form/fieldset.mjs';
import TextList     from '../../../../../../views/neo/src/list/TextList.mjs';
import {t as coreT} from '../../../../../../views/neo/src/Translate.mjs';
import {t}          from '../../util.mjs';
import * as accountApi from './accountApi.mjs';
import LegacyFormWindow from './LegacyFormWindow.mjs';
import {centered, field} from './RecordDialog.mjs';

/**
 * The IMAP rights of one user on a folder (ExtJS GO.email.ImapAclUserDialog, email/folder/setAcl):
 * the IMAP user name (suggestions from email/account/usernames) and read, write, delete, create
 * mailbox, delete mailbox, administrate. An existing entry keeps its user name.
 *
 *     Neo.create(ImapAclUserDialog, {appName, windowId, accountId, mailbox, record}) // record null: new
 */
class ImapAclUserDialog extends LegacyFormWindow {
    static config = {
        className   : 'GO.email.account.ImapAclUserDialog',
        title       : t('Share'),
        wrapperStyle: centered(440, 520),
        /**
         * @member {Number|null} accountId=null
         */
        accountId: null,
        /**
         * @member {String} mailbox=''
         */
        mailbox: '',
        /**
         * The aclStore record to edit, null for a new user
         * @member {Object|null} record=null
         */
        record: null
    }

    /**
     * @returns {Object} right → label
     */
    static rightLabels() {
        return {
            read         : t('Read'),
            write        : t('Write'),
            delete       : t('Delete'),
            createmailbox: t('Create mailbox'),
            deletemailbox: t('Delete mailbox'),
            admin        : t('Administrate')
        }
    }

    construct(config) {
        const record = config.record,
              values = {identifier: record?.identifier || ''};

        accountApi.IMAP_RIGHTS.forEach(right => values[right] = !!record?.[right]);
        // a new user may read by default
        record || (values.read = true);
        config.values = values;

        super.construct(config)
    }

    createFormItems() {
        let me     = this,
            labels = ImapAclUserDialog.rightLabels();

        return [
            me.record
                ? field(TextField, 'identifier', coreT('Username'), {readOnly: true})
                : field(ComboBox, 'identifier', coreT('Username'), {
                    reference   : 'identifier',
                    width       : null,
                    displayField: 'name',
                    valueField  : 'id',
                    // free text: any IMAP user, the list only suggests
                    forceSelection: false,
                    listConfig  : {module: TextList},
                    store       : {keyProperty: 'id', data: []}
                }),
            fieldset(coreT('Permissions'), accountApi.IMAP_RIGHTS.map(right => ({
                module    : BoolCheckBox,
                name      : right,
                flex      : 'none',
                valueLabel: labels[right]
            })))
        ]
    }

    onConstructed() {
        const result = super.onConstructed();
        this.record || this.loadUsernames();
        return result
    }

    async loadUsernames() {
        let me = this;

        try {
            const names = await accountApi.imapUsernames(),
                  combo = me.getReference('identifier');

            combo && !me.isDestroyed && (combo.store.data = names.map(name => ({id: name, name})))
        } catch (e) {
            console.error('email/account/usernames', e)
        }
    }

    /**
     * The combo's typed text or picked user name
     * @returns {Promise<String>}
     */
    async identifier(values) {
        let me = this;

        if (me.record) {
            return me.record.identifier
        }

        const combo = me.getReference('identifier'),
              value = combo?.value;

        return String((value && typeof value === 'object' ? value.id : value) || combo?.lastManualInput || values.identifier || '').trim()
    }

    async save(modified, values) {
        let me         = this,
            identifier = await me.identifier(values);

        if (!identifier) {
            throw new Error(t('Please enter a username'))
        }

        await accountApi.setImapAcl(me.accountId, me.mailbox, identifier, values);
        return {identifier}
    }
}

export default Neo.setupClass(ImapAclUserDialog);
