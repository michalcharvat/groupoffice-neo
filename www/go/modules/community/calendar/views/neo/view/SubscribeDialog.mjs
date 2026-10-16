import Component    from '../../../../../../../views/neo/node_modules/neo.mjs/src/component/Base.mjs';
import Toolbar      from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import SearchButton from '../../../../../../../views/neo/src/button/SearchButton.mjs';
import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import MenuList     from '../../../../../../../views/neo/src/menu/List.mjs';
import {notifyError} from '../../../../../../../views/neo/src/Notify.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import Dialog, {headerTools} from '../../../../../../../views/neo/src/view/Dialog.mjs';
import calendarData from '../data.mjs';

const t = translator('community', 'calendar');

/**
 * Calendars the user can see but has not subscribed to (GOUI SubscribeWindow): search,
 * "Subscribe", and a menu with permissions, delete and export.
 *
 * Events: edit {calendar}, delete {calendar}, export {calendar}
 */
class SubscribeDialog extends Dialog {
    static config = {
        className   : 'GO.calendar.SubscribeDialog',
        cls         : ['go-cal-subscribe-dialog'],
        modal       : true,
        headerConfig: headerTools('close'),
        title       : t('Subscribe to calendar'),
        wrapperStyle: {height: '80vh', left: 'calc(50vw - 250px)', top: '10vh', width: '500px'},
        containerConfig: {layout: {ntype: 'vbox', align: 'stretch'}}
    }

    /** @member {Object[]} calendars */
    calendars = []
    /** @member {String} search */
    search = ''

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            flex  : 'none',
            items : ['->', {module: SearchButton, listeners: {search: ({text}) => me.load(text)}}]
        }, {
            module      : Component,
            reference   : 'list',
            cls         : ['go-cal-subscribe-list'],
            flex        : 1,
            vdom        : {tag: 'ul', cn: []},
            domListeners: [
                {click: me.onSubscribe, delegate: '.go-cal-subscribe-btn', scope: me},
                {click: me.onMenu,      delegate: '.go-row-menu', scope: me}
            ]
        }]
    }

    onConstructed() {
        super.onConstructed();
        this.load('')
    }

    async load(text) {
        let me = this;

        me.search = text || '';

        try {
            const {list} = await client.queryGet('Calendar', {
                filter    : {isSubscribed: false, ...(me.search ? {text: me.search} : {})},
                sort      : [{property: 'name', isAscending: true}],
                limit     : 200,
                properties: ['id', 'name', 'color', 'groupId', 'davaccountId', 'myRights']
            });

            me.calendars = list;
            me.isDestroyed || me.renderList()
        } catch (e) {
            notifyError(me, e)
        }
    }

    renderList() {
        const list = this.getReference('list');

        list.vdom.cn = this.calendars.map(c => ({tag: 'li', 'data-cid': String(c.id), cn: [
            {tag: 'i', cls: ['go-icon'], style: {color: '#' + (c.color || '356772')}, text: c.groupId ? 'meeting_room' : 'event'},
            {tag: 'span', cls: ['go-cal-subscribe-name'], text: c.name},
            {tag: 'button', type: 'button', cls: ['go-cal-subscribe-btn', 'neo-button', 'neo-button-primary'], text: t('Subscribe')},
            {tag: 'i', id: `${this.id}__m_${c.id}`, cls: ['go-icon', 'go-row-menu'], text: 'more_vert'}
        ]}));

        list.update()
    }

    calendarOf(data) {
        const id = data.path.find(n => n.data?.cid)?.data.cid;
        return this.calendars.find(c => String(c.id) === id)
    }

    async onSubscribe(data) {
        let me = this,
            c  = me.calendarOf(data);

        if (!c) {
            return
        }

        try {
            await client.set('Calendar', {update: {[c.id]: {isSubscribed: true}}});
            me.calendars = me.calendars.filter(x => x !== c);
            me.isDestroyed || me.renderList()
        } catch (e) {
            notifyError(me, e)
        }
    }

    onMenu(data) {
        let me     = this,
            c      = me.calendarOf(data),
            rights = calendarData.rights;

        if (!c) {
            return
        }

        MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : `${me.id}__m_${c.id}`,
            items   : [
                {text: t('Permissions') + '…', icon: 'share', disabled: !c.myRights?.mayReadItems || !!c.davaccountId || (c.groupId && !rights.mayChangeResources), handler: () => me.fire('edit', {calendar: c})},
                {text: t('Delete') + '…', icon: 'delete', disabled: !c.myRights?.mayAdmin || !!c.davaccountId || !rights.mayChangeCalendars, handler: () => me.fire('delete', {calendar: c})},
                {separator: true},
                {text: t('Export'), icon: 'file_save', disabled: !!c.groupId, handler: () => me.fire('export', {calendar: c})}
            ]
        })
    }
}

export default Neo.setupClass(SubscribeDialog);
