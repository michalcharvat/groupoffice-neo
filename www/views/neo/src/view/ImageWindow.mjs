import Dialog, {headerTools} from './Dialog.mjs';
import {escapeHtml}          from '../Format.mjs';
import {t}                   from '../Translate.mjs';

/**
 * Large image in a modal window (GOUI Image.showWindow()), opened by clicking an image
 * of zoomable content, see enableImageZoom().
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

/** components that listen to imageZoom already */
const zoomComponents = new WeakSet();

/**
 * Images inside an element with the class "go-image-zoom" in the component's HTML open
 * large on click (GOUI Image.enableZoom()). The main thread addon WS/ImageZoom finds the
 * clicked image, so the HTML is not changed. Call it again after the component moved
 * to another window (the addon is loaded per window).
 *
 *     body.html = `<div class="go-image-zoom">${html}</div>`;
 *     enableImageZoom(body)
 * @param {Neo.component.Base} component
 * @returns {Promise<void>}
 */
export async function enableImageZoom(component) {
    if (!zoomComponents.has(component)) {
        zoomComponents.add(component);

        component.addDomListeners({
            imageZoom: data => ImageWindow.show({
                alt     : String(data.alt || ''),
                appName : component.appName,
                src     : String(data.src || ''),
                windowId: component.windowId
            })
        })
    }

    try {
        await Neo.Main.importAddon({name: 'WS/ImageZoom', windowId: component.windowId})
    } catch (e) {
        console.error('Image zoom', e)
    }
}
