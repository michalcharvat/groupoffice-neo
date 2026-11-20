import Container from '../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar   from '../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button    from '../../../../../../views/neo/src/button/Button.mjs';
import client    from '../../../../../../views/neo/src/jmap/Client.mjs';
import {escapeHtml, formatUserDateTime, smartDateTime} from '../../../../../../views/neo/src/Format.mjs';
import {notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import {messageStore, setFlag} from '../../api.mjs';
import {t, unescapeHtml} from '../../util.mjs';
import {openMessageWindow} from '../message/openMessageWindow.mjs';

/** messages per folder (ExtJS: the grid's first page) */
const LIMIT = 15;

/** ExtJS reloads the messages every 15 minutes */
const RELOAD_INTERVAL = 15 * 60 * 1000;

/**
 * Start page portlet "E-mail" (ExtJS Portlet.js / GO.email.PortletPanel): the newest messages
 * of the folders the user chose for it (em_portlet_folders, email/portlet/portletFoldersByUser),
 * one folder at a time with a button per folder. A click opens the message in a window.
 * "Settings" picks the folders (PortletFoldersDialog).
 */
class EmailPortlet extends Container {
    static config = {
        className: 'GO.email.portlet.EmailPortlet',
        baseCls  : ['go-email-portlet', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module   : Toolbar,
            reference: 'folders',
            flex     : 'none',
            hidden   : true,
            items    : []
        }, {
            ntype    : 'component',
            reference: 'list',
            cls      : ['go-portlet-list'],
            flex     : 'none',
            html     : ''
        }]
    }

    /**
     * email/portlet/portletFoldersByUser results: {account_id, folder_name, name, email}
     * @member {Object[]} folders=[]
     */
    folders = []

    /**
     * The shown folder
     * @member {Object|null} folder=null
     */
    folder = null

    /**
     * Messages of the shown folder
     * @member {Object[]} messages=[]
     */
    messages = []

    /**
     * The folder of `messages` (the shown one can change while its messages load)
     * @member {Object|null} messagesFolder=null
     */
    messagesFolder = null

    loadCounter = 0

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('list').addDomListeners([{click: me.onClick, scope: me}]);
        me.timer = setInterval(() => me.loadMessages(), RELOAD_INTERVAL);
        me.refresh()
    }

    destroy(...args) {
        clearInterval(this.timer);
        super.destroy(...args)
    }

    /**
     * Loads the chosen folders and the messages of the shown one (header button "Refresh")
     * @returns {Promise<void>}
     */
    async refresh() {
        let me = this;

        try {
            const {results = []} = await client.legacy('email/portlet/portletFoldersByUser');

            if (me.isDestroyed) {
                return
            }

            me.folders = results.map(f => ({...f, name: unescapeHtml(f.name), email: unescapeHtml(f.email)}));

            const same = me.folder && me.folders.find(f => f.account_id == me.folder.account_id && f.folder_name === me.folder.folder_name);

            me.folder = same || me.folders[0] || null;
            me.renderFolders();
            await me.loadMessages()
        } catch (e) {
            me.isDestroyed || me.showText(e.message || String(e))
        }
    }

    /**
     * A button per folder, the shown one outlined
     * @protected
     */
    renderFolders() {
        let me      = this,
            toolbar = me.getReference('folders');

        toolbar.removeAll();
        toolbar.hidden = me.folders.length < 2;

        me.folders.length > 1 && toolbar.add(me.folders.map(folder => ({
            module : Button,
            text   : folder.name,
            tooltip: folder.email,
            ui     : folder === me.folder ? 'secondary' : 'ghost',
            handler: () => me.showFolder(folder)
        })))
    }

    /**
     * @param {Object} folder
     */
    showFolder(folder) {
        let me = this;

        me.folder = folder;
        // the old folder's rows would open their uid in the new folder
        me.messages = [];
        me.messagesFolder = null;
        me.showText(t('Loading...'));
        me.getReference('folders').items.forEach((button, i) => button.ui = me.folders[i] === folder ? 'secondary' : 'ghost');
        me.loadMessages()
    }

    /**
     * @returns {Promise<void>}
     */
    async loadMessages() {
        let me      = this,
            folder  = me.folder,
            counter = ++me.loadCounter;

        if (!folder) {
            me.messages = [];
            me.messagesFolder = null;
            me.showText(t('No folders have been added.'));
            return
        }

        try {
            const {results = []} = await messageStore({account_id: folder.account_id, mailbox: folder.folder_name, start: 0, limit: LIMIT, sort: 'arrival', dir: 'DESC'});

            if (me.isDestroyed || counter !== me.loadCounter) {
                return
            }

            me.messages = results;
            me.messagesFolder = folder;
            me.renderMessages()
        } catch (e) {
            me.isDestroyed || counter !== me.loadCounter || me.showText(e.message || String(e))
        }
    }

    /**
     * @protected
     */
    renderMessages() {
        let me = this;

        if (!me.messages.length) {
            me.showText(t('No items to display'));
            return
        }

        me.getReference('list').html = me.messages.map((m, i) => {
            const date   = (m.internal_udate || m.udate) * 1000,
                  seen   = !!Number(m.seen ?? 0) || m.seen === true,
                  from   = escapeHtml(unescapeHtml(m.from) || unescapeHtml(m.sender)),
                  // email/message/store escapes subject and from (htmlspecialchars)
                  subject = escapeHtml(unescapeHtml(m.subject) || t('No subject'));

            return `<div class="go-portlet-row" data-index="${i}">
                <i class="go-icon go-portlet-icon">${seen ? 'drafts' : 'mail'}</i>
                <span class="go-portlet-text">${seen ? subject : `<b>${subject}</b>`}<small>${from}</small></span>
                <span class="go-portlet-meta" title="${escapeHtml(formatUserDateTime(date))}">${escapeHtml(smartDateTime(date))}</span>
            </div>`
        }).join('')
    }

    /**
     * @param {String} text
     * @protected
     */
    showText(text) {
        this.getReference('list').html = `<div class="go-empty">${escapeHtml(text)}</div>`
    }

    onClick({path}) {
        let me      = this,
            index   = path.find(n => n.cls?.includes('go-portlet-row'))?.data?.index,
            message = index !== undefined && me.messages[Number(index)],
            folder  = me.messagesFolder;

        if (message && folder) {
            openMessageWindow({appName: me.appName, windowId: me.windowId, accountId: Number(folder.account_id), mailbox: folder.folder_name, uid: Number(message.uid)})
                .getReference('messagePanel')?.on('load', ({message: shown}) => me.markSeen(folder, message, shown))
        }
    }

    /**
     * Marks the opened message as read like the e-mail client does (EmailMain), unless the
     * account keeps messages unread (do_not_mark_as_read)
     * @param {Object} folder
     * @param {Object} message the portlet's record
     * @param {Object} shown email/message/view data
     * @protected
     */
    async markSeen(folder, message, shown) {
        let me = this;

        if (message.seen === true || Number(message.seen) || shown?.seen || shown?.do_not_mark_as_read) {
            return
        }

        try {
            await setFlag(Number(folder.account_id), folder.folder_name, [Number(message.uid)], 'Seen', false);
            message.seen = true;
            me.isDestroyed || me.renderMessages()
        } catch (e) {
            me.isDestroyed || notifyError(me, e)
        }
    }

    /**
     * "Settings": the folders of the portlet
     */
    async openSettings() {
        let me = this;

        try {
            const {default: PortletFoldersDialog} = await import('./PortletFoldersDialog.mjs');

            me.isDestroyed || Neo.create(PortletFoldersDialog, {appName: me.appName, windowId: me.windowId})
                .on('close', () => me.refresh())
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(EmailPortlet);
