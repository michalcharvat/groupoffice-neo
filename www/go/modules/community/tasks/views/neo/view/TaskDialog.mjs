import RangeField   from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Range.mjs';
import TextArea     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import HiddenField  from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Hidden.mjs';
import TextField    from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import Button       from '../../../../../../../views/neo/src/button/Button.mjs';
import {LEVEL_CREATE} from '../../../../../../../views/neo/src/Acl.mjs';
import client       from '../../../../../../../views/neo/src/jmap/Client.mjs';
import ArrayField   from '../../../../../../../views/neo/src/form/field/ArrayField.mjs';
import AutocompleteChips from '../../../../../../../views/neo/src/form/field/AutocompleteChips.mjs';
import ColorField   from '../../../../../../../views/neo/src/form/field/ColorField.mjs';
import ContainerField from '../../../../../../../views/neo/src/form/field/ContainerField.mjs';
import DateField    from '../../../../../../../views/neo/src/form/field/DateField.mjs';
import DateTimeField from '../../../../../../../views/neo/src/form/field/DateTimeField.mjs';
import DurationField from '../../../../../../../views/neo/src/form/field/DurationField.mjs';
import JmapComboBox from '../../../../../../../views/neo/src/form/field/JmapComboBox.mjs';
import LocalCombo   from '../../../../../../../views/neo/src/form/field/LocalCombo.mjs';
import PrincipalCombo from '../../../../../../../views/neo/src/form/field/PrincipalCombo.mjs';
import RecurrenceField from '../../../../../../../views/neo/src/form/field/RecurrenceField.mjs';
import {fieldset}   from '../../../../../../../views/neo/src/form/fieldset.mjs';
import TextList     from '../../../../../../../views/neo/src/list/TextList.mjs';
import FormWindow   from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import {priorityOptions, progressOptions} from '../util.mjs';

const t = translator('community', 'tasks');

/** Fields side by side (GOUI comp({cls: "row"})) */
export const row = (...items) => ({
    ntype : 'container',
    cls   : ['go-tasks-row'],
    flex  : 'none',
    layout: {ntype: 'hbox', align: 'start'},
    items
});

/**
 * Create or edit a task (GOUI TaskDialog): subject and colour, responsible and list,
 * categories, dates with estimated duration, progress, % complete, priority and
 * recurrence, description and location, alerts.
 */
class TaskDialog extends FormWindow {
    /**
     * Alert ids of the loaded task (removed ones are sent as null)
     * @member {String[]} alertIds=[]
     */
    alertIds = []
    /**
     * Alert rows as loaded, to send only changed ones
     * @member {Object[]} loadedAlerts=[]
     */
    loadedAlerts = []

    static config = {
        className : 'GO.tasks.TaskDialog',
        cls       : ['go-form-window', 'go-tasks-dialog'],
        entityName: 'Task',
        hasLinks  : true,
        title     : t('Task'),
        wrapperStyle: {
            height   : '80vh',
            left     : 'calc(50vw - 400px)',
            maxHeight: '90vh',
            top      : '10vh',
            width    : '800px'
        }
    }

    createFormItems() {
        return [{
            ntype : 'container',
            cls   : ['go-tasks-dialog-body'],
            flex  : 1,
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [row({
                module       : TextField,
                name         : 'title',
                labelText    : t('Subject'),
                labelPosition: 'inline',
                required     : true,
                flex         : 4
            }, {
                module   : ColorField,
                name     : 'color',
                labelText: t('Color'),
                flex     : 1
            }), row({
                module         : PrincipalCombo,
                principalEntity: 'User',
                name           : 'responsibleUserId',
                labelText      : t('Responsible'),
                labelPosition  : 'inline',
                flex           : 1
            }, {
                module       : JmapComboBox,
                name         : 'tasklistId',
                reference    : 'tasklistId',
                entity       : 'TaskList',
                // lists the user may add tasks to
                jmapFilter   : {role: 'list', permissionLevel: LEVEL_CREATE},
                jmapSort     : [{property: 'name', isAscending: true}],
                properties   : ['id', 'name', 'aclId'],
                displayField : 'name',
                labelText    : t('List'),
                labelPosition: 'inline',
                required     : true,
                flex         : 1
            }), {
                module   : AutocompleteChips,
                name     : 'categories',
                reference: 'categories',
                entity   : 'TaskCategory',
                jmapSort : [{property: 'name', isAscending: true}],
                labelText: t('Categories'),
                flex     : 'none'
            }, fieldset(t('Date'), [row({
                module       : DateField,
                name         : 'start',
                reference    : 'start',
                labelText    : t('Start'),
                labelPosition: 'inline',
                flex         : 1
            }, {
                module       : DateField,
                name         : 'due',
                reference    : 'due',
                labelText    : t('Due'),
                labelPosition: 'inline',
                flex         : 1
            }, {
                module      : DurationField,
                name        : 'estimatedDuration',
                labelText   : t('Estimated duration'),
                outputFormat: 's',
                minValue    : 0,
                maxValue    : 24 * 60,
                flex        : 1
            }), row({
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
                value        : 0,
                flex         : 1
            }, {
                module       : LocalCombo,
                name         : 'priority',
                labelText    : t('Priority'),
                labelPosition: 'inline',
                displayField : 'name',
                valueField   : 'id',
                listConfig   : {module: TextList},
                store        : {keyProperty: 'id', data: priorityOptions()},
                flex         : 1
            }), {
                module   : RecurrenceField,
                name     : 'recurrenceRule',
                reference: 'recurrenceRule',
                labelText: t('Recurrence'),
                // GOUI: a series needs a start date
                disabled : true,
                flex     : 'none'
            }]), fieldset(t('Description') + ' / ' + t('Location'), [{
                module       : TextArea,
                name         : 'description',
                labelText    : t('Description'),
                labelPosition: 'inline',
                height       : 120,
                flex         : 'none'
            }, {
                module       : TextArea,
                name         : 'location',
                labelText    : t('Location'),
                labelPosition: 'inline',
                height       : 60,
                flex         : 'none'
            }]), fieldset(t('Alerts'), [{
                module    : ArrayField,
                name      : 'alerts',
                reference : 'alerts',
                flex      : 'none',
                // Alert properties without an input ride along in hidden fields: a relative
                // alert (trigger offset/relativeTo, from other clients) keeps its trigger
                buildField: () => ({
                    module: ContainerField,
                    cls   : ['go-tasks-row'],
                    items : [
                        {module: HiddenField, name: 'id'},
                        {module: HiddenField, name: 'action'},
                        {module: HiddenField, name: 'acknowledged'}, {
                        module: ContainerField,
                        name  : 'trigger',
                        flex  : 1,
                        items : [{
                            module   : DateTimeField,
                            name     : 'when',
                            labelText: t('When'),
                            flex     : 1
                        }, {
                            module: HiddenField,
                            name  : 'offset'
                        }, {
                            module: HiddenField,
                            name  : 'relativeTo'
                        }]
                    }, ArrayField.removeButton()]
                })
            }, {
                module : Button,
                ui     : 'secondary',
                icon   : 'add_alarm',
                text   : t('Add alert'),
                flex   : 'none',
                style  : {alignSelf: 'start'},
                handler: () => this.addAlert()
            }])]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.form.on('fieldChange', ({component, value}) => {
            switch (component.name) {
                case 'start'     : me.onStartChange(value); break;
                case 'tasklistId': me.onTasklistChange(component.getSubmitValue?.() ?? value); break;
            }
        });

        me.on('formReady', () => {
            me.onStartChange(me.getReference('start').value, true);
            me.onTasklistChange(me.getReference('tasklistId').getSubmitValue())
        });

        // Task.alerts is a JMAP map {id: alert} (addMap): rows for the ArrayField
        me.form.on('beforeload', ({data}) => {
            const alerts = data.alerts && typeof data.alerts === 'object' ? data.alerts : {};

            me.alertIds  = Object.keys(alerts);
            data.alerts  = Object.entries(alerts).map(([id, alert]) => ({...alert, id}));
            me.loadedAlerts = data.alerts
        });

        // and back to a map like ExtJS FormGroup (mapKey): known ids, "_NEW_<n>" for new rows,
        // null for removed ones; unchanged alerts as `true`, not set again (a relative trigger
        // with a negative offset can't be: PHP DateInterval refuses "-PT1H").
        // Rows without a time (absolute or relative) are dropped.
        me.form.on('beforesave', ({data}) => {
            if (!Array.isArray(data.alerts)) {
                return
            }

            const clean   = obj => Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v !== null && v !== undefined && v !== '')),
                  map     = {},
                  sent    = new Set(),
                  // the time may come back in another offset (UTC vs local): compare instants
                  key     = ({action, acknowledged, trigger = {}}) => JSON.stringify([action || null, acknowledged || null,
                      trigger.when ? Date.parse(trigger.when) : null, trigger.offset || null, trigger.relativeTo || null]),
                  loaded  = new Map(me.loadedAlerts.map(alert => [String(alert.id), key(alert)]));

            data.alerts.filter(alert => alert?.trigger?.when || alert?.trigger?.offset).forEach((alert, index) => {
                const {id, ...rest} = clean(alert);

                id && sent.add(String(id));

                // the whole map is replaced (Property::patchMap()): `true` keeps an alert as it is
                map[id ? String(id) : '_NEW_' + index] = id && loaded.get(String(id)) === key(alert)
                    ? true
                    // a time typed into a relative alert makes it absolute: the server reads
                    // offset first (Alert::setTrigger())
                    : {...rest, trigger: alert.trigger.when ? {when: alert.trigger.when} : clean(alert.trigger)}
            });

            me.alertIds.forEach(id => sent.has(id) || (map[id] = null));
            data.alerts = map
        });

        // GOUI: after saving, the task is shown
        me.on('save', ({data}) => data?.id && Neo.Main.setRoute({value: 'tasks/task/' + data.id, windowId: me.windowId}))
    }

    /**
     * GOUI: the due date follows a later start, recurrence needs a start
     * @param {String|null} value "Y-m-d"
     * @param {Boolean} initial the form was just loaded: don't touch the due date
     */
    onStartChange(value, initial = false) {
        let me         = this,
            due        = me.getReference('due'),
            recurrence = me.getReference('recurrenceRule');

        if (!value) {
            recurrence.disabled = true;
            return
        }

        if (!initial && (!due.value || due.value < value)) {
            due.value = value
        }

        recurrence.setStartDate(value);
        recurrence.disabled = false
    }

    /**
     * GOUI: categories of the chosen list, global ones and the user's own
     * @param {String|null} tasklistId
     */
    onTasklistChange(tasklistId) {
        const conditions = [{global: true}, {ownerId: client.user.id}];

        tasklistId && conditions.push({tasklistId});

        this.getReference('categories').setJmapFilter({operator: 'OR', conditions})
    }

    /**
     * New alert row, at the start date (ExtJS AlertFields)
     */
    addAlert() {
        const start = this.getReference('start').value;

        this.getReference('alerts').addValue({trigger: {when: start ? start + 'T09:00:00' : null}})
    }
}

export default Neo.setupClass(TaskDialog);
