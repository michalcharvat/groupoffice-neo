import RangeField   from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Range.mjs';
import TextArea     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import {LEVEL_CREATE} from '../../../../../../../views/neo/src/Acl.mjs';
import {addDays, toYmd} from '../../../../../../../views/neo/src/DateUtil.mjs';
import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import {escapeHtml}   from '../../../../../../../views/neo/src/Format.mjs';
import DateTimeField from '../../../../../../../views/neo/src/form/field/DateTimeField.mjs';
import JmapComboBox from '../../../../../../../views/neo/src/form/field/JmapComboBox.mjs';
import LocalCombo   from '../../../../../../../views/neo/src/form/field/LocalCombo.mjs';
import TextList     from '../../../../../../../views/neo/src/list/TextList.mjs';
import FormWindow   from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import {progressOptions} from '../util.mjs';
import {row}        from './TaskDialog.mjs';

const t = translator('community', 'tasks');

/**
 * GOUI ContinueTaskDialog: postpone a task to a later date with an alert at that time,
 * update its progress and list and leave a comment
 */
class ContinueTaskDialog extends FormWindow {
    static config = {
        className : 'GO.tasks.ContinueTaskDialog',
        cls       : ['go-form-window', 'go-tasks-continue-dialog'],
        entityName: 'Task',
        properties: ['id', 'progress', 'percentComplete', 'tasklistId'],
        title     : t('Continue task'),
        wrapperStyle: {height: '520px', left: 'calc(50vw - 300px)', top: 'max(5vh, calc(50vh - 260px))', width: '600px'}
    }

    /**
     * The comment typed, taken on beforesave
     * @member {String} commentText=''
     */
    commentText = ''

    createFormItems() {
        return [{
            // not a task property: becomes the due date and the alert (beforesave)
            module   : DateTimeField,
            reference: 'continueAt',
            labelText: t('Continue at'),
            required : true,
            flex     : 'none'
        }, row({
            module       : LocalCombo,
            name         : 'progress',
            labelText    : t('Progress'),
            labelPosition: 'inline',
            displayField : 'name',
            valueField   : 'id',
            listConfig   : {module: TextList},
            store        : {keyProperty: 'id', data: progressOptions()},
            flex         : 1
        }, {
            module       : RangeField,
            name         : 'percentComplete',
            labelText    : t('Percent complete'),
            labelPosition: 'inline',
            minValue     : 0,
            maxValue     : 100,
            stepSize     : 10,
            flex         : 2
        }), {
            module       : JmapComboBox,
            name         : 'tasklistId',
            entity       : 'TaskList',
            jmapFilter   : {role: 'list', permissionLevel: LEVEL_CREATE},
            jmapSort     : [{property: 'name', isAscending: true}],
            properties   : ['id', 'name'],
            displayField : 'name',
            labelText    : t('List'),
            labelPosition: 'inline',
            flex         : 'none'
        }, {
            module       : TextArea,
            reference    : 'comment',
            labelText    : t('Comment'),
            labelPosition: 'inline',
            height       : 120,
            flex         : 'none'
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        // GOUI: tomorrow at 08:00. After the load: loading resets every field of the form (an unnamed one is not sent or compared)
        me.on('formReady', () => {
            me.getReference('continueAt').value = toYmd(addDays(new Date(), 1)) + 'T08:00:00'
        });

        me.form.on('beforesave', ({data}) => {
            const at = me.getReference('continueAt').getSubmitValue();

            if (at) {
                data.alerts = [{trigger: {when: at}}];
                data.due    = String(at).substring(0, 10)
            }

            // read now: after saving, the form loads the task and resets every field
            me.commentText = (me.getReference('comment').value || '').trim()
        });

        // the comment goes with the saved task (comments are HTML, like CommentsPanel)
        me.on('save', ({data}) => {
            const text = me.commentText;

            text && client.set('Comment', {create: {c: {entity: 'Task', entityId: data.id, text: escapeHtml(text).replace(/\n/g, '<br>')}}})
                .catch(e => console.error('Comment', e))
        })
    }
}

export default Neo.setupClass(ContinueTaskDialog);
