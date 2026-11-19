import Container from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Button    from '../../../../../../../views/neo/src/button/Button.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import CalendarItem from '../CalendarItem.mjs';
import calendarData from '../data.mjs';
import {windowUi} from '../ui.mjs';
import {format, ymd} from '../util/date.mjs';

const t = translator('community', 'calendar');

/**
 * Invitation, reply or cancellation in an e-mail (GO.email.handleITIP of the GOUI calendar,
 * views/goui/script/Index.ts): what the message does to the event, Accept / Maybe / Decline
 * (Import when the user is not a participant) and Open Calendar. A part of the e-mail
 * message view (emailMessagePanelPlugins of the calendar's Index.mjs).
 *
 *     {module: ItipPanel, itip: message.itip}   // {method, event, feedback, recurrenceId}
 *
 * email/message/view already processed the message (Scheduler::handleIMIP): `event` is the
 * user's copy of the event, or the parsed event (a string when there is none).
 */
class ItipPanel extends Container {
    static config = {
        className: 'GO.calendar.ItipPanel',
        baseCls  : ['go-cal-itip', 'neo-container'],
        layout   : {ntype: 'hbox', align: 'center'},
        /**
         * @member {Object|null} itip=null
         */
        itip: null,
        items: [{
            ntype: 'component',
            cls  : ['go-icon', 'go-cal-itip-icon'],
            flex : 'none',
            text : 'event'
        }, {
            ntype    : 'component',
            reference: 'text',
            cls      : ['go-cal-itip-text'],
            flex     : 1
        }, {
            ntype    : 'container',
            reference: 'buttons',
            cls      : ['go-cal-itip-buttons'],
            flex     : 'none',
            layout   : {ntype: 'hbox', align: 'center'},
            items    : []
        }]
    }

    /**
     * @member {CalendarItem|null} item=null
     */
    item = null

    onConstructed() {
        super.onConstructed();
        this.init().catch(e => console.error('ItipPanel', e))
    }

    async init() {
        let me    = this,
            itip  = me.itip || {},
            event = itip.event;

        // CalendarItem finds its calendar in the loaded calendar data
        await calendarData.init();

        if (me.isDestroyed) {
            return
        }

        let text = {
            CANCEL : t('Cancellation'),
            REQUEST: t('Invitation'),
            NONE   : t('Event'),
            REPLY  : t('Reply')
        }[itip.method] || t('Unable to process appointment information.');

        if (event && typeof event === 'object') {
            // its dialogs and questions open in this window
            let item = new CalendarItem({data: event, key: event.id ? String(event.id) : '', ownUi: windowUi(me)});

            if (itip.recurrenceId && item.isRecurring) {
                item = item.patchedInstance(itip.recurrenceId)
            }

            me.item = item;

            if (itip.method !== 'REPLY') {
                text += ` "${item.title}" ${t('at')} ${format(item.start, 'D j M H:i')}`
            }
        } else {
            text += ', ' + (event || t('Unexisting event'))
        }

        if (itip.feedback) {
            text += (itip.method !== 'REPLY' ? '\n' : ': ') + itip.feedback
        }

        me.getReference('text').text = text;
        me.updateButtons()
    }

    /**
     * Import, or the participation buttons with the current status pressed; Open Calendar
     * @protected
     */
    updateButtons() {
        let me      = this,
            item    = me.item,
            method  = me.itip?.method,
            buttons = me.getReference('buttons'),
            items   = [];

        if (item && (method === 'REQUEST' || method === 'NONE')) {
            const status = item.calendarPrincipal?.participationStatus;

            if (!item.calendarPrincipal) {
                items.push({module: Button, ui: 'secondary', text: t('Import'), handler: () => me.importEvent()})
            } else {
                const names   = {accepted: t('Accept'), tentative: t('Maybe'), declined: t('Decline')},
                      pressed = {accepted: t('Accepted'), tentative: t('Maybe'), declined: t('Declined')};

                ['accepted', 'tentative', 'declined'].forEach(s => items.push({
                    module  : Button,
                    ui      : s === status ? 'primary' : 'secondary',
                    cls     : s === status ? ['go-cal-itip-pressed'] : [],
                    text    : s === status ? pressed[s] : names[s],
                    disabled: s === status,
                    handler : () => me.setParticipation(s)
                }))
            }
        }

        item?.start && items.push({
            module : Button,
            ui     : 'secondary',
            icon   : 'calendar_month',
            text   : t('Open Calendar'),
            handler: () => Neo.Main.setRoute({value: 'calendar/day/' + ymd(item.start), windowId: me.windowId})
        });

        buttons.removeAll(true);
        items.length && buttons.add(items)
    }

    /**
     * @param {'accepted'|'tentative'|'declined'} status
     * @protected
     */
    async setParticipation(status) {
        let me = this;

        try {
            await me.item.updateParticipation(status, () => me.isDestroyed || me.updateButtons())
        } catch (e) {
            // the save itself shows its errors (CalendarItem.set)
            console.error('ItipPanel', e)
        }
    }

    /**
     * Not a participant: the event goes into one of the user's calendars through the editor
     * (GOUI item.save())
     * @protected
     */
    async importEvent() {
        try {
            await this.item.open(undefined, true)
        } catch (e) {
            console.error('ItipPanel', e)
        }
    }
}

export default Neo.setupClass(ItipPanel);
