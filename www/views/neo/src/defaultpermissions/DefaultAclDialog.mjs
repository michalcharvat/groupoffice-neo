import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../button/Button.mjs';
import client        from '../jmap/Client.mjs';
import {notify, notifyError} from '../Notify.mjs';
import SharePanel    from '../permissions/SharePanel.mjs';
import {fmt, t}      from '../Translate.mjs';
import ConfirmDialog from '../view/ConfirmDialog.mjs';
import Dialog        from '../view/Dialog.mjs';

/**
 * Default permissions of new items of an entity (go.defaultpermissions.ShareWindow, admins):
 * the entity's default ACL in a SharePanel, saved as Module.entities[name].defaultAcl.
 * "Reset all" gives every existing item the default ACL, "Add to all" adds its groups to
 * every item (Acl/reset); both save first.
 *
 *     Neo.create(DefaultAclDialog, {appName, windowId, forEntity: 'NoteBook', title: t('Note book')})
 */
class DefaultAclDialog extends Dialog {
    static config = {
        className   : 'GO.defaultpermissions.DefaultAclDialog',
        cls         : ['go-defaultacl-dialog'],
        title       : t('Set default permissions'),
        modal       : true,
        resizable   : true,
        wrapperStyle: {
            height: 'min(600px, 90vh)',
            left  : 'max(0px, calc(50vw - 450px))',
            top   : 'max(5vh, calc(50vh - 300px))',
            width : 'min(900px, 100vw)'
        },
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * Entity name, e.g. "Group"
         * @member {String|null} forEntity=null
         */
        forEntity: null,
        /**
         * Id of the entity's module, looked up when not given
         * @member {String|null} moduleId=null
         */
        moduleId: null,
        /**
         * Entity title for the window title
         * @member {String|null} entityTitle=null
         */
        entityTitle: null
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.entityTitle && (me.title = t('Set default permissions') + ': ' + me.entityTitle);

        me.items = [{
            module   : SharePanel,
            reference: 'sharePanel',
            name     : null,
            flex     : 1
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : [{
                module   : Button,
                reference: 'resetButton',
                disabled : true,
                text     : t('Reset all'),
                handler  : () => me.reset(false)
            }, {
                module   : Button,
                reference: 'addButton',
                disabled : true,
                text     : t('Add to all'),
                handler  : () => me.reset(true)
            }, '->', {
                module : Button,
                text   : t('Cancel'),
                handler: () => me.requestClose()
            }, {
                module   : Button,
                ui       : 'primary',
                reference: 'saveButton',
                disabled : true,
                text     : t('Save'),
                handler  : () => me.submit().then(ok => ok && me.close())
            }]
        }]
    }

    /**
     * @returns {GO.permissions.SharePanel}
     */
    get sharePanel() {
        return this.getReference('sharePanel')
    }

    async onConstructed() {
        super.onConstructed();

        let me = this;

        try {
            // the saved default ACL, loaded here: a failure must not show (and save) an empty one
            const {list}  = await client.queryGet('Module', {properties: ['id', 'package', 'name', 'entities']}),
                  module  = me.moduleId ? list.find(m => String(m.id) === String(me.moduleId)) : list.find(m => m.entities?.[me.forEntity]),
                  entity  = module?.entities?.[me.forEntity];

            if (!entity) {
                throw new Error(fmt(t("Could not find entity '{name}'"), {name: me.forEntity}))
            }

            me.moduleId = module.id;

            SharePanel.clearDefaultAcls();
            await me.sharePanel.setEntity(me.forEntity, null);

            if (me.isDestroyed) {
                return
            }

            // an empty default ACL comes as null
            me.sharePanel.reset(entity.defaultAcl ? {...entity.defaultAcl} : null);
            ['saveButton', 'resetButton', 'addButton'].forEach(ref => me.getReference(ref).disabled = false)
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * Saves the default ACL
     * @returns {Promise<Boolean>}
     */
    async submit() {
        let me     = this,
            button = me.getReference('saveButton');

        if (button.disabled) {
            return false
        }

        button.disabled = true;

        try {
            const response = await client.call('Module/set', {update: {[me.moduleId]: {
                entities: {[me.forEntity]: {defaultAcl: me.sharePanel.getSubmitValue() || {}}}
            }}});

            if (response.notUpdated?.[me.moduleId]) {
                throw new Error(client.constructor.describeSetError?.(response.notUpdated[me.moduleId]) || t('Failed to save'))
            }

            // new items of every SharePanel get the new default
            SharePanel.clearDefaultAcls();
            // saved: the new baseline for the discard question
            me.sharePanel.reset(me.sharePanel.value ? {...me.sharePanel.value} : null);
            me.fire('save', {});
            return true
        } catch (e) {
            me.isDestroyed || notifyError(me, e);
            return false
        } finally {
            me.isDestroyed || (button.disabled = false)
        }
    }

    /**
     * Close by the user (Cancel, X, Escape): asks before discarding changes
     */
    async requestClose() {
        let me = this;

        if (me.isClosing || me.isDestroyed) {
            return
        }

        if (me.sharePanel?.isDirty && !await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : t('Are you sure you want to close this window and discard your changes?')
        })) {
            return
        }

        me.isDestroyed || me.close()
    }

    closeOrHideAction() {
        this.requestClose()
    }

    onKeyDownEscape() {
        this.requestClose()
    }

    /**
     * Acl/reset over all items of the entity, after saving
     * @param {Boolean} add true: add the default groups, false: replace the permissions
     */
    async reset(add) {
        let me = this;

        const yes = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Confirm'),
            message : add
                ? t("Are you sure you want to add the default groups to all items? WARNING: This can't be undone.")
                : t("Are you sure you want to reset all permissions? WARNING: This can't be undone.")
        });

        if (!yes || me.isDestroyed || !await me.submit()) {
            return
        }

        try {
            await client.call('Acl/reset', {add, entity: me.forEntity});
            me.isDestroyed || notify(me, t('Changing permissions...') + ' ✓')
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }
}

export default Neo.setupClass(DefaultAclDialog);
