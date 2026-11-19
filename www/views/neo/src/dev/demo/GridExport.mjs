import Button             from '../../button/Button.mjs';
import Container          from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar            from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import JmapStore          from '../../data/JmapStore.mjs';
import {exportEntities, exportMenuItem} from '../../export/exportEntities.mjs';
import Grid               from '../../grid/Grid.mjs';
import MultiSelectToolbar from '../../grid/MultiSelectToolbar.mjs';
import MenuList           from '../../menu/List.mjs';
import {escapeHtml, formatUserDateTime} from '../../Format.mjs';

/**
 * Dev demo: the reusable grid export on the user's notes. ⋮ → Export exports what the
 * grid shows; spreadsheets and HTML ask for the columns first. With two or more rows
 * selected the MultiSelectToolbar exports only those.
 */
class GridExportDemo extends Container {
    static config = {
        className: 'GO.dev.demo.GridExport',
        layout   : {ntype: 'vbox', align: 'stretch'},
        style    : {padding: '16px', gap: '12px'}
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype: 'component',
            flex : 'none',
            html : '<p>Notes of the user. ⋮ → Export exports the grid\'s query (Excel, CSV and HTML ask for the columns). ' +
                   'Select two or more rows (ctrl/⌘ + click) to export only those as JSON.</p>'
        }, {
            ntype : 'container',
            flex  : 1,
            layout: {ntype: 'vbox', align: 'stretch'},
            style : {maxWidth: '720px'},
            items : [{
                ntype: 'container',
                flex : 'none',
                cls  : ['go-mstb-host'],
                items: [{
                    module: Toolbar,
                    cls   : ['go-bg-mid', 'go-border-bottom'],
                    items : [{ntype: 'component', tag: 'h3', text: 'Notes'}, '->', {
                        module   : Button,
                        icon     : 'more_vert',
                        reference: 'moreButton',
                        handler  : () => me.showMoreMenu()
                    }]
                }, {
                    module   : MultiSelectToolbar,
                    reference: 'mstb',
                    items    : [{
                        module : Button,
                        icon   : 'cloud_download',
                        tooltip: 'Export selected (JSON)',
                        handler: () => me.exportSelected()
                    }]
                }]
            }, {
                module     : Grid,
                reference  : 'grid',
                flex       : 1,
                multiSelect: true,
                store      : {
                    module    : JmapStore,
                    entity    : 'Note',
                    model     : {keyProperty: 'id', fields: [{name: 'id', type: 'String'}, {name: 'name', type: 'String'}, {name: 'modifiedAt', type: 'String'}]},
                    pageSize  : 50,
                    sorters   : [{property: 'name', direction: 'ASC'}],
                    properties: ['id', 'name', 'modifiedAt']
                },
                columns: [
                    {dataField: 'name', text: 'Name', flex: 1, renderer: ({record}) => escapeHtml(record.name)},
                    {dataField: 'modifiedAt', text: 'Modified at', width: 200, renderer: ({value}) => escapeHtml(value ? formatUserDateTime(value) : '')}
                ]
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me   = this,
            grid = me.getReference('grid');

        me.getReference('mstb').setGrid(grid);
        grid.store.load().catch(e => console.error(e))
    }

    showMoreMenu() {
        let me = this;

        MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : me.getReference('moreButton').id,
            items   : [exportMenuItem(me, {entity: 'Note', store: me.getReference('grid').store, formats: ['xlsx', 'csv', 'html', 'json']})]
        })
    }

    exportSelected() {
        exportEntities(this, {entity: 'Note', extension: 'json', ids: this.getReference('grid').getSelectedRecords().map(r => r.id)})
    }
}

export default Neo.setupClass(GridExportDemo);
