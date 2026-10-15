import Button     from '../../button/Button.mjs';
import Container  from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import FormWindow from '../../view/FormWindow.mjs';
import TextArea   from '../../../node_modules/neo.mjs/src/form/field/TextArea.mjs';
import TextField  from '../../../node_modules/neo.mjs/src/form/field/Text.mjs';
import client     from '../../jmap/Client.mjs';

/**
 * Note form with a second card, to try FormWindow outside the notes module
 */
class DemoNoteWindow extends FormWindow {
    static config = {
        className : 'GO.dev.DemoNoteWindow',
        entityName: 'Note',
        properties: ['id', 'name', 'noteBookId', 'content'],
        title     : 'FormWindow demo: Note'
    }

    createFormItems() {
        return [{
            module: TextField, name: 'name', labelText: 'Name', labelPosition: 'inline', required: true, flex: 'none'
        }, {
            module: TextField, name: 'noteBookId', labelText: 'Note book id', labelPosition: 'inline', required: true, flex: 'none'
        }]
    }

    addCustomFields() {
        this.addCard({
            header: {text: 'Content'},
            items : [{module: TextArea, name: 'content', labelText: 'Content (HTML)', labelPosition: 'inline', flex: 1}]
        })
    }
}

Neo.setupClass(DemoNoteWindow);

class FormWindowDemo extends Container {
    static config = {
        className: 'GO.dev.demo.FormWindow',
        layout   : {ntype: 'vbox', align: 'start'},
        style    : {padding: '16px', gap: '12px'}
    }

    construct(config) {
        super.construct(config);

        let me = this;

        me.items = [{
            ntype: 'component',
            text : 'Opens GO.view.FormWindow for a Note (id below, empty = new note in the first writable note book).'
        }, {
            module   : TextField,
            reference: 'noteId',
            labelText: 'Note id',
            width    : 200
        }, {
            module : Button,
            text   : 'Open',
            ui     : 'primary',
            handler: () => me.open().catch(e => console.error('FormWindow demo', e))
        }, {
            ntype    : 'component',
            reference: 'log'
        }]
    }

    async open() {
        let me = this,
            id = me.getReference('noteId').value;

        const values = {};

        if (!id) {
            const {list} = await client.queryGet('NoteBook', {limit: 1, properties: ['id']});
            values.noteBookId = list[0]?.id
        }

        const win = Neo.create(DemoNoteWindow, {appName: me.appName, windowId: me.windowId, entityId: id || null, values});

        win.on('save', ({data, isNew}) => {
            me.getReference('log').text = `saved ${isNew ? 'new' : ''} note ${data.id}: ${data.name}`
        })
    }
}

export default Neo.setupClass(FormWindowDemo);
