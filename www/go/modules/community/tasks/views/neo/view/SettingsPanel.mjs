import Container    from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import {LEVEL_CREATE} from '../../../../../../../views/neo/src/Acl.mjs';
import BoolCheckBox from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import JmapComboBox from '../../../../../../../views/neo/src/form/field/JmapComboBox.mjs';
import {fieldset}   from '../../../../../../../views/neo/src/form/fieldset.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'tasks');

/**
 * Tasks card of My account (GOUI tasks SettingsPanel): the user's tasksSettings,
 * saved with the User
 */
class SettingsPanel extends Container {
    static config = {
        className: 'GO.tasks.SettingsPanel',
        baseCls  : ['go-tasks-settings', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [fieldset(t('Display options for lists'), [{
            module    : JmapComboBox,
            name      : 'tasksSettings.defaultTasklistId',
            entity    : 'TaskList',
            jmapFilter: {role: 'list', permissionLevel: LEVEL_CREATE},
            properties: ['id', 'name'],
            jmapSort  : [{property: 'name', isAscending: true}],
            labelText : t('Default list'),
            labelPosition: 'inline',
            width     : null
        }, {
            module    : BoolCheckBox,
            name      : 'tasksSettings.rememberLastItems',
            valueLabel: t('Remember last selected tasklist')
        }, {
            module    : BoolCheckBox,
            name      : 'tasksSettings.defaultDate',
            valueLabel: t('Set today for start and due date when creating new tasks')
        }])]
    }
}

export default Neo.setupClass(SettingsPanel);
