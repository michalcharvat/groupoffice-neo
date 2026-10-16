import Container     from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Button        from '../button/Button.mjs';
import client        from '../jmap/Client.mjs';
import ActionTable   from '../list/ActionTable.mjs';
import {notifyError} from '../Notify.mjs';
import {t}           from '../Translate.mjs';
import ConfirmDialog from '../view/ConfirmDialog.mjs';
import AuthAllowGroupDialog from './AuthAllowGroupDialog.mjs';

/**
 * Groups that may log in from IP patterns (go.systemsettings.AuthAllowGroupGrid).
 * Changes are saved right away (AuthAllowGroup/set), not with the dialog's Save.
 */
class AuthAllowGroupGrid extends Container {
    static config = {
        className: 'GO.systemsettings.AuthAllowGroupGrid',
        baseCls  : ['go-systemsettings-grid', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype : 'toolbar',
            cls   : ['go-systemsettings-grid-tbar'],
            flex  : 'none',
            items : ['->', {
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
                {text: t('Group'),      field: 'groupName', flex: true},
                {text: t('IP pattern'), field: 'ipPattern'}
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
     * Called by the System settings dialog when it opens
     */
    async load() {
        let me = this;

        try {
            const {list} = await client.queryGet('AuthAllowGroup', {properties: ['id', 'groupId', 'ipPattern']}),
                  ids    = [...new Set(list.map(r => String(r.groupId)))],
                  groups = ids.length ? await client.get('Group', ids, ['id', 'name']) : [],
                  names  = Object.fromEntries(groups.map(g => [String(g.id), g.name]));

            me.isDestroyed || (me.getReference('table').records = list.map(r => ({...r, groupName: names[String(r.groupId)] || r.groupId})))
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * @param {String|null} id null: new
     * @protected
     */
    edit(id) {
        let me     = this,
            dialog = Neo.create(AuthAllowGroupDialog, {appName: me.appName, windowId: me.windowId, entityId: id});

        dialog.on('save', () => me.load())
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
            await client.set('AuthAllowGroup', {destroy: [record.id]});
            me.load()
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(AuthAllowGroupGrid);
