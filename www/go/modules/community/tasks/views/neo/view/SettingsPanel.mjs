import Container    from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import {LEVEL_CREATE} from '../../../../../../../views/neo/src/Acl.mjs';
import BoolCheckBox from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import JmapComboBox from '../../../../../../../views/neo/src/form/field/JmapComboBox.mjs';
import LocalCombo   from '../../../../../../../views/neo/src/form/field/LocalCombo.mjs';
import TextList     from '../../../../../../../views/neo/src/list/TextList.mjs';
import {groupByOptions} from '../boardGroups.mjs';
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
        }]), fieldset(t('Board'), [{
            // neo only: in its own table (neo_tasks_user_settings)
            module       : LocalCombo,
            name         : 'neoTasksSettings.boardGroupBy',
            labelText    : t('Group by'),
            labelPosition: 'inline',
            displayField : 'name',
            valueField   : 'id',
            listConfig   : {module: TextList},
            store        : {keyProperty: 'id', data: groupByOptions(t)},
            width        : null
        }])]
    }
}

export default Neo.setupClass(SettingsPanel);
