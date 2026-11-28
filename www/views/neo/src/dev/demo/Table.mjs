import Grid      from '../../grid/Grid.mjs';
import MenuList  from '../../menu/List.mjs';
import Store     from '../../../node_modules/neo.mjs/src/data/Store.mjs';
import Page, {h3, output, p} from './Page.mjs';
import {escapeHtml} from '../../Format.mjs';
import {t}       from '../../Translate.mjs';

// the plain Group column (no renderer) shows these as text: GO.grid.Column escapes them
const GROUPS = ['Alpha', 'R&D', '<b>Gamma</b>'];

/**
 * @param {Number} count
 * @returns {Object[]} records with id, name, group, amount, createdAt
 */
function demoData(count) {
    return Array.from({length: count}, (v, i) => ({
        id       : i + 1,
        name     : `Item ${String(i + 1).padStart(3, '0')}`,
        group    : GROUPS[i % GROUPS.length],
        amount   : Math.round(((i * 37) % 100) * 1.25 * 100) / 100,
        createdAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
    }))
}

const MODEL = {keyProperty: 'id', fields: [
    // group untyped: neo's String type would strip the tag
    {name: 'id', type: 'Integer'}, {name: 'name', type: 'String'}, {name: 'group'},
    {name: 'amount', type: 'Number'}, {name: 'createdAt', type: 'String'}
]};

/**
 * Dev demo: GOUI Table (goui-docs Table.ts) with GO.grid.Grid: sorting, keyboard
 * navigation, (multi) row selection, the column chooser (⋮ in the last header, right
 * click on a header), remembered columns (stateId), a row menu column and group headers.
 */
class Table extends Page {
    static config = {
        className: 'GO.dev.demo.Table',
        heading  : t('Table')
    }

    pageItems() {
        const me   = this,
              card = {cls: ['go-card'], style: {margin: 0}};

        return [
            p(t('Tables support sorting, keyboard navigation and (multi) row selection. Right click a header to sort or to show / hide columns, or use ⋮ in the last header. Hidden columns and widths are remembered (stateId).')),
            {
                module     : Grid,
                reference  : 'playground',
                ...card,
                height     : 320,
                multiSelect: true,
                stateId    : 'go-dev-table-playground',
                store      : {module: Store, model: MODEL, data: demoData(200)},
                columns    : [
                    {dataField: 'id', text: t('ID'), width: 80, cellAlign: 'right', hideable: false},
                    {dataField: 'name', text: t('Name'), flex: 1, renderer: ({value}) => escapeHtml(value)},
                    {dataField: 'group', text: t('Group'), width: 120},
                    {dataField: 'amount', text: t('Amount'), width: 120, cellAlign: 'right', renderer: ({value}) => value.toFixed(2)},
                    {dataField: 'createdAt', text: t('Created at'), width: 140, hidden: true}
                ]
            },
            h3(t('Row menu')),
            p(t('A column renders a ⋮ icon; a click on it opens a GO.menu.List with MenuList.showAt().')),
            {
                module   : Grid,
                reference: 'menuGrid',
                ...card,
                height   : 240,
                store    : {module: Store, model: MODEL, data: demoData(10)},
                columns  : [
                    {dataField: 'id', text: t('ID'), width: 80, cellAlign: 'right'},
                    {dataField: 'name', text: t('Name'), flex: 1, renderer: ({value}) => escapeHtml(value)},
                    {dataField: 'more', text: '', width: 50, sortable: false, hideable: false,
                        renderer: ({record}) => `<i class="go-icon go-dev-more" id="${me.id}__more__${record.id}" title="${escapeHtml(t('More options'))}">more_vert</i>`}
                ]
            },
            h3(t('Grouped')),
            p(t('groupBy shows a header above the first row of each group, while the store\'s first sorter is the group field.')),
            {
                module       : Grid,
                reference    : 'grouped',
                ...card,
                height       : 300,
                groupBy      : 'group',
                groupRenderer: ({value}) => `<strong>${escapeHtml(value)}</strong>`,
                store        : {module: Store, model: MODEL, data: demoData(15),
                    sorters: [{property: 'group', direction: 'ASC'}, {property: 'name', direction: 'ASC'}]},
                columns      : [
                    {dataField: 'id', text: t('ID'), width: 80, cellAlign: 'right'},
                    {dataField: 'name', text: t('Name'), flex: 1, renderer: ({value}) => escapeHtml(value)},
                    {dataField: 'createdAt', text: t('Created at'), width: 140}
                ]
            },
            h3(t('Empty state')),
            {
                module   : Grid,
                reference: 'empty',
                ...card,
                height   : 160,
                emptyText: t('No items found'),
                store    : {module: Store, model: MODEL, data: []},
                columns  : [{dataField: 'name', text: t('Name'), flex: 1}]
            },
            output()
        ]
    }

    onConstructed() {
        super.onConstructed();

        let me         = this,
            playground = me.getReference('playground'),
            menuGrid   = me.getReference('menuGrid');

        playground.view.selectionModel.on('selectionChange', ({records}) => {
            me.log(`selection: ${(records || []).map(r => r.name).join(', ')}`)
        });

        menuGrid.addDomListeners([{click: me.onMoreClick, delegate: '.go-dev-more', scope: me}])
    }

    destroy(...args) {
        // neo's grids leave their stores alive: destroy them after the grids
        const stores = ['playground', 'menuGrid', 'grouped', 'empty'].map(ref => this.getReference(ref)?.store);

        super.destroy(...args);
        stores.forEach(store => store?.destroy?.())
    }

    onMoreClick(data) {
        let me     = this,
            grid   = me.getReference('menuGrid'),
            row    = data.path?.find(node => node.cls?.includes('neo-grid-row') && node.data?.recordId),
            record = row && grid.store.get(row.data.recordId);

        record && MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : data.path[0]?.id,
            items   : [
                {text: t('Edit'), icon: 'edit', handler: () => me.log(`edit ${record.name}`)},
                {text: t('Delete'), icon: 'delete', handler: () => me.log(`delete ${record.name}`)}
            ]
        })
    }
}

export default Neo.setupClass(Table);
