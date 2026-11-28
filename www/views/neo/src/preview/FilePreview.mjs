import Container from '../../node_modules/neo.mjs/src/container/Base.mjs';
import Button    from '../button/Button.mjs';
import PdfViewer, {goUrl} from '../pdf/PdfViewer.mjs';
import {download}     from '../download.mjs';
import {escapeHtml}   from '../Format.mjs';
import {markdownToHtml} from '../Markdown.mjs';
import {t}            from '../Translate.mjs';
import {TEXT_LIMIT, previewKindOf, registeredPreview} from './previewKinds.mjs';

/**
 * Preview of one file by its extension or MIME type: PDF and image in GO.pdf.PdfViewer, text (escaped, monospace),
 * Markdown, audio and video (native players), kinds added with registerPreview() (previewKinds.mjs), otherwise an
 * icon with the name and a Download button. Demo: Dev module, "File preview".
 *
 * Markdown is fetched from `src` and rendered by Markdown.mjs (sanitised). With `htmlUrl` a page the host renders
 * and trusts (e.g. with its protected images) is shown in a frame instead.
 *
 *     {module: FilePreview, reference: 'preview', flex: 1}
 *     preview.setFile({src: downloadUrl, name: 'Report.pdf'});            // extension from the name
 *     preview.setFile({src, extension: 'md', htmlUrl: renderedUrl});
 *     preview.setFile(null);                                              // empty
 *
 * Sources are same-origin URLs (relative to GO's root); fetch, pdf.js and the players send the session cookie.
 * Only the latest file shows: a fetch for an older one drops its result.
 * @summary Preview of a file: PDF, image, text, Markdown, audio, video or a Download fallback.
 * @class GO.preview.FilePreview
 * @extends Neo.container.Base
 */
class FilePreview extends Container {
    static config = {
        className: 'GO.preview.FilePreview',
        cls      : ['go-filepreview'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * URL of the file; null shows nothing
         * @member {String|null} src_=null
         * @reactive
         */
        src_: null,
        /**
         * Extension without the dot; empty takes it from the name
         * @member {String} extension_=''
         * @reactive
         */
        extension_: '',
        /**
         * MIME type, used when the extension is unknown
         * @member {String} type_=''
         * @reactive
         */
        type_: '',
        /**
         * File name, shown by the fallback and used for the extension
         * @member {String} name_=''
         * @reactive
         */
        name_: '',
        /**
         * URL of HTML the host renders for a Markdown file and trusts; shown in a frame
         * @member {String|null} htmlUrl_=null
         * @reactive
         */
        htmlUrl_: null,
        items: [{
            module   : PdfViewer,
            reference: 'viewer',
            flex     : 1
        }, {
            ntype    : 'component',
            reference: 'content',
            cls      : ['go-filepreview-content', 'go-hidden'],
            flex     : 1
        }, {
            ntype    : 'container',
            reference: 'fallback',
            cls      : ['go-filepreview-fallback', 'go-hidden'],
            flex     : 1,
            layout   : {ntype: 'vbox', align: 'center', pack: 'center'},
            items    : [{
                ntype    : 'component',
                reference: 'fallbackText',
                cls      : ['go-empty'],
                flex     : 'none'
            }, {
                module : Button,
                ui     : 'secondary',
                icon   : 'download',
                text   : t('Download'),
                flex   : 'none',
                handler: 'up.onDownload'
            }]
        }]
    }

    /**
     * Counts loads: a fetch whose token is no longer current drops its result
     * @member {Number} loadToken=0
     */
    loadToken = 0

    /**
     * A load is scheduled for the end of this tick (configs set together load once)
     * @member {Boolean} loadPending=false
     */
    loadPending = false

    /**
     * Aborts the fetch of the file shown before
     * @member {AbortController|null} abortController=null
     */
    abortController = null

    /**
     * @summary Starts empty: the viewer keeps its own cls, so it is hidden here.
     */
    onConstructed() {
        super.onConstructed();
        this.showPart(null)
    }

    /**
     * @summary Sets the file in one go; the missing keys are cleared. null empties the preview.
     * @param {Object|null} file {src, extension, type, name, htmlUrl}
     */
    setFile(file) {
        const {src = null, extension = '', type = '', name = '', htmlUrl = null} = file || {};

        this.set({src, extension, type, name, htmlUrl})
    }

    /**
     * @summary Shows the new source.
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetSrc(value, oldValue) {
        this.scheduleLoad()
    }

    /**
     * @summary A new extension can change the kind of preview.
     * @param {String} value
     * @param {String} oldValue
     */
    afterSetExtension(value, oldValue) {
        oldValue !== undefined && this.scheduleLoad()
    }

    /**
     * @summary A new MIME type can change the kind of preview.
     * @param {String} value
     * @param {String} oldValue
     */
    afterSetType(value, oldValue) {
        oldValue !== undefined && this.scheduleLoad()
    }

    /**
     * @summary A new name can change the extension and the fallback text.
     * @param {String} value
     * @param {String} oldValue
     */
    afterSetName(value, oldValue) {
        oldValue !== undefined && this.scheduleLoad()
    }

    /**
     * @summary Markdown shows the host's HTML instead.
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetHtmlUrl(value, oldValue) {
        oldValue !== undefined && this.scheduleLoad()
    }

    /**
     * @summary The kind of preview for the current file.
     * @returns {String|null} see previewKinds.mjs previewKindOf()
     */
    get kind() {
        let me = this;

        return me.src ? previewKindOf({extension: me.extension, type: me.type, name: me.name}) : null
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
                me.isDestroyed || me.loadFile()
            })
        }
    }

    /**
     * @summary Shows the current file in the part for its kind.
     * @returns {Promise<void>}
     */
    async loadFile() {
        let me      = this,
            src     = me.src,
            kind    = me.kind,
            token   = ++me.loadToken,
            viewer  = me.getReference('viewer'),
            content = me.getReference('content');

        me.isLoading = false;
        me.abortController?.abort();
        me.abortController = null;
        // a hidden player would keep playing
        content.html = '';

        // the viewer releases a PDF it no longer shows
        viewer.setSource(kind === 'pdf' || kind === 'image' ? src : null, kind === 'pdf' ? 'pdf' : 'image/*');

        if (!src) {
            me.showPart(null);
            return
        }

        if (kind === 'pdf' || kind === 'image') {
            me.showPart('viewer');
            return
        }

        if (!kind) {
            me.getReference('fallbackText').html =
                `<i class="go-icon">description</i><p>${escapeHtml(me.name || t('No preview available for this file.'))}</p>`;
            me.showPart('fallback');
            return
        }

        me.showPart('content');
        content.toggleCls('go-filepreview-text', kind === 'text');
        content.toggleCls('go-filepreview-frame', kind === 'markdown' && !!me.htmlUrl);
        content.toggleCls('go-markdown', kind === 'markdown' && !me.htmlUrl);

        if (kind === 'audio' || kind === 'video') {
            content.html = `<${kind} controls preload="metadata" src="${escapeHtml(goUrl(src))}"></${kind}>`;
            return
        }

        if (kind === 'markdown' && me.htmlUrl) {
            content.html = `<iframe src="${escapeHtml(goUrl(me.htmlUrl))}" title="${escapeHtml(me.name)}"></iframe>`;
            return
        }

        me.isLoading = t('Loading, please wait...');

        let controller = me.abortController = new AbortController(),
            html;

        try {
            const url = goUrl(src);

            if (kind === 'text' || kind === 'markdown') {
                const response = await fetch(url, {credentials: 'same-origin', signal: controller.signal});

                if (!response.ok) {
                    throw new Error(response.status + ' ' + response.statusText)
                }

                // shortcut: the whole file is downloaded before it is cut; fetch a range when huge logs matter
                const text = (await response.text()).slice(0, TEXT_LIMIT);

                if (token !== me.loadToken) {
                    return
                }

                html = kind === 'text' ? `<pre>${escapeHtml(text)}</pre>` : markdownToHtml(text)
            } else {
                html = await registeredPreview(kind).render({url, src, name: me.name, extension: me.extension, type: me.type, signal: controller.signal})
            }
        } catch (e) {
            console.warn('FilePreview', e);
            html = `<p class="go-empty">${escapeHtml(t('The file could not be loaded.'))}</p>`
        }

        // a newer file meanwhile: its own load shows it
        if (token !== me.loadToken || me.isDestroyed) {
            return
        }

        me.isLoading = false;
        content.html = html
    }

    /**
     * @summary Shows one of the parts: 'viewer', 'content', 'fallback' or none.
     * @param {String|null} part
     */
    showPart(part) {
        let me = this;

        ['viewer', 'content', 'fallback'].forEach(name => {
            me.getReference(name).toggleCls('go-hidden', name !== part)
        })
    }

    /**
     * @summary Downloads the file of the fallback.
     */
    onDownload() {
        let me = this;

        me.src && download(me.windowId, goUrl(me.src)).catch(e => console.warn('FilePreview', e))
    }

    /**
     * @summary Aborts a running fetch.
     * @param {...*} args
     */
    destroy(...args) {
        this.abortController?.abort();
        super.destroy(...args)
    }
}

export default Neo.setupClass(FilePreview);
