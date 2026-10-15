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
    mainView  : () => import('./view/CalendarMain.mjs')
});
