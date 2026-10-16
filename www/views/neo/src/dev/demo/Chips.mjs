import AutocompleteChips from '../../form/field/AutocompleteChips.mjs';
import ChipsField from '../../form/field/ChipsField.mjs';
import FormDemo   from './FormDemo.mjs';
import client     from '../../jmap/Client.mjs';

/**
 * Dev demo: GOUI form/ChipsFieldPage — plain text chips, and user ids shown by name
 * (textInputToValue / chipRenderer over JMAP), and AutocompleteChips over an entity.
 */
class ChipsDemo extends FormDemo {
    static config = {
        className: 'GO.dev.demo.Chips',
        intro    : '<p>Type and press Enter, "," or ";". Backspace in the empty input removes the last chip.</p>',
        fields   : [{
            module     : ChipsField,
            name       : 'tags',
            labelText  : 'Tags',
            placeholder: 'Add a tag…',
            required   : true
        }, {
            module          : ChipsField,
            name            : 'userIds',
            labelText       : 'Users (type a name, value = user id)',
            hint            : 'textInputToValue: User/query by text, chipRenderer: User/get displayName',
            textInputToValue: async text => {
                const {ids} = await client.call('User/query', {filter: {text}, limit: 1});
                return ids[0] ? Number(ids[0]) : null
            },
            chipRenderer: async id => {
                const [user] = await client.get('User', [String(id)], ['id', 'displayName']);
                return user?.displayName || '#' + id
            }
        }, {
            module   : AutocompleteChips,
            name     : 'noteBookIds',
            entity   : 'NoteBook',
            jmapSort : [{property: 'name', isAscending: true}],
            labelText: 'Note books (AutocompleteChips)',
            hint     : '▾ lists the entities (filtered by the typed text), Enter adds the first match'
        }],
        sample: {tags: ['red', 'green'], userIds: [1], noteBookIds: []}
    }
}

export default Neo.setupClass(ChipsDemo);
