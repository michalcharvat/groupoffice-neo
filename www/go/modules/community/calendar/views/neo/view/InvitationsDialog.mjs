import Component    from '../../../../../../../views/neo/node_modules/neo.mjs/src/component/Base.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import Dialog, {headerTools} from '../../../../../../../views/neo/src/view/Dialog.mjs';
import CalendarItem from '../CalendarItem.mjs';
import {format, formatTime} from '../util/date.mjs';

const t = translator('community', 'calendar');

/**
 * Open invitations (GOUI Main inbox button menu): each with Accept / Maybe / Decline.
 *
 *     Neo.create(InvitationsDialog, {appName, windowId, events})
 *
 * Events: answered {}
 */
class InvitationsDialog extends Dialog {
    static config = {
        className   : 'GO.calendar.InvitationsDialog',
        cls         : ['go-cal-invitations-dialog'],
        modal       : false,
        headerConfig: headerTools('close'),
        title       : t('Invitations'),
        wrapperStyle: {maxHeight: '70vh', left: 'calc(50vw - 220px)', top: '12vh', width: '440px'},
        containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}},
        /** @member {Object[]} events CalendarEvents (filter inbox) */
        events: []
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module      : Component,
            reference   : 'list',
            cls         : ['go-cal-invitations'],
            flex        : 1,
            vdom        : {tag: 'ul', cn: []},
            domListeners: [{click: me.onAnswer, delegate: '[data-status]', scope: me}]
        }]
    }

    onConstructed() {
        super.onConstructed();
        this.renderList()
    }

    renderList() {
        const list = this.getReference('list');

        list.vdom.cn = this.events.map(e => {
            const item  = new CalendarItem({key: String(e.id), data: e}),
                  owner = item.owner;

            return {tag: 'li', 'data-eid': String(e.id), cn: [
                {cn: [
                    {tag: 'i', style: {color: '#' + item.color}, text: '●'},
                    {tag: 'strong', text: ' ' + item.title},
                    {tag: 'br'},
                    {tag: 'small', text: owner?.name || owner?.email || t('Unknown owner')}
                ]},
                {tag: 'h3', text: format(item.start, 'D j M') + ' ' + t('at') + ' ' + formatTime(item.start)},
                {cls: ['go-cal-invitation-buttons'], cn: [
                    ['accepted', t('Accept')], ['tentative', t('Maybe')], ['declined', t('Decline')]
                ].map(([status, text]) => ({tag: 'button', type: 'button', cls: ['neo-button', 'neo-button-secondary'], 'data-status': status, text}))}
            ]}
        });

        list.update()
    }

    async onAnswer(data) {
        let me     = this,
            status = data.path.find(n => n.data?.status)?.data.status,
            id     = data.path.find(n => n.data?.eid)?.data.eid,
            event  = me.events.find(e => String(e.id) === id);

        if (!event || !status) {
            return
        }

        const item = new CalendarItem({key: String(event.id), data: event});

        try {
            await item.updateParticipation(status, () => {
                me.events = me.events.filter(e => e !== event);
                me.fire('answered', {});

                if (!me.isDestroyed) {
                    me.events.length ? me.renderList() : me.close()
                }
            })
        } catch (e) {
            CalendarItem.ui.error(e)
        }
    }
}

export default Neo.setupClass(InvitationsDialog);
