import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';
import client         from '../../../../../../views/neo/src/jmap/Client.mjs';
import {translator}   from '../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'pdfeditor');

/**
 * Opens a PDF of the files module in the PDF.js editor (go.modules.community.pdfeditor.openPDF):
 * a new window that loads the file and saves it back through api/upload.php with the
 * session's CSRF token
 * @param {Object} options
 * @param {Object} options.file {id}
 * @param {Neo.component.Base} options.component the view that opens it
 */
function openPdf({file, component}) {
    const origin  = globalThis.location.origin,
          fileUrl = new URL(client.legacyUrl('files/file/download', {id: file.id}), origin).href,
          query   = new URLSearchParams({
              fileId        : file.id,
              security_token: client.constructor.securityToken(),
              CSRFToken     : client.csrfToken || '',
              file          : fileUrl
          });

    Neo.Main.windowOpen({
        url       : client.baseUrl + 'go/modules/community/pdfeditor/views/pdf.js/web/viewer.html?' + query,
        windowName: '_blank',
        windowId  : component.windowId
    })
}

ModuleRegistry.register({
    package   : 'community',
    name      : 'pdfeditor',
    title     : t('PDF editor'),
    iconCls   : 'fa fa-file-pdf',
    capability: 'go:community:pdfeditor',
    // the files module's "Open" / "Open with" (modules/files/views/neo/fileHandlers.mjs)
    fileHandlers: {
        'go\\modules\\community\\pdfeditor\\filehandler\\PdfFileHandler': openPdf
    }
});
