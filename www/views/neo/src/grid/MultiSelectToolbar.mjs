import Button  from '../button/Button.mjs';
import Toolbar from '../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {t}     from '../Translate.mjs';

/**
 * GOUI MultiSelectToolbar: overlays a grid's toolbar while two or more rows are
 * selected: back (clears the selection), "N selected", then the given actions.
 *
 * Put it next to the toolbar it covers, in a container with the class "go-mstb-host"
 * (position: relative), and bind the grid once both exist:
 *
 *     {ntype: 'container', cls: ['go-mstb-host'], items: [tbar, {
 *         module: MultiSelectToolbar, reference: 'mstb',
 *         items : [{module: Button, icon: 'delete', handler: 'up.onDeleteSelected'}]
 *     }]}
 *     mstb.setGrid(grid) // grid: GO.grid.Grid with multiSelect: true (`bind` is a neo config)
 *
 * Fires `show` / `hide` ({count}).
 */
class MultiSelectToolbar extends Toolbar {
    static config = {
        className: 'GO.grid.MultiSelectToolbar',
        ntype    : 'go-multiselect-toolbar',
        baseCls  : ['go-multiselect-toolbar', 'neo-toolbar'],
        hidden   : true,
        /**
         * Rows needed to show it (GOUI: 2)
         * @member {Number} minSelected=2
         */
        minSelected: 2
    }

    /** @member {GO.grid.Grid|null} grid=null */
    grid = null

    construct(config) {
        const actions = config.items || [];

        super.construct({
            ...config,
            items: [{
                module   : Button,
                reference: 'back',
                icon     : 'chevron_left',
                tooltip  : t('Back'),
                handler  : () => this.grid?.view.selectionModel.clear?.()
            }, {
                ntype    : 'component',
                reference: 'label',
                tag      : 'h3',
                cls      : ['go-multiselect-label'],
                text     : ''
            }, '->', ...actions]
        })
    }

    /**
     * @param {GO.grid.Grid} grid
     */
    setGrid(grid) {
        let me = this;

        me.grid?.view.selectionModel.un('selectionChange', me.onSelectionChange, me);
        me.grid = grid;
        grid.view.selectionModel.on('selectionChange', me.onSelectionChange, me);
        me.onSelectionChange({records: grid.getSelectedRecords()})
    }

    destroy(...args) {
        this.grid?.isDestroyed === false && this.grid.view?.selectionModel?.un('selectionChange', this.onSelectionChange, this);
        super.destroy(...args)
    }

    onSelectionChange({records}) {
        let me     = this,
            count  = (records || []).filter(Boolean).length,
            hidden = count < me.minSelected;

        me.getReference('label').text = count + ' ' + t('selected');

        if (hidden !== me.hidden) {
            me.hidden = hidden;
            me.fire(hidden ? 'hide' : 'show', {count})
        }
    }
}

export default Neo.setupClass(MultiSelectToolbar);
