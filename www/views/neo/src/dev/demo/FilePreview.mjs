import Button       from '../../button/Button.mjs';
import Container    from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import UploadButton from '../../component/UploadButton.mjs';
import Preview      from '../../preview/FilePreview.mjs';
import client       from '../../jmap/Client.mjs';
import Page, {code, p} from './Page.mjs';

// files the neo client serves anyway, one per kind
const SAMPLES = [
    {text: 'PDF',      file: {src: 'go/modules/community/pdfeditor/views/pdf.js/web/compressed.tracemonkey-pldi-09.pdf', name: 'tracemonkey.pdf'}},
    {text: 'Image',    file: {src: 'views/neo/resources/images/reminder.png', name: 'reminder.png'}},
    {text: 'Text',     file: {src: 'views/neo/package.json', name: 'package.json'}},
    {text: 'Markdown', file: {src: 'views/neo/README.md', name: 'README.md'}},
    {text: 'Audio',    file: {src: 'views/neo/resources/sounds/dialog-question.mp3', name: 'dialog-question.mp3'}},
    {text: 'No preview', file: {src: 'views/neo/package.json', name: 'archive.zip'}}
];

/**
 * @summary Dev demo of GO.preview.FilePreview: a sample file per kind or an uploaded file.
 * @class GO.dev.demo.FilePreview
 * @extends GO.dev.demo.Page
 */
class FilePreviewDemo extends Page {
    static config = {
        className: 'GO.dev.demo.FilePreview',
        heading  : 'File preview'
    }

    /**
     * @summary The preview with a button per sample and an upload button.
     * @returns {Object[]}
     */
    pageItems() {
        return [
            p('GO.preview.FilePreview picks the preview by extension (or the name\'s, or the MIME type): PDF and image in GO.pdf.PdfViewer, text, Markdown, audio, video, kinds added with registerPreview(), otherwise a Download button.'),
            {
                module: Container,
                layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'},
                style : {gap: '8px'},
                items : [...SAMPLES.map(({text, file}) => ({
                    module : Button,
                    ui     : 'secondary',
                    text,
                    handler: () => this.getReference('preview').setFile(file)
                })), {
                    module    : UploadButton,
                    reference : 'upload',
                    autoUpload: true,
                    multiple  : false,
                    buttonText: 'Upload a file'
                }, {
                    module : Button,
                    ui     : 'secondary',
                    text   : 'Clear',
                    handler: () => this.getReference('preview').setFile(null)
                }]
            },
            {
                module   : Preview,
                reference: 'preview',
                style    : {height: '600px', border: '1px solid var(--fg-border)'}
            },
            code(`{module: FilePreview, reference: 'preview', flex: 1}

preview.setFile({src: client.apiUrl + 'download.php?blob=' + blobId, name: 'Report.pdf'}); // or extension, type
preview.setFile({src, extension: 'md', htmlUrl});   // Markdown the host renders and trusts, in a frame
preview.setFile(null);

// src/preview/previewKinds.mjs
registerPreview('sheet', {extensions: ['xls', 'xlsx'], render: async ({url}) => sanitizedHtml});`)
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

            blob && me.getReference('preview').setFile({
                src : client.apiUrl + 'download.php?blob=' + encodeURIComponent(blob.id),
                name: blob.name,
                type: blob.type
            })
        })
    }
}

export default Neo.setupClass(FilePreviewDemo);
