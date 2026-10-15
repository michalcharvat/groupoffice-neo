import TextField  from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import GroupCombo from '../form/field/GroupCombo.mjs';
import FormWindow from '../view/FormWindow.mjs';
import {t}        from '../Translate.mjs';

/**
 * Creates or edits an AuthAllowGroup: a group that may log in from an IP pattern
 * (row editor of go.systemsettings.AuthAllowGroupGrid)
 */
class AuthAllowGroupDialog extends FormWindow {
    static config = {
        className   : 'GO.systemsettings.AuthAllowGroupDialog',
        entityName  : 'AuthAllowGroup',
        title       : t('Allowed groups'),
        wrapperStyle: {
            height: 'auto',
            left  : 'calc(50vw - 230px)',
            top   : '20vh',
            width : 'min(460px, 100vw)'
        }
    }

    createFormItems() {
        return [{
            module       : GroupCombo,
            name         : 'groupId',
            labelPosition: 'inline',
            required     : true
        }, {
            module         : TextField,
            name           : 'ipPattern',
            labelText      : t('IP pattern'),
            labelPosition  : 'inline',
            placeholderText: '192.168.1?.*',
            required       : true
        }]
    }

    addCustomFields() {
        // AuthAllowGroup has no custom fields
    }
}

export default Neo.setupClass(AuthAllowGroupDialog);
