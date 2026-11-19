import TextField    from '../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import BoolCheckBox from '../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import LocalCombo   from '../../../../../../views/neo/src/form/field/LocalCombo.mjs';
import TextList     from '../../../../../../views/neo/src/list/TextList.mjs';
import {t}          from '../../util.mjs';
import RecordDialog, {centered, field} from './RecordDialog.mjs';

/**
 * The fields a filter compares (ExtJS FilterDialog)
 * @returns {Object[]} [{id, name}]
 */
export function filterFields() {
    return [
        {id: 'from',    name: t('From field')},
        {id: 'subject', name: t('Subject')},
        {id: 'to',      name: t('Send To')},
        {id: 'cc',      name: t('CC field')}
    ]
}

/**
 * A (non-sieve) filter of an account (ExtJS GO.email.FilterDialog, email/filter/load|submit):
 * when the field contains the keyword, move the message to a folder and maybe mark it as read.
 * The legacy client applies the filters when it lists the INBOX.
 *
 *     FilterDialog.open({appName, windowId, accountId, id, folders: ['INBOX', 'Archive']})
 */
class FilterDialog extends RecordDialog {
    static legacyController = 'filter'

    static config = {
        className   : 'GO.email.account.FilterDialog',
        title       : t('Filter'),
        wrapperStyle: centered(460, 440),
        /**
         * Folder names of the account for "Move to folder"
         * @member {String[]} folders=[]
         */
        folders: []
    }

    static toValues(data) {
        return {
            field       : data?.field || 'from',
            keyword     : data?.keyword || '',
            folder      : data?.folder || null,
            mark_as_read: !!+(data?.mark_as_read ?? 0)
        }
    }

    createFormItems() {
        let me      = this,
            combo   = (name, label, data, config) => field(LocalCombo, name, label, {
                width       : null,
                displayField: 'name',
                valueField  : 'id',
                editable    : false,
                listConfig  : {module: TextList},
                store       : {keyProperty: 'id', data},
                ...config
            }),
            current = me.values?.folder,
            folders = [...me.folders];

        // a filter may point to a folder that is gone or not subscribed
        current && !folders.includes(current) && folders.push(current);

        return [
            combo('field', t('Field'), filterFields(), {required: true}),
            field(TextField, 'keyword', t('Keyword'), {required: true}),
            combo('folder', t('Move to folder'), folders.map(name => ({id: name, name})), {required: true}),
            {module: BoolCheckBox, name: 'mark_as_read', valueLabel: t('Mark as read'), flex: 'none'}
        ]
    }

    toParams(values) {
        return {...values, mark_as_read: values.mark_as_read ? 1 : 0}
    }
}

export default Neo.setupClass(FilterDialog);
