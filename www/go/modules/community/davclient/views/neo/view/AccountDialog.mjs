import PasswordField from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Password.mjs';
import TextField     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox  from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import LocalCombo    from '../../../../../../../views/neo/src/form/field/LocalCombo.mjs';
import client        from '../../../../../../../views/neo/src/jmap/Client.mjs';
import ActionTable   from '../../../../../../../views/neo/src/list/ActionTable.mjs';
import TextList      from '../../../../../../../views/neo/src/list/TextList.mjs';
import {notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import SharePanel    from '../../../../../../../views/neo/src/permissions/SharePanel.mjs';
import FormWindow    from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import {formatUserDateTime} from '../../../../../../../views/neo/src/Format.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'davclient');

/**
 * CalDAV account (GOUI davclient AccountWindow): server and login on the first card
 * ("Connect" logs in and finds the calendars), the synchronised collections on the second,
 * permissions on the third. Stays open after saving: a failed connection shows its error,
 * a working one shows the collections.
 */
class AccountDialog extends FormWindow {
    static config = {
        className    : 'GO.davclient.view.AccountDialog',
        cls          : ['go-form-window', 'go-davclient-account'],
        entityName   : 'DavAccount',
        title        : t('Account'),
        closeOnSave  : false,
        generalHeader: {text: t('Server')},
        wrapperStyle : {height: 'min(650px, 90vh)', left: 'calc(50vw - 370px)', top: '5vh', width: 'min(740px, 100vw)'},
        values       : {active: true, verifySSL: true, refreshInterval: 15}
    }

    createFormItems() {
        const field = (module, name, labelText, config = {}) => ({module, name, labelText, labelPosition: 'inline', ...config});

        return [
            // GOUI: shown for a working account (switch it off); after a failed connection
            // saving connects again
            {...field(BoolCheckBox, 'active', null), reference: 'activeField', valueLabel: t('Enabled'), hidden: true},
            field(TextField, 'name', t('Name')),
            field(TextField, 'host', t('Host')),
            {module: BoolCheckBox, name: 'verifySSL', valueLabel: t('Verify SSL certificate')},
            field(TextField, 'username', t('Username')),
            field(PasswordField, 'password', t('Password'), {autoComplete: 'new-password'}),
            field(LocalCombo, 'refreshInterval', t('Refresh calendars'), {
                width       : null,
                displayField: 'name',
                valueField  : 'id',
                editable    : false,
                listConfig  : {module: TextList},
                store       : {keyProperty: 'id', data: [{id: 15, name: t('Every quarter')}, {id: 60, name: t('Every hour')}]}
            }),
            {ntype: 'component', reference: 'lastError', cls: ['go-davclient-error'], hidden: true}
        ]
    }

    addCustomFields() {
        // DavAccount has no custom fields
    }

    onConstructed() {
        const result = super.onConstructed();

        let me = this;

        me.addCard({
            header: {text: t('Collections')},
            items : [{
                module   : ActionTable,
                reference: 'collections',
                flex     : 'none',
                emptyText: t('Connect to find the calendars of the account'),
                columns  : [
                    {text: '', render: c => c.lastError ? '⚠' : ''},
                    {text: t('Name'), flex: true, render: c => `${c.name || ''}${c.uri ? ' (' + c.uri + ')' : ''}`},
                    {text: t('Last Sync'), render: c => c.lastSync ? formatUserDateTime(c.lastSync) : t('Never')}
                ],
                actions  : [
                    {action: 'sync',   icon: 'sync',   tooltip: t('Sync now')},
                    {action: 'remove', icon: 'delete', tooltip: t('Remove from sync')}
                ],
                listeners: {action: ({action, record}) => action === 'sync' ? me.syncCollection(record) : me.removeCollection(record)}
            }]
        });

        me.addCard({
            header: {text: t('Permissions')},
            items : [{module: SharePanel, reference: 'sharePanel', flex: 1}]
        });

        me.form.on('load', ({data}) => me.showAccount(data));

        me.on('formReady', async ({currentId}) => {
            const panel = me.getReference('sharePanel');

            await panel?.setEntity('DavAccount', currentId || null).catch(e => console.error('SharePanel', e));
            !currentId && panel && !me.isDestroyed && me.form.setOriginalValue('acl', panel.getSubmitValue())
        });

        me.form.on('beforesave', ({data}) => {
            // GOUI: saving after an error connects again
            me.lastError && (data.active = true)
        });

        me.on('save', ({data}) => me.afterSave(data?.id || me.form.currentId));

        return result
    }

    /**
     * Error, button text and collections of the loaded account
     * @param {Object} account
     */
    showAccount(account) {
        let me    = this,
            error = me.getReference('lastError');

        me.lastError = account.lastError || null;
        me.collections = account.collections || {};

        error.text   = me.lastError || '';
        error.hidden = !me.lastError;
        me.getReference('activeField').hidden = !account.id || !!me.lastError;
        // GOUI: "Connect" until the account works
        me.getReference('saveButton').text = !account.id || me.lastError ? t('Connect') : t('Save');

        me.getReference('collections').records = Object.entries(me.collections).map(([id, c]) => ({...c, id}))
    }

    /**
     * Saved: the server connected (or not). Errors stay on the first card, a working
     * account shows its collections, a switched off one closes.
     * @param {String} id
     */
    async afterSave(id) {
        let me = this;

        try {
            const [account] = await client.get('DavAccount', [id]);

            if (me.isDestroyed || !account) {
                return
            }

            await me.form.load(id);

            if (account.lastError) {
                return
            }

            account.active ? (me.cards.activeIndex = 1) : me.close()
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * @param {Object} collection
     */
    async syncCollection(collection) {
        let me = this;

        try {
            await client.call('DavAccount/sync', {accountId: me.form.currentId, collectionId: collection.id});
            me.isDestroyed || await me.form.load(me.form.currentId)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * GOUI "Remove from sync": the collection leaves the account's map
     * @param {Object} collection
     */
    async removeCollection(collection) {
        let me                  = this,
            {[collection.id]: _, ...rest} = me.collections;

        try {
            await client.set('DavAccount', {update: {[me.form.currentId]: {collections: rest}}});
            me.isDestroyed || await me.form.load(me.form.currentId)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }
}

export default Neo.setupClass(AccountDialog);
