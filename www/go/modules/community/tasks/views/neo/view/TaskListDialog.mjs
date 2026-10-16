import TextField    from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import ColorField   from '../../../../../../../views/neo/src/form/field/ColorField.mjs';
import JmapComboBox from '../../../../../../../views/neo/src/form/field/JmapComboBox.mjs';
import SharePanel   from '../../../../../../../views/neo/src/permissions/SharePanel.mjs';
import FormWindow   from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'tasks');

/**
 * Create or edit a task list (GOUI TasklistDialog): name, colour, group and, on a
 * second tab, who it is shared with (acl)
 */
class TaskListDialog extends FormWindow {
    static config = {
        className : 'GO.tasks.TaskListDialog',
        cls       : ['go-form-window', 'go-tasks-tasklist-dialog'],
        entityName: 'TaskList',
        properties: ['id', 'name', 'color', 'groupingId', 'role', 'acl'],
        title     : t('List'),
        // a new list is a plain task list (not a project or support list)
        values    : {role: 'list'},
        wrapperStyle: {height: '70vh', left: 'calc(50vw - 300px)', top: '15vh', width: '600px'}
    }

    onConstructed() {
        const result = super.onConstructed();
        this.addSharePanel();
        return result
    }

    /**
     * "Permissions" tab: the acl property as a form field (see NoteBookDialog)
     */
    addSharePanel() {
        let me = this;

        me.addCard({
            header: {text: t('Permissions')},
            items : [{module: SharePanel, reference: 'sharePanel', flex: 1}]
        });

        me.on('formReady', async ({currentId}) => {
            const panel = me.getReference('sharePanel');

            await panel?.setEntity('TaskList', currentId || null).catch(e => console.error('SharePanel', e));

            // a new list's default ACL arrives after the form took its unmodified state
            !currentId && panel && !me.isDestroyed && me.form.setOriginalValue('acl', panel.getSubmitValue())
        })
    }

    createFormItems() {
        return [{
            module       : TextField,
            name         : 'name',
            labelText    : t('Name'),
            labelPosition: 'inline',
            required     : true,
            flex         : 'none'
        }, {
            module   : ColorField,
            name     : 'color',
            labelText: t('Color'),
            flex     : 'none'
        }, {
            module       : JmapComboBox,
            name         : 'groupingId',
            entity       : 'TaskListGrouping',
            jmapSort     : [{property: 'name', isAscending: true}],
            properties   : ['id', 'name'],
            displayField : 'name',
            labelText    : t('Group'),
            labelPosition: 'inline',
            flex         : 'none'
        }]
    }
}

export default Neo.setupClass(TaskListDialog);
