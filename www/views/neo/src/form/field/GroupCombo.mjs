import JmapComboBox from './JmapComboBox.mjs';
import {t}          from '../../Translate.mjs';

/**
 * Pick a core Group, like GOUI GroupCombo.
 *
 *     {module: GroupCombo, jmapFilter: {hideUsers: true}}
 */
class GroupCombo extends JmapComboBox {
    static config = {
        className   : 'GO.form.field.GroupCombo',
        entity      : 'Group',
        name        : 'groupId',
        displayField: 'name',
        properties  : ['id', 'name'],
        jmapSort    : [{property: 'name', isAscending: true}]
    }

    construct(config) {
        super.construct(config);
        config.labelText || (this.labelText = t('Group'))
    }
}

export default Neo.setupClass(GroupCombo);
