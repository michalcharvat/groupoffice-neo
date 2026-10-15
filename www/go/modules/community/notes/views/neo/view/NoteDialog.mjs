import ComboBox     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/ComboBox.mjs';
import HtmlField    from '../../../../../../../views/neo/src/form/field/HtmlField.mjs';
import FormWindow   from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import TextList     from '../../../../../../../views/neo/src/list/TextList.mjs';
import TextField    from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'notes');

/**
 * Create or edit a note (GOUI NoteDialog).
 */
class NoteDialog extends FormWindow {
    static config = {
        className : 'GO.notes.view.NoteDialog',
        cls       : ['go-form-window', 'go-notes-dialog'],
        entityName: 'Note',
        properties: ['id', 'name', 'noteBookId', 'content'],
        hasLinks  : true,
        title     : t('Note'),
        wrapperStyle: {
            height: '70vh',
            left  : 'calc(50vw - 320px)',
            top   : '15vh',
            width : '640px'
        },
        /**
         * Note id when editing, null for a new note (= entityId)
         * @member {String|null} noteId=null
         */
        noteId: null,
        /**
         * NoteBook records for the combo
         * @member {Object[]} noteBooks=[]
         */
        noteBooks: []
    }

    construct(config) {
        // the notes module passes noteId
        config.noteId && (config.entityId ??= config.noteId);

        super.construct(config);

        // NotesMain listens to 'saved'
        this.on('save', ({data}) => this.fire('saved', {id: data.id}))
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
            module       : ComboBox,
            name         : 'noteBookId',
            labelText    : t('Notebook'),
            labelPosition: 'inline',
            required     : true,
            flex         : 'none',
            width        : null,
            displayField : 'name',
            listConfig   : {module: TextList},
            valueField   : 'id',
            store        : {
                keyProperty: 'id',
                data       : (this.noteBooks || []).map(nb => ({id: nb.id, name: nb.name}))
            }
        }, {
            module   : HtmlField,
            name     : 'content',
            reference: 'content',
            labelText: t('Content'),
            flex     : 1
        }]
    }

}

export default Neo.setupClass(NoteDialog);
