import TextField    from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import BoolCheckBox from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import JmapComboBox from '../../../../../../../views/neo/src/form/field/JmapComboBox.mjs';
import FormWindow   from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import {hasRight}   from '../util.mjs';

const t = translator('community', 'tasks');

/**
 * Create or edit a task category (GOUI TaskCategoryDialog): name and list. With the
 * module right mayChangeCategories it can be global (no owner, no list); otherwise it
 * belongs to the user.
 */
class CategoryDialog extends FormWindow {
    static config = {
        className : 'GO.tasks.CategoryDialog',
        cls       : ['go-form-window', 'go-tasks-category-dialog'],
        entityName: 'TaskCategory',
        properties: ['id', 'name', 'tasklistId', 'ownerId'],
        title     : t('Category'),
        wrapperStyle: {height: '360px', left: 'calc(50vw - 200px)', top: 'max(5vh, calc(50vh - 180px))', width: '400px'}
    }

    construct(config) {
        // a new category is the user's own
        config.values ??= {ownerId: client.user.id};
        super.construct(config)
    }

    createFormItems() {
        const items = [{
            module       : TextField,
            name         : 'name',
            labelText    : t('Name'),
            labelPosition: 'inline',
            required     : true,
            flex         : 'none'
        }, {
            module       : JmapComboBox,
            name         : 'tasklistId',
            reference    : 'tasklistId',
            entity       : 'TaskList',
            jmapFilter   : {role: 'list'},
            jmapSort     : [{property: 'name', isAscending: true}],
            properties   : ['id', 'name'],
            displayField : 'name',
            labelText    : t('List'),
            labelPosition: 'inline',
            flex         : 'none'
        }];

        if (hasRight('mayChangeCategories')) {
            items.push({
                module    : BoolCheckBox,
                reference : 'global',
                valueLabel: t('Global category'),
                listeners : {change: ({value}) => this.onGlobalChange(value)}
            })
        }

        return items
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        // a global category has no owner (and no list)
        me.on('formReady', () => {
            const global = me.getReference('global');

            if (global && !me.isDestroyed) {
                // Category::defineFilters "global": no owner and no list (no owner + a list = a list category)
                global.checked = !!me.form.currentId && !me.form.entityData.ownerId && !me.form.entityData.tasklistId;
                me.getReference('tasklistId').disabled = global.checked
            }
        });

        me.form.on('beforesave', ({data}) => {
            const global = me.getReference('global');

            if (global && global.checked) {
                data.ownerId    = null;
                data.tasklistId = null
            } else if (global && me.form.isNew) {
                data.ownerId = client.user.id
            }
            // editing without checking "global": owner and list stay as they are
        })
    }

    /**
     * @param {Boolean} global
     */
    onGlobalChange(global) {
        this.getReference('tasklistId').disabled = global
    }
}

export default Neo.setupClass(CategoryDialog);
