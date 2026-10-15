import NeoHeaderButton from '../../node_modules/neo.mjs/src/grid/header/Button.mjs';

/**
 * Grid header button with a "more" (⋮) trigger; CSS shows it on the last column only.
 * A click on it opens the column chooser (GO.grid.Grid#showColumnMenu()).
 *
 * Also fixes neo 13 sorting on click with sortable: false.
 */
class HeaderButton extends NeoHeaderButton {
    static config = {
        className: 'GO.grid.HeaderButton',
        ntype    : 'go-grid-header-button'
    }

    construct(config) {
        super.construct(config);

        this.vdom.cn.push({tag: 'i', cls: ['go-icon', 'go-grid-header-trigger'], text: 'more_vert'});
        this.update()
    }

    /**
     * @param {Object} data
     * @protected
     */
    onClick(data) {
        if (data.path[0]?.cls?.includes('go-grid-header-trigger')) {
            Neo.getComponent(this.parentId)?.gridContainer?.showColumnMenu?.(this.id);
            return
        }

        if (this.sortable) {
            super.onClick(data)
        }
    }
}

export default Neo.setupClass(HeaderButton);
