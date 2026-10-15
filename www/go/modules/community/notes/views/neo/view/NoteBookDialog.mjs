import SharePanel   from '../../../../../../../views/neo/src/permissions/SharePanel.mjs';
import FormWindow   from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import TextField    from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'notes');

/**
 * Create or edit a note book (GOUI NoteBookDialog): name and, on a second tab,
 * who it is shared with (acl).
 */
class NoteBookDialog extends FormWindow {
    static config = {
        className : 'GO.notes.view.NoteBookDialog',
        cls       : ['go-form-window', 'go-notebook-dialog'],
        entityName: 'NoteBook',
        properties: ['id', 'name', 'acl'],
        title     : t('Note book'),
        wrapperStyle: {height: '70vh', left: 'calc(50vw - 300px)', top: '15vh', width: '600px'},
        /**
         * Id when editing, null for a new note book (= entityId)
         * @member {String|null} noteBookId=null
         */
        noteBookId: null,
        /**
         * Initial name of a new note book
         * @member {String} name=''
         */
        name: ''
    }

    construct(config) {
        config.noteBookId && (config.entityId ??= config.noteBookId);
        config.values ??= {name: config.name || ''};

        super.construct(config);

        this.on('save', ({data}) => this.fire('saved', {id: data.id}))
    }

    onConstructed() {
        // the cards exist from here on; 'formReady' fires later, after the load
        const result = super.onConstructed();
        this.addSharePanel();
        return result
    }

    /**
     * "Permissions" tab: the acl property as a form field
     */
    addSharePanel() {
        let me = this;

        me.addCard({
            header: {text: t('Permissions')},
            items : [{module: SharePanel, reference: 'sharePanel', flex: 1}]
        });

        // the ACL members are listed first; a new note book gets the default ACL
        me.on('formReady', async ({currentId}) => {
            const panel = me.getReference('sharePanel');

            await panel?.setEntity('NoteBook', currentId || null).catch(e => console.error('SharePanel', e));

            // a new note book's default ACL arrives after the form took its unmodified state
            !currentId && panel && !me.isDestroyed && me.form.setOriginalValue('acl', panel.getSubmitValue())
        })
    }

    createFormItems() {
        return [{
            module       : TextField,
            name         : 'name',
            labelText    : t('Name'),
            labelPosition: 'inline',
            required     : true
        }]
    }
}

export default Neo.setupClass(NoteBookDialog);
