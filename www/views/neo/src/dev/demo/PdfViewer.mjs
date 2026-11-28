import Button       from '../../button/Button.mjs';
import Container    from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import TextField    from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';
import UploadButton from '../../component/UploadButton.mjs';
import ExportDialog from '../../pdf/PdfPageExportDialog.mjs';
import Viewer       from '../../pdf/PdfViewer.mjs';
import client       from '../../jmap/Client.mjs';
import Page, {code, output, p} from './Page.mjs';

// a 14 page PDF that comes with the community/pdfeditor module, enough for the preview limit and page lists
const SAMPLE = 'go/modules/community/pdfeditor/views/pdf.js/web/compressed.tracemonkey-pldi-09.pdf';

/**
 * @summary Dev demo of GO.pdf.PdfViewer: a sample or an uploaded PDF or image, zoom and a page list.
 * @class GO.dev.demo.PdfViewer
 * @extends GO.dev.demo.Page
 */
class PdfViewerDemo extends Page {
    static config = {
        className: 'GO.dev.demo.PdfViewer',
        heading  : 'PDF viewer'
    }

    /**
     * @summary The viewer with buttons for its sources and a page list field.
     * @returns {Object[]}
     */
    pageItems() {
        return [
            p('GO.pdf.PdfViewer draws a PDF with pdf.js in a main thread addon (first 10 pages, or a page list) or shows an image. Pages are drawn when they scroll near the view. Zoom with the toolbar buttons.'),
            {
                module: Container,
                layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
                style : {gap: '8px'},
                items : [{
                    module : Button,
                    ui     : 'secondary',
                    text   : 'Sample PDF (14 pages)',
                    handler: 'up.onSample'
                }, {
                    module    : UploadButton,
                    reference : 'upload',
                    autoUpload: true,
                    multiple  : false,
                    accept    : '.pdf,image/*',
                    buttonText: 'Upload a PDF or image'
                }, {
                    module   : TextField,
                    reference: 'pagesField',
                    labelText: 'Pages',
                    width    : 360,
                    listeners: {change: 'up.onPagesChange'}
                }, {
                    module : Button,
                    ui     : 'secondary',
                    text   : 'Clear',
                    handler: 'up.onClear'
                }, {
                    module   : Button,
                    reference: 'exportButton',
                    ui       : 'secondary',
                    icon     : 'print',
                    text     : 'Print or export pages',
                    disabled : true,
                    handler  : 'up.onExport'
                }]
            },
            {
                module   : Viewer,
                reference: 'viewer',
                style    : {height: '600px', border: '1px solid var(--fg-border)'},
                listeners: {
                    load     : 'up.onViewerLoad',
                    loadError: 'up.onViewerError'
                }
            },
            output(),
            code(`{module: PdfViewer, reference: 'preview', toolbarItems: [{module: Button, text: t('Analyze'), handler: 'up.onAnalyze'}]}

preview.setSource(client.apiUrl + 'download.php?blob=' + blobId, 'application/pdf'); // or 'pdf', 'image/png', 'jpg' …; null clears
preview.pages = [3, 4, 5];                                    // null: the preview again
preview.on('load', ({numPages, title}) => …);                 // also 'loadError {error}'

// GO.pdf.PdfPageExportDialog: a page range with thumbnails; print and download the pages, save and e-mail by the host
Neo.create(PdfPageExportDialog, {appName, windowId, src, numPages,
    pageExportUrl: (range, inline) => client.apiUrl + '…&range=' + encodeURIComponent(range) + (inline ? '&inline=1' : ''),
    saveHandler  : range => …,     // optional: "Save as"
    emailHandler : range => …})    // optional: "Send by email"`)
        ]
    }

    /**
     * @summary Shows an uploaded file.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('upload').on('upload', ({blobs}) => {
            const blob = blobs[0];

            me.getReference('exportButton').disabled = true;
            blob && me.getReference('viewer').setSource(client.apiUrl + 'download.php?blob=' + encodeURIComponent(blob.id), blob.type)
        })
    }

    /**
     * @summary Loads the sample PDF.
     */
    onSample() {
        this.getReference('exportButton').disabled = true;
        this.getReference('viewer').setSource(SAMPLE, 'application/pdf')
    }

    /**
     * @summary Empties the viewer.
     */
    onClear() {
        this.getReference('exportButton').disabled = true;
        this.getReference('viewer').setSource(null)
    }

    /**
     * @summary A comma separated page list, empty for the preview.
     * @param {Object} data
     * @param {String} data.value
     */
    onPagesChange({value}) {
        this.getReference('viewer').pages = String(value || '').split(',').map(s => s.trim()).filter(Boolean)
    }

    /**
     * @summary Logs a loaded PDF.
     * @param {Object} data
     * @param {Number} data.numPages
     * @param {String} data.title
     */
    onViewerLoad({numPages, title}) {
        this.numPages = numPages;
        this.getReference('exportButton').disabled = false;
        this.log(`load: ${numPages} pages, "${title}"`)
    }

    /**
     * @summary Opens the page export dialog for the loaded PDF. Core has no page extraction, so print and download
     * get the whole PDF; save and e-mail only log the range.
     */
    onExport() {
        let me  = this,
            src = me.getReference('viewer').src;

        Neo.create(ExportDialog, {
            appName      : me.appName,
            windowId     : me.windowId,
            src,
            numPages     : me.numPages,
            pageExportUrl: (range, inline) => {
                me.log(`pageExportUrl("${range}", ${inline})`);
                // download.php sends a blob as an attachment unless inline: printing needs it inline
                return inline && src.includes('download.php') ? src + '&inline=1' : src
            },
            saveHandler : range => me.log(`saveHandler("${range}")`),
            emailHandler: range => me.log(`emailHandler("${range}")`)
        })
    }

    /**
     * @summary Logs a failed load.
     * @param {Object} data
     * @param {String} data.error
     */
    onViewerError({error}) {
        this.getReference('exportButton').disabled = true;
        this.log('loadError: ' + error)
    }
}

export default Neo.setupClass(PdfViewerDemo);
