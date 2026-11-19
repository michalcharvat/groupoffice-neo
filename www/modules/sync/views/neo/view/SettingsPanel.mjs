import Container      from '../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import BoolCheckBox   from '../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import LocalCombo     from '../../../../../views/neo/src/form/field/LocalCombo.mjs';
import client         from '../../../../../views/neo/src/jmap/Client.mjs';
import TextList       from '../../../../../views/neo/src/list/TextList.mjs';
import {LEVEL_READ, LEVEL_WRITE} from '../../../../../views/neo/src/Acl.mjs';
import {fieldset}     from '../../../../../views/neo/src/form/fieldset.mjs';
import {t as coreT, translator} from '../../../../../views/neo/src/Translate.mjs';
import SyncBooksField from './SyncBooksField.mjs';

const t = translator('legacy', 'sync');

/**
 * Synchronization card of My account (GO.sync.SettingsPanel): the user's syncSettings,
 * saved with the User. Deleting through a device, the e-mail account and the note books
 * and address books a device synchronizes, each with a default for new items.
 *
 * The legacy calendar and tasks panels of ExtJS only show with the legacy calendar /
 * tasks modules, which GO 26 no longer has.
 */
class SettingsPanel extends Container {
    static config = {
        className: 'GO.sync.view.SettingsPanel',
        baseCls  : ['go-sync-settings', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);

        let me    = this,
            // books the user (also one an administrator edits) can read
            books = (name, entity, idField, title, capability) => client.hasCapability(capability) ? [fieldset(title, [{
                module    : SyncBooksField,
                reference : name,
                name      : 'syncSettings.' + name,
                entity,
                idField,
                height    : 260,
                jmapFilter: {permissionLevel: LEVEL_READ}
            }])] : [];

        me.items = [fieldset(coreT('General'), [{
            module    : BoolCheckBox,
            name      : 'syncSettings.allowDeletes',
            valueLabel: t('Allow delete via synchronization')
        }, {
            ntype: 'component',
            cls  : ['go-field-hint'],
            text : t('By default devices are not allowed to delete items. This was added due to a bug in Android 12 that deleted contacts after an update.')
        }]),
        ...client.hasCapability('go:legacy:email') ? [fieldset(coreT('E-mail'), [{
            module       : LocalCombo,
            reference    : 'account',
            name         : 'syncSettings.account_id',
            labelText    : coreT('E-mail Account', 'legacy', 'email'),
            labelPosition: 'inline',
            width        : null,
            editable     : false,
            displayField : 'name',
            valueField   : 'id',
            listConfig   : {module: TextList},
            store        : {keyProperty: 'id', data: []}
        }])] : [],
        ...books('noteBooks', 'NoteBook', 'noteBookId', coreT('Notebooks', 'community', 'notes'), 'go:community:notes'),
        ...books('addressBooks', 'AddressBook', 'addressBookId', coreT('Address books', 'community', 'addressbook'), 'go:community:addressbook')]
    }

    /**
     * Called by the My account dialog after every load: the lists follow the edited user
     * (ExtJS onLoadStart: permissionLevelUserId)
     * @param {Object} user
     */
    onLoad(user) {
        let me = this;

        ['noteBooks', 'addressBooks'].forEach(name => {
            const field = me.getReference(name);
            field && (field.jmapFilter = {permissionLevel: LEVEL_READ, permissionLevelUserId: user.id})
        });

        me.getReference('account') && me.loadAccounts(user)
    }

    /**
     * E-mail accounts the user may write to: only those can be synchronized
     * @param {Object} user
     * @protected
     */
    async loadAccounts(user) {
        let me    = this,
            combo = me.getReference('account');

        try {
            const {results = []} = await client.legacy('email/account/store', {
                    permissionLevel      : LEVEL_WRITE,
                    permissionLevelUserId: user.id,
                    limit                : 0
                }),
                value = user.syncSettings?.account_id ?? null;

            if (me.isDestroyed) {
                return
            }

            combo.store.data = results.map(a => ({id: a.id, name: a.username}));

            // the value arrived before its option: shown as loaded, not as a change
            if (value != null) {
                combo.value = value;
                me.up({className: 'GO.form.DataSourceForm'})?.setOriginalValue(combo.name, combo.getSubmitValue())
            }
        } catch (e) {
            console.warn('sync: e-mail accounts', e)
        }
    }
}

export default Neo.setupClass(SettingsPanel);
