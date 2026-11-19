import Container from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Button    from '../button/Button.mjs';
import {escapeHtml, smartDateTime} from '../Format.mjs';
import {notifyError} from '../Notify.mjs';
import {t} from '../Translate.mjs';
import ConfirmDialog from '../view/ConfirmDialog.mjs';
import notificationCenter from './NotificationCenter.mjs';

/**
 * Snooze times of the ExtJS checker (GO.Checker checkerSnoozeTimes), in seconds
 * @returns {Object[]} {text, seconds}
 */
export function snoozeTimes() {
    const minutes = n => n + ' ' + t('Minutes'),
          hours   = n => n + ' ' + t(n === 1 ? 'Hour' : 'Hours'),
          days    = n => n + ' ' + t(n === 1 ? 'Day' : 'Days');

    return [
        [300, minutes(5)], [600, minutes(10)], [1200, minutes(20)], [1800, minutes(30)],
        [3600, hours(1)], [7200, hours(2)], [10800, hours(3)], [14400, hours(4)],
        ...[1, 2, 3, 4, 5, 6, 7].map(n => [n * 86400, days(n)])
    ].map(([seconds, text]) => ({seconds, text}))
}

/**
 * The notification area of the shell (the east slide-out of go.Notifier in the ExtJS
 * client): the messages of the NotificationCenter, newest first. A click on a message
 * opens its item and dismisses it; × dismisses it, "Dismiss all" all but the
 * persistent ones. Opened by the bell in the header (MainView).
 */
class NotificationPanel extends Container {
    static config = {
        className: 'GO.alerts.NotificationPanel',
        baseCls  : ['go-notification-panel', 'neo-container'],
        hidden   : true,
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            ntype : 'container',
            cls   : ['go-notification-panel-header'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                ntype: 'component',
                cls  : ['go-notification-panel-title'],
                flex : 1,
                text : t('Notifications')
            }, {
                module   : Button,
                reference: 'desktopButton',
                icon     : 'notifications_active',
                hidden   : true,
                tooltip  : t('Enable desktop notifications')
            }, {
                module   : Button,
                reference: 'dismissAllButton',
                icon     : 'clear_all',
                tooltip  : t('Dismiss all')
            }, {
                module   : Button,
                reference: 'closeButton',
                icon     : 'close',
                tooltip  : t('Close')
            }]
        }, {
            ntype    : 'container',
            reference: 'list',
            cls      : ['go-notification-list'],
            flex     : 1,
            layout   : {ntype: 'vbox', align: 'stretch'},
            items    : []
        }]
    }

    /**
     * The list shows other messages than the center has
     * @member {Boolean} dirty=true
     */
    dirty = true

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('closeButton').handler      = () => me.close();
        me.getReference('dismissAllButton').handler = () => me.confirmDismissAll();
        me.getReference('desktopButton').handler    = () => me.enableDesktop();

        me.removeChangeListener = notificationCenter.onChange(() => {
            me.dirty = true;
            me.hidden || me.renderList()
        });

        me.getReference('list').addDomListeners([{click: me.onListClick, scope: me}])
    }

    destroy(...args) {
        this.removeChangeListener?.();
        super.destroy(...args)
    }

    toggle() {
        this.hidden ? this.open() : this.close()
    }

    async open() {
        let me = this;

        me.hidden = false;
        me.renderList();

        // "Enable desktop notifications" while the browser hasn't been asked yet
        const permission = await notificationCenter.permission();
        me.isDestroyed || (me.getReference('desktopButton').hidden = permission !== 'default')
    }

    close() {
        this.hidden = true
    }

    async enableDesktop() {
        let me = this;

        try {
            const permission = await notificationCenter.requestPermission(me.windowId);
            me.getReference('desktopButton').hidden = permission !== 'default'
        } catch (e) {
            console.warn('Notification permission', e)
        }
    }

    async confirmDismissAll() {
        let me = this;

        if (!notificationCenter.messages.some(m => !m.persistent)) {
            return
        }

        const ok = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : escapeHtml(t('Are you sure you want to dismiss all notifications?'))
        });

        ok && await notificationCenter.dismissAll()
    }

    renderList() {
        let me = this;

        if (!me.dirty) {
            return
        }

        me.dirty = false;

        const list     = me.getReference('list'),
              messages = notificationCenter.messages;

        list.removeAll();

        if (!messages.length) {
            list.add({ntype: 'component', flex: 'none', cls: ['go-empty'], text: t('No notifications')});
            return
        }

        list.add(messages.map(message => me.itemConfig(message)))
    }

    /**
     * @param {Object} message
     * @returns {Object} container config
     */
    itemConfig(message) {
        let me      = this,
            id      = escapeHtml(message.id),
            buttons = (message.buttons || []).map(b => ({
                module : Button,
                text   : b.text,
                icon   : b.icon || null,
                ...b.menu ? {menu: b.menu.map(item => ({text: item.text, handler: () => item.handler(message, me)}))} : {},
                handler: b.handler ? () => b.handler(message, me) : null
            }));

        if (message.snooze) {
            buttons.unshift({
                module: Button,
                icon  : 'snooze',
                text  : t('Snooze'),
                menu  : snoozeTimes().map(({text, seconds}) => ({
                    text,
                    handler: () => notificationCenter.snooze(message.id, seconds).catch(e => notifyError(me, e))
                }))
            });
            buttons.push({
                module : Button,
                icon   : 'delete',
                text   : t('Dismiss'),
                handler: () => notificationCenter.dismiss(message.id)
            })
        }

        const progress = message.progress === null || message.progress === undefined ? '' :
            `<div class="go-notification-progress"><progress max="100" value="${Number(message.progress) || 0}"></progress><span>${escapeHtml(t('Progress'))} ${Number(message.progress) || 0}%</span></div>`;

        return {
            ntype : 'container',
            flex  : 'none',
            cls   : ['go-notification', ...(message.route || message.handler) ? ['go-notification-link'] : []],
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                ntype: 'component',
                html : `<div class="go-notification-head" data-id="${id}">
                    <i class="go-icon go-notification-icon">${escapeHtml(message.icon || 'notifications')}</i>
                    <span class="go-notification-title">${escapeHtml(message.title || '')}</span>
                    <span class="go-notification-time">${escapeHtml(smartDateTime(message.time))}</span>
                    ${message.persistent ? '' : `<i class="go-icon go-notification-close" data-id="${id}" title="${escapeHtml(t('Close'))}">close</i>`}
                </div>
                <div class="go-notification-body" data-id="${id}">${message.html || ''}</div>${progress}`
            }, ...buttons.length ? [{
                ntype : 'container',
                cls   : ['go-notification-buttons'],
                layout: {ntype: 'hbox', align: 'center', pack: 'end'},
                items : buttons
            }] : []]
        }
    }

    onListClick({path}) {
        let me   = this,
            node = path.find(n => n.data?.id);

        // a link in the body (e.g. "Download" of an export) opens itself
        if (!node || path.some(n => n.tagName === 'a' || n.tagName === 'A')) {
            return
        }

        const message = notificationCenter.get(node.data.id);

        if (!message) {
            return
        }

        if (node.cls?.includes('go-notification-close')) {
            notificationCenter.dismiss(message.id);
            return
        }

        if (message.route || message.handler) {
            me.close();
            message.handler ? message.handler(message, me) : Neo.Main.setRoute({value: message.route, windowId: me.windowId});
            // go.Alerts: opening the item dismisses the alert
            message.persistent || message.dismissOnOpen === false || notificationCenter.dismiss(message.id)
        }
    }
}

export default Neo.setupClass(NotificationPanel);
