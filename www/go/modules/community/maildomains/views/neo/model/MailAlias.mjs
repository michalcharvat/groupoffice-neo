import Model from '../../../../../../../views/neo/node_modules/neo.mjs/src/data/Model.mjs';

class MailAlias extends Model {
    static config = {
        className  : 'GO.maildomains.model.MailAlias',
        keyProperty: 'id',
        // no type: objects, arrays, numbers and booleans stay as JMAP sends them
        fields     : [
            {name: 'id', type: 'String'},
            {name: 'domainId', type: 'String'},
            {name: 'address', type: 'String'},
            {name: 'recipients'},
            {name: 'active'},
            {name: 'createdAt', type: 'String'},
            {name: 'createdBy', type: 'String'},
            {name: 'modifiedAt', type: 'String'},
            {name: 'modifiedBy', type: 'String'}
        ]
    }
}

export default Neo.setupClass(MailAlias);
