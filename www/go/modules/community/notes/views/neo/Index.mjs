import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}  from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'notes');

ModuleRegistry.register({
    package   : 'community',
    name      : 'notes',
    title     : t('Notes'),
    iconCls   : 'fa fa-sticky-note',
    capability: 'go:community:notes',
    // Material icon in the header's main menu
    icon      : 'sticky_note_2',
    // header "+" menu: calls the main view's onQuickAdd()
    quickAdd  : {text: t('Note'), icon: 'sticky_note_2'},
    // header search results: entity → route below "#notes/"
    routes    : {Note: id => 'note/' + id},
    mainView  : () => import('./view/NotesMain.mjs')
});
