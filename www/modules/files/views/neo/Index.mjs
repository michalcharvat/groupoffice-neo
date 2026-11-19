import ModuleRegistry from '../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}  from '../../../../views/neo/src/Translate.mjs';

const t = translator('legacy', 'files');

ModuleRegistry.register({
    package   : 'legacy',
    name      : 'files',
    title     : t('Files'),
    iconCls   : 'fa fa-folder',
    capability: 'go:legacy:files',
    // Material icon in the header's main menu
    icon      : 'folder',
    // header "+" menu: the main view's onQuickAdd() asks for a new folder
    quickAdd  : {text: t('Folder'), icon: 'create_new_folder'},
    // header search results ("#files/file/5", "#files/folder/3")
    routes    : {File: id => 'file/' + id, Folder: id => 'folder/' + id},
    mainView  : () => import('./view/FilesMain.mjs')
});
