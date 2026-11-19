import AutocompleteField from '../../form/field/AutocompleteField.mjs';
import FormDemo          from './FormDemo.mjs';

const COUNTRIES = {CZ: 'Czechia', DE: 'Germany', NL: 'Netherlands', AT: 'Austria', BE: 'Belgium', DK: 'Denmark'};

/**
 * Dev demo: GOUI AutocompleteField — over a JMAP entity (note books), and over a local
 * list with another value property (country codes).
 */
class AutocompleteDemo extends FormDemo {
    static config = {
        className: 'GO.dev.demo.Autocomplete',
        intro    : '<p>Type to get suggestions, Enter picks the first one, ▾ lists them all. Clearing the text clears the value.</p>',
        fields   : [{
            module   : AutocompleteField,
            name     : 'noteBookId',
            entity   : 'NoteBook',
            jmapSort : [{property: 'name', isAscending: true}],
            labelText: 'Note book (JMAP entity, value = id)',
            required : true
        }, {
            module       : AutocompleteField,
            name         : 'country',
            labelText    : 'Country (local list, value = code)',
            displayField : 'name',
            valueProperty: 'code',
            fetch        : async text => Object.entries(COUNTRIES)
                .map(([code, name]) => ({code, name}))
                .filter(({name}) => name.toLowerCase().includes(text.toLowerCase())),
            valueToText  : code => COUNTRIES[code] ?? null
        }],
        sample: {noteBookId: null, country: 'NL'}
    }
}

export default Neo.setupClass(AutocompleteDemo);
