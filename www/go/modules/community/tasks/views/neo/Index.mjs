import client         from '../../../../../../views/neo/src/jmap/Client.mjs';
import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}  from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'tasks');

ModuleRegistry.register({
    package   : 'community',
    name      : 'tasks',
    title     : t('Tasks'),
    iconCls   : 'fa fa-check-square',
    capability: 'go:community:tasks',
    // Material icon in the header's main menu
    icon      : 'check',
    // header "+" menu: calls the main view's onQuickAdd()
    quickAdd  : {text: t('Task'), icon: 'check'},
    // header search results: entity → route below "#tasks/"
    routes    : {Task: id => 'task/' + id},
    // count on the module tab and main menu item (src/Badges.mjs): open tasks of the default list due today or without a date (ExtJS showBadge())
    badge     : {entities: ['Task'], count: () => client.call('Task/countMine')},
    mainView  : () => import('./view/TasksMain.mjs'),
    // notification area: assignments and reminders (src/alerts/Alerts.mjs)
    alerts    : args => import('./alerts.mjs').then(m => m.default(args)),
    // start page (legacy summary module)
    portlets  : [{id: 'portlet-tasks', title: t('Tasks'), icon: 'check_circle', view: () => import('./view/TasksPortlet.mjs')}],
    // card in My account
    userSettings: {
        title  : t('Tasks'),
        iconCls: 'fa fa-check-square',
        panel  : () => import('./view/SettingsPanel.mjs')
    }
});
