import Toolbar       from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button        from '../../../../../views/neo/src/button/Button.mjs';
import {escapeHtml}  from '../../../../../views/neo/src/Format.mjs';
import client        from '../../../../../views/neo/src/jmap/Client.mjs';
import ActionTable   from '../../../../../views/neo/src/list/ActionTable.mjs';
import {notifyError} from '../../../../../views/neo/src/Notify.mjs';
import {t as coreT, translator} from '../../../../../views/neo/src/Translate.mjs';
import ConfirmDialog from '../../../../../views/neo/src/view/ConfirmDialog.mjs';
import Dialog        from '../../../../../views/neo/src/view/Dialog.mjs';
import AnnouncementDialog from './AnnouncementDialog.mjs';

const t = translator('legacy', 'summary');

/**
 * "Manage announcements" (GO.summary.AnnouncementsGrid in a window): all announcements the
 * user may see; add, edit (pencil or double click) and delete. For module managers.
 *
 * Fires `changed` after an add, edit or delete: the start page reloads its portlet.
 */
class AnnouncementsDialog extends Dialog {
    static config = {
        className: 'GO.summary.AnnouncementsDialog',
        cls      : ['go-announcements-dialog'],
        modal    : true,
        resizable: true,
        title    : t('Announcements'),
        wrapperStyle: {
            height   : '450px',
            left     : 'calc(50vw - 350px)',
            maxHeight: '90vh',
            maxWidth : '100vw',
            top      : 'max(5vh, calc(50vh - 225px))',
            width    : '700px'
        },
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        }
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            cls   : ['go-border-bottom'],
            flex  : 'none',
            items : [{
                module : Button,
                icon   : 'add',
                text   : coreT('Add'),
                handler: () => me.openAnnouncement(null)
            }]
        }, {
            // a scrolling box: the table itself would stretch its rows over the height
            ntype: 'container',
            cls  : ['go-scroll'],
            flex : 1,
            items: [{
                module   : ActionTable,
                reference: 'table',
                flex     : 'none',
                columns  : [
                    {text: t('Title'), field: 'title', flex: true},
                    {text: coreT('Owner'), field: 'user_name'},
                    {text: t('Show until'), field: 'due_time'},
                    {text: coreT('Modified at'), field: 'mtime'}
                ],
                actions  : [
                    {action: 'edit', icon: 'edit', tooltip: coreT('Edit')},
                    {action: 'delete', icon: 'delete', tooltip: coreT('Delete')}
                ]
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me    = this,
            table = me.getReference('table');

        table.on('action', ({action, record}) => action === 'edit' ? me.openAnnouncement(record) : me.deleteAnnouncement(record));
        table.on('rowDoubleClick', ({record}) => me.openAnnouncement(record));
        me.load()
    }

    async load() {
        let me = this;

        try {
            const {results = []} = await client.legacy('summary/announcement/store', {sort: 'id', dir: 'DESC', limit: 500});
            me.isDestroyed || (me.getReference('table').records = results)
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * @param {Object|null} record null for a new announcement
     */
    openAnnouncement(record) {
        let me = this;

        const dialog = Neo.create(AnnouncementDialog, {appName: me.appName, windowId: me.windowId, announcementId: record?.id || null});

        dialog.on('saved', () => {
            me.load();
            me.fire('changed')
        })
    }

    async deleteAnnouncement(record) {
        let me = this;

        const ok = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : escapeHtml(coreT('Are you sure you want to delete the selected item?'))
        });

        if (!ok) {
            return
        }

        try {
            await client.legacy('summary/announcement/delete', {id: record.id});
            me.load();
            me.fire('changed')
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(AnnouncementsDialog);
