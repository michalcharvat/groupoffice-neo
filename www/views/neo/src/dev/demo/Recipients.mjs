import RecipientsField from '../../form/field/RecipientsField.mjs';
import FormDemo        from './FormDemo.mjs';

/**
 * Dev demo: goui-docs RecipientsField — e-mail recipients as chips with suggestions
 * (users and contacts) and GO.view.RecipientPicker behind the person_add button.
 */
class RecipientsDemo extends FormDemo {
    static config = {
        className: 'GO.dev.demo.Recipients',
        intro    : '<p>Type a name or address: users and contacts with an e-mail address are suggested (arrow keys, Enter). ' +
                   'Typed addresses ("john@example.com", "John Doe &lt;john@example.com&gt;") become chips on Enter, "," or ";". ' +
                   'The person icon opens the picker (users by group, contacts). Invalid addresses are red and fail validation.</p>',
        fields   : [{
            module     : RecipientsField,
            name       : 'to',
            labelText  : 'To',
            placeholder: 'Add recipients…',
            required   : true
        }, {
            module   : RecipientsField,
            name     : 'cc',
            labelText: 'Cc (no picker button, initial value)',
            picker   : false,
            value    : [{name: 'Jane Roe', email: 'jane@example.org'}]
        }],
        sample: {to: [{name: 'John Doe', email: 'john@example.com'}, 'not-an-address']}
    }
}

export default Neo.setupClass(RecipientsDemo);
