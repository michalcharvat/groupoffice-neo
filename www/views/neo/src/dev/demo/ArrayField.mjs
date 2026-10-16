import ArrayField     from '../../form/field/ArrayField.mjs';
import Button         from '../../button/Button.mjs';
import ContainerField from '../../form/field/ContainerField.mjs';
import FormDemo       from './FormDemo.mjs';
import TextField      from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';

/**
 * Dev demo: GOUI form/ArrayFieldPage + ContainerFieldPage — e-mail addresses as an
 * ArrayField of ContainerField rows, an address as one ContainerField.
 */
class ArrayFieldDemo extends FormDemo {
    static config = {
        className: 'GO.dev.demo.ArrayField',
        intro    : '<p>ContainerField: child fields give one object value. ArrayField: one row field per ' +
                   'array item (buildField). The form sees only the outer field (src/form/nestedFields.mjs).</p>',
        fields   : [{
            module   : TextField,
            name     : 'name',
            labelText: 'Name',
            labelPosition: 'inline'
        }, {
            module: ContainerField,
            name  : 'address',
            style : {gap: '8px'},
            items : [
                {module: TextField, name: 'street', labelText: 'Street', labelPosition: 'inline', flex: 2},
                {module: TextField, name: 'city', labelText: 'City', labelPosition: 'inline', flex: 1, required: true}
            ]
        }, {
            module    : ArrayField,
            name      : 'emailAddresses',
            reference : 'emails',
            style     : {gap: '8px'},
            buildField: () => ({
                module: ContainerField,
                style : {gap: '8px'},
                items : [
                    {module: TextField, name: 'type', labelText: 'Type', labelPosition: 'inline', width: 120},
                    {module: TextField, name: 'email', labelText: 'E-mail', labelPosition: 'inline', flex: 1, inputType: 'email'},
                    ArrayField.removeButton()
                ]
            })
        }, {
            module : Button,
            ui     : 'secondary',
            icon   : 'add',
            text   : 'Add e-mail address',
            flex   : 'none',
            style  : {alignSelf: 'start'},
            // the form (the button's parent) holds the ArrayField
            handler: data => data.component.parent.getReference('emails').addValue({type: 'work', email: ''})
        }],
        sample: {
            name          : 'Jane Doe',
            address       : {street: 'Main street 1', city: 'Utrecht'},
            emailAddresses: [{type: 'work', email: 'jane@example.com'}, {type: 'home', email: 'jane@home.example'}]
        }
    }
}

export default Neo.setupClass(ArrayFieldDemo);
