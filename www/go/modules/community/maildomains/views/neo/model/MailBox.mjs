import Model from '../../../../../../../views/neo/node_modules/neo.mjs/src/data/Model.mjs';

class MailBox extends Model {
    static config = {
        className  : 'GO.maildomains.model.MailBox',
        keyProperty: 'id',
        // no type: objects, arrays, numbers and booleans stay as JMAP sends them
        fields     : [
            {name: 'id', type: 'String'},
            {name: 'domainId', type: 'String'},
            {name: 'username', type: 'String'},
            {name: 'description', type: 'String'},
            {name: 'quota'},
            {name: 'bytes'},
            {name: 'messages'},
            {name: 'active'},
            {name: 'domainOwner'},
            {name: 'smtpAllowed'},
            {name: 'fts'},
            {name: 'autoExpunge', type: 'String'},
            {name: 'createdAt', type: 'String'},
            {name: 'createdBy', type: 'String'},
            {name: 'modifiedAt', type: 'String'},
            {name: 'modifiedBy', type: 'String'}
        ]
    }
}

export default Neo.setupClass(MailBox);
