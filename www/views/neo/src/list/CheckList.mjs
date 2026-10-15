import ListModel from '../../node_modules/neo.mjs/src/selection/ListModel.mjs';
import {escapeHtml} from '../Format.mjs';
import TextList    from './TextList.mjs';
import MenuList    from '../menu/List.mjs';
import {t} from '../Translate.mjs';

/**
 * GOUI table with a checkbox select column, a name and a row menu column, without
 * headers and row lines (e.g. the notebooks in the notes module's west panel).
 * Clicking a row toggles it.
 *
 *     {module: CheckList, displayField: 'name', rowMenu: record => [{text: 'Edit', icon: 'edit', handler}]}
 */
class CheckList extends TextList {
    static config = {
        className    : 'GO.list.CheckList',
        baseCls      : ['go-check-list', 'neo-list'],
        useInternalId: false,
        /**
         * Items of the row menu (GO.menu.List) for a record, null for none
         * @member {Function|null} rowMenu=null
         */
        rowMenu: null,
        selectionModel: {
            module       : ListModel,
            singleSelect : false,
            toggleOnClick: true
        }
    }

    createItemContent(record) {
        let content = [
            {tag: 'span', cls: ['go-check'], 'aria-hidden': true},
            {tag: 'span', cls: ['go-check-list-text'], html: escapeHtml(String(record[this.displayField] ?? ''))}
        ];

        if (this.rowMenu) {
            content.push({tag: 'i', cls: ['go-icon', 'go-row-menu'], text: 'more_vert', title: t('More options')})
        }

        return content
    }

    /**
     * Clicks on the row menu icon do not toggle the row
     */
    getInteractiveItemIndex(path) {
        if (path.some(node => node.cls?.includes('go-row-menu'))) {
            return undefined
        }

        return super.getInteractiveItemIndex(path)
    }

    onClick(data) {
        let me   = this,
            icon = data.path.find(node => node.cls?.includes('go-row-menu'));

        if (icon && me.rowMenu) {
            const itemNode = data.path.find(node => node.cls?.includes(me.itemCls)),
                  record   = itemNode && me.store.get(me.getItemRecordId(itemNode.id)),
                  items    = record && me.rowMenu(record);

            items?.length && MenuList.showAt({
                appName : me.appName,
                windowId: me.windowId,
                // GOUI: the menu's top right at the icon's bottom right
                target  : icon.id || itemNode.id,
                items
            });
            return
        }

        super.onClick(data)
    }

    /**
     * @returns {String[]} ids of the checked records
     */
    getCheckedIds() {
        return this.selectionModel.getSelection().map(itemId => String(this.getItemRecordId(itemId)))
    }
}

export default Neo.setupClass(CheckList);
