import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import {translator}   from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'syncfusion');

/** Files that the editor opens (filehandler/Syncfusion.php) */
const SUPPORTED_EXTENSIONS = ['docx', 'doc', 'dotx', 'rtf', 'txt', 'xlsx', 'xls', 'csv'];

/**
 * @param {Object} file {id, name}
 * @param {Neo.component.Base} component the view that opens it; refreshed after a save when it can (Files)
 */
function openFile(file, component) {
    import('./view/EditorWindow.mjs').then(({default: EditorWindow}) => {
        const win = EditorWindow.open({
            appName : component.appName,
            windowId: component.windowId,
            fileId  : file.id,
            fileName: file.name || ''
        });

        win.on('save', () => {
            component.isDestroyed || Promise.resolve(component.refresh?.()).catch(() => {})
        })
    })
}

ModuleRegistry.register({
    package   : 'community',
    name      : 'syncfusion',
    title     : t('Syncfusion'),
    iconCls   : 'fa fa-file-pen',
    capability: 'go:community:syncfusion',
    systemSettings: {
        title  : t('Syncfusion'),
        iconCls: 'fa fa-file-pen',
        itemId : 'syncfusion',
        panel  : () => import('./view/SystemSettingsPanel.mjs')
    },
    /**
     * "Open" / "Open with" → Syncfusion in the Files module (ExtJS: the handler's JavaScript
     * go.modules.community.syncfusion.openFile())
     */
    fileHandlers: {
        'go\\modules\\community\\syncfusion\\filehandler\\Syncfusion': ({file, component}) => openFile(file, component)
    },
    /**
     * "Edit with Syncfusion" in the item menu of one file (GOUI FilesContextMenu.ts)
     * @param {Object} data {file: {id, name}, component}
     * @returns {Object[]} menu items
     */
    fileMenuItems: ({file, component}) => {
        const name = String(file.name || ''),
              ext  = name.includes('.') ? name.split('.').pop().toLowerCase() : '';

        return SUPPORTED_EXTENSIONS.includes(ext)
            ? [{text: t('Edit with Syncfusion'), icon: 'edit_document', handler: () => openFile(file, component)}]
            : []
    }
});
