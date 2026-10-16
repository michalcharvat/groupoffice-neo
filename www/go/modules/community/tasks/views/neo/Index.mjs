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
    mainView  : () => import('./view/TasksMain.mjs'),
    // card in My account
    userSettings: {
        title  : t('Tasks'),
        iconCls: 'fa fa-check-square',
        panel  : () => import('./view/SettingsPanel.mjs')
    }
});
