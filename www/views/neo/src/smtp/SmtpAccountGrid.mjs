import Container     from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Button        from '../button/Button.mjs';
import client        from '../jmap/Client.mjs';
import ActionTable   from '../list/ActionTable.mjs';
import {notifyError} from '../Notify.mjs';
import {t}           from '../Translate.mjs';
import ConfirmDialog from '../view/ConfirmDialog.mjs';
import SmtpAccountDialog from './SmtpAccountDialog.mjs';

/**
 * SMTP accounts of a module (go.smtp.GridPanel), e.g. in a module's System settings card:
 *
 *     {module: SmtpAccountGrid, smtpModule: {package: 'community', name: 'newsletters'}}
 *
 * Call load() when the card loads. Double click or ⋮ edit, delete asks first.
 */
class SmtpAccountGrid extends Container {
    static config = {
        className : 'GO.smtp.SmtpAccountGrid',
        baseCls   : ['go-smtp-grid', 'neo-container'],
        layout    : {ntype: 'vbox', align: 'stretch'},
        /**
         * Owning module: {package, name}
         * @member {Object|null} smtpModule=null
         */
        smtpModule: null
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype : 'toolbar',
            cls   : ['go-smtp-grid-tbar'],
            flex  : 'none',
            items : [{
                ntype: 'component',
                cls  : ['go-smtp-grid-title'],
                text : t('SMTP Accounts')
            }, '->', {
                module : Button,
                icon   : 'add',
                tooltip: t('Add'),
                handler: () => me.edit(null)
            }]
        }, {
            module   : ActionTable,
            reference: 'table',
            flex     : 'none',
            columns  : [
                {text: t('Hostname'), field: 'hostname', flex: true},
                {text: t('E-mail'),   field: 'fromEmail'}
            ],
            actions  : [
                {action: 'edit',   icon: 'edit',   tooltip: t('Edit')},
                {action: 'delete', icon: 'delete', tooltip: t('Delete')}
            ],
            listeners: {
                action        : ({action, record}) => action === 'edit' ? me.edit(record.id) : me.remove(record),
                rowDoubleClick: ({record}) => me.edit(record.id)
            }
        }]
    }

    /**
     * Loads the module's accounts
     */
    async load() {
        let me = this;

        try {
            const {list} = await client.queryGet('SmtpAccount', {
                filter    : me.smtpModule ? {module: me.smtpModule} : undefined,
                properties: ['id', 'hostname', 'fromEmail', 'fromName']
            });

            me.isDestroyed || (me.getReference('table').records = list)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * @param {String|null} id null: new account of smtpModule
     * @protected
     */
    edit(id) {
        let me     = this,
            config = {appName: me.appName, windowId: me.windowId};

        id ? (config.entityId = id) : (config.values = {module: me.smtpModule});

        Neo.create(SmtpAccountDialog, config).on('save', () => me.load())
    }

    /**
     * @param {Object} record
     * @protected
     */
    async remove(record) {
        let me = this;

        const yes = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Confirm delete'),
            message : t('Are you sure you want to delete the selected item?')
        });

        if (!yes || me.isDestroyed) {
            return
        }

        try {
            await client.set('SmtpAccount', {destroy: [record.id]});
            me.load()
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(SmtpAccountGrid);
