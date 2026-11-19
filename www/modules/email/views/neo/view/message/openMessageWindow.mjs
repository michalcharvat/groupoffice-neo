import Dialog, {headerTools} from '../../../../../../views/neo/src/view/Dialog.mjs';
import MessagePanel from './MessagePanel.mjs';
import {t, unescapeHtml} from '../../util.mjs';

/** Actions after which the message is no longer where the window shows it */
const GONE = new Set(['delete', 'move', 'spam', 'notSpam']);

/**
 * A message in its own window (ExtJS GO.email.MessageDialog, and LinkedMessagePanel's window
 * for an attached e-mail). The header's "popout" tool moves it into a browser window.
 *
 *     const win = openMessageWindow({appName, windowId, accountId, mailbox, uid});
 *     win.getReference('messagePanel').on('load', ({message}) => …)
 */
class MessageDialog extends Dialog {
    static config = {
        className   : 'GO.email.message.MessageDialog',
        cls         : ['go-email-message-dialog'],
        modal       : false,
        resizable   : true,
        headerConfig: headerTools('popout', 'maximize', 'close'),
        title       : t('E-mail'),
        wrapperStyle: {height: '85vh', left: 'max(0px, calc(50vw - 450px))', top: '7vh', width: 'min(900px, 100vw)'},
        containerConfig: {
            layout: 'fit'
        },
        /**
         * EmailMain to keep up to date (it marks the message as read and refreshes after changes)
         * @member {GO.email.EmailMain|null} host=null
         */
        host: null
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module   : MessagePanel,
            reference: 'messagePanel',
            canPopout: false,
            host     : me.host
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me    = this,
            panel = me.getReference('messagePanel');

        panel.on('load', ({message}) => {
            me.title = unescapeHtml(message.subject) || t('E-mail')
        });

        panel.on('change', ({action}) => {
            GONE.has(action) && !me.isDestroyed && me.close()
        })
    }
}

Neo.setupClass(MessageDialog);

/**
 * @param {Object} cfg appName, windowId, accountId, mailbox, uid; optional host (EmailMain)
 *                     and options (email/message/view flags, e.g. {no_max_body_size: true})
 * @returns {GO.email.message.MessageDialog}
 */
export function openMessageWindow({appName, windowId, accountId, mailbox, uid, host=null, options={}}) {
    const dialog = Neo.create(MessageDialog, {appName, windowId, host});

    dialog.getReference('messagePanel').load({accountId, mailbox, uid}, options);
    return dialog
}

/**
 * An e-mail attached to another one (.eml; ExtJS GO.email.showMessageAttachment)
 * @param {Object} cfg appName, windowId, parent {accountId, mailbox, uid}, attachment, host
 * @returns {GO.email.message.MessageDialog}
 */
export function openAttachedMessageWindow({appName, windowId, parent, attachment, host=null}) {
    const dialog = Neo.create(MessageDialog, {appName, windowId, host, title: attachment.name || t('E-mail message')});

    dialog.getReference('messagePanel').loadAttached(parent, attachment);
    host?.trackDialog?.(dialog);
    return dialog
}

export default openMessageWindow;
