import client from '../../../../../../views/neo/src/jmap/Client.mjs';
import {download} from '../../../../../../views/neo/src/download.mjs';
import {showComposer} from '../../../../../../views/neo/src/Mail.mjs';
import {notifyError} from '../../../../../../views/neo/src/Notify.mjs';
import ConfirmDialog from '../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import CalendarItem from './CalendarItem.mjs';
import {ymdhis} from './util/date.mjs';
import ChoiceDialog from './view/ChoiceDialog.mjs';

/**
 * CalendarItem.ui outside a calendar view (notifications, the e-mail message view): the
 * item dialogs and questions open in the given window. The calendar main view has its own
 * (CalendarMain.createUi()).
 *
 * @param {Object} owner {appName, windowId}
 * @returns {Object} CalendarItem.ui
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

/**
 * Runs fn with CalendarItem.ui of this window: the questions of a save ("Send" / "Save
 * only") open here, not in a calendar view of another window
 * @param {Object} owner {appName, windowId}
 * @param {Function} fn async
 * @returns {Promise<*>} fn's result
 */
export async function withWindowUi(owner, fn) {
    const previous = CalendarItem.ui,
          ui       = windowUi(owner);

    CalendarItem.ui = ui;

    try {
        return await fn()
    } finally {
        // a calendar view opened or closed meanwhile sets its own
        CalendarItem.ui === ui && (CalendarItem.ui = previous)
    }
}

/**
 * Opens a dialog with CalendarItem.ui of this window for as long as the dialog is open
 * (its save, availability and exception buttons use CalendarItem.ui)
 * @param {Object} owner {appName, windowId}
 * @param {Function} open async () => dialog
 * @returns {Promise<Object|null>} the dialog
 */
export async function openWithWindowUi(owner, open) {
    const previous = CalendarItem.ui,
          ui       = windowUi(owner);

    CalendarItem.ui = ui;

    const restore = () => {CalendarItem.ui === ui && (CalendarItem.ui = previous)};

    try {
        const dialog = await open(ui);

        // Dialog fires close before it is destroyed
        dialog?.on ? dialog.on('close', restore) : restore();
        return dialog
    } catch (e) {
        restore();
        throw e
    }
}
