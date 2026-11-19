import TextField    from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import ColorField   from '../../../../../../../views/neo/src/form/field/ColorField.mjs';
import FormWindow   from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'comments');

/**
 * A comment label (GOUI LabelDialog edits them in its table): name and colour
 */
class LabelDialog extends FormWindow {
    static config = {
        className   : 'GO.comments.view.LabelDialog',
        entityName  : 'CommentLabel',
        title       : t('Label'),
        wrapperStyle: {height: 'auto', left: 'calc(50vw - 200px)', top: '20vh', width: 'min(400px, 100vw)'}
    }

    createFormItems() {
        return [{
            module       : TextField,
            name         : 'name',
            labelText    : t('Name'),
            labelPosition: 'inline',
            required     : true
        }, {
            module   : ColorField,
            name     : 'color',
            labelText: t('Color'),
            palette  : true
        }]
    }

    addCustomFields() {
        // CommentLabel has no custom fields
    }
}

export default Neo.setupClass(LabelDialog);
