import List         from '../../../../../../../views/neo/node_modules/neo.mjs/src/list/Base.mjs';
import {escapeHtml} from '../../../../../../../views/neo/src/Format.mjs';

/**
 * go.NavMenu: a single-select list of views with a coloured Material icon per item,
 * e.g. "All contacts", "Starred". Items: {id, name, icon, color}.
 */
class NavList extends List {
    static config = {
        className    : 'GO.addressbook.view.NavList',
        baseCls      : ['go-nav-list', 'neo-list'],
        useInternalId: false,
        displayField : 'name'
    }

    createItemContent(record) {
        return [
            {tag: 'i', cls: ['go-icon', 'go-nav-icon', record.color ? 'go-nav-' + record.color : ''].filter(Boolean), text: record.icon || ''},
            {tag: 'span', cls: ['go-nav-text'], html: escapeHtml(String(record.name ?? ''))}
        ]
    }
}

export default Neo.setupClass(NavList);
