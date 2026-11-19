import {LEVEL_CREATE} from '../../../../../../../views/neo/src/Acl.mjs';
import BoolCheckBox  from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import JmapComboBox  from '../../../../../../../views/neo/src/form/field/JmapComboBox.mjs';
import ImportFileDialog from '../../../../../../../views/neo/src/import/ImportFileDialog.mjs';
import {translator}  from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'tasks');

/**
 * GOUI ImportTaskDialog: imports an iCalendar or CSV file into the chosen list, or takes
 * the list id of every task from the CSV file. Import stays disabled until one of both is set.
 *
 *     Neo.create(ImportTaskDialog, {appName, windowId, tasklistId: 3})
 */
class ImportTaskDialog extends ImportFileDialog {
    static config = {
        className: 'GO.tasks.ImportTaskDialog',
        title    : t('Choose a tasklist'),
        entity   : 'Task',
        accept   : '.ics,.csv',
        /**
         * List chosen when the dialog opens
         * @member {Number|String|null} tasklistId=null
         */
        tasklistId: null,
        // GOUI ImportTaskDialog: the CSV mapping shows the task properties by these names
        options: {labels: {
            start          : t('start'),
            due            : t('due'),
            completed      : t('completed'),
            title          : t('title'),
            description    : t('description'),
            status         : t('status'),
            priority       : t('priority'),
            percentComplete: t('percentage completed'),
            categories     : t('categories')
        }}
    }

    createExtraItems() {
        let me = this;

        return [{
            module      : JmapComboBox,
            reference   : 'tasklistId',
            cls         : ['go-import-file-field'],
            flex        : 'none',
            entity      : 'TaskList',
            // lists the user may add tasks to
            jmapFilter  : {role: 'list', permissionLevel: LEVEL_CREATE},
            jmapSort    : [{property: 'name', isAscending: true}],
            properties  : ['id', 'name'],
            displayField: 'name',
            value       : me.tasklistId,
            labelText   : t('List'),
            labelPosition: 'inline',
            listeners   : {change: () => me.syncUpload()}
        }, {
            module    : BoolCheckBox,
            reference : 'idFromFile',
            cls       : ['go-import-file-field'],
            flex      : 'none',
            valueLabel: t('Import list ID from CSV file'),
            listeners : {change: () => me.syncUpload()}
        }]
    }

    /**
     * @returns {Boolean} the CSV file holds the list of every task
     */
    isIdFromFile() {
        return !!this.getReference('idFromFile')?.checked
    }

    /**
     * @returns {String|Number|null} the chosen list (the configured one while the combo is not created yet)
     */
    getTasklistId() {
        const combo = this.getReference('tasklistId');

        return (combo ? combo.getSubmitValue() : this.tasklistId) || null
    }

    /**
     * Import needs a list or "Import list ID from CSV file"
     * @returns {Boolean}
     */
    canUpload() {
        return this.isIdFromFile() || !!this.getTasklistId()
    }

    /**
     * The list combo only counts without "Import list ID from CSV file"
     */
    syncUpload() {
        const combo = this.getReference('tasklistId');

        combo && (combo.disabled = this.isIdFromFile());
        super.syncUpload()
    }

    getImportValues() {
        let me = this;

        return me.isIdFromFile() ? {...me.values} : {...me.values, tasklistId: me.getTasklistId()}
    }
}

export default Neo.setupClass(ImportTaskDialog);
