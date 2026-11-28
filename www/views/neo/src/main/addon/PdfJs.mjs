import Base      from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';
import DomAccess from '../../../node_modules/neo.mjs/src/main/DomAccess.mjs';
import {pagesToDraw} from '../../pdf/pdfPages.mjs';

/**
 * Version of pdfjs-dist in views/neo/package.json. Keep it in step: it only busts the browser cache.
 */
const PDFJS_VERSION = '6.5.438';

/** Most pixels of one page canvas (16.7 million, about 64 MB) and most pixels of one side: within every browser's limits */
const MAX_CANVAS_PIXELS = 16777216,
      MAX_CANVAS_SIDE   = 8192;

/**
 * Main thread side of GO.pdf.PdfViewer: pdf.js and its canvases need the real DOM, so
 * the document lives here and the App worker only says what to show.
 *
 * Every page gets a placeholder of its size, in order; a page is drawn when its placeholder comes near the visible
 * part of the host and its canvas is dropped again when it leaves it. Scrolling through a long manual keeps only a
 * few canvases (one page at scale 1.5 takes about 8 MB).
 *
 * One view per host element id. Only the latest load() of a host may touch it: an earlier, slower load drops its
 * document and answers {superseded: true}.
 *
 * Loaded per window: await Neo.Main.importAddon({name: 'WS/PdfJs', windowId}), see src/pdf/PdfViewer.mjs.
 * @summary pdf.js document, lazy page canvases and zoom of a PDF view.
 * @class GO.main.addon.PdfJs
 * @extends Neo.main.addon.Base
 */
class PdfJs extends Base {
    static config = {
        className: 'GO.main.addon.PdfJs',
        // pdf.js is loaded on the first load(), see library()
        preloadFilesDelay: false,
        remote: {
            app: [
                'detach',
                'load',
                'redraw',
                'release'
            ]
        }
    }

    /**
     * host element id → {request, doc, scale, pages, previewPages, maxListedPages, render, observer}
     * @member {Object} views={}
     */
    views = {}

    /**
     * Counter for the drawing tokens of drawPage()
     * @member {Number} drawToken=0
     */
    drawToken = 0

    /**
     * The pdf.js module while or after it loads; a failed load is forgotten so the next call tries again
     * @member {Promise<Object>|null} pdfjs=null
     */
    pdfjs = null

    /**
     * @summary Loads pdf.js once per window and points it at its worker.
     * @param {String} base absolute URL of the pdfjs-dist package
     * @returns {Promise<Object>} the pdf.js module
     */
    library(base) {
        let me = this;

        if (!me.pdfjs) {
            me.pdfjs = import(base + 'build/pdf.mjs?v=' + PDFJS_VERSION).then(pdfjs => {
                pdfjs.GlobalWorkerOptions.workerSrc = base + 'build/pdf.worker.mjs?v=' + PDFJS_VERSION;
                return pdfjs
            }).catch(e => {
                me.pdfjs = null;
                throw e
            })
        }

        return me.pdfjs
    }

    /**
     * @summary Loads a PDF into a host and draws its pages.
     * @param {Object} data
     * @param {String} data.id               host element id
     * @param {String} data.url              absolute same-origin download URL (the session cookie goes along)
     * @param {String} data.pdfjsBase        absolute URL of the pdfjs-dist package, ending in "/"
     * @param {Number} data.scale            pdf.js scale, 1 = 72 dpi
     * @param {Number[]|null} [data.pages]   page list, null for the preview
     * @param {Number} [data.previewPages]
     * @param {Number} [data.maxListedPages]
     * @returns {Promise<Object>} {numPages}, {superseded: true} or {error}
     */
    async load({id, url, pdfjsBase, scale, pages = null, previewPages, maxListedPages}) {
        let me      = this,
            view    = me.views[id] ??= {request: 0},
            request = ++view.request,
            isCurrent = () => me.views[id] === view && view.request === request,
            task, doc;

        try {
            // absolute URLs from the worker: the page's <base href> is neo's app folder, not GO's root
            const pdfjs = await me.library(pdfjsBase);

            if (!isCurrent()) {
                return {superseded: true}
            }

            // the loading task owns the fetch and the pdf.js worker: a superseded load is stopped through it
            view.task?.destroy();
            task = view.task = pdfjs.getDocument({
                url,
                cMapUrl            : pdfjsBase + 'cmaps/',
                cMapPacked         : true,
                iccUrl             : pdfjsBase + 'iccs/',
                standardFontDataUrl: pdfjsBase + 'standard_fonts/',
                wasmUrl            : pdfjsBase + 'wasm/'
            });

            doc = await task.promise
        } catch (e) {
            task?.destroy();
            view.task === task && (view.task = null);

            if (!isCurrent()) {
                return {superseded: true}
            }

            // the document shown before must not stay under the new title
            me.releaseDocument(view);
            me.clearHost(id);
            console.warn("PDF: Can't load: " + (e?.message || e));
            return {error: String(e?.message || e)}
        }

        view.task === task && (view.task = null);

        if (!isCurrent()) {
            task.destroy();
            return {superseded: true}
        }

        me.releaseDocument(view);
        Object.assign(view, {doc, scale, pages, previewPages, maxListedPages});
        me.draw(id, false);

        return {numPages: doc.numPages}
    }

    /**
     * @summary Draws the loaded document again: new zoom or page list, or the host was mounted again.
     * @param {Object} data
     * @param {String} data.id
     * @param {Number} [data.scale]
     * @param {Number[]|null} [data.pages]
     * @returns {Boolean} false when nothing is loaded for the host
     */
    redraw({id, scale, pages}) {
        const view = this.views[id];

        if (!view?.doc) {
            return false
        }

        scale !== undefined && (view.scale = scale);
        pages !== undefined && (view.pages = pages);

        return this.draw(id, true)
    }

    /**
     * @summary Stops drawing into a host whose element left the DOM; the document stays for redraw().
     * @param {Object} data
     * @param {String} data.id
     */
    detach({id}) {
        const view = this.views[id];

        if (view) {
            view.render = (view.render || 0) + 1;
            this.disconnect(view)
        }
    }

    /**
     * @summary Frees the document of a host and empties it; a load still running for it is dropped.
     * @param {Object} data
     * @param {String} data.id
     */
    release({id}) {
        const view = this.views[id];

        if (view) {
            delete this.views[id];
            view.request++;
            view.task?.destroy();
            view.task = null;
            view.render = (view.render || 0) + 1;
            this.releaseDocument(view);
            this.clearHost(id)
        }
    }

    /**
     * @summary Places a sized placeholder for every page to draw and observes them.
     * @param {String} id
     * @param {Boolean} keepScroll keep the relative scroll position (zoom)
     * @returns {Boolean} false when the host is not in the DOM
     */
    draw(id, keepScroll) {
        let me   = this,
            view = me.views[id],
            host = DomAccess.getElement(id);

        if (!host || !view?.doc) {
            return false
        }

        const {doc}  = view,
              render = view.render = (view.render || 0) + 1,
              // a redraw before the previous one placed its pages keeps that one's position, not the empty top
              ratio  = !keepScroll ? 0 : view.scrollRatio ?? (host.scrollHeight ? host.scrollTop / host.scrollHeight : 0),
              pageNumbers = pagesToDraw({
                  numPages      : doc.numPages,
                  pages         : view.pages,
                  previewPages  : view.previewPages,
                  maxListedPages: view.maxListedPages
              });

        view.scrollRatio = ratio || null;
        me.disconnect(view);
        me.clearHost(id);

        if (!pageNumbers.length) {
            view.scrollRatio = null;
            return true
        }

        doc.getPage(pageNumbers[0]).then(firstPage => {
            if (view.doc !== doc || view.render !== render || !host.isConnected) {
                return // another document, zoom or page list meanwhile
            }

            // pages of one document are as a rule the same size: the first one sizes the placeholders, a page
            // of another size corrects its own when it is drawn
            const size = firstPage.getViewport({scale: view.scale});

            view.observer = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        me.drawPage(view, render, entry.target)
                    } else {
                        me.releasePage(entry.target)
                    }
                })
            }, {root: host, rootMargin: '1500px 0px'});

            pageNumbers.forEach(pageNumber => {
                const div = document.createElement('div');

                div.className    = 'go-pdf-page';
                div.dataset.page = String(pageNumber);
                div.style.width  = size.width + 'px';
                div.style.height = size.height + 'px';
                host.appendChild(div);
                view.observer.observe(div)
            });

            view.scrollRatio = null;

            if (ratio) {
                host.scrollTop = ratio * host.scrollHeight
            }
        }).catch(e => {
            console.warn("PDF: Can't render: " + (e?.message || e))
        });

        return true
    }

    /**
     * @summary Draws one page into its placeholder.
     * @param {Object} view
     * @param {Number} render the draw() this placeholder belongs to
     * @param {HTMLElement} div
     */
    drawPage(view, render, div) {
        if (div.dataset.drawn) {
            return
        }

        // a token per drawing: a page that left and came back while getPage() was pending is drawn once
        const token      = String(++this.drawToken),
              {doc}      = view,
              pageNumber = parseInt(div.dataset.page, 10);

        div.dataset.drawn = token;

        doc.getPage(pageNumber).then(page => {
            if (view.doc !== doc || view.render !== render || div.dataset.drawn !== token) {
                return
            }

            const viewport = page.getViewport({scale: view.scale}),
                  area     = viewport.width * viewport.height,
                  // sharp on high density screens, but within a pixel budget: a canvas over the browser's limit
                  // stays blank, and a large one costs hundreds of MB
                  ratio    = Math.min(
                      globalThis.devicePixelRatio || 1,
                      Math.sqrt(MAX_CANVAS_PIXELS / area),
                      MAX_CANVAS_SIDE / viewport.width,
                      MAX_CANVAS_SIDE / viewport.height
                  ),
                  canvas   = document.createElement('canvas');

            // the bitmap has device pixels, the element CSS pixels
            canvas.width        = Math.floor(viewport.width * ratio);
            canvas.height       = Math.floor(viewport.height * ratio);
            canvas.style.width  = viewport.width + 'px';
            canvas.style.height = viewport.height + 'px';
            div.style.width     = viewport.width + 'px';
            div.style.height    = viewport.height + 'px';
            div.appendChild(canvas);
            div.pdfPage = page;

            // pdf.js paints the white page background itself
            div.renderTask = page.render({
                canvas,
                viewport,
                transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0]
            });

            div.renderTask.promise.catch(e => {
                // cancelled by releasePage(); anything else is a page that could not be drawn
                e?.name === 'RenderingCancelledException' || console.warn("PDF: Can't render page " + pageNumber + ': ' + (e?.message || e))
            })
        }).catch(e => {
            console.warn("PDF: Can't render page " + pageNumber + ': ' + (e?.message || e))
        })
    }

    /**
     * @summary Drops the canvas of a page that left the drawing margin.
     * @param {HTMLElement} div
     */
    releasePage(div) {
        if (!div.dataset.drawn) {
            return
        }

        delete div.dataset.drawn;

        if (div.renderTask) {
            div.renderTask.cancel();
            div.renderTask = null
        }

        // frees the page's decoded images and operator list; pdf.js defers it while the cancelled render winds down
        div.pdfPage?.cleanup();
        div.pdfPage = null;

        const canvas = div.querySelector('canvas');

        if (canvas) {
            // a zero-sized canvas hands its memory back at once, before garbage collection
            canvas.width = canvas.height = 0;
            canvas.remove()
        }
    }

    /**
     * @summary Removes the placeholders of a host, freeing their canvases.
     * @param {String} id
     */
    clearHost(id) {
        const host = DomAccess.getElement(id);

        if (host) {
            host.querySelectorAll('.go-pdf-page').forEach(div => this.releasePage(div));
            host.replaceChildren()
        }
    }

    /**
     * @summary Stops observing the placeholders of a view.
     * @param {Object} view
     */
    disconnect(view) {
        view.observer?.disconnect();
        view.observer = null
    }

    /**
     * @summary Frees the pdf.js document of a view (its worker data) and its observer.
     * @param {Object} view
     */
    releaseDocument(view) {
        this.disconnect(view);
        view.doc?.loadingTask.destroy();
        view.doc = null
    }
}

export default Neo.setupClass(PdfJs);
