import JmapComboBox  from './JmapComboBox.mjs';
import PrincipalList from './PrincipalList.mjs';
import {t}           from '../../Translate.mjs';

/**
 * Pick a user, group or contact (core Principal), like GOUI PrincipalCombo.
 * The value is the principal id; for users that is the user id.
 *
 *     {module: PrincipalCombo, principalEntity: 'User', name: 'userId'}
 */
class PrincipalCombo extends JmapComboBox {
    static config = {
        className   : 'GO.form.field.PrincipalCombo',
        entity      : 'Principal',
        name        : 'userId',
        displayField: 'name',
        properties  : ['id', 'name', 'description', 'avatarId', 'type', 'email'],
        jmapSort    : [{property: 'name', isAscending: true}],
        listConfig  : {module: PrincipalList},
        /**
         * Only principals of this entity, e.g. "User" (Principal filter "entity")
         * @member {String|null} principalEntity=null
         */
        principalEntity: null
    }

    construct(config) {
        super.construct(config);

        let me = this;

        if (me.principalEntity) {
            me.setJmapFilter({entity: me.principalEntity});
            // GOUI: a user picker is labelled "User"
            me.principalEntity === 'User' && !config.labelText && (me.labelText = t('User'))
        }
    }
}

export default Neo.setupClass(PrincipalCombo);
