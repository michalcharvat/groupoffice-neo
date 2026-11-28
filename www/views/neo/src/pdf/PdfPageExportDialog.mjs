import Button        from '../button/Button.mjs';
import Dialog, {headerTools} from '../view/Dialog.mjs';
import FormContainer from '../../node_modules/neo.mjs/src/form/Container.mjs';
import TextField     from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import Toolbar       from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import PdfViewer, {goUrl} from './PdfViewer.mjs';
import {download}    from '../download.mjs';
import {printUrl}    from '../print.mjs';
import {parsePageRange} from './pdfPages.mjs';
import {t}           from '../Translate.mjs';

/**
 * Pages of a PDF to print, download, save or e-mail (classic amd/libs PdfPageExportDialog): a page range (empty =
 * all pages) with thumbnails of the selection. The host builds the URL of the selected pages and handles save and
 * e-mail; their buttons show only with a handler. The range goes to the host as entered ("1-N" when empty), the
 * server parses it again (amd/dms util/PageRangeParser.php).
 *
 *     Neo.create(PdfPageExportDialog, {appName, windowId, src: downloadUrl, numPages,   // from the viewer's 'load'
 *         pageExportUrl: (range, inline) => client.apiUrl + 'page.php/amd/dms/pages?…&range=' + encodeURIComponent(range),
 *         saveHandler  : range => …,            // optional, e.g. a dialog to save the pages as a new document
 *         emailHandler : range => …})           // optional, e.g. attach the pages and Mail.showComposer()
 * @summary Page range of a PDF with thumbnails; print, download, save or e-mail the pages.
 * @class GO.pdf.PdfPageExportDialog
 * @extends GO.view.Dialog
 */
class PdfPageExportDialog extends Dialog {
    static config = {
        className   : 'GO.pdf.PdfPageExportDialog',
        modal       : true,
        headerConfig: headerTools('close'),
        title       : t('Print or export pages'),
        wrapperStyle: {height: '520px', left: 'calc(50vw - 300px)', top: 'calc(50vh - 260px)', width: '600px'},
        containerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'}
        },
        /**
         * URL of the PDF the thumbnails are drawn from (same origin)
         * @member {String|null} src=null
         */
        src: null,
        /**
         * Pages of the PDF (the 'load' event of GO.pdf.PdfViewer has them)
         * @member {Number} numPages=0
         */
        numPages: 0,
        /**
         * (range, inline) => URL of the selected pages as one PDF; inline for printing, else an attachment
         * @member {Function|null} pageExportUrl=null
         */
        pageExportUrl: null,
        /**
         * (range) => void: adds "Save as" as the primary action
         * @member {Function|null} saveHandler=null
         */
        saveHandler: null,
        /**
         * (range) => void: adds "Send by email"
         * @member {Function|null} emailHandler=null
         */
        emailHandler: null
    }

    /**
     * Counts range changes: only the latest updates the thumbnails
     * @member {Number} rangeToken=0
     */
    rangeToken = 0

    /**
     * @summary Builds the range field, the thumbnails and the action buttons.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            module   : FormContainer,
            reference: 'form',
            flex     : 'none',
            keys     : {Enter: () => me.onPrimary()},
            items    : [{
                module         : TextField,
                reference      : 'range',
                name           : 'range',
                labelText      : t('Page range'),
                labelPosition  : 'inline',
                placeholderText: t('All pages (e.g. 1,3,5-7)'),
                listeners      : {change: () => me.onRangeChange()}
            }, {
                ntype    : 'component',
                reference: 'error',
                cls      : ['go-form-error'],
                text     : ''
            }]
        }, {
            module   : PdfViewer,
            reference : 'thumbs',
            thumbnails: true,
            flex      : 1,
            pageScale : 1,
            zoom      : .25
        }, {
            module: Toolbar,
            cls   : ['go-dialog-buttons'],
            flex  : 'none',
            items : ['->', {
                module : Button,
                icon   : 'print',
                text   : t('Print'),
                handler: () => me.onPrint()
            }, {
                module : Button,
                icon   : 'download',
                text   : t('Download'),
                ...(me.saveHandler ? {} : {ui: 'primary'}),
                handler: () => me.onDownload()
            }, {
                module : Button,
                icon   : 'mail',
                text   : t('Send by email'),
                hidden : !me.emailHandler,
                handler: () => me.onHandler(me.emailHandler)
            }, {
                module : Button,
                icon   : 'save',
                ui     : 'primary',
                text   : t('Save as'),
                hidden : !me.saveHandler,
                handler: () => me.onHandler(me.saveHandler)
            }]
        }]
    }

    /**
     * @summary Shows the thumbnails of all pages.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('thumbs').pages = me.allPages();
        me.getReference('thumbs').setSource(me.src, 'application/pdf')
    }

    /**
     * @summary Every page of the document.
     * @returns {Number[]}
     */
    allPages() {
        return Array.from({length: this.numPages}, (_, i) => i + 1)
    }

    /**
     * @summary The range as entered, "1-N" when empty.
     * @returns {String}
     */
    getRangeString() {
        const value = String(this.getReference('range').value ?? '').trim();

        return value || '1-' + this.numPages
    }

    /**
     * @summary The pages of the range; shows the error and returns null when it is invalid.
     * @returns {Number[]|null}
     */
    getValidPages() {
        const pages = parsePageRange(this.getRangeString(), this.numPages);

        this.getReference('error').text = pages ? '' : t('Invalid page range');

        return pages
    }

    /**
     * @summary Updates the thumbnails half a second after the last change of a valid range.
     */
    async onRangeChange() {
        let me    = this,
            token = ++me.rangeToken;

        await me.timeout(500);

        if (me.isDestroyed || token !== me.rangeToken) {
            return
        }

        const pages = me.getValidPages();

        if (pages) {
            me.getReference('thumbs').pages = pages
        }
    }

    /**
     * @summary Enter: save when the host saves, else download.
     */
    onPrimary() {
        this.saveHandler ? this.onHandler(this.saveHandler) : this.onDownload()
    }

    /**
     * @summary Prints the selected pages; the dialog stays open (the print dialog opens over it).
     */
    async onPrint() {
        let me = this;

        if (me.getValidPages()) {
            await printUrl(me.windowId, goUrl(me.pageExportUrl(me.getRangeString(), true)))
        }
    }

    /**
     * @summary Downloads the selected pages and closes.
     */
    async onDownload() {
        let me = this;

        if (me.getValidPages()) {
            const {windowId} = me,
                  url        = goUrl(me.pageExportUrl(me.getRangeString(), false));

            me.close();
            await download(windowId, url)
        }
    }

    /**
     * @summary Hands the range to a host handler (save, e-mail) and closes.
     * @param {Function} handler
     */
    onHandler(handler) {
        let me = this;

        if (me.getValidPages()) {
            const range = me.getRangeString();

            me.close();
            handler(range)
        }
    }
}

export default Neo.setupClass(PdfPageExportDialog);
