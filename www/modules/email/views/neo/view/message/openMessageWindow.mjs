import Dialog, {headerTools} from '../../../../../../views/neo/src/view/Dialog.mjs';
import MessagePanel from './MessagePanel.mjs';
import {t}          from '../../util.mjs';

/**
 * A message in its own window (ExtJS GO.email.MessageDialog), e.g. on a double click in the
 * message grid.
 *
 * STUB of card 1 with the final API; card 2 may replace the file (and MessageDialog's looks).
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
        headerConfig: headerTools('maximize', 'close'),
        title       : t('E-mail'),
        wrapperStyle: {height: '80vh', left: 'max(0px, calc(50vw - 400px))', top: '10vh', width: 'min(800px, 100vw)'},
        containerConfig: {
            layout: 'fit'
        }
    }

    construct(config) {
        super.construct(config);

        this.items = [{
            module   : MessagePanel,
            reference: 'messagePanel'
        }]
    }
}

Neo.setupClass(MessageDialog);

/**
 * @param {Object} cfg appName, windowId, accountId, mailbox, uid
 * @returns {GO.email.message.MessageDialog}
 */
export function openMessageWindow({appName, windowId, accountId, mailbox, uid}) {
    const dialog = Neo.create(MessageDialog, {appName, windowId});

    dialog.getReference('messagePanel').load({accountId, mailbox, uid});
    return dialog
}

export default openMessageWindow;
