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
                   'array item (buildField). The form sees only the outer field (src/form/nestedFields.mjs). ' +
                   'sortable: true: drag a row by its handle; the chapters each sort their own documents.</p>',
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
            sortable  : true,
            buildField: () => ({
                module: ContainerField,
                style : {gap: '8px'},
                items : [
                    ArrayField.dragHandle(),
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
        }, {
            module    : ArrayField,
            name      : 'chapters',
            sortable  : true,
            style     : {gap: '8px'},
            // a sortable ArrayField in each row of another
            buildField: () => ({
                module: ContainerField,
                layout: {ntype: 'vbox', align: 'stretch'},
                style : {gap: '4px'},
                items : [{
                    ntype : 'container',
                    layout: {ntype: 'hbox', align: 'start'},
                    style : {gap: '8px'},
                    items : [ArrayField.dragHandle(), {module: TextField, name: 'title', labelText: 'Chapter', labelPosition: 'inline', flex: 1}]
                }, {
                    module    : ArrayField,
                    name      : 'documents',
                    sortable  : true,
                    style     : {gap: '4px', paddingLeft: '32px'},
                    buildField: () => ({
                        module: ContainerField,
                        style : {gap: '8px'},
                        items : [ArrayField.dragHandle(), {module: TextField, name: 'name', labelText: 'Document', labelPosition: 'inline', flex: 1}]
                    })
                }]
            })
        }],
        sample: {
            name          : 'Jane Doe',
            address       : {street: 'Main street 1', city: 'Utrecht'},
            emailAddresses: [{type: 'work', email: 'jane@example.com'}, {type: 'home', email: 'jane@home.example'}],
            chapters      : [
                {title: 'Introduction', documents: [{name: 'Scope'}, {name: 'Terms'}]},
                {title: 'Procedures', documents: [{name: 'Mooring'}, {name: 'Bunkering'}, {name: 'Waste'}]}
            ]
        }
    }
}

export default Neo.setupClass(ArrayFieldDemo);
