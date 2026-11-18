import Base      from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';
import DomEvents from '../../../node_modules/neo.mjs/src/main/DomEvents.mjs';

/**
 * Main thread side of image zoom (GOUI Image.enableZoom()): a click on an image
 * inside an element with the class "go-image-zoom" sends the custom DOM event
 * "imageZoom" {src, alt} to the App worker, see GO.view.ImageWindow enableImageZoom().
 *
 * The rendered HTML is not changed: the image is found here, on the live DOM.
 *
 * Loaded per window: await Neo.Main.importAddon({name: 'WS/ImageZoom', windowId})
 */
class ImageZoom extends Base {
    static config = {
        className: 'GO.main.addon.ImageZoom',
        // no library files to load
        preloadFilesDelay: false
    }

    construct(config) {
        super.construct(config);

        document.addEventListener('click', e => this.onClick(e))
    }

    /**
     * @param {MouseEvent} e
     */
    onClick(e) {
        const img  = e.target?.closest?.('img'),
              root = img?.closest('.go-image-zoom');

        if (!root || !img.getAttribute('src')) {
            return
        }

        DomEvents.sendMessageToApp({
            // the component that rendered the content
            id  : root.closest('[id]')?.id,
            path: DomEvents.getPathFromElement(img).map(el => DomEvents.getTargetData(el)),
            type: 'imageZoom',
            src : img.getAttribute('src'),
            alt : img.getAttribute('alt') || ''
        })
    }
}

export default Neo.setupClass(ImageZoom);
