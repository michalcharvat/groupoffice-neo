import Model from '../../../../../../../views/neo/node_modules/neo.mjs/src/data/Model.mjs';

/**
 * Contact or organization (grid rows). Arrays (emailAddresses, …) are untyped fields:
 * neo passes them through as they come.
 */
class Contact extends Model {
    static config = {
        className  : 'GO.addressbook.model.Contact',
        keyProperty: 'id',
        fields     : [
            {name: 'id',              type: 'String'},
            {name: 'name'},
            {name: 'firstName'},
            {name: 'middleName'},
            {name: 'lastName'},
            {name: 'prefixes'},
            {name: 'suffixes'},
            {name: 'isOrganization',  type: 'Boolean'},
            {name: 'addressBookId',   type: 'String'},
            {name: 'jobTitle'},
            {name: 'department'},
            {name: 'gender'},
            {name: 'color'},
            {name: 'photoBlobId'},
            {name: 'starred'},
            {name: 'groups'},
            {name: 'organizationIds'},
            {name: 'emailAddresses'},
            {name: 'phoneNumbers'},
            {name: 'addresses'},
            {name: 'dates'},
            {name: 'urls'},
            {name: 'notes'},
            {name: 'IBAN'},
            {name: 'BIC'},
            {name: 'nameBank'},
            {name: 'vatNo'},
            {name: 'vatReverseCharge'},
            {name: 'registrationNumber'},
            {name: 'debtorNumber'},
            {name: 'age'},
            {name: 'birthday'},
            {name: 'actionAt'},
            {name: 'lastContactAt'},
            {name: 'createdAt'},
            {name: 'modifiedAt'},
            {name: 'createdBy',       type: 'String'},
            {name: 'modifiedBy',      type: 'String'},
            {name: 'permissionLevel', type: 'Int'},
            {name: 'filesFolderId'},
            {name: 'goUserId'}
        ]
    }
}

export default Neo.setupClass(Contact);
