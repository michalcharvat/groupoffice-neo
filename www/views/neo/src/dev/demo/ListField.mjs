import Store     from '../../../node_modules/neo.mjs/src/data/Store.mjs';
import JmapStore from '../../data/JmapStore.mjs';
import ListField from '../../form/field/ListField.mjs';
import {escapeHtml} from '../../Format.mjs';
import FormDemo  from './FormDemo.mjs';

const PRIORITIES = [
    {id: '1', name: 'High', color: 'C62828'},
    {id: '5', name: 'Normal', color: '1565C0'},
    {id: '9', name: 'Low', color: '2E7D32'}
];

/**
 * Dev demo: GOUI ListField — a JMAP store (note books, loaded when the menu opens) and a
 * local store with a renderValue that shows HTML.
 */
class ListFieldDemo extends FormDemo {
    static config = {
        className: 'GO.dev.demo.ListField',
        intro    : '<p>Click the box or ▾ to pick a record. The box shows the value through renderValue (HTML).</p>',
        fields   : [{
            module     : ListField,
            name       : 'noteBookId',
            labelText  : 'Note book (JmapStore, value = id)',
            placeholder: 'Pick a note book',
            required   : true,
            store      : {
                module    : JmapStore,
                entity    : 'NoteBook',
                model     : {fields: [{name: 'id', type: 'String'}, {name: 'name', type: 'String'}]},
                jmapSort  : [{property: 'name', isAscending: true}]
            }
        }, {
            module     : ListField,
            name       : 'priority',
            labelText  : 'Priority (local store, renderValue)',
            store      : {
                module     : Store,
                keyProperty: 'id',
                model      : {fields: [{name: 'id', type: 'String'}, {name: 'name', type: 'String'}, {name: 'color', type: 'String'}]},
                data       : PRIORITIES
            },
            renderValue: async id => {
                const priority = PRIORITIES.find(p => p.id === id);
                return priority
                    ? `<span class="go-dev-swatch" style="background:#${priority.color}"></span> ${escapeHtml(priority.name)}`
                    : escapeHtml(String(id))
            }
        }],
        sample: {noteBookId: null, priority: '1'}
    }
}

export default Neo.setupClass(ListFieldDemo);
