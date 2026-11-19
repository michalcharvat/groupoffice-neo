import Base from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';

/**
 * Main thread side of src/print.mjs: prints the rendered HTML of one element
 * (GOUI Component.print(), ExtJS Ext.Element.print()).
 *
 * The element is copied into a hidden iframe together with the page's style sheets
 * and the classes of its ancestors (theme selectors like `.neo-theme-go .x` keep
 * matching), so the page itself is not changed while the print dialog is open.
 * Buttons (except `.go-print-show`), inputs and `.go-print-hide` are left out,
 * scrolled content is printed in full and dark mode prints light.
 *
 * Loaded per window: await Neo.Main.importAddon({name: 'WS/Print', windowId})
 */
class Print extends Base {
    static config = {
        className: 'GO.main.addon.Print',
        // no library files to load
        preloadFilesDelay: false,
        remote: {
            app: ['print']
        }
    }

    /**
     * The iframe of the last print, removed after printing
     * @member {HTMLIFrameElement|null} frame=null
     */
    frame = null

    /**
     * The page title before the last print changed it, null when unchanged
     * @member {String|null} oldTitle=null
     */
    oldTitle = null

    /**
     * @param {Object} data
     * @param {String} data.id    DOM id of the element to print
     * @param {String} [data.title] document title, the file name when saving as PDF
     * @returns {Boolean} false when the element is not in this window
     */
    print({id, title}) {
        const el = document.getElementById(id);

        if (!el) {
            return false
        }

        this.removeFrame();

        const frame = this.frame = document.createElement('iframe');

        // not display: none or visibility: hidden, browsers print those empty
        frame.setAttribute('aria-hidden', 'true');
        frame.tabIndex = -1;
        frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';

        frame.addEventListener('load', () => this.printFrame(frame, title), {once: true});
        frame.srcdoc = this.buildHtml(el, title);
        document.body.appendChild(frame);

        return true
    }

    /**
     * @param {HTMLElement} el
     * @param {String} [title]
     * @returns {String} the iframe document
     */
    buildHtml(el, title) {
        const root      = document.documentElement,
              ancestors = [];

        for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
            ancestors.unshift(node.className)
        }

        // the colour scheme classes on body (src/Preferences.mjs): paper is light
        const bodyCls = [...document.body.classList].filter(c => c !== 'dark' && c !== 'system');

        bodyCls.includes('light') || bodyCls.push('light');

        let html = el.outerHTML;

        for (let i = ancestors.length - 1; i >= 0; i--) {
            html = `<div class="go-print-ancestor ${escapeAttr(ancestors[i])}">${html}</div>`
        }

        return '<!DOCTYPE html>' +
            `<html class="${escapeAttr(root.className)}" style="${escapeAttr(root.getAttribute('style') || '')}">` +
            '<head><meta charset="utf-8">' +
            `<base href="${escapeAttr(document.baseURI)}">` +
            `<title>${escapeText(title || document.title)}</title>` +
            this.styleSheetsHtml() +
            `<style>${PRINT_CSS}</style>` +
            '</head>' +
            `<body class="${escapeAttr(bodyCls.join(' '))}" style="${escapeAttr(document.body.getAttribute('style') || '')}">` +
            html +
            '</body></html>'
    }

    /**
     * The page's style sheets: links by URL, the others (also rules added with
     * insertRule(), which are not in a style element's text) by their rules
     * @returns {String}
     */
    styleSheetsHtml() {
        return Array.from(document.styleSheets).map(sheet => {
            const media = sheet.media?.mediaText ? ` media="${escapeAttr(sheet.media.mediaText)}"` : '';

            if (sheet.href) {
                return `<link rel="stylesheet" href="${escapeAttr(sheet.href)}"${media}>`
            }

            try {
                return `<style${media}>${Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n').replace(/<\/style/gi, '<\\/style')}</style>`
            } catch (e) {
                // a cross-origin sheet without href cannot be read
                return ''
            }
        }).join('')
    }

    /**
     * Prints once the iframe has loaded its style sheets and images
     * @param {HTMLIFrameElement} frame
     * @param {String} [title]
     */
    printFrame(frame, title) {
        const win = frame.contentWindow;

        if (!win || this.frame !== frame) {
            return
        }

        // Chrome names the PDF after the top document; replace characters not valid in file names
        if (title) {
            this.oldTitle = document.title;
            document.title = title.replace(':', '.').replace(/[/\\?%*|"<>]+/g, '-')
        }

        win.addEventListener('afterprint', () => {
            // after the dialog closed: Firefox and Safari return from print() before it did;
            // a newer print owns the frame and the title
            setTimeout(() => this.frame === frame && this.removeFrame(), 0)
        }, {once: true});

        win.focus();
        win.print()
    }

    /**
     * Ends the last print: removes its iframe and restores the page title
     */
    removeFrame() {
        if (this.oldTitle !== null) {
            document.title = this.oldTitle;
            this.oldTitle = null
        }

        this.frame?.remove();
        this.frame = null
    }
}

/**
 * Print layout: the content and its ancestors grow to their full height, controls are left out
 */
const PRINT_CSS = `
@page {margin: 10mm; size: auto;}
html, body {display: block !important; height: auto !important; overflow: visible !important; background: transparent !important; margin: 0 !important; padding: 0 !important;}
.go-print-ancestor {display: block !important; position: static !important; width: auto !important; height: auto !important; min-height: 0 !important; max-height: none !important; overflow: visible !important; padding: 0 !important; margin: 0 !important; border: 0 !important; box-shadow: none !important; background: transparent !important; transform: none !important;}
.go-print-ancestor > *, .go-print-ancestor > * * {overflow: visible !important; max-height: none !important;}
.go-print-ancestor > * {position: static !important; width: auto !important; height: auto !important; flex: none !important;}
button:not(.go-print-show), input, textarea, select, .go-print-hide {display: none !important;}
* {-webkit-print-color-adjust: exact; print-color-adjust: exact;}
`;

/**
 * @param {String} value
 * @returns {String}
 */
function escapeAttr(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/**
 * @param {String} value
 * @returns {String}
 */
function escapeText(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
}

export default Neo.setupClass(Print);
