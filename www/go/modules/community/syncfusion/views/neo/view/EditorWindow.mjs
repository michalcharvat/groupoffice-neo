import Dialog, {headerTools} from '../../../../../../../views/neo/src/view/Dialog.mjs';
import ConfirmDialog         from '../../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import client                from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {notifyError}         from '../../../../../../../views/neo/src/Notify.mjs';
import {t as coreT, translator} from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'syncfusion');

/**
 * Main thread addon that runs the editor, relative to neo's own addon folder (views/neo/src/main/addon)
 */
const ADDON = 'WS/../../../../../go/modules/community/syncfusion/views/neo/addon/Syncfusion';

export const DEFAULT_CDN_URL     = 'https://cdn.syncfusion.com/ej2/32.1.19/';
export const DOCUMENT_EXTENSIONS    = ['docx', 'doc', 'dotx', 'rtf', 'txt'];
export const SPREADSHEET_EXTENSIONS = ['xlsx', 'xls', 'csv'];
export const SUPPORTED_EXTENSIONS   = DOCUMENT_EXTENSIONS.concat(SPREADSHEET_EXTENSIONS);

/** Saving these creates a new .docx next to the file: the editor can't export them */
const CONVERT_TO_DOCX = ['doc', 'dotx', 'rtf'];

/**
 * @param {String} name
 * @returns {String} lower case extension
 */
export function extensionOf(name) {
    const i = String(name || '').lastIndexOf('.');
    return i < 0 ? '' : String(name).substring(i + 1).toLowerCase()
}

/**
 * URLs of the ej2 script and stylesheet (GOUI Loader.ts getLibraryUrls())
 * @param {Object} settings
 * @returns {{js: String, css: String, cssDark: (String|undefined), version: String}}
 */
function libraryUrls(settings) {
    const cdnBase = (settings.cdnUrl || DEFAULT_CDN_URL).replace(/\/?$/, '/'),
          version = /\/ej2\/([^/]+)\//.exec(cdnBase)?.[1] || '32.1.19';

    if (settings.librarySource === 'local') {
        const local = new URL((Neo.config.goBaseUrl || '/') + 'go/modules/community/syncfusion/lib/', globalThis.location.href).href;
        return {js: local + 'ej2.min.js', css: local + 'ej2.min.css', version}
    }

    // the local lib/ folder only documents ej2.min.css, so a local install stays light
    return {js: cdnBase + 'dist/ej2.min.js', css: cdnBase + 'material.css', cssDark: cdnBase + 'material-dark.css', version}
}

/**
 * Window with the Syncfusion document or spreadsheet editor (GOUI EditorWindow.ts).
 *
 * Opens a Files module file (fileId) or a JMAP blob (blobId), lets the backend convert it
 * (community/syncfusion/Editor/openDocument, openSpreadsheet) and saves it back (Editor/save):
 * a file gets a new version. The editor itself runs in the main thread addon
 * (addon/Syncfusion.mjs); this window does the JMAP calls.
 *
 *     EditorWindow.open({appName, windowId, fileId, fileName})
 *
 * Events: save {blobId, fileId}
 */
class EditorWindow extends Dialog {
    static config = {
        className: 'GO.syncfusion.view.EditorWindow',
        cls      : ['go-syncfusion-window'],
        modal    : false,
        resizable: true,
        // the editor lives in this window's main thread: no popout
        headerConfig: headerTools('maximize', 'close'),
        // GOUI: 1000 × 800 dp
        wrapperStyle: {
            height: 'min(80rem, 92vh)',
            left  : 'calc((100vw - min(100rem, 96vw)) / 2)',
            top   : 'calc((100vh - min(80rem, 92vh)) / 2)',
            width : 'min(100rem, 96vw)'
        },
        containerConfig: {
            layout: 'fit'
        },
        /**
         * 'document' or 'spreadsheet', from the file name when not set
         * @member {String|null} editorType=null
         */
        editorType: null,
        /**
         * Files module file id
         * @member {Number|null} fileId=null
         */
        fileId: null,
        /**
         * JMAP blob id, when there is no fileId
         * @member {String|null} blobId=null
         */
        blobId: null,
        /**
         * @member {String} fileName=''
         */
        fileName: ''
    }

    canEdit = false
    saving  = false
    started = false

    /**
     * The running save, see requestClose()
     * @member {Promise|null} savePromise=null
     */
    savePromise = null

    /**
     * Blob id of the last save
     * @member {String|null} savedBlobId=null
     */
    savedBlobId = null

    construct(config) {
        super.construct(config);

        let me = this;

        me.editorType ??= SPREADSHEET_EXTENSIONS.includes(extensionOf(me.fileName)) ? 'spreadsheet' : 'document';
        me.updateTitle();

        me.items = [{
            ntype    : 'component',
            id       : me.hostId,
            cls      : ['go-syncfusion-host'],
            tabIndex : -1
        }];

        // Ctrl/Cmd+S and the File menu's Save in the editor (addon), on the host inside this window
        me.addDomListeners({syncfusionSave: () => me.save(), scope: me})
    }

    get addon() {
        return Neo.ns('GO.syncfusion.main.addon.Syncfusion')
    }

    get hostId() {
        return this.id + '__editor'
    }

    updateTitle() {
        this.title = this.fileName ? this.fileName + ' - ' + t('Syncfusion') : t('Syncfusion')
    }

    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (value && !this.started) {
            this.started = true;
            this.start()
        }
    }

    /**
     * Loads the library, converts the file and opens it. The mask stays from the start: loading the library is
     * usually the longest step.
     */
    async start() {
        let me = this;

        me.isLoading = true;

        try {
            // the settings come with the file (Editor::clientSettings()): non-admins can't read Module.settings
            const params   = me.fileParams(),
                  [result] = await Promise.all([
                      me.request(me.editorType === 'document' ? 'openDocument' : 'openSpreadsheet', params),
                      Neo.Main.importAddon({name: ADDON, windowId: me.windowId})
                  ]),
                  settings = result.client || {};

            if (me.isClosing || me.isDestroyed) {
                return
            }

            if (result.fileName) {
                me.fileName = result.fileName;
                me.updateTitle()
            }

            me.canEdit = result.canEdit !== false;

            const urls   = libraryUrls(settings),
                  lang   = Neo.config.goLanguage || 'en',
                  locale = lang === 'en' ? 'en-US' : lang;

            const opened = await me.addon.openEditor({
                id        : me.hostId,
                type      : me.editorType,
                urls      : {js: urls.js, css: urls.css, cssDark: urls.cssDark},
                // the ej2 library validates its license in the browser
                licenseKey: settings.licenseKey || '',
                locale,
                localeUrl : locale === 'en-US' ? '' : `https://cdn.jsdelivr.net/npm/@syncfusion/ej2-locale@${urls.version}/src/${locale}.json`,
                content   : me.editorType === 'document' ? result.sfdt : result.data,
                canEdit   : me.canEdit,
                serviceUrl: settings.spreadsheetServiceUrl || '',
                labels    : {save: coreT('Save'), error: t('Failed to load the Syncfusion library.')},
                windowId  : me.windowId
            });

            if (!opened || me.isDestroyed) {
                return
            }

            me.isLoading = false
        } catch (e) {
            if (me.isClosing || me.isDestroyed) {
                return
            }

            notifyError(me, e);
            me.close()
        }
    }

    /**
     * @returns {Object} {fileId} or {blobId}
     */
    fileParams() {
        let me = this;

        if (me.fileId) {
            return {fileId: me.fileId}
        }

        if (me.blobId) {
            return {blobId: me.blobId}
        }

        throw new Error(t('No file or blob specified.'))
    }

    /**
     * A community/syncfusion/Editor method; it reports failures in its result
     * @param {String} method
     * @param {Object} params
     * @returns {Promise<Object>}
     */
    async request(method, params) {
        const result = await client.call('community/syncfusion/Editor/' + method, params);

        if (!result?.success) {
            throw new Error(result?.error || coreT('An error occurred'))
        }

        return result
    }

    /**
     * Saves the editor content back to the file (a new version) or to a new blob
     */
    async save() {
        let me = this;

        // Ctrl+S is not stopped by the mask: one save at a time
        if (!me.canEdit || me.saving || me.isDestroyed) {
            return
        }

        me.saving    = true;
        me.isLoading = true;

        let done;
        me.savePromise = new Promise(resolve => {done = resolve});

        try {
            const blobId = me.editorType === 'document' ? await me.saveDocument() : await me.saveSpreadsheet();

            me.savedBlobId = blobId;
            me.fire('save', {blobId, fileId: me.fileId})
        } catch (e) {
            me.isDestroyed || me.addon.setDirty({id: me.hostId, windowId: me.windowId}).catch(() => {});
            notifyError(me, e)
        } finally {
            me.saving      = false;
            me.savePromise = null;
            done();
            me.isDestroyed || (me.isLoading = false)
        }
    }

    async saveDocument() {
        let me       = this,
            ext      = extensionOf(me.fileName),
            // txt round-trips; everything else is exported as DOCX
            content  = await me.addon.exportFile({id: me.hostId, format: ext === 'txt' ? 'Txt' : 'Docx', windowId: me.windowId}),
            name     = CONVERT_TO_DOCX.includes(ext) ? me.fileName.replace(/\.[^.]+$/, '') + '.docx' : me.fileName;

        if (!content) {
            throw new Error(coreT('An error occurred'))
        }

        const upload = await client.upload(new File([content], name, {type: content.type || 'application/octet-stream'})),
              blobId = upload.blobId || upload.id,
              result = await me.request('save', me.fileId ? {blobId, fileId: me.fileId} : {blobId});

        // doc, dotx and rtf were saved as a new .docx file: further saves go there
        if (result.newFileId) {
            me.fileId   = result.newFileId;
            me.fileName = result.newFileName || name;
            me.updateTitle()
        }

        return blobId
    }

    async saveSpreadsheet() {
        let me       = this,
            ext      = extensionOf(me.fileName),
            // xls and csv round-trip in their own format
            saveType = ext === 'xls' ? 'Xls' : (ext === 'csv' ? 'Csv' : 'Xlsx'),
            jsonData = await me.addon.exportFile({id: me.hostId, windowId: me.windowId});

        if (!jsonData) {
            throw new Error(coreT('An error occurred'))
        }

        const {blobId} = await me.request('exportSpreadsheet', {jsonData, fileName: me.fileName, saveType});

        await me.request('save', me.fileId ? {blobId, fileId: me.fileId} : {blobId});

        return blobId
    }

    /**
     * Close by the user (X, Escape): asks before discarding unsaved changes
     */
    async requestClose() {
        let me = this;

        if (me.isClosing || me.isDestroyed) {
            return
        }

        // the editor counts as saved while a save runs: wait for its result
        await me.savePromise;

        if (me.isClosing || me.isDestroyed) {
            return
        }

        let dirty = false;

        try {
            dirty = await me.addon.isDirty({id: me.hostId, windowId: me.windowId})
        } catch (e) {
            // no addon (the editor never opened)
        }

        if (dirty && !await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            message : t('Unsaved changes will be lost. Close anyway?')
        })) {
            return
        }

        me.isDestroyed || me.close()
    }

    closeOrHideAction() {
        this.requestClose()
    }

    onKeyDownEscape() {
        this.requestClose()
    }

    /**
     * Removes the editor before the window leaves the DOM: the document editor writes to its iframe's storage
     * when destroyed
     */
    close(...args) {
        let me = this;

        if (!me.isClosing && !me.isDestroyed && me.started) {
            me.addon?.destroyEditor?.({id: me.hostId, windowId: me.windowId}).catch(() => {})
        }

        super.close(...args)
    }

    /**
     * @param {Object} config appName, windowId, fileId or blobId, fileName, editorType
     * @returns {GO.syncfusion.view.EditorWindow}
     */
    static open(config) {
        return Neo.create(EditorWindow, config)
    }
}

export default Neo.setupClass(EditorWindow);
