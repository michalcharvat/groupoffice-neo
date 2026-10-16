import Model from '../../../../../../../views/neo/node_modules/neo.mjs/src/data/Model.mjs';

class MailDomain extends Model {
    static config = {
        className  : 'GO.maildomains.model.MailDomain',
        keyProperty: 'id',
        // no type: objects, arrays, numbers and booleans stay as JMAP sends them
        fields     : [
            {name: 'id', type: 'String'},
            {name: 'domain', type: 'String'},
            {name: 'description', type: 'String'},
            {name: 'userId', type: 'String'},
            {name: 'active'},
            {name: 'backupMx'},
            {name: 'transport', type: 'String'},
            {name: 'mxStatus'},
            {name: 'dmarcStatus'},
            {name: 'spfStatus'},
            {name: 'spf', type: 'String'},
            {name: 'dmarc', type: 'String'},
            {name: 'mx', type: 'String'},
            {name: 'dkim'},
            {name: 'defaultQuota'},
            {name: 'totalQuota'},
            {name: 'maxMailboxes'},
            {name: 'maxAliases'},
            {name: 'sumUsedQuota'},
            {name: 'sumUsage'},
            {name: 'createdAt', type: 'String'},
            {name: 'createdBy', type: 'String'},
            {name: 'modifiedAt', type: 'String'},
            {name: 'modifiedBy', type: 'String'},
            {name: 'permissionLevel'}
        ]
    }
}

export default Neo.setupClass(MailDomain);
