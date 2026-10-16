import Button        from '../button/Button.mjs';
import GroupCombo    from '../form/field/GroupCombo.mjs';
import client        from '../jmap/Client.mjs';
import ActionTable   from '../list/ActionTable.mjs';
import {notifyError} from '../Notify.mjs';
import {fmt, t}      from '../Translate.mjs';
import Dialog        from '../view/Dialog.mjs';
import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';

/** core group "Admins": has every right anyway, the combo does not offer it (go.modules.GroupRights) */
const ADMINS = '1';

/**
 * Permissions of a module (go.modules.GroupRights): the groups that may use it, each
 * with the module's extra rights (mayManage, ...). Saved as Module.permissions,
 * {groupId: {groupId, rights: {name: true}}}.
 *
 *     Neo.create(ModuleRightsDialog, {appName, windowId, moduleId: 5, rights: ['mayManage']})
 */
class ModuleRightsDialog extends Dialog {
    static config = {
        className   : 'GO.systemsettings.ModuleRightsDialog',
        cls         : ['go-modulerights-dialog'],
        modal       : true,
        resizable   : true,
        title       : t('Permissions'),
        wrapperStyle: {
            height: 'min(600px, 90vh)',
            left  : 'max(0px, calc(50vw - 400px))',
            top   : 'max(5vh, calc(50vh - 300px))',
            width : 'min(800px, 100vw)'
        },
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * @member {String|null} moduleId=null
         */
        moduleId: null,
        /**
         * Right names besides "mayRead" (the group is listed)
         * @member {String[]} rights=[]
         */
        rights: []
    }

    /**
     * The loaded Module
     * @member {Object|null} module=null
     */
    module = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            cls   : ['go-modulerights-tbar'],
            flex  : 'none',
            items : [{
                module         : GroupCombo,
                reference      : 'addGroup',
                name           : null,
                labelText      : null,
                placeholderText: t('Add group'),
                flex           : 1,
                listeners      : {change: ({value}) => value && me.addGroup(value)}
            }]
        }, {
            ntype : 'container',
            cls   : ['go-modulerights-list'],
            flex  : 1,
            items : [{
                module   : ActionTable,
                reference: 'table',
                keyProperty: 'groupId',
                columns  : [{text: t('Group'), field: 'groupName', flex: true}],
                actions  : [{action: 'delete', icon: 'delete', tooltip: t('Delete')}],
                listeners: {action: ({record}) => me.removeGroup(record)}
            }]
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : ['->', {
                module : Button,
                text   : t('Cancel'),
                handler: () => me.close()
            }, {
                module   : Button,
                ui       : 'primary',
                reference: 'saveButton',
                disabled : true,
                text     : t('Save'),
                handler  : () => me.submit()
            }]
        }]
    }

    /**
     * @returns {GO.list.ActionTable}
     */
    get table() {
        return this.getReference('table')
    }

    async onConstructed() {
        super.onConstructed();

        let me = this;

        try {
            const [module] = await client.get('Module', [String(me.moduleId)], ['id', 'name', 'package', 'permissions']);

            if (!module) {
                throw new Error(t('Not found'))
            }

            if (me.isDestroyed) {
                return
            }

            me.module = module;
            me.title  = t('Permissions') + ' ' + module.name;

            const pkg = module.package || 'legacy';

            me.table.columns = [
                {text: t('Group'), field: 'groupName', flex: true},
                // the module's own words for its rights ("mayManage" → "Manage")
                ...me.rights.map(right => ({text: t(right, pkg, module.name), field: right, type: 'check'}))
            ];

            const permissions = Object.values(module.permissions || {}),
                  groups      = await me.loadGroups(permissions.map(p => p.groupId));

            me.isDestroyed || (me.table.records = permissions.map(p => ({
                groupId  : String(p.groupId),
                groupName: groups[String(p.groupId)] || String(p.groupId),
                ...Object.fromEntries(me.rights.map(right => [right, !!p.rights?.[right]]))
            })));

            me.isDestroyed || (me.getReference('saveButton').disabled = false)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * @param {String[]} ids
     * @returns {Promise<Object>} id → name (user groups: the user's name)
     * @protected
     */
    async loadGroups(ids) {
        if (!ids.length) {
            return {}
        }

        const list = await client.get('Group', ids.map(String), ['id', 'name']);
        return Object.fromEntries(list.map(g => [String(g.id), g.name]))
    }

    /**
     * @param {String|Object} value combo value: id or record
     * @protected
     */
    async addGroup(value) {
        let me    = this,
            combo = me.getReference('addGroup'),
            id    = String(value?.id ?? value);

        combo.value = null;

        if (id === ADMINS || me.table.getRecord(id)) {
            return
        }

        const names = await me.loadGroups([id]);

        if (me.isDestroyed) {
            return
        }

        me.table.records = [{
            groupId  : id,
            groupName: names[id] || id,
            ...Object.fromEntries(me.rights.map(right => [right, false]))
        }, ...me.table.records]
    }

    /**
     * @param {Object} record
     * @protected
     */
    removeGroup(record) {
        this.table.records = this.table.records.filter(r => r !== record)
    }

    /**
     * Saves all listed groups as the module's permissions
     */
    async submit() {
        let me     = this,
            button = me.getReference('saveButton');

        if (!me.module || button.disabled) {
            return
        }

        const permissions = Object.fromEntries(me.table.records.map(record => [record.groupId, {
            groupId: record.groupId,
            rights : Object.fromEntries(me.rights.filter(right => record[right]).map(right => [right, true]))
        }]));

        button.disabled = true;

        try {
            await client.set('Module', {update: {[me.module.id]: {permissions}}});
            me.fire('save', {permissions});
            me.close()
        } catch (e) {
            notifyError(me, new Error(fmt(t('Permissions') + ' {name}: ', {name: me.module.name}) + e.message))
        } finally {
            me.isDestroyed || (button.disabled = false)
        }
    }
}

export default Neo.setupClass(ModuleRightsDialog);
