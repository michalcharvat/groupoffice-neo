import client         from '../../../../views/neo/src/jmap/Client.mjs';
import ModuleRegistry from '../../../../views/neo/src/ModuleRegistry.mjs';
import ImageWindow    from '../../../../views/neo/src/view/ImageWindow.mjs';

/**
 * "Open" of a file (ExtJS: the server's handler JavaScript, GO\Files\Filehandler\*). neo
 * does not run that JavaScript: it maps the handler class to an action.
 *
 * Modules add handlers for their classes in the ModuleRegistry:
 *
 *     ModuleRegistry.register({..., fileHandlers: {
 *         'go\\modules\\community\\addressbook\\filehandler\\VCard': ({file, component}) => {...}
 *     }})
 *
 * Without one, a handler whose JavaScript opens a URL (WOPI: Collabora, Office Online)
 * opens that URL; everything else opens the file inline in a new window.
 */

/** handler class (end of the name) → action */
const BUILT_IN = {
    'Filehandler\\Download'   : ({file, component}) => openUrl(component, downloadUrl(file, false)),
    'Filehandler\\Inline'     : ({file, component}) => openUrl(component, downloadUrl(file, true)),
    'Filehandler\\ImageViewer': ({file, component}) => ImageWindow.show({
        appName : component.appName,
        windowId: component.windowId,
        src     : downloadUrl(file, true),
        alt     : file.name || ''
    })
};

/**
 * @param {Object} file {id, name}
 * @param {Boolean} inline
 * @returns {String}
 */
export function downloadUrl(file, inline) {
    return client.legacyUrl('files/file/download', {id: file.id, inline: inline ? 1 : 0})
}

/**
 * @param {Neo.component.Base} component
 * @param {String} url
 */
export function openUrl(component, url) {
    Neo.Main.windowOpen({url, windowName: '_blank', windowId: component.windowId})
}

/**
 * The handlers of a file (files/file/handlers)
 * @param {Object} file {id}
 * @param {Boolean} [all=false] all handlers, else the user's default one
 * @returns {Promise<Object[]>} [{name, cls, handler, iconCls}]
 */
export async function getHandlers(file, all=false) {
    const {results = []} = await client.legacy('files/file/handlers', {id: file.id, all: all ? 1 : 0});
    return results
}

/**
 * Runs a handler for a file
 * @param {Object} handler {cls, handler}
 * @param {Object} file {id, name}
 * @param {Neo.component.Base} component the view that opens it (window, dialogs)
 */
export function runHandler(handler, file, component) {
    const cls     = String(handler?.cls || ''),
          modules = Object.assign({}, ...ModuleRegistry.getConfigs('fileHandlers')),
          own     = modules[cls] || Object.entries(BUILT_IN).find(([suffix]) => cls.endsWith(suffix))?.[1];

    if (own) {
        own({file, component, handler});
        return
    }

    // e.g. WOPI: window.open('/wopi/edit/<service>/<file>')
    const url = /window\.open\(\s*(['"])([^'"]+)\1/.exec(String(handler?.handler || ''))?.[2];

    openUrl(component, url && ((url.startsWith('/') && !url.startsWith('//')) || /^https?:\/\//.test(url)) ? url : downloadUrl(file, true))
}

/**
 * files/file/submit that keeps the user's "Open with" choice for the file type:
 * FileController::beforeSubmit() deletes it when handlerCls is not sent
 * @param {Object} params id and the changed values
 * @returns {Promise<Object>}
 */
export async function submitFile(params) {
    if (!('handlerCls' in params)) {
        const {data} = await client.legacy('files/file/load', {id: params.id});
        params = {...params, handlerCls: data?.handlerCls || ''}
    }

    return client.legacy('files/file/submit', params)
}

/**
 * Opens a file with the user's default handler (ExtJS double click)
 * @param {Object} file {id, name}
 * @param {Neo.component.Base} component
 * @returns {Promise<void>}
 */
export async function openFile(file, component) {
    let handler = null;

    try {
        [handler] = await getHandlers(file)
    } catch (e) {
        // no handler list: open it inline
    }

    runHandler(handler, file, component)
}
