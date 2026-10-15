import Container    from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import BoolCheckBox from '../../../../../../../views/neo/src/form/field/BoolCheckBox.mjs';
import JmapComboBox from '../../../../../../../views/neo/src/form/field/JmapComboBox.mjs';
import {LEVEL_WRITE} from '../../../../../../../views/neo/src/Acl.mjs';
import {fieldset}   from '../../../../../../../views/neo/src/form/fieldset.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'notes');

/**
 * Notes card of My account (GOUI notes SettingsPanel): the user's notesSettings,
 * saved with the User.
 */
class SettingsPanel extends Container {
    static config = {
        className: 'GO.notes.view.SettingsPanel',
        baseCls  : ['go-notes-settings', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [fieldset(t('Display options for notebooks'), [{
            module    : JmapComboBox,
            name      : 'notesSettings.defaultNoteBookId',
            entity    : 'NoteBook',
            jmapFilter: {permissionLevel: LEVEL_WRITE},
            properties: ['id', 'name'],
            jmapSort  : [{property: 'name', isAscending: true}],
            labelText : t('Default note book'),
            labelPosition: 'inline',
            width     : null
        }, {
            module    : BoolCheckBox,
            name      : 'notesSettings.rememberLastItems',
            valueLabel: t('Remember last selected note book')
        }])]
    }
}

export default Neo.setupClass(SettingsPanel);
