import client         from '../../../../../../views/neo/src/jmap/Client.mjs';
import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}  from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'calendar');

ModuleRegistry.register({
    package   : 'community',
    name      : 'calendar',
    title     : t('Calendar'),
    iconCls   : 'fa fa-calendar',
    capability: 'go:community:calendar',
    // Material icon in the header's main menu
    icon      : 'calendar_month',
    // header "+" menu: calls the main view's onQuickAdd()
    quickAdd  : {text: t('Event'), icon: 'event'},
    // header search results and notifications: entity → route below "#calendar/"
    routes    : {CalendarEvent: id => 'event/' + id},
    // count on the module tab and main menu item (src/Badges.mjs): open invitations (GOUI showBadge())
    badge     : {entities: ['CalendarEvent'], count: () => client.call('CalendarEvent/countMine')},
    mainView  : () => import('./view/CalendarMain.mjs'),
    // "Add link" menu of other items' details: a new linked event
    linkWindows: [{title: t('Event'), icon: 'event', open: ctx => import('./linkWindow.mjs').then(m => m.default(ctx))}],
    // notification area: invitations and reminders (src/alerts/Alerts.mjs)
    alerts    : args => import('./alerts.mjs').then(m => m.default(args)),
    // e-mail message view (www/modules/email/views/neo): invitations (GOUI GO.email.handleITIP)
    // and .ics attachments (go.openIcs)
    emailMessagePanelPlugins: {
        id    : 'itip',
        onLoad: message => message?.itip ? import('./itip.mjs').then(m => m.onLoad(message)) : null
    },
    openIcs   : (attachment, panel) => import('./itip.mjs').then(m => m.openIcs(attachment, panel)),
    // card in My account
    userSettings: {
        title  : t('Calendar'),
        iconCls: 'fa fa-calendar',
        panel  : () => import('./view/PreferencesPanel.mjs')
    }
});
