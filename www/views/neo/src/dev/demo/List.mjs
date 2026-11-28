import Button    from '../../button/Button.mjs';
import JmapStore from '../../data/JmapStore.mjs';
import GroupModel from '../../model/Group.mjs';
import CheckList from '../../list/CheckList.mjs';
import NavCheckList from '../../list/NavCheckList.mjs';
import TextList  from '../../list/TextList.mjs';
import Page, {h3, output, p, pageOf} from './Page.mjs';
import {escapeHtml} from '../../Format.mjs';
import {t}       from '../../Translate.mjs';

const GROUPS = {fruit: 'Fruit', vegetable: 'Vegetables', nut: 'Nuts'};

const FOOD = [
    ['Apple', 'fruit'], ['Banana', 'fruit'], ['Cherry', 'fruit'],
    ['Carrot', 'vegetable'], ['Leek', 'vegetable'],
    ['Almond', 'nut'], ['Cashew', 'nut'], ['Walnut', 'nut']
].map(([name, group], i) => ({id: i + 1, name, group}));

/**
 * @returns {Object[]} ten records with a random description
 */
function randomData() {
    return Array.from({length: 10}, (v, i) => ({
        id         : i + 1,
        description: `${i + 1}. ${(Math.random() + 1).toString(36).substring(7)} <b>not bold</b>`
    }))
}

/**
 * @summary Dev demo of the GO lists.
 *
 * GOUI List (goui-docs List.ts) with GO.list.TextList (escapes the display
 * field, group headers with groupField / groupRenderer, empty state) and
 * GO.list.CheckList (checkbox per row, row menu) and GO.list.NavCheckList
 * (west filter list: select all, search, checks kept across searches).
 * @class GO.dev.demo.List
 * @extends GO.dev.demo.Page
 */
class List extends Page {
    static config = {
        className: 'GO.dev.demo.List',
        heading  : t('List')
    }

    /**
     * @summary The demo lists.
     * @returns {Object[]}
     */
    pageItems() {
        const me   = this,
              card = {cls: ['go-card'], style: {margin: 0, maxWidth: '480px'}};

        return [
            p(t('A list renders the records of a store. GO.list.TextList renders the display field as text (escaped), so data from the server is safe in it.')),
            h3(t('A list with some random generated strings')),
            {
                module      : TextList,
                reference   : 'random',
                ...card,
                displayField: 'description',
                store       : {keyProperty: 'id', data: randomData()}
            },
            {
                module : Button,
                ui     : 'primary',
                text   : t('Regenerate store data'),
                style  : {alignSelf: 'start'},
                handler: data => {pageOf(data.component).getReference('random').store.data = randomData()}
            },
            h3(t('Grouping')),
            p(t('With groupField a header shows above each run of the same value; sort the store by that field first. Click an item.')),
            {
                module       : TextList,
                reference    : 'grouped',
                ...card,
                displayField : 'name',
                groupField   : 'group',
                groupRenderer: ({value}) => `<strong>${escapeHtml(t(GROUPS[value]))}</strong>`,
                store        : {keyProperty: 'id', sorters: [{property: 'group', direction: 'ASC'}, {property: 'name', direction: 'ASC'}], data: FOOD}
            },
            h3(t('Check list')),
            p(t('GO.list.CheckList: a checkbox per row, a click toggles the row; rowMenu adds a ⋮ menu per row (e.g. the note books of the notes module).')),
            {
                module      : CheckList,
                reference   : 'checks',
                ...card,
                displayField: 'name',
                store       : {keyProperty: 'id', data: FOOD.slice(0, 5)},
                rowMenu     : record => [
                    {text: t('Edit'), icon: 'edit', handler: () => me.log(`edit ${record.name}`)},
                    {text: t('Delete'), icon: 'delete', handler: () => me.log(`delete ${record.name}`)}
                ]
            },
            h3(t('Navigation check list')),
            p(t('GO.list.NavCheckList: the west filter list of a module (classic go.NavGrid) on JMAP groups, 5 per page. Select all, search, an Add button and a row menu; checks stay while a search hides them.')),
            {
                module   : NavCheckList,
                reference: 'nav',
                ...card,
                cls      : ['go-card', 'go-nav-check-list'],
                heading  : t('Groups'),
                buttons  : [{module: Button, icon: 'add', cls: ['small'], tooltip: t('Add'), handler: () => me.log('add')}],
                rowMenu  : record => [{text: t('Edit'), icon: 'edit', handler: () => me.log(`edit ${record.name}`)}],
                store    : {
                    module    : JmapStore,
                    entity    : 'Group',
                    model     : GroupModel,
                    pageSize  : 5,
                    scrollLoad: true,
                    properties: ['id', 'name'],
                    jmapSort  : [{property: 'name', isAscending: true}]
                }
            },
            h3(t('Empty state')),
            {
                module      : TextList,
                ...card,
                displayField: 'name',
                emptyText   : t('No items found'),
                store       : {keyProperty: 'id', data: []}
            },
            output()
        ]
    }

    /**
     * @summary Logs the clicks and checks of the lists.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('grouped').on('itemClick', ({record}) => me.log(`itemClick: ${record.name}`));
        const checks = me.getReference('checks');
        checks.selectionModel.on('selectionChange', () => me.log(`checked ids: ${JSON.stringify(checks.getCheckedIds())}`));
        me.getReference('nav').on('selectionChange', ({ids}) => me.log(`nav selectionChange: ${JSON.stringify(ids)}`))
    }
}

export default Neo.setupClass(List);
