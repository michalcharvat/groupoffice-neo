import Container from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar   from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button    from '../button/Button.mjs';
import {t}       from '../Translate.mjs';
import {MAX_LISTED_PAGES, PREVIEW_PAGES, ZOOM_STEPS, nextZoom, normalizePages, pagesTitle, previewKind} from './pdfPages.mjs';

const ADDON = 'WS/PdfJs',
      // pdf.js comes with the neo client (package.json "dependencies", kept by buildScripts/release.mjs)
      PDFJS_BASE = 'views/neo/node_modules/pdfjs-dist/';

/**
 * @summary An absolute URL for a path relative to GO's root (e.g. "api/download.php?blob=…"). Relative URLs must not
 * reach the DOM or the addon: the page's <base href> is neo's app folder.
 * @param {String} url
 * @returns {String}
 */
export function goUrl(url) {
    return new URL(url, new URL(Neo.config.goBaseUrl || '/', globalThis.location.href)).href
}

/**
 * Preview of a document: a PDF drawn by pdf.js (main thread addon src/main/addon/PdfJs.mjs) or an image, with zoom
 * buttons and the page title in a toolbar (classic amd/libs PdfViewPanel). Demo: Dev module, "PDF viewer".
 *
 * A PDF shows its first `previewPages` pages, or only the pages of `pages` (e.g. the pages of a job's manual),
 * at most `maxListedPages`. Pages are drawn when they scroll near the view. The source is a same-origin URL,
 * e.g. a blob download URL: the session cookie goes along.
 *
 *     {module: PdfViewer, reference: 'preview', toolbarItems: [{module: Button, text: t('Analyze'), handler}]}
 *     preview.setSource(downloadUrl, 'application/pdf');   // or 'pdf', 'image/png', 'jpg' …
 *     preview.pages = [3, 4, 5];                             // redraws the loaded PDF with these pages
 *
 * Events: `load {numPages, title}` after a PDF loaded, `loadError {error}`.
 * @summary PDF or image preview with zoom and a lazily drawn page list.
 * @class GO.pdf.PdfViewer
 * @extends Neo.container.Base
 */
class PdfViewer extends Container {
    static config = {
        className: 'GO.pdf.PdfViewer',
        cls      : ['go-pdfviewer'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * URL of the document; null shows nothing
         * @member {String|null} src_=null
         * @reactive
         */
        src_: null,
        /**
         * MIME type or extension of the source, see pdfPages.mjs previewKind()
         * @member {String} type_='pdf'
         * @reactive
         */
        type_: 'pdf',
        /**
         * 1-based pages to show instead of the preview; null or [] shows the preview
         * @member {Number[]|null} pages_=null
         * @reactive
         */
        pages_: null,
        /**
         * Zoom, 1 = 100 % (a PDF at pageScale, an image at the width of the view)
         * @member {Number} zoom_=1
         * @reactive
         */
        zoom_: 1,
        /**
         * pdf.js scale at zoom 1 (classic pageScale)
         * @member {Number} pageScale=1.5
         */
        pageScale: 1.5,
        /**
         * Pages of the preview
         * @member {Number} previewPages=10
         */
        previewPages: PREVIEW_PAGES,
        /**
         * At most this many pages of a page list are drawn
         * @member {Number} maxListedPages=200
         */
        maxListedPages: MAX_LISTED_PAGES,
        /**
         * Items added to the toolbar after the zoom buttons, e.g. an "Analyze" button
         * @member {Object[]} toolbarItems=[]
         */
        toolbarItems: []
    }

    /**
     * Pages of the loaded PDF, null while none is loaded
     * @member {Number|null} numPages=null
     */
    numPages = null

    /**
     * The PDF source the addon holds, null when none
     * @member {String|null} loadedSrc=null
     */
    loadedSrc = null

    /**
     * Window whose addon holds loadedSrc
     * @member {String|null} loadedWindowId=null
     */
    loadedWindowId = null

    /**
     * Counts loads and releases: a load whose token is no longer current drops its result
     * @member {Number} loadToken=0
     */
    loadToken = 0

    /**
     * A load is scheduled for the end of this tick (src and type set together load once)
     * @member {Boolean} loadPending=false
     */
    loadPending = false

    /**
     * @summary Builds the toolbar, the PDF host the addon draws into and the image view.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module: Toolbar,
            cls   : ['go-pdfviewer-tbar'],
            flex  : 'none',
            items : [{
                ntype    : 'component',
                reference: 'title',
                cls      : ['go-pdfviewer-title']
            }, '->', {
                module   : Button,
                reference: 'zoomOut',
                icon     : 'zoom_out',
                tooltip  : t('Zoom out'),
                handler  : () => me.zoomBy(-1)
            }, {
                ntype    : 'component',
                reference: 'zoomLabel',
                cls      : ['go-pdfviewer-zoom']
            }, {
                module   : Button,
                reference: 'zoomIn',
                icon     : 'zoom_in',
                tooltip  : t('Zoom in'),
                handler  : () => me.zoomBy(1)
            }, ...me.toolbarItems]
        }, {
            // filled by the addon only: no vdom children, so an update of this component leaves the pages alone
            ntype    : 'component',
            id       : me.pdfHostId,
            reference: 'pages',
            cls      : ['go-pdfviewer-pages', 'go-hidden'],
            flex     : 1,
            tabIndex : -1
        }, {
            ntype    : 'component',
            reference: 'image',
            cls      : ['go-pdfviewer-image', 'go-hidden'],
            flex     : 1,
            vdom     : {cn: [{tag: 'img', alt: ''}]}
        }, {
            ntype    : 'component',
            reference: 'message',
            cls      : ['go-pdfviewer-message', 'go-hidden'],
            flex     : 1
        }]
    }

    /**
     * @summary Shows the initial zoom and title once the references exist.
     */
    onConstructed() {
        super.onConstructed();
        this.updateToolbar()
    }

    /**
     * @summary Id of the element the addon draws the pages into.
     * @returns {String}
     */
    get pdfHostId() {
        return this.id + '__pages'
    }

    /**
     * @summary The addon of this window, once imported.
     * @returns {Object|null}
     */
    get addon() {
        return Neo.ns('GO.main.addon.PdfJs')
    }

    /**
     * @summary Sets source and type together; they load once.
     * @param {String|null} src
     * @param {String} [type='pdf'] MIME type or extension
     */
    setSource(src, type = 'pdf') {
        this.set({type, src})
    }

    /**
     * @summary Loads a new source.
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetSrc(value, oldValue) {
        this.scheduleLoad()
    }

    /**
     * @summary A new type loads the source again (PDF or image).
     * @param {String} value
     * @param {String} oldValue
     */
    afterSetType(value, oldValue) {
        oldValue !== undefined && this.scheduleLoad()
    }

    /**
     * @summary Keeps a clean page list and redraws the loaded PDF with it.
     * @param {Number[]|null} value
     * @param {Number[]|null} oldValue
     * @returns {Number[]|null}
     */
    beforeSetPages(value, oldValue) {
        return normalizePages(value)
    }

    /**
     * @summary Redraws the loaded PDF with the new page list.
     * @param {Number[]|null} value
     * @param {Number[]|null} oldValue
     */
    afterSetPages(value, oldValue) {
        let me = this;

        me.updateToolbar();

        if (me.loadedSrc && me.mounted) {
            me.callAddon('redraw', {pages: value})
        }
    }

    /**
     * @summary Keeps the zoom within the steps.
     * @param {Number} value
     * @param {Number} oldValue
     * @returns {Number}
     */
    beforeSetZoom(value, oldValue) {
        const zoom = Number(value);

        return Number.isFinite(zoom) ? Math.min(ZOOM_STEPS.at(-1), Math.max(ZOOM_STEPS[0], zoom)) : 1
    }

    /**
     * @summary Applies the zoom to the PDF or the image.
     * @param {Number} value
     * @param {Number} oldValue
     */
    afterSetZoom(value, oldValue) {
        let me = this;

        me.updateToolbar();

        if (oldValue === undefined) {
            return
        }

        if (me.loadedSrc && me.mounted) {
            me.callAddon('redraw', {scale: me.pageScale * value})
        }

        me.applyImageZoom()
    }

    /**
     * @summary Zooms one step in or out.
     * @param {Number} direction 1 = in, -1 = out
     */
    zoomBy(direction) {
        this.zoom = nextZoom(this.zoom, direction)
    }

    /**
     * @summary Draws the PDF again when the view comes back into the DOM (a tab shown again), and stops drawing
     * when it leaves.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        let me = this;

        if (value) {
            // moved to another window: the document lives in the addon of the old one
            if (me.loadedSrc && me.loadedWindowId !== me.windowId) {
                me.addon?.release({id: me.pdfHostId, windowId: me.loadedWindowId}).catch(() => {});
                me.loadedSrc      = null;
                me.loadedWindowId = null
            }

            if (me.src && previewKind(me.type) === 'pdf' && me.loadedSrc !== me.src) {
                me.scheduleLoad()
            } else if (me.loadedSrc) {
                me.callAddon('redraw', {scale: me.pageScale * me.zoom, pages: me.pages})
            }
        } else if (oldValue && me.loadedSrc) {
            me.callAddon('detach', {})
        }
    }

    /**
     * @summary Loads at the end of the tick, once for configs set together.
     */
    scheduleLoad() {
        let me = this;

        if (!me.loadPending) {
            me.loadPending = true;

            Promise.resolve().then(() => {
                me.loadPending = false;
                me.isDestroyed || me.loadSource()
            })
        }
    }

    /**
     * @summary Shows the current source: PDF through the addon, an image in the view, otherwise a message.
     * @returns {Promise<void>}
     */
    async loadSource() {
        let me    = this,
            src   = me.src,
            kind  = src ? previewKind(me.type) : null,
            token = ++me.loadToken;

        me.showPart(kind === 'pdf' ? 'pages' : kind === 'image' ? 'image' : src ? 'message' : null);
        me.setMessage(src && !kind ? t('No preview available for this file.') : '');

        if (kind !== 'pdf') {
            me.releasePdf();
            me.setImage(kind === 'image' ? src : null);
            me.updateToolbar();
            return
        }

        me.setImage(null);

        // the host element must exist: afterSetMounted() loads it then
        if (!me.mounted) {
            return
        }

        me.loadedSrc      = null;
        me.loadedWindowId = null;
        me.numPages       = null;
        me.updateToolbar();
        me.isLoading = t('Loading PDF, please wait...');

        let scale = me.pageScale * me.zoom,
            pages = me.pages,
            result;

        try {
            await Neo.Main.importAddon({name: ADDON, windowId: me.windowId});

            // another source, an image or a release while the addon loaded: this PDF must not reach it
            if (token !== me.loadToken || me.isDestroyed) {
                return
            }

            result = await me.addon.load({
                id            : me.pdfHostId,
                url           : goUrl(src),
                pdfjsBase     : goUrl(PDFJS_BASE),
                scale,
                pages,
                previewPages  : me.previewPages,
                maxListedPages: me.maxListedPages,
                windowId      : me.windowId
            })
        } catch (e) {
            result = {error: String(e?.message || e)}
        }

        // a newer source or type meanwhile: its own load shows the result
        if (me.isDestroyed || result?.superseded || token !== me.loadToken) {
            return
        }

        me.isLoading = false;

        if (result?.error) {
            me.showPart('message');
            me.setMessage(t('The document could not be loaded.'));
            me.updateToolbar();
            me.fire('loadError', {error: result.error});
            return
        }

        me.loadedSrc      = src;
        me.loadedWindowId = me.windowId;
        me.numPages       = result.numPages;

        // zoom or page list changed while it loaded: redraw() was skipped then
        if (me.pageScale * me.zoom !== scale || me.pages !== pages) {
            me.callAddon('redraw', {scale: me.pageScale * me.zoom, pages: me.pages})
        }
        me.updateToolbar();
        me.fire('load', {numPages: me.numPages, title: me.getTitle()})
    }

    /**
     * @summary Calls a method of the addon for this view's host; errors only go to the console.
     * @param {String} method 'redraw' or 'detach'
     * @param {Object} data
     */
    callAddon(method, data) {
        let me = this;

        me.addon?.[method]({...data, id: me.pdfHostId, windowId: me.windowId}).catch(e => console.warn('PDF', e))
    }

    /**
     * @summary Frees the PDF the addon holds for this view.
     */
    releasePdf() {
        let me = this;

        me.loadToken++;

        if (me.loadedSrc || me.isLoading) {
            me.addon?.release({id: me.pdfHostId, windowId: me.loadedWindowId || me.windowId}).catch(() => {})
        }

        me.loadedSrc = null;
        me.numPages  = null;
        me.isLoading = false
    }

    /**
     * @summary Title of the view: the page list, the preview limit, "PDF", or empty for an image.
     * @returns {String} plain text
     */
    getTitle() {
        let me = this;

        if (!me.src || previewKind(me.type) !== 'pdf') {
            return ''
        }

        return pagesTitle({
            t,
            numPages      : me.numPages,
            pages         : me.pages,
            previewPages  : me.previewPages,
            maxListedPages: me.maxListedPages
        })
    }

    /**
     * @summary Title, zoom percentage and the zoom buttons' limits.
     */
    updateToolbar() {
        let me    = this,
            title = me.getReference('title'),
            label = me.getReference('zoomLabel');

        if (!title) {
            return
        }

        title.text = me.getTitle();
        label.text = Math.round(me.zoom * 100) + ' %';
        me.getReference('zoomOut').disabled = me.zoom <= ZOOM_STEPS[0];
        me.getReference('zoomIn').disabled  = me.zoom >= ZOOM_STEPS.at(-1)
    }

    /**
     * @summary Shows one of the parts: 'pages', 'image', 'message' or none.
     * @param {String|null} part
     */
    showPart(part) {
        let me    = this,
            parts = {
                pages  : me.getReference('pages'),
                image  : me.getReference('image'),
                message: me.getReference('message')
            };

        Object.entries(parts).forEach(([name, component]) => {
            component && component.toggleCls('go-hidden', name !== part)
        })
    }

    /**
     * @summary Puts an image source into the image view.
     * @param {String|null} src
     */
    setImage(src) {
        let me    = this,
            image = me.getReference('image');

        if (!image) {
            return
        }

        const img = image.vdom.cn[0];

        if (src) {
            img.src = goUrl(src)
        } else {
            delete img.src
        }

        me.applyImageZoom()
    }

    /**
     * @summary Zooms the image: 100 % is the width of the view.
     */
    applyImageZoom() {
        let me    = this,
            image = me.getReference('image');

        if (image) {
            image.vdom.cn[0].style = {width: Math.round(me.zoom * 100) + '%'};
            image.update()
        }
    }

    /**
     * @summary Shows a plain text message instead of the document.
     * @param {String} text
     */
    setMessage(text) {
        const message = this.getReference('message');

        message && (message.text = text)
    }

    /**
     * @summary Frees the PDF in the addon.
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.loadToken++;
        me.addon?.release({id: me.pdfHostId, windowId: me.loadedWindowId || me.windowId}).catch(() => {});

        super.destroy(...args)
    }
}

export default Neo.setupClass(PdfViewer);
