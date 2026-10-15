import List         from '../../node_modules/neo.mjs/src/list/Base.mjs';
import {escapeHtml} from '../Format.mjs';

/**
 * neo's List renders displayField as HTML. GO data (note book names etc.) is
 * text: escape it. Use as List, or in a ComboBox as listConfig: {module: TextList}.
 */
class TextList extends List {
    static config = {
        className: 'GO.list.TextList'
    }

    createItemContent(record) {
        return escapeHtml(String(record[this.displayField] ?? ''))
    }
}

export default Neo.setupClass(TextList);
