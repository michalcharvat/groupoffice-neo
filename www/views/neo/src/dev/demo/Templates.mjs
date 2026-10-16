import Container         from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import EmailTemplateGrid from '../../emailtemplate/EmailTemplateGrid.mjs';
import PdfTemplateGrid   from '../../pdftemplate/PdfTemplateGrid.mjs';

// templates of this demo: the core module with an own key, nothing a module uses
const MODULE = {package: 'core', name: 'core'},
      KEY    = 'neo-dev-demo';

/**
 * Dev demo: the e-mail and PDF template lists of a module (GO.emailtemplate.EmailTemplateGrid,
 * GO.pdftemplate.PdfTemplateGrid) over the core module with the key "neo-dev-demo".
 */
class TemplatesDemo extends Container {
    static config = {
        className: 'GO.dev.demo.Templates',
        cls      : ['go-dev-templates'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module        : EmailTemplateGrid,
            title         : 'E-mail templates',
            templateModule: MODULE,
            key           : KEY,
            flex          : 'none'
        }, {
            module        : PdfTemplateGrid,
            title         : 'PDF templates',
            templateModule: MODULE,
            key           : KEY,
            flex          : 'none'
        }]
    }
}

export default Neo.setupClass(TemplatesDemo);
