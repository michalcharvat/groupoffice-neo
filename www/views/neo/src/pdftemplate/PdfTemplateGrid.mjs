import EmailTemplateGrid from '../emailtemplate/EmailTemplateGrid.mjs';

/**
 * The PDF templates of a module (go.pdftemplate.GridPanel): like the e-mail template list.
 *
 *     {module: PdfTemplateGrid, templateModule: {package: 'business', name: 'finance'}, key: '3'}
 */
class PdfTemplateGrid extends EmailTemplateGrid {
    static config = {
        className: 'GO.pdftemplate.PdfTemplateGrid',
        entity   : 'PdfTemplate'
    }

    loadDialog() {
        return import('./PdfTemplateDialog.mjs')
    }
}

export default Neo.setupClass(PdfTemplateGrid);
