import ComboBox     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/ComboBox.mjs';
import Container    from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Button       from '../../../../../../../views/neo/src/button/Button.mjs';
import HtmlField    from '../../../../../../../views/neo/src/form/field/HtmlField.mjs';
import MarkdownField from '../../../../../../../views/neo/src/form/field/MarkdownField.mjs';
import ConfirmDialog from '../../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import FormWindow   from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import TextList     from '../../../../../../../views/neo/src/list/TextList.mjs';
import TextField    from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'notes');

/**
 * Create or edit a note (GOUI NoteDialog).
 *
 * The content is HTML or Markdown (Note.type). A new note gets the user's default
 * editor (notesSettings.defaultType) and can switch it, which clears the content;
 * an existing note keeps its type.
 */
class NoteDialog extends FormWindow {
    static config = {
        className : 'GO.notes.view.NoteDialog',
        cls       : ['go-form-window', 'go-notes-dialog'],
        entityName: 'Note',
        properties: ['id', 'name', 'noteBookId', 'content', 'type'],
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
        noteBooks: [],
        /**
         * Editor of a new note: 'html' or 'markdown' (notesSettings.defaultType)
         * @member {String} defaultType='html'
         */
        defaultType: 'html'
    }

    /**
     * Content type of the note: 'html' or 'markdown'
     * @member {String} type='html'
     */
    type = 'html'

    construct(config) {
        // the notes module passes noteId
        config.noteId && (config.entityId ??= config.noteId);

        super.construct(config);

        // NotesMain listens to 'saved'
        this.on('save', ({data}) => this.fire('saved', {id: data.id}))
    }

    createFormItems() {
        let me = this;

        me.type = me.defaultType === 'markdown' ? 'markdown' : 'html';

        return [{
            module: Container,
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            cls   : ['go-notes-dialog-head'],
            items : [{
                module       : TextField,
                name         : 'name',
                labelText    : t('Name'),
                labelPosition: 'inline',
                required     : true,
                flex         : 1
            }, {
                module       : ComboBox,
                name         : 'noteBookId',
                labelText    : t('Notebook'),
                labelPosition: 'inline',
                required     : true,
                flex         : 'none',
                width        : 240,
                displayField : 'name',
                listConfig   : {module: TextList},
                valueField   : 'id',
                store        : {
                    keyProperty: 'id',
                    data       : (me.noteBooks || []).map(nb => ({id: nb.id, name: nb.name}))
                }
            }, {
                module   : Button,
                reference: 'typeButton',
                flex     : 'none',
                icon     : me.type,
                tooltip  : t('Switch between HTML and Markdown editor'),
                handler  : () => me.switchType()
            }]
        }, me.createContentField(me.type)]
    }

    /**
     * @param {String} type 'html' or 'markdown'
     * @returns {Object} item config
     */
    createContentField(type) {
        return {
            module   : type === 'markdown' ? MarkdownField : HtmlField,
            name     : 'content',
            reference: 'content',
            labelText: t('Content'),
            flex     : 1
        }
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.form.on('beforeload', ({data}) => {
            // existing notes keep their own type; prefilled new notes (e.g. from an e-mail) are HTML
            me.setType(data?.type || (data?.content ? 'html' : me.defaultType));
            me.getReference('typeButton').hidden = !me.form.isNew
        });

        // the type can only be set on create
        me.form.on('beforesave', event => {
            event.isNew && (event.data.type = me.type)
        })
    }

    /**
     * Sets the content type and swaps the editor if needed
     * @param {String} type 'html' or 'markdown'
     */
    setType(type) {
        let me    = this,
            field = me.getReference('content');

        type = type === 'markdown' ? 'markdown' : 'html';

        me.type = type;
        me.getReference('typeButton').icon = type;

        if (!field || (field instanceof MarkdownField) === (type === 'markdown')) {
            return
        }

        const parent = field.parent,
              index  = parent.indexOf(field);

        parent.removeAt(index);
        parent.insert(index, me.createContentField(type))
    }

    /**
     * Switches the editor of a new note between HTML and Markdown. The content is
     * cleared because it can't be converted.
     */
    async switchType() {
        let me    = this,
            field = me.getReference('content');

        if (!me.form.isNew) {
            return
        }

        // the last typing: the editor syncs debounced
        if (await field.flush()) {
            const ok = await ConfirmDialog.ask({
                appName : me.appName,
                windowId: me.windowId,
                message : t('Switching the editor will clear the content. Are you sure?')
            });

            if (!ok || me.isDestroyed) {
                return
            }
        }

        me.setType(me.type === 'markdown' ? 'html' : 'markdown')
    }

}

export default Neo.setupClass(NoteDialog);
