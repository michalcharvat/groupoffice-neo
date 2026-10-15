import Toolbar         from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button          from '../../../../../../../views/neo/src/button/Button.mjs';
import client          from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {notifyError}   from '../../../../../../../views/neo/src/Notify.mjs';
import EntityListPanel from '../../../../../../../views/neo/src/systemsettings/EntityListPanel.mjs';
import {smartDateTime} from '../../../../../../../views/neo/src/Format.mjs';
import {t as coreT, translator} from '../../../../../../../views/neo/src/Translate.mjs';
import Dialog, {headerTools} from '../../../../../../../views/neo/src/view/Dialog.mjs';

const t = translator('community', 'davclient');

/**
 * "DAV Accounts" card of My account (GOUI davclient SystemSettings): CalDAV accounts whose
 * calendars are synchronised; sync, edit, delete (keeping the calendars or not)
 */
class AccountsPanel extends EntityListPanel {
    static config = {
        className : 'GO.davclient.view.AccountsPanel',
        entity    : 'DavAccount',
        properties: ['id', 'name', 'active', 'lastSync', 'lastError', 'collections'],
        dialog    : () => import('./AccountDialog.mjs'),
        columns   : [
            {text: '', render: record => record.lastError ? '⚠' : (record.active ? '✓' : '✕')},
            {text: t('Name'), field: 'name', flex: true},
            {text: t('Last Sync'), render: record => record.lastSync ? smartDateTime(record.lastSync) : ''},
            {text: t('Collections'), render: record => String(Object.keys(record.collections || {}).length)}
        ],
        actions   : [{action: 'sync', icon: 'sync', tooltip: t('Sync')}]
    }

    /**
     * My account loaded the user
     */
    onLoad() {
        this.load()
    }

    async onAction(action, record) {
        let me = this;

        if (action !== 'sync') {
            return super.onAction(action, record)
        }

        try {
            await client.call('DavAccount/sync', {accountId: record.id});
            me.load()
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * GOUI: keep the synchronised calendars, or delete them too
     * @param {Object} record
     */
    async remove(record) {
        let me     = this,
            answer = await KeepDataDialog.ask({appName: me.appName, windowId: me.windowId});

        if (answer === null || me.isDestroyed) {
            return
        }

        try {
            const response = await client.call('DavAccount/set', {destroy: [record.id], keepData: answer === 'keep'}),
                  error    = response.notDestroyed?.[record.id];

            if (error) {
                throw new Error(client.constructor.describeSetError(error))
            }

            me.load()
        } catch (e) {
            notifyError(me, e)
        }
    }
}

/**
 * "Keep calendar data?" with Cancel / Keep calendar data / Delete all
 */
class KeepDataDialog extends Dialog {
    static config = {
        className   : 'GO.davclient.view.KeepDataDialog',
        cls         : ['go-confirm-dialog'],
        modal       : true,
        resizable   : false,
        headerConfig: headerTools('close'),
        title       : t('Keep calendar data?'),
        wrapperStyle: {left: 'calc(50vw - 260px)', top: '30vh', width: 'min(520px, 100vw)'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        }
    }

    /**
     * 'keep', 'delete' or null (cancelled)
     * @member {String|null} answer=null
     */
    answer = null

    construct(config) {
        super.construct(config);

        let me     = this,
            answer = value => () => {
                me.answer = value;
                me.close()
            };

        me.items = [{
            ntype: 'component',
            cls  : ['go-confirm-message'],
            text : t('Do you want to keep the synchronised calendars or delete those as well?') + ' ' +
                   t('If only the account is deleted the calendars can still be deleted manually')
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            items : [{
                module : Button,
                text   : coreT('Cancel'),
                handler: () => me.close()
            }, '->', {
                module : Button,
                text   : t('Keep calendar data'),
                handler: answer('keep')
            }, {
                module : Button,
                ui     : 'primary',
                text   : t('Delete all'),
                handler: answer('delete')
            }]
        }]
    }

    /**
     * @param {Object} config appName, windowId
     * @returns {Promise<String|null>}
     */
    static ask(config) {
        return new Promise(resolve => {
            const dialog = Neo.create(KeepDataDialog, config);
            dialog.on('close', () => resolve(dialog.answer))
        })
    }
}

Neo.setupClass(KeepDataDialog);

export default Neo.setupClass(AccountsPanel);
