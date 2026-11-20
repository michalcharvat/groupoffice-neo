import Container     from '../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar       from '../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_CREATE} from '../../../../../../views/neo/src/Acl.mjs';
import Button        from '../../../../../../views/neo/src/button/Button.mjs';
import {download}    from '../../../../../../views/neo/src/download.mjs';
import {escapeHtml, formatUserDateTime, sanitizeHtml} from '../../../../../../views/neo/src/Format.mjs';
import {resolveRoute} from '../../../../../../views/neo/src/link/linkTypes.mjs';
import MenuList      from '../../../../../../views/neo/src/menu/List.mjs';
import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import {fmt, t as coreT} from '../../../../../../views/neo/src/Translate.mjs';
import ConfirmDialog from '../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import {enableImageZoom} from '../../../../../../views/neo/src/view/ImageWindow.mjs';
import * as api      from '../../api.mjs';
import {LEVEL_DELEGATED, t, unescapeHtml} from '../../util.mjs';
import {compose}     from '../composer/compose.mjs';
import FolderPickerDialog from '../FolderPickerDialog.mjs';
import {showAddressMenu} from './addressMenu.mjs';
import {allAttachmentsMenuItems, attachmentMenuItems, openAttachment} from './attachments.mjs';
import {bodyHtml, headerHtml} from './messageHtml.mjs';
import * as messageApi from './messageApi.mjs';

/**
 * The message view: the east panel of the e-mail module and the body of openMessageWindow()
 * (ExtJS GO.email.MessagePanel, the message toolbar of EmailClient.js, MessageContextMenu,
 * AttachmentContextMenu, AllAttachmentContextMenu, AddressContextMenu).
 *
 * API (kept from card 1's stub, EmailMain relies on it):
 * - load({accountId, mailbox, uid}, options) → Promise of the email/message/view response (null
 *   when another load() replaced it); options are the route's flags (unblock, filterXSS,
 *   no_max_body_size, plaintext, password) and stay for reload()
 * - loadAttached(parent, attachment): a message attached to another one (.eml, read only)
 * - reset() empties the panel
 * - reference 'toolbar': the host may insert buttons (EmailMain adds the phone's close button at 0)
 * - events: load {message} (the response; EmailMain marks the message as read), loadError {error},
 *   change {action, message, uid?} after the message was changed, moved or deleted from the view
 *
 * In EmailMain the actions on the message (delete, move, flags, labels, spam) go through
 * EmailMain's own methods, so the grid and the folder counts follow. In a window the panel
 * calls the legacy routes itself and asks EmailMain of the window to refresh.
 *
 * Extension point `emailMessagePanelPlugins` (ModuleRegistry.getConfigs()), see
 * docs/neo-email-module.md: a module registers
 *
 *     emailMessagePanelPlugins: {
 *         id: 'itip',
 *         // optional: extra email/message/view parameters (or a Promise of them), e.g. a password
 *         beforeLoad: (params, panel) => ({}),
 *         // optional, after every load: parts above the body and toolbar / menu items
 *         onLoad: async (message, panel) => ({
 *             parts       : [{ntype: 'component', html: '…'}], // neo configs, above the body
 *             toolbarItems: [{module: Button, icon: 'event', text: '…', handler}],
 *             menuItems   : [{text: '…', icon: '…', handler}]  // the "more" menu
 *         }),
 *         // optional: items of an attachment's menu (e.g. smime "Import certificate")
 *         attachmentMenuItems: (attachment, message, panel) => []
 *     }
 */
class MessagePanel extends Container {
    static config = {
        className: 'GO.email.message.MessagePanel',
        baseCls  : ['go-email-message-panel', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * Open in new window in the "more" menu (not in the window itself)
         * @member {Boolean} canPopout=true
         */
        canPopout: true,
        /**
         * EmailMain to keep up to date when the panel is not inside it (a window)
         * @member {GO.email.EmailMain|null} host=null
         */
        host: null,
        items    : [{
            module   : Toolbar,
            reference: 'toolbar',
            flex     : 'none',
            cls      : ['go-bg-mid', 'go-border-bottom', 'go-email-message-toolbar'],
            items    : [{
                module   : Button,
                reference: 'editButton',
                icon     : 'edit',
                text     : t('Edit'),
                hidden   : true
            }, {
                module   : Button,
                reference: 'replyButton',
                icon     : 'reply',
                text     : t('Reply'),
                disabled : true
            }, {
                module   : Button,
                reference: 'replyAllButton',
                icon     : 'reply_all',
                text     : t('Reply all'),
                disabled : true
            }, {
                module   : Button,
                reference: 'forwardButton',
                icon     : 'forward',
                text     : t('Forward'),
                disabled : true
            }, '->', {
                module   : Button,
                reference: 'deleteButton',
                icon     : 'delete',
                tooltip  : coreT('Delete'),
                disabled : true
            }, {
                module   : Button,
                reference: 'moreButton',
                icon     : 'more_vert',
                tooltip  : coreT('More options'),
                disabled : true
            }]
        }, {
            ntype    : 'container',
            reference: 'content',
            flex     : 1,
            cls      : ['go-email-message-scroll', 'go-scroll'],
            layout   : {ntype: 'vbox', align: 'stretch'},
            items    : [{
                ntype    : 'component',
                reference: 'header',
                flex     : 'none',
                html     : ''
            }, {
                ntype    : 'container',
                reference: 'parts',
                flex     : 'none',
                cls      : ['go-email-message-parts'],
                layout   : {ntype: 'vbox', align: 'stretch'},
                items    : []
            }, {
                ntype    : 'component',
                reference: 'body',
                flex     : 'none',
                cls      : ['go-email-message-body'],
                html     : ''
            }]
        }]
    }

    /**
     * The shown message: {accountId, mailbox, uid}; for an attached message also `attachment`
     * and the parent's {accountId, mailbox, uid}
     * @member {Object|null} message=null
     */
    message = null
    /**
     * email/message/view response of the shown message
     * @member {Object|null} data=null
     */
    messageData = null
    /**
     * Route flags of the shown message (unblock, filterXSS, no_max_body_size, plaintext, password)
     * @member {Object} options={}
     */
    options = {}
    /**
     * Addresses in the header, by data-address
     * @member {Object[]} addresses=[]
     */
    addresses = []
    /**
     * Toolbar components and menu items the plugins added for the shown message
     * @member {Object} pluginState
     */
    pluginState = {toolbar: [], menuItems: []}

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('editButton').handler     = () => me.editDraft();
        me.getReference('replyButton').handler    = () => me.reply(false);
        me.getReference('replyAllButton').handler = () => me.reply(true);
        me.getReference('forwardButton').handler  = () => me.forward();
        me.getReference('deleteButton').handler   = () => me.deleteMessage();
        me.getReference('moreButton').handler     = () => me.showMoreMenu();

        me.getReference('content').addDomListeners({click: me.onContentClick, contextmenu: me.onContentMenu, scope: me});
        enableImageZoom(me.getReference('body'))
    }

    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId?.(value, oldValue);

        // a right click on an attachment opens its menu instead of the browser's
        value && Neo.main.DomEvents.registerPreventDefaultTargets({name: 'contextmenu', cls: ['go-email-attachment'], windowId: value})
    }

    /**
     * Loads a message of an account
     * @param {Object} params
     * @param {Number} params.accountId
     * @param {String} params.mailbox
     * @param {Number} params.uid
     * @param {Object} [options] route flags, see `options`
     * @returns {Promise<Object|null>}
     */
    load({accountId, mailbox, uid}, options={}) {
        const me  = this,
              key = JSON.stringify([Number(accountId), mailbox, Number(uid), options]);

        // the same request again (EmailMain shows the selected row on a click too): one request
        if (key === me.loadKey && me.loadPromise) {
            return me.loadPromise
        }

        me.loadKey = key;
        me.loadPromise = me.doLoad({accountId, mailbox, uid}, options);
        return me.loadPromise
    }

    /**
     * @param {Object} params {accountId, mailbox, uid}
     * @param {Object} options
     * @returns {Promise<Object|null>}
     * @protected
     */
    async doLoad({accountId, mailbox, uid}, options) {
        let me         = this,
            generation = me.loadGeneration = (me.loadGeneration || 0) + 1,
            same       = me.message && !me.message.attachment && me.message.accountId === Number(accountId)
                && me.message.mailbox === mailbox && me.message.uid === Number(uid);

        const message = {accountId: Number(accountId), mailbox, uid: Number(uid)};

        me.message = message;
        me.options = options;
        same || me.showLoading();

        try {
            const extra = await me.pluginParams(message, options);

            // another message was selected while a plugin was busy
            if (me.isDestroyed || generation !== me.loadGeneration) {
                return null
            }

            const data = await messageApi.view({...message, ...options, ...extra});

            if (me.isDestroyed || generation !== me.loadGeneration) {
                return null
            }

            await me.showMessage(data, generation);
            me.isDestroyed || generation !== me.loadGeneration || me.fire('load', {message: data});
            return data
        } catch (error) {
            if (!me.isDestroyed && generation === me.loadGeneration) {
                me.loadKey = null;
                me.clear();
                notifyError(me, error);
                me.fire('loadError', {error})
            }
            return null
        }
    }

    /**
     * Loads a message attached to another one (ExtJS LinkedMessagePanel via
     * email/message/messageAttachment): read only, reply and forward from the temporary copy
     * @param {Object} parent {accountId, mailbox, uid}
     * @param {Object} attachment
     * @param {Object} [options] {filterXSS}
     * @returns {Promise<Object|null>}
     */
    async loadAttached(parent, attachment, options={}) {
        let me         = this,
            generation = me.loadGeneration = (me.loadGeneration || 0) + 1;

        me.loadKey = null;
        me.message = {accountId: Number(parent.accountId), mailbox: parent.mailbox, uid: Number(parent.uid), attachment, parent};
        me.options = options;
        me.showLoading();

        try {
            const data = await messageApi.messageAttachment(parent, attachment, options);

            if (me.isDestroyed || generation !== me.loadGeneration) {
                return null
            }

            // the panel's actions only need the account (e.g. the composer's sender) and the
            // user's level on it, which the attachment route doesn't return
            data.account_id = parent.accountId;
            data.permission_level ??= parent.permissionLevel;
            await me.showMessage(data, generation);
            me.isDestroyed || generation !== me.loadGeneration || me.fire('load', {message: data});
            return data
        } catch (error) {
            if (!me.isDestroyed && generation === me.loadGeneration) {
                me.clear();
                notifyError(me, error);
                me.fire('loadError', {error})
            }
            return null
        }
    }

    /**
     * Loads the shown message again
     * @param {Object} [extra] flags to add, e.g. {unblock: true}
     * @returns {Promise<Object|null>}
     */
    reload(extra={}) {
        const me = this;

        if (!me.message) {
            return Promise.resolve(null)
        }

        me.loadKey = null;

        return me.message.attachment
            ? me.loadAttached(me.message.parent, me.message.attachment, {...me.options, ...extra})
            : me.load(me.message, {...me.options, ...extra})
    }

    reset() {
        let me = this;

        me.loadGeneration = (me.loadGeneration || 0) + 1;
        me.loadKey = null;
        me.message = null;
        me.clear()
    }

    /**
     * Empties the view and disables the actions
     * @protected
     */
    clear() {
        let me = this;

        me.messageData = null;
        me.addresses = [];
        me.removePluginParts();
        me.getReference('header').html = '';
        me.getReference('body').html   = '';
        me.updateButtons()
    }

    /**
     * @protected
     */
    showLoading() {
        let me = this;

        me.messageData = null;
        me.removePluginParts();
        me.updateButtons();
        me.getReference('header').html = `<p class="go-email-message-loading">${escapeHtml(t('Loading...'))}</p>`;
        me.getReference('body').html   = ''
    }

    /**
     * Renders a loaded message, then the plugins' parts and the read notification
     * @param {Object} data
     * @param {Number} generation
     * @protected
     */
    async showMessage(data, generation) {
        let me       = this,
            attached = !!me.message.attachment;

        me.messageData      = data;
        me.addresses = [];
        me.removePluginParts();

        me.getReference('header').html = headerHtml(data, me.addresses, {actions: !attached, prefix: me.id});
        me.getReference('body').html   = bodyHtml(data, me.id);
        me.updateButtons();

        await me.runPlugins(data, generation);

        // not for a message that was replaced or a closed window while the plugins ran
        me.isDestroyed || generation !== me.loadGeneration || attached || me.askNotification(data)
    }

    /**
     * Toolbar state for the shown message and the user's permission on its account
     * (ExtJS: reply for "delegated" and up, edit for drafts, delete with "Use account")
     * @protected
     */
    updateButtons() {
        let me       = this,
            data     = me.messageData,
            attached = !!me.message?.attachment,
            level    = me.permissionLevel(),
            draft    = !!data?.isDraft && !attached;

        me.getReference('editButton').hidden       = !draft;
        me.getReference('replyButton').hidden      = draft;
        me.getReference('replyAllButton').hidden   = draft;
        me.getReference('replyButton').disabled    = !data || level < LEVEL_DELEGATED;
        me.getReference('replyAllButton').disabled = !data || level < LEVEL_DELEGATED;
        me.getReference('forwardButton').disabled  = !data;
        me.getReference('deleteButton').hidden     = attached;
        me.getReference('deleteButton').disabled   = !data || level < LEVEL_CREATE;
        me.getReference('moreButton').disabled     = !data
    }

    /**
     * Permission level of the user on the account of the shown message
     * @returns {Number}
     */
    permissionLevel() {
        return Number(this.messageData?.permission_level) || 0
    }

    /**
     * The read notification the sender asked for (ExtJS: needs "Use account"; automatic with the
     * user setting "always respond", else after asking)
     * @param {Object} data
     * @protected
     */
    async askNotification(data) {
        let me = this;

        const key = [data.account_id, data.mailbox, data.uid].join(':');

        // once per shown message, not again on a reload (images, plain text)
        if (data.seen || !data.notification || me.permissionLevel() < LEVEL_CREATE || me.notificationAsked === key) {
            return
        }

        me.notificationAsked = key;

        const send = data.always_respond_to_notifications || await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : escapeHtml(fmt(t('The sender of this messages likes a read notification by you at: %s. Do you want to send a read notification now?').replace('%s', '{address}'), {address: data.notification}))
        });

        if (send && !me.isDestroyed) {
            messageApi.sendNotification(data).catch(e => notifyError(me, e))
        }
    }

    // ----------------------------------------------------------------- plugins

    /**
     * @returns {Object[]} emailMessagePanelPlugins configs
     */
    messagePlugins() {
        return ModuleRegistry.getConfigs('emailMessagePanelPlugins').flat()
    }

    /**
     * Extra view parameters of the plugins (beforeLoad)
     * @param {Object} message {accountId, mailbox, uid} to load
     * @param {Object} options
     * @returns {Promise<Object>}
     * @protected
     */
    async pluginParams(message, options) {
        let params = {};

        for (const plugin of this.messagePlugins()) {
            try {
                Object.assign(params, await plugin.beforeLoad?.({...message, ...options}, this) || {})
            } catch (e) {
                console.error(`emailMessagePanelPlugins ${plugin.id} beforeLoad`, e)
            }
        }

        return params
    }

    /**
     * The plugins' parts and toolbar items for a loaded message
     * @param {Object} data
     * @param {Number} generation
     * @protected
     */
    async runPlugins(data, generation) {
        let me      = this,
            toolbar = me.getReference('toolbar');

        for (const plugin of me.messagePlugins()) {
            let result;

            try {
                result = await plugin.onLoad?.(data, me)
            } catch (e) {
                console.error(`emailMessagePanelPlugins ${plugin.id} onLoad`, e);
                continue
            }

            if (!result || me.isDestroyed || generation !== me.loadGeneration) {
                continue
            }

            result.parts?.length && me.getReference('parts').add(result.parts);

            (result.toolbarItems || []).forEach(item => {
                // after the forward button
                const index = toolbar.items.indexOf(me.getReference('forwardButton')) + 1 + me.pluginState.toolbar.length;
                me.pluginState.toolbar.push(toolbar.insert(index, item))
            });

            me.pluginState.menuItems.push(...(result.menuItems || []))
        }
    }

    /**
     * @protected
     */
    removePluginParts() {
        let me    = this,
            parts = me.getReference('parts');

        parts?.items.length && parts.removeAll(true);
        me.pluginState.toolbar.forEach(item => item && !item.isDestroyed && me.getReference('toolbar').remove(item, true));
        me.pluginState = {toolbar: [], menuItems: []}
    }

    /**
     * Menu items a plugin function gives (e.g. 'attachmentMenuItems')
     * @param {String} key
     * @param {...*} args
     * @returns {Object[]}
     */
    pluginItems(key, ...args) {
        return this.messagePlugins().flatMap(plugin => {
            try {
                return plugin[key]?.(...args, this.messageData, this) || []
            } catch (e) {
                console.error(`emailMessagePanelPlugins ${plugin.id} ${key}`, e);
                return []
            }
        })
    }

    // ------------------------------------------------------------------- clicks

    onContentClick(data) {
        let me   = this,
            path = data.path || [],
            has  = cls => path.find(node => node.cls?.includes(cls));

        if (!me.messageData) {
            return
        }

        let node;

        if ((node = has('go-email-attachment-more'))) {
            const index = has('go-email-attachment')?.data?.attachment;
            me.showAttachmentMenu(index, `${me.id}-more-${index}`)
        } else if ((node = has('go-email-attachments-more'))) {
            MenuList.showAt({appName: me.appName, windowId: me.windowId, target: `${me.id}-allmore`, items: allAttachmentsMenuItems(me)})
        } else if ((node = has('go-email-attachment'))) {
            const attachment = me.messageData.attachments?.[Number(node.data?.attachment)];
            attachment && openAttachment(me, attachment)
        } else if ((node = has('go-email-address'))) {
            const address = me.addresses[Number(node.data?.address)];
            address && showAddressMenu(me, address, `${me.id}-address-${node.data?.address}`)
        } else if ((node = has('go-email-mailto'))) {
            me.onMailto(node)
        } else if (has('go-email-contact')) {
            const route = me.messageData.contact?.id && resolveRoute('Contact', me.messageData.contact.id);
            route && Neo.Main.setRoute({value: route, windowId: me.windowId})
        } else if ((node = has('go-email-msglink'))) {
            const link  = me.messageData.links?.[Number(node.data?.link)],
                  route = link && resolveRoute(link.entity, link.entityId ?? link.model_id);
            route && Neo.Main.setRoute({value: route, windowId: me.windowId})
        } else if (has('go-email-unblock')) {
            me.reload({unblock: true})
        } else if (has('go-email-filterxss')) {
            me.reload({filterXSS: true, unblock: true})
        } else if (has('go-email-fullbody')) {
            me.reload({no_max_body_size: true})
        } else if (has('go-email-notspam')) {
            me.moveToInbox()
        }
    }

    onContentMenu(data) {
        let me   = this,
            path = data.path || [],
            node = path.find(n => n.cls?.includes('go-email-attachment'));

        node && me.messageData && me.showAttachmentMenu(node.data?.attachment, `${me.id}-attachment-${node.data?.attachment}`)
    }

    /**
     * @param {String|Number} index data-attachment
     * @param {String} target DOM id
     * @protected
     */
    showAttachmentMenu(index, target) {
        const me         = this,
              attachment = me.messageData?.attachments?.[Number(index)];

        attachment && MenuList.showAt({appName: me.appName, windowId: me.windowId, target, items: attachmentMenuItems(me, attachment)})
    }

    /**
     * A mailto: link in the body: "mailto:a@b.c?subject=…" (sanitizeHtml() escaped the href)
     * @param {Object} node
     * @protected
     */
    onMailto(node) {
        const href  = unescapeHtml(String(node.data?.mailto || '')),
              index = href.indexOf('?');

        let email = index > -1 ? href.slice(0, index) : href;

        try {
            email = decodeURIComponent(email)
        } catch (e) {
            // not URL encoded
        }

        // "Name <a@b.c>"
        const match = email.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);

        showAddressMenu(this, {
            email: (match ? match[2] : email).trim(),
            name : match ? match[1].trim() : '',
            query: index > -1 ? href.slice(index + 1) : ''
        }, node.id)
    }

    /**
     * An attached e-mail in a window of its own
     * @param {Object} attachment
     */
    async openAttachedMessage(attachment) {
        const me = this;

        if (me.message?.attachment) {
            // an e-mail in an attached e-mail: the server only reads attachments of IMAP messages
            download(me.windowId, messageApi.attachmentUrl(attachment, false)).catch(e => notifyError(me, e));
            return
        }

        const {openAttachedMessageWindow} = await import('./openMessageWindow.mjs');
        openAttachedMessageWindow({appName: me.appName, windowId: me.windowId, parent: {...me.message, permissionLevel: me.permissionLevel()}, attachment, host: me.getHost()})
    }

    // ------------------------------------------------------------------ actions

    /**
     * EmailMain that shows this panel, or the one of the window
     * @returns {GO.email.EmailMain|null}
     */
    getHost() {
        const me = this;

        if (me.host && !me.host.isDestroyed) {
            return me.host
        }

        return me.up({className: 'GO.email.EmailMain'})
            || Neo.manager.Component.find('className', 'GO.email.EmailMain').find(c => c.windowId === me.windowId && !c.isDestroyed)
            || null
    }

    /**
     * EmailMain when this panel is its east panel and shows a message of the open folder: then
     * the actions go through it
     * @returns {GO.email.EmailMain|null}
     */
    getFolderHost() {
        const me   = this,
              host = me.up({className: 'GO.email.EmailMain'});

        return host && me.message && !me.message.attachment && host.accountId === me.message.accountId && host.mailbox === me.message.mailbox
            ? host : null
    }

    /**
     * The message as an EmailMain grid record (or one with the same fields)
     * @param {GO.email.EmailMain|null} host
     * @returns {Object}
     */
    getRecord(host=this.getFolderHost()) {
        const {accountId, mailbox, uid} = this.message,
              record = host?.getReference('grid')?.store.items.find(r => r.uid === uid && r.mailbox === mailbox && r.account_id === accountId);

        return record || {
            uid, mailbox,
            account_id: accountId,
            subject   : unescapeHtml(this.messageData?.subject),
            seen      : !!this.messageData?.seen,
            flagged   : !!this.messageData?.flagged,
            labels    : this.messageData?.labels || []
        }
    }

    /**
     * After an action that changed the message outside EmailMain: tell the listeners, refresh
     * the grid and folder counts of the window's EmailMain
     * @param {String} action
     * @param {Object} [extra]
     * @protected
     */
    changed(action, extra={}) {
        const me      = this,
              host    = me.getHost(),
              message = {...me.message};

        if (host && !host.isDestroyed) {
            host.accountId === message.accountId && host.reload?.();
            host.checkUnseen?.()
        }

        // last: a window closes itself on it
        me.fire('change', {action, message, ...extra})
    }

    /**
     * Composer links: the items the message is linked to (ExtJS adds data.links)
     * @returns {Object[]}
     */
    composerLinks() {
        return (this.messageData?.links || []).map(link => ({entity: link.entity, entityId: link.entityId ?? link.model_id})).filter(l => l.entity && l.entityId)
    }

    /**
     * Load parameters of email/message/reply and /forward: the IMAP message, or the temporary
     * copy of an attached one
     * @returns {Object}
     */
    composerParams() {
        const {accountId, mailbox, uid, attachment} = this.message;

        return attachment
            ? {account_id: accountId, path: this.messageData.path, is_tmp_file: 1}
            : {account_id: accountId, mailbox, uid}
    }

    /**
     * @param {Boolean} all reply all
     */
    reply(all) {
        const me = this;

        me.messageData && compose({
            appName   : me.appName,
            windowId  : me.windowId,
            accountId : me.message.accountId,
            loadUrl   : 'email/message/reply',
            loadParams: {...me.composerParams(), ...(all ? {replyAll: 1} : {})},
            links     : me.composerLinks()
        })
    }

    forward() {
        const me = this;

        me.messageData && compose({
            appName   : me.appName,
            windowId  : me.windowId,
            accountId : me.message.accountId,
            loadUrl   : 'email/message/forward',
            loadParams: me.composerParams(),
            links     : me.composerLinks()
        })
    }

    /**
     * ExtJS MessageContextMenu "Forward as attachment": a new message with this one as .eml
     */
    forwardAsAttachment() {
        const me = this,
              {accountId, mailbox, uid} = me.message;

        compose({
            appName   : me.appName,
            windowId  : me.windowId,
            accountId,
            values    : {subject: 'Fwd: ' + unescapeHtml(me.messageData?.subject)},
            loadUrl   : 'email/message/template',
            loadParams: {account_id: accountId, addEmailAsAttachmentList: JSON.stringify([{uid, mailbox}])}
        })
    }

    editDraft() {
        const me = this,
              {accountId, mailbox, uid} = me.message;

        compose({appName: me.appName, windowId: me.windowId, accountId, loadUrl: 'email/message/openDraft', loadParams: {account_id: accountId, mailbox, uid}})
    }

    async deleteMessage() {
        const me   = this,
              host = me.getFolderHost();

        if (!me.messageData || me.message.attachment) {
            return
        }

        if (host) {
            await host.deleteMessages([me.getRecord(host)]);
            return
        }

        const {accountId, mailbox, uid} = me.message;

        // without a trash folder (or in it) the message is gone for good: ask like EmailMain
        const response = await api.messageStore({account_id: accountId, mailbox, limit: 1});

        if (response.deleteConfirm && !await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : fmt(coreT("Are you sure you want to delete '{item}'?"), {item: escapeHtml(unescapeHtml(me.messageData.subject))})
        })) {
            return
        }

        try {
            const result = await api.messageStore({account_id: accountId, mailbox, limit: 1, delete_keys: JSON.stringify([uid])});

            if (result.deleteFeedback) {
                throw new Error(result.deleteFeedback)
            }

            me.changed('delete')
        } catch (e) {
            notifyError(me, e)
        }
    }

    async moveMessage() {
        const me   = this,
              host = me.getFolderHost();

        if (host) {
            await host.moveMessages([me.getRecord(host)]);
            return
        }

        const target = await FolderPickerDialog.ask({appName: me.appName, windowId: me.windowId, title: t('Move email to...')});

        if (!target || me.isDestroyed) {
            return
        }

        const {accountId, mailbox, uid} = me.message;

        if (Number(target.accountId) === accountId && target.mailbox === mailbox) {
            return
        }

        try {
            if (Number(target.accountId) === accountId) {
                await api.messageStore({account_id: accountId, mailbox, limit: 1, action: 'move', messages: JSON.stringify([uid]), to_mailbox: target.mailbox})
            } else {
                let left = [uid];

                while (left.length) {
                    const response = await api.moveToAccount({
                        from_account_id: accountId, to_account_id: target.accountId, from_mailbox: mailbox,
                        to_mailbox: target.mailbox, messages: left, total: 1
                    });

                    left = response.messages?.length ? response.messages : []
                }
            }

            me.changed('move', {target})
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * Seen, Flagged or a label ($label) on the shown message
     * @param {String} action 'seen' | 'flagged' | 'label'
     * @param {Boolean} on
     * @param {Object} [label] {name, flag, color}
     */
    async setFlag(action, on, label=null) {
        const me         = this,
              host       = me.getFolderHost(),
              record     = me.getRecord(host),
              message    = {...me.message},
              generation = me.loadGeneration,
              // another message is shown when the request returns: leave its flags alone
              stale      = () => me.isDestroyed || generation !== me.loadGeneration;

        if (host) {
            action === 'seen'    && await host.setSeen([record], on);
            action === 'flagged' && await host.setFlagged([record], on);
            action === 'label'   && await host.setLabel([record], label, on);
            stale() || me.syncFlags(record);
            return
        }

        const flag = action === 'seen' ? 'Seen' : action === 'flagged' ? 'Flagged' : label.flag;

        try {
            await api.setFlag(message.accountId, message.mailbox, [message.uid], flag, !on);

            if (stale()) {
                return
            }

            action === 'seen'    && (me.messageData.seen = on);
            action === 'flagged' && (me.messageData.flagged = on);

            if (action === 'label') {
                const rest = (me.messageData.labels || []).filter(l => l.flag !== label.flag && l.name !== label.name);
                me.messageData.labels = on ? [...rest, {name: label.name, color: label.color, flag: label.flag}] : rest
            }

            me.changed(action);
            me.refreshHeader()
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * The grid record changed the flags: show them
     * @param {Object} record
     * @protected
     */
    syncFlags(record) {
        const me = this;

        if (me.messageData && !me.isDestroyed) {
            me.messageData.seen    = !!record.seen;
            me.messageData.flagged = !!record.flagged;
            me.messageData.labels  = (record.labels || []).map(l => ({name: l.name, color: l.color, flag: l.flag}));
            me.refreshHeader()
        }
    }

    /**
     * @protected
     */
    refreshHeader() {
        const me = this;

        me.addresses = [];
        me.getReference('header').html = headerHtml(me.messageData, me.addresses, {actions: !me.message?.attachment, prefix: me.id})
    }

    async moveToSpam() {
        const me   = this,
              host = me.getFolderHost();

        if (host) {
            await host.moveToSpam([me.getRecord(host)]);
            return
        }

        if (!await ConfirmDialog.ask({appName: me.appName, windowId: me.windowId, message: t('Are you sure you want to classify this message as spam?')})) {
            return
        }

        try {
            await api.moveToSpam(me.message.accountId, me.message.mailbox, [me.message.uid]);
            me.changed('spam')
        } catch (e) {
            notifyError(me, e)
        }
    }

    async moveToInbox() {
        const me   = this,
              host = me.getFolderHost();

        if (host) {
            await host.moveToInbox([me.getRecord(host)]);
            return
        }

        if (!await ConfirmDialog.ask({appName: me.appName, windowId: me.windowId, message: t('Are you sure you want to remove the spam mark and move this message into your inbox?')})) {
            return
        }

        try {
            await api.moveToInbox(me.message.accountId, me.message.uid);
            me.changed('notSpam')
        } catch (e) {
            notifyError(me, e)
        }
    }

    viewSource() {
        Neo.Main.windowOpen({url: messageApi.sourceUrl(this.message), windowName: '_blank', windowId: this.windowId})
    }

    downloadSource() {
        download(this.windowId, messageApi.sourceUrl(this.message, true)).catch(e => notifyError(this, e))
    }

    /**
     * ExtJS MessagePanel.print(): the message in a page of its own that prints itself. The
     * page is a blob of this worker (same origin); the body is sanitised like in the view.
     */
    print() {
        const me   = this,
              data = me.messageData;

        if (!data) {
            return
        }

        const row = (label, value) => value ? `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>` : '',
              list = recipients => (recipients || []).map(r => r.personal ? `${unescapeHtml(r.personal)} <${r.email}>` : r.email).filter(Boolean).join(', '),
              subject = unescapeHtml(data.subject),
              date    = data.udate ? formatUserDateTime(data.udate * 1000) : '',
              body    = data.htmlbody !== undefined && data.htmlbody !== null ? sanitizeHtml(data.htmlbody) : `<pre>${escapeHtml(data.plainbody || '')}</pre>`,
              html    = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml([date, data.sender, subject].filter(Boolean).join(' - '))}</title>
<style>body{font:14px/1.4 sans-serif;margin:24px}table{border-collapse:collapse;margin-bottom:16px}th{text-align:left;padding:2px 12px 2px 0;vertical-align:top}
img{max-width:100%}hr{border:0;border-top:1px solid #ccc}</style></head><body>
<table>${row(t('From'), unescapeHtml(data.full_from || data.sender))}${row(t('Subject'), subject)}${row(coreT('Date'), date)}${row(t('To'), list(data.to))}${row(t('CC'), list(data.cc))}</table><hr>
${body}<script>window.onload = () => window.print()</script></body></html>`,
              url = URL.createObjectURL(new Blob([html], {type: 'text/html'}));

        Neo.Main.windowOpen({url, windowName: '_blank', windowId: me.windowId});
        // the new page has loaded it by then
        setTimeout(() => URL.revokeObjectURL(url), 60000)
    }

    /**
     * Labels of the account for the menu (EmailMain caches them for the open account)
     * @returns {Promise<Object[]>}
     * @protected
     */
    async loadLabels() {
        const me   = this,
              host = me.getFolderHost();

        if (host) {
            return host.loadLabels()
        }

        if (!me.labels || me.labels.accountId !== me.message.accountId) {
            const accountId = me.message.accountId;
            me.labels = Object.assign(await api.labels(accountId), {accountId})
        }

        return me.labels
    }

    /**
     * The "more" menu (ExtJS MessageContextMenu for the shown message)
     */
    async showMoreMenu() {
        const me         = this,
              generation = me.menuGeneration = (me.menuGeneration || 0) + 1,
              data       = me.messageData,
              target     = me.getReference('moreButton').id;

        if (!data) {
            return
        }

        const attached  = !!me.message.attachment,
              level     = me.permissionLevel(),
              delegated = level >= LEVEL_DELEGATED,
              change    = level >= LEVEL_CREATE,
              record    = me.getRecord(),
              plaintext = !!me.options.plaintext,
              items     = [];

        let labels = [];

        if (!attached && delegated) {
            labels = await me.loadLabels().catch(() => []);

            if (me.isDestroyed || generation !== me.menuGeneration || me.messageData !== data) {
                return
            }
        }

        me.canPopout && !attached && items.push({text: t('Open in new window'), icon: 'open_in_new', handler: () => me.openInWindow()});

        if (!attached) {
            items.push(
                record.seen
                    ? {text: t('Mark as unread'), icon: 'mark_email_unread', disabled: !change, handler: () => me.setFlag('seen', false)}
                    : {text: t('Mark as read'), icon: 'mark_email_read', disabled: !delegated, handler: () => me.setFlag('seen', true)},
                record.flagged
                    ? {text: t('Remove flag'), icon: 'outlined_flag', disabled: !delegated, handler: () => me.setFlag('flagged', false)}
                    : {text: t('Add flag'), icon: 'flag', disabled: !delegated, handler: () => me.setFlag('flagged', true)});

            labels.length && items.push({
                text : t('Labels'),
                icon : 'label',
                items: labels.map(label => {
                    const on = (record.labels || []).some(l => (l.flag && l.flag === label.flag) || l.name === label.name);
                    return {text: label.name, icon: on ? 'check_box' : 'check_box_outline_blank', handler: () => me.setFlag('label', !on, label)}
                })
            });

            items.push({separator: true});
        }

        items.push(
            {text: t('Forward as attachment'), icon: 'forward_to_inbox', hidden: attached, handler: () => me.forwardAsAttachment()},
            {text: plaintext ? t('Show HTML') : t('Show plain text'), icon: plaintext ? 'html' : 'notes', hidden: attached, handler: () => me.reload({plaintext: !plaintext})},
            {text: coreT('Print'), icon: 'print', handler: () => me.print()});

        if (!attached) {
            items.push(
                {text: t('View source'), icon: 'code', handler: () => me.viewSource()},
                {text: t('Download as file'), icon: 'download', handler: () => me.downloadSource()},
                {separator: true},
                {text: t('Move email to...'), icon: 'drive_file_move', disabled: !change, handler: () => me.moveMessage()},
                data.isInSpamFolder
                    ? {text: t('Not spam'), icon: 'move_to_inbox', disabled: !change, handler: () => me.moveToInbox()}
                    : {text: t('Move to spam folder'), icon: 'report', disabled: !change, handler: () => me.moveToSpam()},
                {text: coreT('Delete'), icon: 'delete', disabled: !change, handler: () => me.deleteMessage()});
        }

        const extra = me.pluginState.menuItems;
        extra.length && items.push({separator: true}, ...extra);

        MenuList.showAt({appName: me.appName, windowId: me.windowId, target, items: items.filter(item => !item.hidden)})
    }

    /**
     * The shown message in a window (ExtJS MessageDialog)
     */
    async openInWindow() {
        const me = this,
              {openMessageWindow} = await import('./openMessageWindow.mjs');

        if (me.message && !me.message.attachment) {
            const host   = me.getHost(),
                  dialog = openMessageWindow({appName: me.appName, windowId: me.windowId, ...me.message, host});

            // EmailMain marks a message opened in a window as read too
            host?.trackDialog?.(dialog);
            host && dialog.getReference('messagePanel').on('load', ({message}) => host.isDestroyed || host.onMessageLoaded?.(message))
        }
    }
}

export default Neo.setupClass(MessagePanel);
