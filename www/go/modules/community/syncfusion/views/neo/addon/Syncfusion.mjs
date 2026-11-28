import Base      from '../../../../../../../views/neo/node_modules/neo.mjs/src/main/addon/Base.mjs';
import DomAccess from '../../../../../../../views/neo/node_modules/neo.mjs/src/main/DomAccess.mjs';
import DomEvents from '../../../../../../../views/neo/node_modules/neo.mjs/src/main/DomEvents.mjs';

/**
 * Main thread side of the Syncfusion editor window (GOUI EditorWindow.ts and Loader.ts): the ej2 library and the
 * editors need the real DOM, so they live here; the App worker (view/EditorWindow.mjs) does the JMAP calls.
 *
 * - Spreadsheets render in the page, with the ej2 bundle loaded once per browser window (inside an iframe the
 *   spreadsheet did not resize in the GOUI port).
 * - Documents render in an iframe with their own ej2 copy, so the ej2 styles can't clash with GO's.
 *
 * Ctrl/Cmd+S sends the custom DOM event "syncfusionSave" to the worker. The library sources are the ones of the
 * GOUI loader: the configured CDN or the module's lib/ folder.
 *
 * Loaded per window: await Neo.Main.importAddon({name: ADDON, windowId}), see view/EditorWindow.mjs.
 */
class Syncfusion extends Base {
    static config = {
        className: 'GO.syncfusion.main.addon.Syncfusion',
        // the library is loaded on demand, see loadLibrary()
        preloadFilesDelay: false,
        remote: {
            app: [
                'destroyEditor',
                'exportFile',
                'isDirty',
                'openEditor',
                'setDirty'
            ]
        }
    }

    /**
     * host element id → {type, editor, ej, iframe, container, dirty, canEdit, observer, keyHandler}
     * @member {Object} map={}
     */
    map = {}

    /**
     * Loading of the page's ej2 bundle, by script URL; a failed load is removed so the next call tries again
     * @member {Object} loading={}
     */
    loading = {}

    /**
     * ej2 theme stylesheets (page and iframes); their href follows the colour scheme, see watchTheme()
     * @member {Set<HTMLLinkElement>} themeLinks=new Set()
     */
    themeLinks = new Set()

    /**
     * @member {MutationObserver|null} themeObserver=null
     */
    themeObserver = null

    /**
     * The ej2 theme stylesheet: material-dark.css when the page is dark and the source has one (CDN only)
     * @param {Object} urls {css, cssDark}
     * @returns {String}
     */
    themeHref(urls) {
        return document.body.classList.contains('dark') && urls.cssDark ? urls.cssDark : urls.css
    }

    /**
     * Points a theme stylesheet at the current colour scheme
     * @param {HTMLLinkElement} link
     * @param {Object} urls {css, cssDark}
     */
    applyTheme(link, urls) {
        const href = this.themeHref(urls);

        link.sfUrls = urls;
        // body class changes that keep the scheme must not reload the stylesheet
        link.getAttribute('href') !== href && link.setAttribute('href', href);
        // the iframe's own style rules (.e-de-background) follow the loaded theme, a local install stays light
        link.ownerDocument !== document && link.ownerDocument.documentElement.classList.toggle('dark', href === urls.cssDark);
    }

    /**
     * Loads the ej2 bundle into this page (spreadsheets)
     * @param {Object} urls {js, css, cssDark}
     * @param {String} licenseKey
     * @param {String} errorText
     * @returns {Promise<Object>} the page's ej namespace
     */
    loadLibrary(urls, licenseKey, errorText) {
        let me = this;

        if (!me.loading[urls.js]) {
            me.loading[urls.js] = new Promise((resolve, reject) => {
                const link   = document.createElement('link'),
                      script = document.createElement('script');

                link.rel = 'stylesheet';
                me.applyTheme(link, urls);
                me.themeLinks.add(link);
                me.watchTheme();
                document.head.appendChild(link);

                // a plain script tag: a failed CDN load rejects instead of leaving the caller waiting
                script.src    = urls.js;
                script.onload = () => {
                    me.registerLicense(globalThis.ej, licenseKey);
                    resolve(globalThis.ej)
                };
                script.onerror = () => {
                    delete me.loading[urls.js];
                    me.themeLinks.delete(link);
                    link.remove();
                    script.remove();
                    console.error('Failed to load ' + urls.js);
                    reject(new Error(errorText))
                };
                document.head.appendChild(script)
            })
        }

        return me.loading[urls.js]
    }

    /**
     * The license key is registered in the browser: the ej2 library checks it there
     * @param {Object} ej
     * @param {String} licenseKey
     */
    registerLicense(ej, licenseKey) {
        licenseKey && ej?.base?.registerLicense?.(licenseKey)
    }

    /**
     * An iframe that loads the ej2 bundle
     * @param {HTMLElement} host
     * @param {Object} item
     * @param {Object} urls {js, css, cssDark}
     * @param {String} licenseKey
     * @param {String} errorText
     * @returns {Promise<Object>} the iframe's ej namespace
     */
    createIframe(host, item, urls, licenseKey, errorText) {
        return new Promise((resolve, reject) => {
            // destroyEditor() while the library loads: the worker must not wait forever
            item.cancelLoad = () => reject(new Error('cancelled'));

            const iframe = item.iframe = document.createElement('iframe'),
                  attr   = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

            iframe.className = 'go-syncfusion-frame';
            host.appendChild(iframe);

            iframe.onload = () => {
                const ej = iframe.contentWindow?.ej;

                // load fires even when the library script inside failed, e.g. CDN unreachable
                if (!ej) {
                    reject(new Error(errorText));
                    return
                }

                this.registerLicense(ej, licenseKey);
                resolve(ej)
            };

            const doc = iframe.contentDocument;
            doc.open();
            doc.write(
                '<!DOCTYPE html><html><head>' +
                '<link id="sf-theme" rel="stylesheet" href="' + attr(this.themeHref(urls)) + '">' +
                '<style>html, body {margin: 0; padding: 0; height: 100%; overflow: hidden} #sf-editor {height: 100%; width: 100%} html:not(.dark) .e-de-background {background-color: #eee}</style>' +
                '</head><body><div id="sf-editor"></div>' +
                '<script src="' + attr(urls.js) + '"><\/script>' +
                '</body></html>'
            );
            doc.close();

            item.themeLink = doc.getElementById('sf-theme');
            this.applyTheme(item.themeLink, urls);
            this.themeLinks.add(item.themeLink);
            this.watchTheme()
        })
    }

    /**
     * Loads the Syncfusion translations of a locale (ej2-locale on jsdelivr); without one the editor stays English
     * @param {Object} ej
     * @param {String} url
     */
    async loadLocale(ej, url) {
        if (!url) {
            return
        }

        try {
            const response = await fetch(url);

            response.ok && ej?.base?.L10n?.load(await response.json())
        } catch (e) {
            // no locale for this language
        }
    }

    /**
     * Sends Ctrl/Cmd+S to the worker
     * @param {String} id host element id
     * @param {KeyboardEvent} e
     */
    onKeyDown(id, e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            e.stopPropagation();

            const host = DomAccess.getElement(id);

            host && DomEvents.sendMessageToApp({
                id,
                path: DomEvents.getPathFromElement(host).map(el => DomEvents.getTargetData(el)),
                type: 'syncfusionSave'
            })
        }
    }

    /**
     * Creates the editor inside the host element and opens the converted file
     * @param {Object} data
     * @param {String} data.id          host element id (the worker component)
     * @param {String} data.type        'document' or 'spreadsheet'
     * @param {Object} data.urls        {js, css, cssDark} of the ej2 bundle
     * @param {String} [data.licenseKey]
     * @param {String} data.locale      Syncfusion locale, e.g. 'en-US', 'nl'
     * @param {String} [data.localeUrl] translations of the locale
     * @param {*} data.content          SFDT (document) or workbook JSON (spreadsheet) from the backend
     * @param {Boolean} data.canEdit
     * @param {String} [data.serviceUrl] spreadsheet service base URL; the File menu only renders with it
     * @param {Object} data.labels      {save, error}
     * @returns {Promise<Boolean>} false when the host is gone (window closed meanwhile)
     */
    async openEditor({id, type, urls, licenseKey = '', locale = 'en-US', localeUrl = '', content, canEdit = false, serviceUrl = '', labels = {}}) {
        let me   = this,
            host = DomAccess.getElement(id);

        if (!host) {
            return false
        }

        me.destroyEditor({id});

        const item = me.map[id] = {type, canEdit, dirty: false};

        const ej = type === 'document'
            ? await me.createIframe(host, item, urls, licenseKey, labels.error)
            : await me.loadLibrary(urls, licenseKey, labels.error);

        // closed meanwhile
        if (me.map[id] !== item) {
            return false
        }

        item.ej = ej;
        await me.loadLocale(ej, localeUrl);

        if (me.map[id] !== item) {
            return false
        }

        if (type === 'document') {
            me.openDocument(id, item, content, locale, labels)
        } else {
            me.openSpreadsheet(id, host, item, content, locale, serviceUrl, labels)
        }

        return true
    }

    openDocument(id, item, sfdt, locale, labels) {
        const ej  = item.ej,
              doc = item.iframe.contentDocument;

        // Office style tabbed toolbar
        ej.documenteditor.DocumentEditorContainer.Inject(ej.documenteditor.Ribbon);

        const editor = item.editor = new ej.documenteditor.DocumentEditorContainer({
            enableToolbar    : true,
            toolbarMode      : 'Ribbon',
            ribbonLayout     : 'Simplified',
            height           : '100%',
            locale,
            showPropertiesPane: true,
            enableLocalPaste : false,
            restrictEditing  : !item.canEdit,
            // No 'New': a blank document saved over the loaded one would replace the file
            fileMenuItems    : [{text: labels.save, id: 'go_save', iconCss: 'e-icons e-save'}, 'Print'],
            fileMenuItemClick: args => {
                args.item.id === 'go_save' && this.onKeyDown(id, {ctrlKey: true, key: 's', preventDefault() {}, stopPropagation() {}})
            },
            created          : () => {
                editor.documentEditor.pageOutline = '#d1d1d1'
            },
            contentChange    : () => {
                item.dirty = true
            }
        });

        editor.appendTo(doc.getElementById('sf-editor'));
        editor.documentEditor.open(JSON.stringify(sfdt));

        // open() fires contentChange itself: reset once loading settles
        setTimeout(() => {
            item.dirty = false
        }, 300);

        // The editor takes key input in its own element: its keyDown event sees Ctrl/Cmd+S, the document doesn't.
        // isHandled stops the editor's own Ctrl+S (a download of the document).
        editor.documentEditor.addEventListener('keyDown', args => {
            const e = args.event;

            if (e && (e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
                args.isHandled = true;
                this.onKeyDown(id, e)
            }
        })
    }

    openSpreadsheet(id, host, item, data, locale, serviceUrl, labels) {
        let me        = this,
            ej        = item.ej,
            container = item.container = document.createElement('div'),
            added     = false;

        serviceUrl = serviceUrl ? serviceUrl.replace(/\/?$/, '/') : '';

        container.id        = id + '__sf';
        container.className = 'go-syncfusion-sheet';
        host.appendChild(container);

        const resize = () => item.editor?.isRendered && item.editor.resize?.();

        const editor = item.editor = new ej.spreadsheet.Spreadsheet({
            locale,
            allowOpen   : true,
            allowSave   : true,
            // the File menu only renders when these are set
            openUrl     : serviceUrl + 'Open',
            saveUrl     : serviceUrl + 'Save',
            // isProtected only protects the workbook structure, allowEditing keeps the cells read-only
            isProtected : !item.canEdit,
            allowEditing: item.canEdit,
            created     : () => {
                editor.isRendered = true;

                if (data) {
                    editor.openFromJson({file: typeof data === 'object' ? data : JSON.parse(data)});
                    data = null;

                    // openFromJson() returns no promise: recalculate the layout once it settled
                    setTimeout(() => {
                        container.style.width = (container.offsetWidth - 1) + 'px';
                        setTimeout(() => {
                            container.style.width = '';
                            resize()
                        }, 50)
                    }, 200)
                } else {
                    resize()
                }
            },
            openComplete: () => {
                item.dirty = false;
                resize()
            },
            actionComplete: () => {
                item.dirty = true
            },
            // File menu items are created lazily, custom ones can only be added here
            fileMenuBeforeOpen: () => {
                if (added) {
                    return
                }

                added = true;
                editor.addFileMenuItems([{text: labels.save, id: 'go_save', iconCss: 'e-save e-icons'}], container.id + '_Open', true, true);

                // The built-in items post from the browser straight to the Docker service (openUrl / saveUrl),
                // which is unreachable and unauthenticated from here; 'New' would let a blank workbook overwrite
                // the file through our own Save.
                // By id: the texts are translated
                editor.hideFileMenuItems(['_New', '_Open', '_Save_As'].map(suffix => container.id + suffix), true, true)
            },
            fileMenuItemSelect: args => {
                args.item.properties?.id === 'go_save' && me.onKeyDown(id, {ctrlKey: true, key: 's', preventDefault() {}, stopPropagation() {}})
            }
        });

        editor.appendTo('#' + container.id);

        // Focusing a cell (typing, Enter) lets the browser scroll the cell area by itself, while ej2 keeps its
        // horizontal scroller and the column headers where they were: cells and headers no longer line up. The
        // scroller is ej2's own position, put the cell area back there.
        item.scrollGuard = e => {
            const content  = e.target,
                  scroller = container.querySelector('.e-scroller');

            if (content?.classList?.contains('e-sheet-content') && scroller && content.scrollLeft !== scroller.scrollLeft) {
                content.scrollLeft = scroller.scrollLeft
            }
        };
        container.addEventListener('scroll', item.scrollGuard, true);

        item.observer = new ResizeObserver(resize);
        item.observer.observe(host);

        // Captured before the spreadsheet's own handler, which would open its Save As dialog
        item.keyHandler = e => me.onKeyDown(id, e);
        item.keyTarget  = host;
        host.addEventListener('keydown', item.keyHandler, true)
    }

    /**
     * Unsaved changes in the editor
     * @param {Object} data {id}
     * @returns {Boolean}
     */
    isDirty({id}) {
        return !!this.map[id]?.dirty
    }

    /**
     * Content to save: a document as a Blob (format 'Docx' or 'Txt'), a spreadsheet as the workbook JSON string.
     * Clears the dirty flag: the worker saves this content, a later change sets it again (setDirty() when the save
     * failed).
     * @param {Object} data
     * @param {String} data.id
     * @param {String} [data.format='Docx']
     * @returns {Promise<Blob|String|null>}
     */
    async exportFile({id, format = 'Docx'}) {
        const item = this.map[id];

        if (!item?.editor) {
            return null
        }

        item.dirty = false;

        if (item.type === 'document') {
            return item.editor.documentEditor.saveAsBlob(format)
        }

        const response = await item.editor.saveAsJson();
        return JSON.stringify(response.jsonObject.Workbook)
    }

    /**
     * @summary Switches the ej2 theme of all editors of this window when the colour scheme changes.
     */
    watchTheme() {
        let me = this;

        if (!me.themeObserver) {
            me.themeObserver = new MutationObserver(() => me.themeLinks.forEach(link => me.applyTheme(link, link.sfUrls)));
            me.themeObserver.observe(document.body, {attributes: true, attributeFilter: ['class']})
        }
    }

    /**
     * Marks the editor content as unsaved again (the save of exportFile() failed)
     * @param {Object} data {id}
     */
    setDirty({id}) {
        this.map[id] && (this.map[id].dirty = true)
    }

    /**
     * Removes the editor. Before the host leaves the DOM: the document editor writes to its iframe's storage when
     * destroyed.
     * @param {Object} data {id}
     * @returns {Boolean}
     */
    destroyEditor({id}) {
        const item = this.map[id];

        if (!item) {
            return false
        }

        delete this.map[id];
        item.observer?.disconnect();

        if (item.keyHandler) {
            (item.keyTarget || item.iframe?.contentDocument)?.removeEventListener('keydown', item.keyHandler, !!item.keyTarget)
        }

        try {
            item.editor?.destroy?.()
        } catch (e) {
            // a failing destroy in the library must not keep the window open
            console.error(e)
        }

        item.cancelLoad?.();
        this.themeLinks.delete(item.themeLink);

        if (item.iframe) {
            item.iframe.onload = null;
            item.iframe.remove()
        }

        item.container?.remove();
        return true
    }
}

export default Neo.setupClass(Syncfusion);
