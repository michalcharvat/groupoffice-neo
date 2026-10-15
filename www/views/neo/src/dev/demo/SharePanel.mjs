import Container     from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import FormContainer from '../../../node_modules/neo.mjs/src/form/Container.mjs';
import Button        from '../../button/Button.mjs';
import JmapComboBox  from '../../form/field/JmapComboBox.mjs';
import client        from '../../jmap/Client.mjs';
import SharePanel    from '../../permissions/SharePanel.mjs';
import {escapeHtml}  from '../../Format.mjs';

// Save and Delete only touch note books created by this demo
const TEST_PREFIX = 'Share test ';

/**
 * Dev demo: SharePanel of a NoteBook. Pick one to view its ACL; "Create test
 * note book" makes one that Save may change and Delete removes.
 */
class SharePanelDemo extends Container {
    static config = {
        className: 'GO.dev.demo.SharePanel',
        layout   : {ntype: 'vbox', align: 'stretch'},
        style    : {padding: '16px', gap: '12px', overflow: 'hidden'},
        items    : [{
            ntype : 'container',
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'end'},
            style : {gap: '8px', flexWrap: 'wrap'},
            items : [{
                module       : JmapComboBox,
                reference    : 'noteBook',
                entity       : 'NoteBook',
                name         : 'noteBookId',
                labelText    : 'NoteBook',
                labelPosition: 'inline',
                jmapSort     : [{property: 'name', isAscending: true}],
                properties   : ['id', 'name'],
                width        : 280
            }, {
                module   : Button,
                ui       : 'secondary',
                text     : 'Create test note book',
                reference: 'onCreate'
            }, {
                module   : Button,
                ui       : 'secondary',
                text     : 'Get value',
                reference: 'onGetValue'
            }, {
                module   : Button,
                ui       : 'primary',
                text     : 'Save',
                reference: 'onSave'
            }, {
                module   : Button,
                ui       : 'secondary',
                text     : 'Delete test note book',
                reference: 'onDelete'
            }]
        }, {
            module   : FormContainer,
            reference: 'form',
            flex     : 1,
            layout   : 'fit',
            items    : [{module: SharePanel, reference: 'sharePanel'}]
        }, {
            ntype    : 'component',
            reference: 'output',
            tag      : 'pre',
            flex     : 'none',
            style    : {maxHeight: '160px', overflow: 'auto', margin: 0},
            text     : ''
        }]
    }

    /** {id, name} of the shown note book */
    noteBook = null

    onConstructed() {
        super.onConstructed();

        let me = this;

        ['onCreate', 'onGetValue', 'onSave', 'onDelete'].forEach(name => {
            me.getReference(name).handler = () => me[name]().catch(e => me.print(String(e.message || e)))
        });

        me.getReference('noteBook').on('change', ({value}) => {
            value?.id && value.id !== me.noteBook?.id && me.show(value.id).catch(e => me.print(String(e.message || e)))
        })
    }

    print(text) {
        this.getReference('output').html = escapeHtml(text)
    }

    async show(id) {
        let me         = this,
            sharePanel = me.getReference('sharePanel'),
            [noteBook] = await client.get('NoteBook', [id], ['id', 'name', 'acl']);

        me.noteBook = noteBook || null;

        if (noteBook) {
            sharePanel.reset(noteBook.acl || null);
            await sharePanel.setEntity('NoteBook', noteBook.id);
            me.print('Loaded acl of "' + noteBook.name + '": ' + JSON.stringify(noteBook.acl))
        }
    }

    async onCreate() {
        let me       = this,
            name     = TEST_PREFIX + new Date().toISOString().slice(11, 19),
            response = await client.set('NoteBook', {create: {n1: {name}}}),
            id       = response.created?.n1?.id;

        me.getReference('noteBook').value = id;
        await me.show(id)
    }

    async onGetValue() {
        let me         = this,
            sharePanel = me.getReference('sharePanel'),
            values     = await me.getReference('form').getValues();

        me.print('form.getValues(): ' + JSON.stringify(values, null, 1) + '\nisDirty: ' + sharePanel.isDirty)
    }

    async onSave() {
        let me         = this,
            sharePanel = me.getReference('sharePanel');

        if (!me.noteBook?.name?.startsWith(TEST_PREFIX)) {
            me.print('Save only changes note books named "' + TEST_PREFIX + '…" (create one first)');
            return
        }

        await client.set('NoteBook', {update: {[me.noteBook.id]: {acl: sharePanel.getSubmitValue()}}});
        await me.show(me.noteBook.id)
    }

    async onDelete() {
        let me = this;

        if (!me.noteBook?.name?.startsWith(TEST_PREFIX)) {
            me.print('Delete only removes note books named "' + TEST_PREFIX + '…"');
            return
        }

        await client.set('NoteBook', {destroy: [me.noteBook.id]});
        me.print('Deleted "' + me.noteBook.name + '"');
        me.noteBook = null;
        me.getReference('noteBook').value = null;
        me.getReference('sharePanel').reset(null)
    }
}

export default Neo.setupClass(SharePanelDemo);
