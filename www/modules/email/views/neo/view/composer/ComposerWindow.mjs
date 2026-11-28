import Button           from '../../../../../../views/neo/src/button/Button.mjs';
import Dialog           from '../../../../../../views/neo/src/view/Dialog.mjs';
import ConfirmDialog    from '../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import HtmlField        from '../../../../../../views/neo/src/form/field/HtmlField.mjs';
import RecipientsField  from '../../../../../../views/neo/src/form/field/RecipientsField.mjs';
import SelectField      from '../../../../../../views/neo/src/form/field/SelectField.mjs';
import client           from '../../../../../../views/neo/src/jmap/Client.mjs';
import CreateLinkButton from '../../../../../../views/neo/src/link/CreateLinkButton.mjs';
import MenuList         from '../../../../../../views/neo/src/menu/List.mjs';
import ModuleRegistry   from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {notify, notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import {t as coreT}     from '../../../../../../views/neo/src/Translate.mjs';
import Container        from '../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import FormContainer    from '../../../../../../views/neo/node_modules/neo.mjs/src/form/Container.mjs';
import TextArea         from '../../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField        from '../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar          from '../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {t, unescapeHtml} from '../../util.mjs';
import CloseDialog      from './CloseDialog.mjs';
import ComposerAttachmentsField from './ComposerAttachmentsField.mjs';
import {absoluteLegacyUrls, addSignature, attachmentsParam, formatRecipients, loadedAttachments, swapSignature, toRecipients} from './composerUtil.mjs';

/** ms between auto saves to Drafts (ExtJS autoSaveTask interval) */
const AUTO_SAVE_INTERVAL = 120000;

/** sendParams of a new message (ExtJS EmailComposer.defaultSendParams) */
const DEFAULT_SEND_PARAMS = {
    priority       : 3,
    notification   : 0,
    draft_uid      : 0,
    reply_uid      : 0,
    reply_mailbox  : '',
    in_reply_to    : '',
    forward_uid    : 0,
    forward_mailbox: ''
};

const check = on => on ? 'check_box' : 'check_box_outline_blank',
      radio = on => on ? 'radio_button_checked' : 'radio_button_unchecked';

/**
 * The e-mail composer (ExtJS GO.email.EmailComposer): a non-modal window with From (alias),
 * To / CC / BCC, subject, HTML or text body and attachments. Sends and saves drafts with the
 * legacy routes email/message/send and email/message/save. Open it with compose() of
 * compose.mjs, which loads the aliases and templates first.
 *
 * Plugins: modules register `emailComposerPlugins` (see docs/neo-email-module.md): extra
 * items of the options menu, hooks before sending and on the send parameters (smime).
 *
 * Events: load {response}, save {response}, send {response}
 */
class ComposerWindow extends Dialog {
    static config = {
        className   : 'GO.email.composer.ComposerWindow',
        cls         : ['go-email-composer'],
        modal       : false,
        resizable   : true,
        title       : t('Compose an e-mail message'),
        // no animateTarget: position explicitly, .neo-floating parks it off-screen
        wrapperStyle: {height: 'min(800px, 90vh)', left: 'max(0px, calc(50vw - 500px))', top: 'max(0px, calc(50vh - 400px))', width: 'min(1000px, 100vw)'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * email/alias/store records: {id, account_id, from, name, email, html_signature,
         * plain_signature, signature_below_reply, template_id, …}
         * @member {Object[]} aliases=[]
         */
        aliases: [],
        /**
         * email/template/emailSelection records: {template_id, name, group_name, checked}
         * @member {Object[]} templates=[]
         */
        templates: [],
        /**
         * The user's emailSettings (JMAP User): use_html_markup, show_from, show_cc, show_bcc,
         * always_request_notification, skip_unknown_recipients, …
         * @member {Object} settings={}
         */
        settings: {}
    }

    /** current alias record */
    alias = null
    /** HTML body (else plain text) */
    isHtml = true
    /** parameters of send/save besides the form (reply / forward / draft state, priority, …) */
    sendParams = {...DEFAULT_SEND_PARAMS}
    /** inline images of a loaded message: [{tmp_file, token, …}] */
    inlineAttachments = []
    /** route and params of the last load: a template or content type switch loads again */
    lastLoadUrl = 'email/message/template'
    lastLoadParams = {}
    /** template of the message (0: none) */
    templateId = 0
    /** values at the last load or save: changes since then are asked before closing */
    snapshot = ''
    /** body at the last auto save */
    lastAutoSaveBody = null
    /** send or save running */
    busy = false
    /** @member {Promise<Boolean>|null} the running send or save */
    submitPromise = null
    /** counts loads: only the newest one's response is used */
    loadSeq = 0
    /** names of the attachments of the last load */
    lastLoadedAttachments = []
    /** names of loaded attachments the user removed: a reload doesn't add them again */
    removedLoadedAttachments = new Set()
    /** the message was sent: closing asks nothing */
    sent = false
    /** emailComposerPlugins configs */
    composerPlugins = []

    construct(config) {
        super.construct(config);

        let me = this;

        me.composerPlugins = ModuleRegistry.getConfigs('emailComposerPlugins').flat();
        me.isHtml  = me.settings.use_html_markup !== false;
        me.sendParams.notification = me.settings.always_request_notification ? 1 : 0;

        const recipients = (name, label, hidden = false) => ({
            module       : RecipientsField,
            name,
            reference    : name + 'Field',
            labelText    : label,
            labelPosition: 'inline',
            hidden,
            flex         : 'none'
        });

        me.items = [{
            module   : Toolbar,
            reference: 'toolbar',
            cls      : ['go-email-composer-toolbar'],
            flex     : 'none',
            items    : [{
                module   : Button,
                reference: 'sendButton',
                ui       : 'primary',
                icon     : 'send',
                text     : t('Send'),
                tooltip  : 'Ctrl + Enter',
                handler  : () => me.send()
            }, {
                module   : Button,
                reference: 'saveButton',
                icon     : 'save',
                tooltip  : t('Save draft'),
                handler  : () => me.save()
            }, '->', {
                module   : CreateLinkButton,
                reference: 'createLinkButton',
                flex     : 'none',
                listeners: {
                    openChange: ({open}) => me.getReference('toolbar').toggleCls('go-email-composer-linking', open)
                }
            }, {
                module   : Button,
                reference: 'fieldsButton',
                icon     : 'people',
                tooltip  : t('Add recipients'),
                handler  : () => me.showFieldsMenu()
            }, {
                module   : Button,
                reference: 'templatesButton',
                icon     : 'style',
                tooltip  : t('E-mail template'),
                handler  : () => me.showTemplatesMenu()
            }, {
                module   : Button,
                reference: 'optionsButton',
                icon     : 'more_vert',
                tooltip  : t('Extra options'),
                handler  : () => me.showOptionsMenu()
            }]
        }, {
            module   : FormContainer,
            reference: 'form',
            cls      : ['go-email-composer-form'],
            flex     : 1,
            layout   : {ntype: 'vbox', align: 'stretch'},
            // Ctrl+Enter sends (ExtJS ctrlenter of the editor and the form keys)
            keys     : {Enter: data => (data.ctrlKey || data.metaKey) && me.send()},
            items    : [{
                module       : SelectField,
                name         : 'alias_id',
                reference    : 'fromField',
                labelText    : t('From'),
                labelPosition: 'inline',
                flex         : 'none',
                hidden       : !me.settings.show_from,
                options      : me.aliases.map(alias => ({value: String(alias.id), text: unescapeHtml(alias.from)})),
                listeners    : {
                    change: ({value, oldValue}) => me.onAliasChange(value, oldValue)
                }
            },
            recipients('to', t('To')),
            recipients('cc', t('CC'), !me.settings.show_cc),
            recipients('bcc', t('BCC'), !me.settings.show_bcc),
            {
                module       : TextField,
                name         : 'subject',
                reference    : 'subjectField',
                labelText    : t('Subject'),
                labelPosition: 'inline',
                flex         : 'none'
            }, {
                module   : HtmlField,
                name     : 'htmlbody',
                reference: 'htmlField',
                cls      : ['go-email-composer-body'],
                // pasted images become data: images, embedded by the server on send
                pasteImages: true,
                flex     : 1,
                hidden   : !me.isHtml
            }, {
                module   : TextArea,
                name     : 'plainbody',
                reference: 'plainField',
                cls      : ['go-email-composer-body', 'go-email-composer-plain'],
                flex     : 1,
                hidden   : me.isHtml
            }, {
                module   : ComposerAttachmentsField,
                name     : 'attachments',
                reference: 'attachmentsField',
                flex     : 'none'
            }]
        }, {
            ntype    : 'component',
            reference: 'error',
            cls      : ['go-email-composer-error'],
            flex     : 'none',
            hidden   : true
        }];

        me.alias = me.aliases[0] || null;

        me.composerPlugins.forEach(plugin => me.callPlugin(plugin, 'init', me));

        me.autoSaveTimer = setInterval(() => me.autoSave(), AUTO_SAVE_INTERVAL)
    }

    destroy(...args) {
        clearInterval(this.autoSaveTimer);
        super.destroy(...args)
    }

    /**
     * Calls a hook of a plugin; a failing plugin is logged and does not stop the composer
     * @param {Object} plugin
     * @param {String} name
     * @param {...*} args
     * @returns {*}
     */
    callPlugin(plugin, name, ...args) {
        try {
            return plugin[name]?.(...args)
        } catch (e) {
            console.error(`emailComposerPlugins ${plugin.id || ''} ${name}`, e)
        }
    }

    /** @returns {Number|String} account of the current alias */
    get accountId() {
        return this.alias?.account_id
    }

    get htmlField()  {return this.getReference('htmlField')}
    get plainField() {return this.getReference('plainField')}

    /** @returns {String} the body of the active editor */
    get body() {
        return (this.isHtml ? this.htmlField.value : this.plainField.value) || ''
    }

    set body(value) {
        let me = this;

        if (me.isHtml) {
            me.htmlField.value = value || ''
        } else {
            me.plainField.value = value || ''
        }
    }

    /**
     * Shows the message and loads it (ExtJS EmailComposer.show(config))
     * @param {Object} cfg see compose()
     * @returns {Promise<void>}
     */
    async start(cfg) {
        let me     = this,
            values = cfg.values || {};

        me.initFrom(cfg);

        typeof cfg.isHtml === 'boolean' && me.setContentType(cfg.isHtml);

        me.setRecipients('to', values.to);
        me.setRecipients('cc', values.cc);
        me.setRecipients('bcc', values.bcc);
        me.getReference('subjectField').value = values.subject || '';

        (cfg.links || []).forEach(link => link?.entity && link.entityId && me.getReference('createLinkButton').addLink(link.entity, link.entityId));

        const params = {...cfg.loadParams || {uid: cfg.uid, task: cfg.task, mailbox: cfg.mailbox}};

        // template tags of a contact (ExtJS contact_id / entity Contact)
        cfg.contact_id && (params.contact_id = cfg.contact_id);
        cfg.entity === 'Contact' && cfg.entityId && (params.contact_id = cfg.entityId);
        cfg.company_id && (params.company_id = cfg.company_id);

        params.to      = formatRecipients(me.getReference('toField').value);
        params.cc      = formatRecipients(me.getReference('ccField').value);
        params.bcc     = formatRecipients(me.getReference('bccField').value);
        params.subject = values.subject ?? '';

        typeof values.body === 'string' && (params.body = values.body);

        params.template_id = cfg.template_id ?? me.defaultTemplateId();
        params.account_id  = cfg.accountId || cfg.account_id || me.accountId;
        params.alias_id    = me.alias?.id;

        cfg.addEmailAsAttachmentList && (params.addEmailAsAttachmentList = typeof cfg.addEmailAsAttachmentList === 'string'
            ? cfg.addEmailAsAttachmentList : JSON.stringify(cfg.addEmailAsAttachmentList));
        cfg.includeAttachments && (params.includeAttachments = cfg.includeAttachments);

        let task = cfg.task || 'template',
            url  = cfg.loadUrl;

        if (!url) {
            if (task === 'reply_all') {
                task = 'reply';
                params.replyAll = 1
            }

            url = 'email/message/' + (task === 'opendraft' ? 'openDraft' : task)
        }

        me.isDraft = /\/openDraft$/i.test(url) || task === 'opendraft';

        await me.loadMessage(url, params, {addSignature: !me.isDraft});

        // attachments from other modules (ExtJS config.blobs)
        const blobs = (cfg.blobs || []).filter(b => b?.blobId || b?.id);

        if (blobs.length && !me.isDestroyed) {
            const field = me.getReference('attachmentsField');
            field.value = [...field.value || [], ...blobs.map(b => ({blobId: b.blobId || b.id, name: b.name, attachment: true}))]
        }

        if (me.isDestroyed) {
            return
        }

        me.updateFieldVisibility();
        await me.syncEditorValue();

        if (me.isDestroyed) {
            return
        }

        me.takeSnapshot();
        me.lastAutoSaveBody = me.body;

        cfg.afterLoad?.(me);
        me.focusFirst()
    }

    /**
     * The alias to send with: the configured account's first alias, or the alias with that
     * e-mail address (ExtJS initFrom())
     * @param {Object} cfg
     */
    initFrom(cfg) {
        let me        = this,
            accountId = cfg.accountId || cfg.account_id,
            alias     = null;

        if (cfg.from) {
            alias = me.aliases.find(a => a.email === cfg.from)
        }

        if (!alias && accountId) {
            alias = me.aliases.find(a => String(a.account_id) === String(accountId))
        }

        me.setAlias(alias || me.aliases[0] || null, false)
    }

    /**
     * @param {Object|null} alias
     * @param {Boolean} [swap=true] swap the signature in the body
     */
    setAlias(alias, swap = true) {
        let me  = this,
            old = me.alias;

        me.alias = alias;
        me.getReference('fromField').value = alias ? String(alias.id) : null;

        if (swap && old && alias && old !== alias) {
            me.body = swapSignature({body: me.body, html: me.isHtml, oldAlias: old, newAlias: alias})
        }

        me.composerPlugins.forEach(plugin => me.callPlugin(plugin, 'onAliasChange', me, alias))
    }

    /**
     * The user picked another From (ExtJS beforeselect: _checkLoadTemplate, _setSignature)
     */
    async onAliasChange(value, oldValue) {
        let me    = this,
            alias = me.aliases.find(a => String(a.id) === String(value));

        if (!alias || alias === me.alias) {
            return
        }

        const old = me.alias;

        // the draft lives in the old account's Drafts folder: its UID means another message in
        // the new account, which save/send would delete
        old && String(old.account_id) !== String(alias.account_id) && (me.sendParams.draft_uid = 0);

        me.setAlias(alias);

        // another account with another default template: load it (ExtJS _checkLoadTemplate)
        if (old && alias.template_id !== undefined && alias.template_id !== old.template_id && String(alias.template_id) !== String(me.templateId)) {
            if (!me.isBodyModified() || await me.confirm(t('Changes will be lost. Are you sure?'))) {
                await me.changeTemplate(alias.template_id)
            }
        }
    }

    /**
     * Default template of the From alias (its account's or the user's)
     * @returns {Number}
     */
    defaultTemplateId() {
        let me = this;

        if (me.alias?.template_id !== undefined && me.alias?.template_id !== null) {
            return me.alias.template_id
        }

        return me.templates.find(tpl => tpl.checked)?.template_id ?? 0
    }

    /**
     * Loads a legacy composer route into the form (email/message/template, reply, forward,
     * openDraft): the response's data fills the fields, its sendParams the send parameters.
     * @param {String} url
     * @param {Object} params
     * @param {Object} [options]
     * @param {Boolean} [options.addSignature=true]
     * @param {Boolean} [options.keepAttachments=false] keep the current attachments (template switch)
     * @returns {Promise<Object|null>} the response, null on error
     */
    async loadMessage(url, params, {addSignature: withSignature = true, keepAttachments = false} = {}) {
        let me   = this,
            form = me.getReference('form');

        params = {...params, content_type: me.isHtml ? 'html' : 'plain'};

        me.lastLoadUrl    = url;
        me.lastLoadParams = params;

        // a newer load (another template picked meanwhile) wins
        const seq = ++me.loadSeq;

        form.isLoading = coreT('Loading...');

        let response;

        try {
            response = await client.legacy(url, params)
        } catch (e) {
            me.isDestroyed || me.showError(e.message || String(e));
            return null
        } finally {
            me.isDestroyed || seq !== me.loadSeq || (form.isLoading = false)
        }

        if (me.isDestroyed || seq !== me.loadSeq) {
            return null
        }

        const data = response.data || {};

        response.sendParams && Object.assign(me.sendParams, response.sendParams);

        // a draft keeps its priority and read notification (ExtJS lost them)
        if (me.isDraft) {
            [1, 3, 5].includes(Number(data.priority)) && (me.sendParams.priority = Number(data.priority));
            data.notification && (me.sendParams.notification = 1)
        }

        if (data.alias_id) {
            const alias = me.aliases.find(a => String(a.id) === String(data.alias_id));
            alias && me.setAlias(alias, false)
        } else if (data.account_id && String(data.account_id) !== String(me.accountId)) {
            const alias = me.aliases.find(a => String(a.account_id) === String(data.account_id));
            alias && me.setAlias(alias, false)
        }

        data.template_id !== undefined ? (me.templateId = data.template_id) : (me.templateId = params.template_id ?? me.templateId);
        me.lastLoadParams.template_id = me.templateId;

        'to'  in data && me.setRecipients('to', data.to);
        'cc'  in data && me.setRecipients('cc', data.cc);
        'bcc' in data && me.setRecipients('bcc', data.bcc);

        if ('subject' in data) {
            // email/message/template returns the subject HTML encoded (toOutputArray()), the others plain
            me.getReference('subjectField').value = /\/template$/.test(url) ? unescapeHtml(data.subject) : (data.subject || '')
        }

        let body = me.isHtml ? data.htmlbody : data.plainbody;

        body = me.isHtml ? absoluteLegacyUrls(body ?? '', client.baseUrl) : body ?? '';
        withSignature && (body = addSignature({body, html: me.isHtml, alias: me.alias}));
        me.body = body;

        me.inlineAttachments = data.inlineAttachments || [];

        me.setLoadedAttachments(data.attachments, keepAttachments);

        me.showError('');
        me.composerPlugins.forEach(plugin => me.callPlugin(plugin, 'afterLoad', me, response));
        me.fire('load', {response});

        return response
    }

    /**
     * Puts the attachments of a load response in the field. A reload (other template or
     * format) returns the loaded ones again: they replace the ones of the last load, the user's
     * own stay, and loaded ones the user removed stay away.
     * @param {Object[]} attachments data.attachments
     * @param {Boolean} keep keep the attachments the user added
     */
    setLoadedAttachments(attachments, keep) {
        let me     = this,
            field  = me.getReference('attachmentsField'),
            loaded = loadedAttachments(attachments).map(a => ({...a, loaded: true}));

        if (!keep) {
            me.removedLoadedAttachments = new Set();
            field.value = loaded;
        } else {
            const current = field.value || [],
                  present = new Set(current.filter(a => a.loaded).map(a => a.name));

            me.lastLoadedAttachments.forEach(name => present.has(name) || me.removedLoadedAttachments.add(name));

            field.value = [...current.filter(a => !a.loaded), ...loaded.filter(a => !me.removedLoadedAttachments.has(a.name))]
        }

        me.lastLoadedAttachments = loaded.map(a => a.name)
    }

    /**
     * Another template: loads the last route again with it, keeping recipients and
     * attachments (ExtJS _changeTemplate / loadForm with keepHeaders)
     * @param {Number|String} templateId
     */
    async changeTemplate(templateId) {
        let me = this;

        await me.loadMessage(me.lastLoadUrl, {...me.lastLoadParams, template_id: templateId, keepHeaders: 1, alias_id: me.alias?.id},
            {addSignature: true, keepAttachments: true});

        me.isDestroyed || me.updateFieldVisibility()
    }

    /**
     * @param {Boolean} html
     */
    setContentType(html) {
        let me = this;

        me.isHtml = html;
        me.htmlField.hidden  = !html;
        me.plainField.hidden = html
    }

    /**
     * "Use HTML markup" switched: loads the message again in the other format (ExtJS
     * htmlCheck checkchange)
     */
    async toggleHtml() {
        let me = this;

        if (me.isBodyModified() && !await me.confirm(t('Changes will be lost. Are you sure?'))) {
            return
        }

        me.setContentType(!me.isHtml);

        await me.loadMessage(me.lastLoadUrl, {...me.lastLoadParams, keepHeaders: 1, alias_id: me.alias?.id},
            {addSignature: !me.isDraft, keepAttachments: true})
    }

    /**
     * @param {String} name 'to', 'cc' or 'bcc'
     * @param {String|Object[]|String[]|null} value
     */
    setRecipients(name, value) {
        this.getReference(name + 'Field').value = toRecipients(value)
    }

    /**
     * Shows CC / BCC when they have recipients (ExtJS afterShowAndLoad)
     */
    updateFieldVisibility() {
        let me = this;

        ['cc', 'bcc'].forEach(name => {
            const field = me.getReference(name + 'Field');
            (field.value || []).length && (field.hidden = false)
        })
    }

    focusFirst() {
        let me = this,
            to = me.getReference('toField');

        me.timeout(100).then(() => {
            if (me.isDestroyed) {
                return
            }

            if (!(to.value || []).length) {
                to.focus(to.id + '__input')
            } else {
                me.isHtml ? me.htmlField.focus() : me.plainField.focus()
            }
        })
    }

    /**
     * @param {String} message text, '' hides the error
     */
    showError(message) {
        const error = this.getReference('error');

        error.text   = message || '';
        error.hidden = !message
    }

    /**
     * @param {String} message
     * @returns {Promise<Boolean>}
     */
    confirm(message) {
        let me = this;
        return ConfirmDialog.ask({appName: me.appName, windowId: me.windowId, message})
    }

    /**
     * Takes the HTML as the browser's editor holds it: it normalizes the loaded HTML (e.g.
     * "<br />" to "<br>"), and the first sync would count as a change of the message
     * @returns {Promise<void>}
     */
    async syncEditorValue() {
        let me    = this,
            field = me.htmlField;

        if (!me.isHtml) {
            return
        }

        // the editor is created after the field mounted
        for (let i = 0; i < 30 && !field.editorWindowId && !me.isDestroyed; i++) {
            await me.timeout(100)
        }

        const windowId = field.editorWindowId;

        if (!windowId || me.isDestroyed) {
            return
        }

        const html = await field.addon.getValue({id: field.id, windowId}).catch(() => null);

        if (typeof html === 'string' && !me.isDestroyed && html !== (field.value || '')) {
            field.value = html
        }
    }

    /**
     * Values that count as a change of the message
     * @returns {String}
     */
    currentState() {
        let me  = this,
            ref = name => me.getReference(name);

        return JSON.stringify([
            formatRecipients(ref('toField').value),
            formatRecipients(ref('ccField').value),
            formatRecipients(ref('bccField').value),
            ref('subjectField').value || '',
            me.body,
            (ref('attachmentsField').value || []).map(ComposerAttachmentsField.key),
            me.getReference('createLinkButton').links.length,
            me.alias?.id ?? null,
            Number(me.sendParams.priority) || 3,
            me.sendParams.notification ? 1 : 0
        ])
    }

    takeSnapshot() {
        this.snapshot = this.currentState()
    }

    /** @returns {Boolean} changed since loading or the last save */
    isModified() {
        return this.currentState() !== this.snapshot
    }

    /** @returns {Boolean} the body changed since loading or the last save */
    isBodyModified() {
        return JSON.parse(this.snapshot || '[]')[4] !== this.body
    }

    /**
     * The parameters of email/message/send and save (ExtJS form fields + sendParams)
     * @param {Object} options
     * @param {Boolean} options.draft
     * @param {Boolean} options.autoSave
     * @returns {Object}
     */
    buildParams({draft, autoSave}) {
        let me     = this,
            ref    = name => me.getReference(name),
            params = {
                ...me.sendParams,
                alias_id         : me.alias?.id,
                to               : formatRecipients(ref('toField').value),
                cc               : formatRecipients(ref('ccField').value),
                bcc              : formatRecipients(ref('bccField').value),
                subject          : ref('subjectField').value || '',
                content_type     : me.isHtml ? 'html' : 'plain',
                htmlbody         : me.isHtml ? me.body : '',
                plainbody        : me.isHtml ? '' : me.body,
                attachments      : JSON.stringify(attachmentsParam(ref('attachmentsField').value)),
                inlineAttachments: JSON.stringify(me.inlineAttachments || []),
                links            : JSON.stringify(ref('createLinkButton').links.map(l => ({toEntity: l.entity, toId: l.entityId})))
            };

        me.composerPlugins.forEach(plugin => me.callPlugin(plugin, 'submitParams', me, params, {draft, autoSave}));

        // the server reads "0"/"1"; booleans would arrive as "true"/"false"
        Object.keys(params).forEach(key => {
            typeof params[key] === 'boolean' && (params[key] = params[key] ? 1 : 0);
            (params[key] === null || params[key] === undefined) && delete params[key]
        });

        return params
    }

    /**
     * Saves the message in the Drafts folder (Save button)
     * @returns {Promise<Boolean>}
     */
    save() {
        return this.submit({draft: true})
    }

    /**
     * Sends the message (Send button, Ctrl+Enter)
     * @returns {Promise<Boolean>}
     */
    send() {
        return this.submit({draft: false})
    }

    /**
     * Saves to Drafts every 2 minutes when the body changed (ExtJS autoSave): quietly, a
     * failure only shows in the console
     */
    async autoSave() {
        let me = this;

        if (me.busy || me.sent || me.isClosing || me.isDestroyed) {
            return
        }

        await me.syncEditorValue();

        const body = me.body;

        if (me.busy || me.isDestroyed || body === me.lastAutoSaveBody) {
            return
        }

        notify(me, t('Autosaving e-mail message to drafts (every 2 mins)'));

        // a failed save is tried again next time
        await me.submit({draft: true, autoSave: true}) && (me.lastAutoSaveBody = body)
    }

    /**
     * email/message/send or save (ExtJS sendMail(draft, autoSave))
     * @param {Object} options
     * @param {Boolean} options.draft save in Drafts instead of sending
     * @param {Boolean} [options.autoSave=false] quiet: no questions, no errors shown
     * @returns {Promise<Boolean>} done
     */
    submit({draft, autoSave = false}) {
        let me = this;

        if (me.busy || me.sent || me.isDestroyed) {
            return Promise.resolve(false)
        }

        // busy before the first await: a second click or the auto save waits
        me.busy = true;

        return me.submitPromise = me.doSubmit({draft, autoSave})
    }

    /**
     * @param {Object} options see submit()
     * @returns {Promise<Boolean>}
     * @protected
     */
    async doSubmit({draft, autoSave}) {
        let me = this;

        me.setBusy(true);

        try {
            // uploads still running; the editor sends its value delayed (typing then Ctrl+Enter)
            await me.getReference('attachmentsField').flush();
            await me.syncEditorValue();

            if (me.isDestroyed) {
                return false
            }

            if (!autoSave) {
                const invalid = ['to', 'cc', 'bcc'].map(n => me.getReference(n + 'Field')).find(f => f.getError?.());

                if (invalid) {
                    me.showError(invalid.getError());
                    return false
                }

                if (!draft && !['to', 'cc', 'bcc'].some(n => (me.getReference(n + 'Field').value || []).length)) {
                    me.showError(t("You didn't enter a recipient"));
                    return false
                }

                if (!(me.getReference('subjectField').value || '').trim()) {
                    const ok = await me.confirm(draft
                        ? t("You didn't fill in a subject. Are you sure you want to save this message without a subject?")
                        : t("You didn't fill in a subject. Are you sure you want to send this message without a subject?"));

                    if (!ok || me.isDestroyed) {
                        return false
                    }
                }

                for (const plugin of me.composerPlugins) {
                    if (await me.callPlugin(plugin, 'beforeSend', me, {draft}) === false || me.isDestroyed) {
                        return false
                    }
                }
            }

            const params = me.buildParams({draft, autoSave});

            // the state that the server gets: later typing is a change again
            const state = me.currentState();

            autoSave || (me.getReference('form').isLoading = draft ? coreT('Saving...') : t('Sending...'));

            let response;

            try {
                response = await client.legacy(draft ? 'email/message/save' : 'email/message/send', params)
            } catch (e) {
                if (!me.isDestroyed) {
                    autoSave ? console.warn('Composer auto save failed', e) : me.showError(e.message || String(e))
                }

                return false
            } finally {
                me.isDestroyed || (me.getReference('form').isLoading = false)
            }

            if (me.isDestroyed) {
                return true
            }

            const oldDraftUid = Number(me.sendParams.draft_uid) || 0;

            response.sendParams && Object.assign(me.sendParams, response.sendParams);
            response.account_id && (me.sendParams.account_id = response.account_id);

            // the saved draft replaced the opened one: a reload (template, format) opens the new one
            if (draft && oldDraftUid && /\/openDraft$/.test(me.lastLoadUrl || '') && Number(me.lastLoadParams?.uid) === oldDraftUid) {
                me.lastLoadParams = {...me.lastLoadParams, uid: me.sendParams.draft_uid}
            }

            me.showError(response.feedback && !draft ? response.feedback : '');

            if (draft) {
                me.snapshot = state;
                autoSave || notify(me, t('Message saved in the Drafts folder'));
                me.fire('save', {response});
                return true
            }

            me.sent = true;
            me.fire('send', {response});
            me.afterSend?.(response);

            // a sent copy was saved but the server also has a warning (e.g. sent folder): show it
            response.feedback && notify(me, response.feedback);

            await me.showUnknownRecipients(response.unknown_recipients);

            me.close();
            return true
        } finally {
            me.busy = false;
            me.isDestroyed || me.setBusy(false)
        }
    }

    /**
     * @param {Boolean} busy
     */
    setBusy(busy) {
        let me = this;

        me.getReference('sendButton').disabled = busy;
        me.getReference('saveButton').disabled = busy
    }

    /**
     * Recipients that are no contact yet (ExtJS UnknownRecipientsDialog, a part of the
     * message view card). Shown when the addressbook is available and the user did not turn
     * the question off.
     * @param {Object[]} recipients [{email, name, first_name, middle_name, last_name}]
     */
    async showUnknownRecipients(recipients) {
        let me = this;

        if (!recipients?.length || me.settings.skip_unknown_recipients || !client.hasCapability('go:community:addressbook')) {
            return
        }

        try {
            const {default: dialog} = await import('../message/UnknownRecipientsDialog.mjs');
            dialog?.show?.({appName: me.appName, windowId: me.windowId, recipients})
        } catch (e) {
            console.warn('UnknownRecipientsDialog not available', e)
        }
    }

    /**
     * Menu "Add recipients": show From, CC, BCC (ExtJS showMenu)
     */
    showFieldsMenu() {
        let me     = this,
            toggle = name => {
                const field = me.getReference(name + 'Field');
                field.hidden = !field.hidden;
                field.hidden || (name === 'from' ? null : field.focus(field.id + '__input'))
            };

        MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : me.getReference('fieldsButton').id,
            items   : [
                {text: t('From field'), icon: check(!me.getReference('fromField').hidden), handler: () => toggle('from')},
                {text: t('CC field'),   icon: check(!me.getReference('ccField').hidden),   handler: () => toggle('cc')},
                {text: t('BCC field'),  icon: check(!me.getReference('bccField').hidden),  handler: () => toggle('bcc')}
            ]
        })
    }

    /**
     * @summary Templates by group, and the default template choice (ExtJS templatesMenu).
     */
    showTemplatesMenu() {
        let me      = this,
            current = String(me.templateId ?? 0),
            items   = [],
            group   = null;

        const sorted = [...me.templates].sort((a, b) =>
            (a.template_id === 0 ? -1 : b.template_id === 0 ? 1 : 0) ||
            String(a.group_name || '').localeCompare(String(b.group_name || '')) ||
            String(a.name).localeCompare(String(b.name)));

        sorted.forEach(tpl => {
            if (tpl.template_id !== 0 && (tpl.group_name || '') !== group) {
                group = tpl.group_name || '';
                items.push({separator: true});
                group && items.push({text: unescapeHtml(group), icon: 'folder', disabled: true})
            }

            items.push({
                // the name comes HTML encoded; vdom text: neo escapes it
                text   : unescapeHtml(tpl.name),
                icon   : radio(String(tpl.template_id) === current),
                handler: () => me.pickTemplate(tpl.template_id)
            })
        });

        items.push({separator: true},
            {text: t('Set current template as default for myself'), icon: 'person', handler: () => me.setDefaultTemplate('default')},
            {text: t('Set current template as default for this email account'), icon: 'alternate_email', handler: () => me.setDefaultTemplate('default_for_account')});

        MenuList.showAt({appName: me.appName, windowId: me.windowId, target: me.getReference('templatesButton').id, items})
    }

    async pickTemplate(templateId) {
        let me = this;

        if (String(templateId) === String(me.templateId)) {
            return
        }

        if (me.isBodyModified() && !await me.confirm(t('Changes will be lost. Are you sure?'))) {
            return
        }

        await me.changeTemplate(templateId)
    }

    /**
     * Stores the current template as the user's or the account's default
     * (email/template/emailSelection default_template_id)
     * @param {String} type 'default' or 'default_for_account'
     */
    async setDefaultTemplate(type) {
        let me = this;

        try {
            const response = await client.legacy('email/template/emailSelection', {
                type,
                account_id         : me.accountId,
                default_template_id: me.templateId ?? 0
            });

            if (me.isDestroyed) {
                return
            }

            me.templates = response.results || me.templates;

            // aliases of this account (or all, for the user's default) use it from now on
            me.aliases.forEach(alias => {
                if (type === 'default' || String(alias.account_id) === String(me.accountId)) {
                    alias.template_id = me.templateId
                }
            });

            notify(me, t('The default template was saved'))
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * Read notification, priority, HTML markup and the plugins' options (ExtJS optionsMenu)
     */
    showOptionsMenu() {
        let me       = this,
            priority = String(me.sendParams.priority ?? 3),
            set      = (key, value) => () => me.sendParams[key] = value;

        const items = [
            {text: t('Request read notification'), icon: check(!!Number(me.sendParams.notification)),
                handler: set('notification', Number(me.sendParams.notification) ? 0 : 1)},
            {separator: true},
            {text: t('Priority'), icon: 'priority_high', disabled: true},
            {text: t('High'),   icon: radio(priority === '1'), handler: set('priority', 1)},
            {text: t('Normal'), icon: radio(priority === '3'), handler: set('priority', 3)},
            {text: t('Low'),    icon: radio(priority === '5'), handler: set('priority', 5)},
            {separator: true},
            {text: t('Use HTML markup'), icon: check(me.isHtml), handler: () => me.toggleHtml()}
        ];

        me.composerPlugins.forEach(plugin => {
            const extra = me.callPlugin(plugin, 'menuItems', me);
            extra?.length && items.push({separator: true}, ...extra)
        });

        MenuList.showAt({appName: me.appName, windowId: me.windowId, target: me.getReference('optionsButton').id, items})
    }

    /**
     * Close by the user (X, Escape): a changed message may be saved as draft first
     */
    async requestClose() {
        let me = this;

        if (me.isClosing || me.isDestroyed) {
            return
        }

        // a running (auto) save or send first: it may fail or miss later changes
        while (me.busy && !me.isDestroyed) {
            await me.submitPromise
        }

        if (me.isDestroyed || me.sent) {
            return
        }

        if (me.isModified()) {
            const answer = await CloseDialog.ask({appName: me.appName, windowId: me.windowId, canSave: true});

            if (me.isDestroyed || !answer) {
                return
            }

            if (answer === 'save' && !await me.save()) {
                return
            }
        }

        me.isDestroyed || me.close()
    }

    closeOrHideAction() {
        this.requestClose()
    }

    onKeyDownEscape() {
        this.requestClose()
    }
}

export default Neo.setupClass(ComposerWindow);
