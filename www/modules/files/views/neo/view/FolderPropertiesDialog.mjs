import TextArea     from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField    from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import DescriptionList from '../../../../../views/neo/src/component/DescriptionList.mjs';
import BoolCheckBox from '../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import client       from '../../../../../views/neo/src/jmap/Client.mjs';
import SharePanel   from '../../../../../views/neo/src/permissions/SharePanel.mjs';
import ConfirmDialog from '../../../../../views/neo/src/view/ConfirmDialog.mjs';
import {translator} from '../../../../../views/neo/src/Translate.mjs';
import {decodeEntities, isValidName} from '../util.mjs';
import LegacyFormWindow from './LegacyFormWindow.mjs';
import {saveAcl} from './acl.mjs';

const t = translator('legacy', 'files');

/**
 * Folder properties (ExtJS GO.files.FolderPropertiesDialog, files/folder/load|submit):
 * name, comment, "Activate sharing" (own ACL), "Notify me about changes", "Apply the
 * folder's display settings for everyone"; permissions of a shared folder on their own tab.
 *
 *     FolderPropertiesDialog.open({appName, windowId, folderId}) // → the dialog, after loading
 */
class FolderPropertiesDialog extends LegacyFormWindow {
    static config = {
        className    : 'GO.files.view.FolderPropertiesDialog',
        cls          : ['go-form-window', 'go-files-properties'],
        title        : t('Properties'),
        wrapperStyle : {height: '70vh', left: 'calc(50vw - 300px)', top: '15vh', width: '600px'},
        generalHeader: {text: t('Properties')},
        /**
         * files/folder/load data
         * @member {Object} folder={}
         */
        folder: {}
    }

    /**
     * {groupId: level} of the ACL as loaded
     * @member {Object|null} aclValue=null
     */
    aclValue = null

    /**
     * Loads the folder and its ACL, then shows the dialog
     * @param {Object} config appName, windowId, folderId
     * @returns {Promise<FolderPropertiesDialog>}
     */
    static async open({folderId, ...config}) {
        const {data} = await client.legacy('files/folder/load', {id: folderId}),
              acl    = data.acl_id ? await loadAcl(data.acl_id) : null;

        return Neo.create(FolderPropertiesDialog, {
            ...config,
            folder: {...data, aclManage: acl?.manage},
            values: {
                name           : decodeEntities(data.name),
                comment        : data.comment || '',
                share          : !!data.acl_id,
                notify         : !!data.notify,
                apply_state    : !!data.apply_state
            },
            aclValue: acl?.value || null
        })
    }

    construct(config) {
        const aclValue = config.aclValue;
        delete config.aclValue;
        super.construct(config);
        this.aclValue = aclValue
    }

    createFormItems() {
        let me       = this,
            folder   = me.folder,
            level    = +folder.permission_level || 0,
            home     = !!folder.is_someones_home_dir,
            readonly = !!+folder.readonly;

        return [{
            module       : TextField,
            name         : 'name',
            labelText    : t('Name'),
            labelPosition: 'inline',
            required     : true,
            disabled     : home || readonly || level < 30,
            validator    : field => isValidName(String(field.value || '')) || t('Invalid file or folder name')
        }, {
            module : DescriptionList,
            records: [
                [t('Location'), decodeEntities(folder.path)],
                [t('URL'), folder.url],
                [t('Created at'), folder.ctime],
                [t('Created by'), folder.username],
                [t('Modified at'), folder.mtime],
                [t('Modified by'), folder.musername]
            ]
        }, {
            module    : BoolCheckBox,
            name      : 'share',
            valueLabel: t('Activate sharing'),
            disabled  : home || readonly || level < 50
        }, {
            module    : BoolCheckBox,
            name      : 'notify',
            valueLabel: t('Notify me about changes in this folder')
        }, {
            module    : BoolCheckBox,
            name      : 'apply_state',
            valueLabel: t("Apply the folder's display settings for everyone."),
            disabled  : level < 50 && !client.user?.isAdmin
        }, {
            module       : TextArea,
            name         : 'comment',
            labelText    : t('Comment'),
            labelPosition: 'inline',
            height       : 120,
            disabled     : readonly || level < 30
        }]
    }

    onConstructed() {
        const result = super.onConstructed();
        this.addPermissionsCard();
        return result
    }

    /**
     * "Permissions" tab of a shared folder (its own ACL)
     */
    addPermissionsCard() {
        let me = this;

        if (!me.folder.acl_id) {
            return
        }

        me.addCard({
            header: {text: t('Permissions')},
            items : [{module: SharePanel, reference: 'sharePanel', flex: 1, name: 'aclLevels', readOnly: !me.folder.aclManage}]
        });

        me.on('formReady', async () => {
            const panel = me.getReference('sharePanel');

            if (panel) {
                await panel.setAclId(me.folder.acl_id, me.aclValue).catch(e => console.error('SharePanel', e));
                me.isDestroyed || me.form.setOriginalValue('aclLevels', panel.getSubmitValue())
            }
        })
    }

    async save(modified, values) {
        let me     = this,
            folder = me.folder,
            params = {id: folder.id};

        ['name', 'comment'].forEach(key => key in modified && (params[key] = modified[key]));
        'apply_state' in modified && (params.apply_state = modified.apply_state ? 1 : 0);
        'share' in modified && (params.share = modified.share ? 1 : 0);

        if ('notify' in modified) {
            params.notify = modified.notify ? 1 : 0;

            // ExtJS: the subfolders too?
            params.notifyRecursive = await ConfirmDialog.ask({
                appName : me.appName,
                windowId: me.windowId,
                message : t('Do you want to apply this to all the subfolders?')
            }) ? 'true' : 'false'
        }

        if (params.share === 0 && !await ConfirmDialog.ask({appName: me.appName, windowId: me.windowId,
            message: t('Are you sure you want to stop sharing this folder? Everyone except you loses access.')})) {
            return false
        }

        // levels first: "stop sharing" removes the ACL
        if (modified.aclLevels && folder.acl_id && params.share !== 0) {
            await saveAcl(folder.acl_id, me.aclValue || {}, values.aclLevels || {})
        }

        Object.keys(params).length > 1 && await client.legacy('files/folder/submit', params);

        return {id: folder.id, shared: params.share}
    }
}

/**
 * @param {Number} aclId
 * @returns {Promise<{value: Object, manage: Boolean}>}
 */
async function loadAcl(aclId) {
    const {results = [], manage_permission} = await client.legacy('core/aclGroup/selectedStore', {model_id: aclId, limit: 0}),
          value = {};

    results.forEach(r => value[r.id] = +r.level);
    return {value, manage: !!manage_permission}
}

export default Neo.setupClass(FolderPropertiesDialog);
