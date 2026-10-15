import Button             from '../../button/Button.mjs';
import Component          from '../../../node_modules/neo.mjs/src/component/Base.mjs';
import Container          from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Grid               from '../../grid/Grid.mjs';
import MultiSelectToolbar from '../../grid/MultiSelectToolbar.mjs';
import Store              from '../../../node_modules/neo.mjs/src/data/Store.mjs';
import Toolbar            from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import {escapeHtml}       from '../../Format.mjs';

const NAMES = ['Anna', 'Bert', 'Carla', 'Dirk', 'Eva', 'Frank', 'Greta', 'Hugo', 'Ines', 'Jan'];

/**
 * Dev demo: GOUI Table with multiSelect + MultiSelectToolbar — ctrl/⌘ + click toggles a
 * row, shift + click selects a range; from two rows the overlay toolbar shows.
 */
class MultiSelectDemo extends Container {
    static config = {
        className: 'GO.dev.demo.MultiSelect',
        layout   : {ntype: 'vbox', align: 'stretch'},
        style    : {padding: '16px', gap: '12px'},
        items    : [{
            ntype: 'component',
            flex : 'none',
            html : '<p>Click a row, ctrl/⌘ + click more rows, shift + click a range. From two selected rows the ' +
                   'MultiSelectToolbar covers the toolbar; ‹ clears the selection.</p>'
        }, {
            ntype : 'container',
            flex  : 1,
            cls   : ['go-dev-multiselect'],
            layout: {ntype: 'vbox', align: 'stretch'},
            style : {maxWidth: '640px'},
            items : [{
                ntype : 'container',
                flex  : 'none',
                cls   : ['go-mstb-host'],
                items : [{
                    module: Toolbar,
                    cls   : ['go-bg-mid', 'go-border-bottom'],
                    items : [{ntype: 'component', tag: 'h3', text: 'People'}, '->', {
                        module : Button,
                        text   : 'Select all',
                        handler: data => data.component.up({className: 'GO.dev.demo.MultiSelect'}).getReference('grid').view.selectionModel.selectAll()
                    }]
                }, {
                    module   : MultiSelectToolbar,
                    reference: 'mstb',
                    items    : [{
                        module : Button,
                        icon   : 'delete',
                        tooltip: 'Delete',
                        handler: data => data.component.up({className: 'GO.dev.demo.MultiSelect'}).onDelete()
                    }]
                }]
            }, {
                module     : Grid,
                reference  : 'grid',
                flex       : 1,
                multiSelect: true,
                store      : {
                    module     : Store,
                    keyProperty: 'id',
                    model      : {fields: [{name: 'id', type: 'Integer'}, {name: 'name', type: 'String'}, {name: 'age', type: 'Integer'}]},
                    data       : NAMES.map((name, i) => ({id: i + 1, name, age: 20 + i * 3}))
                },
                columns: [
                    {dataField: 'name', text: 'Name', flex: 1},
                    {dataField: 'age', text: 'Age', width: 100, cellAlign: 'right'}
                ]
            }]
        }, {
            module   : Component,
            reference: 'output',
            flex     : 'none',
            tag      : 'pre',
            cls      : ['go-dev-output'],
            html     : ''
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me   = this,
            grid = me.getReference('grid');

        me.getReference('mstb').setGrid(grid);
        grid.view.selectionModel.on('selectionChange', ({records, record}) => {
            me.getReference('output').html = escapeHtml(`selectionChange: ${records.map(r => r.name).join(', ')}` + (record ? ` (clicked ${record.name})` : ''))
        })
    }

    onDelete() {
        let grid    = this.getReference('grid'),
            records = grid.getSelectedRecords();

        grid.view.selectionModel.clear();
        grid.store.remove(records)
    }
}

export default Neo.setupClass(MultiSelectDemo);
