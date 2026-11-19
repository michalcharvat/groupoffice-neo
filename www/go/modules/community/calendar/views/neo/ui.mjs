import client from '../../../../../../views/neo/src/jmap/Client.mjs';
import {download} from '../../../../../../views/neo/src/download.mjs';
import {showComposer} from '../../../../../../views/neo/src/Mail.mjs';
import {notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import ConfirmDialog from '../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import {ymdhis} from './util/date.mjs';
import ChoiceDialog from './view/ChoiceDialog.mjs';

/**
 * The ui of a CalendarItem shown outside a calendar view (notifications, the e-mail message
 * view): its dialogs and questions open in the given window, whatever calendar view is open
 * elsewhere. The calendar main view has its own (CalendarMain.createUi(), CalendarItem.ui).
 *
 *     new CalendarItem({key, data, ownUi: windowUi(component)})
 *
 * @param {Object} owner {appName, windowId}
 * @returns {Object} a CalendarItem ui
 */
export function windowUi(owner) {
    const base = {appName: owner.appName, windowId: owner.windowId};

    return {
        openEditor: async (item, opts = {}) => {
            const {default: EventDialog} = await import('./view/EventDialog.mjs'),
                  dialog = Neo.create(EventDialog, {...base, item});

            opts.onCancel && dialog.on('cancel', () => opts.onCancel());
            return dialog
        },
        openDetail: async item => {
            const {default: EventDetailDialog} = await import('./view/EventDetailDialog.mjs');
            return Neo.create(EventDetailDialog, {...base, item})
        },
        choose  : config => ChoiceDialog.ask({...base, ...config}),
        confirm : message => ConfirmDialog.ask({...base, message}),
        error   : e => notifyError(base, e),
        mask    : () => {},
        unmask  : () => {},
        // a blob id or a download route ('community/calendar/ics/<id>')
        download: blobId => download(base.windowId, (client.session?.downloadUrl || client.baseUrl + 'api/download.php?blob={blobId}').replace('{blobId}', blobId))
            .catch(e => notifyError(base, e)),
        mailTo  : to => showComposer({...base, to}),
        openExceptions: async (item, overrides) => {
            const {default: ExceptionsDialog} = await import('./view/ExceptionsDialog.mjs');
            return Neo.create(ExceptionsDialog, {...base, item, overrides})
        },
        openAvailability: async eventDialog => {
            const {default: AvailabilityDialog} = await import('./view/AvailabilityDialog.mjs'),
                  dialog = Neo.create(AvailabilityDialog, {
                      ...base,
                      principalIds: Object.keys(eventDialog.getReference('participantField').participants),
                      start       : eventDialog.getReference('startField').getValueAsDate(),
                      end         : eventDialog.getReference('endField').getValueAsDate()
                  });

            // like CalendarMain.openAvailability()
            dialog.on('changeTime', ({start, end}) => {
                if (eventDialog.isDestroyed || !start) {
                    return
                }

                eventDialog.getReference('startField').value = ymdhis(start);
                eventDialog.getReference('endField').value   = ymdhis(end);
                eventDialog.checkAvailability()
            });

            return dialog
        },
        // no calendar to write in: the calendar view offers to create one
        noWritableCalendar: async () => null
    }
}
