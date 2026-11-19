import TextField  from '../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar    from '../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button     from '../../../../../../views/neo/src/button/Button.mjs';
import HtmlField  from '../../../../../../views/neo/src/form/field/HtmlField.mjs';
import LocalCombo from '../../../../../../views/neo/src/form/field/LocalCombo.mjs';
import client     from '../../../../../../views/neo/src/jmap/Client.mjs';
import TextList   from '../../../../../../views/neo/src/list/TextList.mjs';
import SharePanel from '../../../../../../views/neo/src/permissions/SharePanel.mjs';
import LegacyFormWindow from '../../../../../../views/neo/src/view/LegacyFormWindow.mjs';
import {LEVEL_MANAGE} from '../../../../../../views/neo/src/Acl.mjs';
// the legacy ACL helpers of the files module (core/aclGroup), see docs/neo-email-module.md
import {saveAcl} from '../../../../../files/views/neo/view/acl.mjs';
import {t} from '../../util.mjs';
import {groupStore, loadTemplate, submitTemplate} from './api.mjs';
import {autodataMenu} from './autodata.mjs';
import TemplateAttachmentsField from './TemplateAttachmentsField.mjs';

/**
 * Creates or edits a legacy e-mail template (ExtJS GO.email.EmailTemplateDialog,
 * email/template/load|submit): name, subject, group, the HTML body with the "Autodata"
 * menu that inserts tags at the cursor, attachments, and the template's permissions on
 * their own card (existing templates; a new one gets its ACL when it is saved).
 *
 *     const dialog = await EmailTemplateDialog.open({appName, windowId, templateId}) // no templateId: new
 *     dialog.on('save', ({data}) => …) // data: {id}
 */
class EmailTemplateDialog extends LegacyFormWindow {
    static config = {
        className    : 'GO.email.settings.EmailTemplateDialog',
        cls          : ['go-form-window', 'go-email-template-dialog'],
        title        : t('E-mail template'),
        modal        : false,
        wrapperStyle : {height: '80vh', left: 'max(0px, calc(50vw - 450px))', top: '10vh', width: 'min(900px, 100vw)'},
        generalHeader: {text: t('Properties')},
        /**
         * email/template/load data, {} for a new template
         * @member {Object} template={}
         */
        template: {},
        /**
         * Template groups [{id, name}]
         * @member {Object[]} groups=[]
         */
        groups: []
    }

    /**
     * {groupId: level} of the ACL as loaded
     * @member {Object|null} aclValue=null
     */
    aclValue = null

    /**
     * Loads the template (and its ACL) and the groups, then shows the dialog
     * @param {Object} config appName, windowId, templateId
     * @returns {Promise<EmailTemplateDialog>}
     */
    static async open({templateId, ...config}) {
        const [template, groups] = await Promise.all([templateId ? loadTemplate(templateId) : {}, groupStore()]),
              acl = template.acl_id ? await loadAcl(template.acl_id) : null;

        return Neo.create(EmailTemplateDialog, {
            ...config,
            template: {...template, aclManage: !!acl?.manage},
            groups,
            aclValue: acl?.value || null,
            values  : {
                name       : template.name || '',
                subject    : template.subject || '',
                group_id   : template.group_id ? +template.group_id : null,
                // the parsed message adds line breaks around the body on every save
                htmlbody   : (template.htmlbody || '').trim(),
                attachments: template.attachments || []
            }
        })
    }

    construct(config) {
        const aclValue = config.aclValue;
        delete config.aclValue;
        super.construct(config);
        this.aclValue = aclValue
    }

    addCustomFields() {
        // legacy templates have no custom fields
    }

    createFormItems() {
        let me = this;

        return [{
            module       : TextField,
            name         : 'name',
            labelText    : t('Name'),
            labelPosition: 'inline',
            required     : true,
            flex         : 'none'
        }, {
            module       : TextField,
            name         : 'subject',
            labelText    : t('Subject'),
            labelPosition: 'inline',
            flex         : 'none'
        }, {
            module       : LocalCombo,
            name         : 'group_id',
            labelText    : t('Group'),
            labelPosition: 'inline',
            flex         : 'none',
            width        : null,
            editable     : false,
            displayField : 'name',
            valueField   : 'id',
            listConfig   : {module: TextList},
            store        : {keyProperty: 'id', data: me.groups.map(({id, name}) => ({id: +id, name}))}
        }, {
            module: Toolbar,
            cls   : ['go-email-template-toolbar'],
            flex  : 'none',
            items : [{
                module : Button,
                icon   : 'data_object',
                text   : t('Autodata'),
                tooltip: t('Insert a field that is replaced when the template is used'),
                // above the dialog (neo menus default to z-index 100, dialogs are 1000)
                menu   : {items: autodataMenu(tag => me.getReference('body').insertText(tag)), zIndex: 1100}
            }]
        }, {
            module   : HtmlField,
            reference: 'body',
            name     : 'htmlbody',
            cls      : ['go-email-template-body'],
            flex     : 1
        }, {
            module   : TemplateAttachmentsField,
            reference: 'attachments',
            name     : 'attachments',
            flex     : 'none'
        }]
    }

    onConstructed() {
        const result = super.onConstructed();
        this.addPermissionsCard();
        return result
    }

    /**
     * "Permissions" card of an existing template (its own ACL), read only without manage
     */
    addPermissionsCard() {
        let me = this,
            {template} = me;

        if (!template.acl_id) {
            return
        }

        me.addCard({
            header: {text: t('Permissions')},
            items : [{
                module   : SharePanel,
                reference: 'sharePanel',
                name     : 'aclLevels',
                flex     : 1,
                readOnly : !template.aclManage && +template.permission_level < LEVEL_MANAGE
            }]
        });

        me.on('formReady', async () => {
            const panel = me.getReference('sharePanel');

            if (panel) {
                await panel.setAclId(template.acl_id, me.aclValue).catch(e => console.error('SharePanel', e));
                me.isDestroyed || me.form.setOriginalValue('aclLevels', panel.getSubmitValue())
            }
        })
    }

    async submit() {
        // the editor syncs its HTML debounced and uploads may still run: take them along
        // before LegacyFormWindow reads the values
        const fields = await this.form.getFields();
        await Promise.all(fields.filter(field => typeof field.flush === 'function').map(field => field.flush()));

        return super.submit()
    }

    async save(modified, values) {
        let me = this,
            {template} = me;

        // the server rebuilds the whole MIME message: always send subject, body and attachments
        const result = await submitTemplate({
            id               : template.id || 0,
            name             : values.name,
            subject          : values.subject || '',
            // empty = no group (NULL: group_id references go_template_group)
            group_id         : values.group_id || '',
            htmlbody         : values.htmlbody || '',
            attachments      : me.getReference('attachments').submitValue(),
            // stored inline images: their token in the body keeps them (Message::handleEmailFormInput())
            inlineAttachments: (template.inlineAttachments || []).map(({tmp_file, token}) => ({tmp_file, token}))
        });

        if (modified.aclLevels && template.acl_id) {
            await saveAcl(template.acl_id, me.aclValue || {}, values.aclLevels || {})
        }

        return {id: result.id}
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

export default Neo.setupClass(EmailTemplateDialog);
