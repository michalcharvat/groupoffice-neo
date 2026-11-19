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
    mainView  : () => import('./view/FilesMain.mjs'),
    // files in detail panels (GO.detail.FilesPanel) open with the user's file handler
    openFile  : (file, component) => import('./fileHandlers.mjs').then(m => m.openFile(file, component)),
    /**
     * Folder picker for other modules (ExtJS GO.files.SelectFolderDialog / SaveAsDialog):
     * ModuleRegistry.getConfigs('selectFolder')[0]({appName, windowId, title?, fileName?})
     * resolves to {id, path, fileName?} or null when cancelled
     */
    selectFolder: config => import('./view/SelectFolderDialog.mjs').then(m => m.default.ask(config))
});
