import TextField         from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import {LEVEL_MANAGE}    from '../Acl.mjs';
import EntityCheckList   from '../form/field/EntityCheckList.mjs';
import client            from '../jmap/Client.mjs';
import {notifyError}     from '../Notify.mjs';
import SharePanel        from '../permissions/SharePanel.mjs';
import {t}               from '../Translate.mjs';
import FormWindow        from '../view/FormWindow.mjs';
import GroupModulesPanel from './GroupModulesPanel.mjs';

/** core group "Everyone": every user is a member, the list is hidden */
const EVERYONE = '2';

/**
 * Create or edit a group (go.groups.GroupDialog): name and members (users, checked ones
 * first), who may see and manage the group (acl) and, for admins, the modules the group
 * may use. The modules are saved after the group (Module/set).
 */
class GroupDialog extends FormWindow {
    /**
     * Module permissions are being saved
     * @member {Boolean} savingModules=false
     */
    savingModules = false

    static config = {
        className   : 'GO.groups.GroupDialog',
        cls         : ['go-form-window', 'go-group-dialog'],
        entityName  : 'Group',
        properties  : ['id', 'name', 'users', 'acl', 'permissionLevel'],
        title       : t('Group'),
        wrapperStyle: {height: 'min(800px, 90vh)', left: 'max(0px, calc(50vw - 450px))', top: 'max(5vh, calc(50vh - 400px))', width: 'min(900px, 100vw)'}
    }

    construct(config) {
        config.values ??= {users: []};
        super.construct(config)
    }

    createFormItems() {
        let me = this;

        return [{
            module       : TextField,
            name         : 'name',
            labelText    : t('Name'),
            labelPosition: 'inline',
            flex         : 'none',
            required     : true
        }, {
            module    : EntityCheckList,
            reference : 'members',
            name      : 'users',
            title     : t('Members'),
            flex      : 1,
            entity    : 'Principal',
            properties: ['id', 'name', 'description', 'avatarId'],
            // groupMember sorts the members on top
            jmapFilter: {entity: 'User', ...me.entityId ? {groupMember: me.entityId} : {}},
            hidden    : String(me.entityId) === EVERYONE
        }]
    }

    onConstructed() {
        let me     = this,
            result = super.onConstructed();

        me.addCard({
            header: {text: t('Permissions')},
            items : [{module: SharePanel, reference: 'sharePanel', flex: 1}]
        });

        client.isAdmin && me.addCard({
            header: {text: t('Modules')},
            items : [{module: GroupModulesPanel, reference: 'modules', flex: 1, groupId: me.entityId || null}]
        });

        me.on('formReady', async ({currentId}) => {
            const share   = me.getReference('sharePanel'),
                  modules = me.getReference('modules');

            modules?.load();
            // GroupModuleGrid: only managers of the group change its modules
            modules && currentId && (modules.readOnly = (me.form.entityData.permissionLevel || 0) < LEVEL_MANAGE);

            await share?.setEntity('Group', currentId || null).catch(e => console.error('SharePanel', e));

            // a new group's default ACL arrives after the form took its unmodified state
            !currentId && share && !me.isDestroyed && me.form.setOriginalValue('acl', share.getSubmitValue())
        });

        return result
    }

    /**
     * Module changes are no form value: they count as changes too
     * @returns {Promise<Boolean>}
     */
    async isModified() {
        return !!this.getReference('modules')?.isModified() || super.isModified()
    }

    /**
     * Saves the module changes; Save and the modules are locked meanwhile
     * @param {String} groupId
     * @returns {Promise<Boolean>}
     * @protected
     */
    async saveModules(groupId) {
        let me       = this,
            modules  = me.getReference('modules'),
            button   = me.getReference('saveButton'),
            readOnly = modules?.readOnly;

        if (!modules?.isModified()) {
            return true
        }

        me.savingModules = true;
        button.disabled  = true;
        modules.readOnly = true;

        try {
            await modules.save(groupId);
            return true
        } catch (e) {
            notifyError(me, e);
            return false
        } finally {
            me.savingModules = false;

            if (!me.isDestroyed) {
                button.disabled  = false;
                modules.readOnly = readOnly
            }
        }
    }

    async onFormSave(data) {
        let me = this;

        // the group is saved; its id is known now (new group)
        me.getReference('modules') && (me.getReference('modules').groupId = String(data.data.id));

        if (await me.saveModules(String(data.data.id)) && !me.isDestroyed) {
            super.onFormSave(data)
        }
    }

    async submit() {
        let me      = this,
            modules = me.getReference('modules');

        if (me.savingModules) {
            return false
        }

        // only modules changed: the form has nothing to send, the modules still save
        if (me.formReady && me.form.currentId && modules?.isModified() && !Object.keys(await me.form.getModified()).length) {
            const data = me.form.entityData;

            if (!await me.saveModules(String(me.form.currentId)) || me.isDestroyed) {
                return false
            }

            me.fire('save', {data, isNew: false});
            me.close();
            return data
        }

        return super.submit()
    }
}

export default Neo.setupClass(GroupDialog);
