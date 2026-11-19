import TextField  from '../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import ColorField from '../../../../../../views/neo/src/form/field/ColorField.mjs';
import {t as coreT} from '../../../../../../views/neo/src/Translate.mjs';
import {t}          from '../../util.mjs';
import RecordDialog, {centered, field} from './RecordDialog.mjs';

/**
 * A label of an account (ExtJS GO.email.LabelDialog, email/label/load|submit): name and colour.
 * The server limits the number of labels (config email_max_labels, default 10).
 */
class LabelDialog extends RecordDialog {
    static legacyController = 'label'

    static config = {
        className   : 'GO.email.account.LabelDialog',
        title       : t('Label'),
        wrapperStyle: centered(420, 320)
    }

    static toValues(data) {
        // ExtJS default colour
        return {name: data?.name || '', color: (data?.color || '7A7AFF').toUpperCase()}
    }

    createFormItems() {
        return [
            field(TextField, 'name', coreT('Name'), {required: true}),
            field(ColorField, 'color', coreT('Color'), {required: true, palette: true})
        ]
    }
}

export default Neo.setupClass(LabelDialog);
