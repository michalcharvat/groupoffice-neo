import Base from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';

/**
 * @summary Main thread side of the grid overflow tooltips (GOUI Table overflowTooltip): hovering a
 * GO.grid.Grid cell or header whose text is cut off shows the full text as its title.
 *
 * Measured on the live DOM at each hover, so resized columns and rows that neo's buffered grid
 * reuses for another record are taken into account. A title set by a renderer is never changed.
 *
 * Loaded per window by GO.grid.Grid: await Neo.Main.importAddon({name: 'WS/OverflowTooltip', windowId})
 */
class OverflowTooltip extends Base {
    static config = {
        className: 'GO.main.addon.OverflowTooltip',
        // no library files to load
        preloadFilesDelay: false
    }

    /**
     * @summary Listens to mouseover on the whole document.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        document.addEventListener('mouseover', e => this.onMouseOver(e))
    }

    /**
     * @summary Sets or clears the title of the hovered element and its ancestors up to the cell.
     * @param {MouseEvent} e
     */
    onMouseOver(e) {
        // a header: only its text, the ⋮ trigger makes the button itself overflow
        const root = e.target?.closest?.('.go-grid .neo-grid-cell, .go-grid .neo-grid-header-button > .neo-button-text');

        const path = [];

        for (let el = root && e.target; el; el = el === root ? null : el.parentElement) {
            // a title the renderer set, also an empty one (ours is remembered in the data attribute)
            if (el.hasAttribute('title') && el.title !== el.dataset?.overflowTitle) {
                return
            }

            path.push(el)
        }

        for (const el of path) {
            // innerText is undefined on SVG elements
            const text = (el.innerText || '').trim();

            if (text && el.scrollWidth > el.clientWidth) {
                el.title                 = text;
                el.dataset.overflowTitle = text;
                return
            }

            if (el.dataset?.overflowTitle !== undefined) {
                el.removeAttribute('title');
                delete el.dataset.overflowTitle
            }
        }
    }
}

export default Neo.setupClass(OverflowTooltip);
