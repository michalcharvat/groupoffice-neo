import TextArea      from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox  from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import PrincipalCombo from '../../../../../../../views/neo/src/form/field/PrincipalCombo.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';
import FormWindow    from '../../../../../../../views/neo/src/view/FormWindow.mjs';

const t = translator('community', 'calendar');

/**
 * Create or edit a resource group (GOUI ResourceGroupWindow)
 */
class ResourceGroupDialog extends FormWindow {
    static config = {
        className : 'GO.calendar.ResourceGroupDialog',
        cls       : ['go-form-window', 'go-cal-form-dialog'],
        entityName: 'ResourceGroup',
        title     : t('Resource group'),
        wrapperStyle: {height: '460px', left: 'calc(50vw - 250px)', top: '15vh', width: '500px'}
    }

    createFormItems() {
        return [
            {module: TextField, name: 'name', labelText: t('Name'), labelPosition: 'inline', required: true, flex: 'none'},
            {module: TextArea, name: 'description', labelText: t('Description'), labelPosition: 'inline', flex: 'none'},
            {module: BoolCheckBox, name: 'autoAccept', valueLabel: t('Auto-accept available resources'), flex: 'none'},
            {module: PrincipalCombo, principalEntity: 'User', name: 'defaultOwnerId', labelText: t('Default admin'), labelPosition: 'inline', required: true, flex: 'none'}
        ]
    }
}

export default Neo.setupClass(ResourceGroupDialog);
