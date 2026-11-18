import Dialog, {headerTools} from './Dialog.mjs';
import {escapeHtml}          from '../Format.mjs';
import {t}                   from '../Translate.mjs';

/**
 * Large image in a modal window (GOUI Image.showWindow()), opened by clicking an image
 * of zoomable content, see zoomableImages().
 *
 *     ImageWindow.show({appName, windowId, src, alt})
 */
class ImageWindow extends Dialog {
    static config = {
        className   : 'GO.view.ImageWindow',
        cls         : ['go-image-window'],
        modal       : true,
        resizable   : true,
        headerConfig: headerTools('maximize', 'close'),
        // GOUI: the viewport minus 50px
        wrapperStyle: {height: 'calc(100vh - 50px)', left: '25px', top: '25px', width: 'calc(100vw - 50px)'},
        containerConfig: {
            layout: 'fit'
        },
        /**
         * @member {String} src=''
         */
        src: '',
        /**
         * Alt text, also the title
         * @member {String} alt=''
         */
        alt: ''
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.title = me.alt || t('Image');
        me.items = [{
            ntype: 'component',
            cls  : ['go-image-window-body'],
            html : `<img src="${escapeHtml(me.src)}" alt="${escapeHtml(me.alt)}">`
        }]
    }

    /**
     * @param {Object} config appName, windowId, src, alt
     * @returns {GO.view.ImageWindow}
     */
    static show(config) {
        return Neo.create(ImageWindow, config)
    }
}

export default Neo.setupClass(ImageWindow);

/**
 * Makes the images of (sanitised) HTML zoomable: each <img> gets the class
 * "go-zoomable" and data-zoom = its index in the returned list. Listen to clicks with
 * delegate '.go-zoomable' and open ImageWindow.show({...images[data.target.data.zoom]}).
 * @param {String} html sanitised HTML
 * @returns {{html: String, images: {src: String, alt: String}[]}}
 */
export function zoomableImages(html) {
    const images = [],
          // decoded attribute value of a sanitised tag
          attr   = (tag, name) => {
              const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
              return m ? (m[2] ?? m[3] ?? m[4] ?? '')
                  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : ''
          };

    html = String(html || '').replace(/<img\b[^>]*>/gi, tag => {
        const src = attr(tag, 'src');

        if (!src) {
            return tag
        }

        // the HTML parser keeps the first of duplicate attributes: these win over existing ones
        images.push({src, alt: attr(tag, 'alt')});
        return tag.replace(/^<img\b/i, `<img class="go-zoomable" data-zoom="${images.length - 1}"`)
    });

    return {html, images}
}
