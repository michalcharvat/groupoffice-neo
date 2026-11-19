import {download}   from '../../../../../../views/neo/src/download.mjs';
import client       from '../../../../../../views/neo/src/jmap/Client.mjs';
import SelectSearchDialog from '../../../../../../views/neo/src/link/SelectSearchDialog.mjs';
import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {notify, notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import {fmt, t as coreT} from '../../../../../../views/neo/src/Translate.mjs';
import ConfirmDialog from '../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import ImageWindow  from '../../../../../../views/neo/src/view/ImageWindow.mjs';
import {LEVEL_CREATE} from '../../../../../../views/neo/src/Acl.mjs';
import {t}          from '../../util.mjs';
import * as messageApi from './messageApi.mjs';

/**
 * Opening, downloading and saving attachments (ExtJS GO.email.openAttachment,
 * AttachmentContextMenu, AllAttachmentContextMenu, LinkAttachmentDialog). `panel` is the
 * GO.email.message.MessagePanel that shows the message: `panel.messageData` (email/message/view
 * response), `panel.message` ({accountId, mailbox, uid}).
 */

const IMAGES = new Set(['bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp']);

/** Files a browser tab shows; the server sends others (and HTML, SVG, XML) as a download */
const VIEWABLE = new Set(['pdf', 'txt', 'mp3', 'mp4', 'ogg', 'wav', 'webm']);

/**
 * Whether the user has a neo module (an app or settings only)
 * @param {String} name
 * @returns {Boolean}
 */
export function hasModule(name) {
    return ModuleRegistry.getAvailable().some(m => m.name === name)
}

/**
 * The message an attachment belongs to, with what the save routes need
 * @param {GO.email.message.MessagePanel} panel
 * @returns {Object} {accountId, mailbox, uid, sender, path}
 */
function messageOf(panel) {
    return {...panel.message, sender: panel.messageData?.sender || '', path: panel.messageData?.path || ''}
}

/**
 * Click on an attachment (ExtJS GO.email.openAttachment): an attached e-mail opens in the
 * message window, .ics in the calendar (module config `openIcs`), .vcf is imported into the
 * address book, images open large, PDF, text and media in a new browser tab, other files download
 * @param {GO.email.message.MessagePanel} panel
 * @param {Object} attachment
 */
export async function openAttachment(panel, attachment) {
    const extension = String(attachment.extension || '').toLowerCase();

    if (attachment.mime === 'message/rfc822' || attachment.mime === 'application/eml' || extension === 'eml') {
        panel.openAttachedMessage(attachment);
        return
    }

    if (extension === 'ics' && ModuleRegistry.getConfigs('openIcs').length && !panel.message.attachment) {
        ModuleRegistry.getConfigs('openIcs')[0]({
            accountId: panel.message.accountId,
            mailbox  : panel.message.mailbox,
            uid      : panel.message.uid,
            partId   : attachment.number,
            encoding : attachment.encoding,
            blobId   : attachment.blobId || null
        }, panel);
        return
    }

    if (extension === 'vcf' && hasModule('addressbook') && panel.message.uid && !panel.message.attachment) {
        await importVCard(panel, attachment);
        return
    }

    if (IMAGES.has(extension)) {
        ImageWindow.show({appName: panel.appName, windowId: panel.windowId, src: messageApi.attachmentUrl(attachment, true), alt: attachment.name});
        return
    }

    // a tab for files the browser shows, else a download (no empty tab); winmail.dat comes as zip
    VIEWABLE.has(extension)
        ? Neo.Main.windowOpen({url: messageApi.attachmentUrl(attachment, true), windowName: '_blank', windowId: panel.windowId})
        : downloadAttachment(panel, attachment)
}

/**
 * @param {GO.email.message.MessagePanel} panel
 * @param {Object} attachment
 */
export function downloadAttachment(panel, attachment) {
    download(panel.windowId, messageApi.attachmentUrl(attachment, false)).catch(e => notifyError(panel, e))
}

/**
 * ExtJS: confirm, then JMAP Contact/loadVCF and the contact dialog
 * @param {GO.email.message.MessagePanel} panel
 * @param {Object} attachment
 */
async function importVCard(panel, attachment) {
    const confirmed = await ConfirmDialog.ask({
        appName : panel.appName,
        windowId: panel.windowId,
        message : t('Are you sure that you would like to import this VCard?')
    });

    if (!confirmed || panel.isDestroyed) {
        return
    }

    try {
        const {accountId, mailbox, uid} = panel.message,
              response = await client.call('Contact/loadVCF', {account_id: accountId, mailbox, uid, number: attachment.number, encoding: attachment.encoding}),
              {default: ContactDialog} = await import('../../../../../../go/modules/community/addressbook/views/neo/view/ContactDialog.mjs');

        response?.contactId && Neo.create(ContactDialog, {appName: panel.appName, windowId: panel.windowId, entityId: response.contactId})
    } catch (e) {
        notifyError(panel, e)
    }
}

/**
 * Menu of one attachment (ExtJS AttachmentContextMenu) plus the items of
 * `emailMessagePanelPlugins` (attachmentMenuItems, e.g. smime "import certificate")
 * @param {GO.email.message.MessagePanel} panel
 * @param {Object} attachment
 * @returns {Object[]} GO.menu.List items
 */
export function attachmentMenuItems(panel, attachment) {
    const items = [
        {text: coreT('Open'), icon: 'open_in_new', handler: () => openAttachment(panel, attachment)},
        {text: coreT('Download'), icon: 'download', handler: () => downloadAttachment(panel, attachment)}
    ];

    if (hasModule('files') && panel.message?.uid && !panel.message.attachment) {
        items.push({text: t('Save to personal folder'), icon: 'save', handler: () => saveToFolder(panel, attachment)},
                   {text: t('Save to item'), icon: 'drive_folder_upload', handler: () => saveToItem(panel, attachment)})
    }

    return items.concat(panel.pluginItems('attachmentMenuItems', attachment))
}

/**
 * Menu of all attachments (ExtJS AllAttachmentContextMenu)
 * @param {GO.email.message.MessagePanel} panel
 * @returns {Object[]}
 */
export function allAttachmentsMenuItems(panel) {
    const data  = panel.messageData || {},
          count = data.attachments?.length || 0,
          // an attached e-mail has its parent's uid: these routes would use the parent's parts
          saved = !!panel.message?.uid && !panel.message.attachment,
          items = [];

    count > 1 && data.zip_of_attachments_url && saved && items.push({
        text   : t('Download all as zipfile'),
        icon   : 'folder_zip',
        handler: () => download(panel.windowId, messageApi.zipUrl(panel.message)).catch(e => notifyError(panel, e))
    });

    count > 1 && hasModule('files') && saved && items.push({
        text   : t('Save all to personal folder'),
        icon   : 'save',
        handler: () => saveToFolder(panel, null)
    }, {
        text   : t('Save all to item'),
        icon   : 'drive_folder_upload',
        handler: () => saveToItem(panel, null)
    });

    data.delete_all_attachments_url && saved && items.push({
        text    : t('Delete all attachments'),
        icon    : 'delete_sweep',
        disabled: (Number(data.permission_level) || 0) < LEVEL_CREATE,
        handler : () => deleteAllAttachments(panel)
    });

    return items.length ? items : [{text: coreT('Download'), icon: 'download', disabled: !count, handler: () => count && downloadAttachment(panel, data.attachments[0])}]
}

/**
 * ExtJS GO.email.saveAttachment (GO.files.SaveAsDialog) and GO.email.saveAllAttachments
 * (GO.files.SelectFolderDialog): pick a files folder (and the file name of one attachment)
 * with the files module's picker, then save there. The server needs write permission on it.
 * @param {GO.email.message.MessagePanel} panel
 * @param {Object|null} attachment null: all attachments
 * @returns {Promise<void>}
 */
export async function saveToFolder(panel, attachment) {
    const pick    = ModuleRegistry.getConfigs('selectFolder')[0],
          message = messageOf(panel);

    if (!pick) {
        return
    }

    try {
        const folder = await pick({
            appName : panel.appName,
            windowId: panel.windowId,
            ...attachment ? {title: t('Save to personal folder'), fileName: attachment.name || ''} : {title: t('Save all to personal folder')}
        });

        if (!folder || panel.isDestroyed) {
            return
        }

        attachment
            ? await messageApi.saveAttachment(message, attachment, folder.id, folder.fileName)
            : await messageApi.saveAllAttachments(message, folder.id);

        panel.isDestroyed || notify(panel, coreT('Saved'))
    } catch (e) {
        panel.isDestroyed || notifyError(panel, e)
    }
}

/**
 * ExtJS LinkAttachmentDialog: pick items, save the attachment (or all) in their files folders
 * @param {GO.email.message.MessagePanel} panel
 * @param {Object|null} attachment null: all attachments
 */
export function saveToItem(panel, attachment) {
    const dialog = Neo.create(SelectSearchDialog, {appName: panel.appName, windowId: panel.windowId, title: t('Save to item')}),
          message = messageOf(panel);

    dialog.on('select', async ({records}) => {
        try {
            for (const record of records) {
                const folderId = record.entity === 'Folder' ? Number(record.entityId) : await messageApi.itemFolderId(record.entity, record.entityId);

                attachment
                    ? await messageApi.saveAttachment(message, attachment, folderId)
                    : await messageApi.saveAllAttachments(message, folderId)
            }

            panel.isDestroyed || notify(panel, fmt(t('Saved to {count} items'), {count: records.length}))
        } catch (e) {
            panel.isDestroyed || notifyError(panel, e)
        }
    })
}

/**
 * ExtJS GO.email.deleteAllAttachments: the message gets a new uid, the panel shows that one
 * @param {GO.email.message.MessagePanel} panel
 */
export async function deleteAllAttachments(panel) {
    const confirmed = await ConfirmDialog.ask({
        appName : panel.appName,
        windowId: panel.windowId,
        message : t('Are you sure that you wish to remove all attachments from this email message?')
    });

    if (!confirmed || panel.isDestroyed) {
        return
    }

    try {
        const message = {...panel.message},
              uid     = await messageApi.deleteAllAttachments(message);

        if (panel.isDestroyed) {
            return
        }

        // the folder grid reloads, so it has the new uid too
        panel.changed('deleteAllAttachments', {uid});
        uid && panel.load({...message, uid})
    } catch (e) {
        notifyError(panel, e)
    }
}
