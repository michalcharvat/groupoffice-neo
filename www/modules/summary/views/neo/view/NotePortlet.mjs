import Container     from '../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import TextArea      from '../../../../../views/neo/node_modules/neo.mjs/src/form/field/TextArea.mjs';
import client        from '../../../../../views/neo/src/jmap/Client.mjs';
import {notifyError} from '../../../../../views/neo/src/Notify.mjs';

/**
 * "Notes" portlet: the user's own note (su_notes, summary/note/load and submit), saved a
 * second after the user stops typing and when the portlet goes away.
 */
class NotePortlet extends Container {
    static config = {
        className: 'GO.summary.NotePortlet',
        cls      : ['go-note-portlet'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module   : TextArea,
            reference: 'text',
            hideLabel: true,
            flex     : 1
        }]
    }

    /**
     * Last loaded or saved text
     * @member {String|null} saved=null
     */
    saved = null

    onConstructed() {
        super.onConstructed();

        let me    = this,
            field = me.getReference('text');

        field.on('change', ({value}) => me.scheduleSave(value));
        me.refresh()
    }

    async refresh() {
        let me = this;

        try {
            const {data} = await client.legacy('summary/note/load');

            if (!me.isDestroyed) {
                me.saved = data?.text ?? '';
                me.getReference('text').value = me.saved
            }
        } catch (e) {
            notifyError(me, e)
        }
    }

    scheduleSave(value) {
        let me = this;

        clearTimeout(me.saveTimer);
        // not while loading: the change event of setting the loaded value
        me.saved !== null && value !== me.saved && (me.saveTimer = setTimeout(() => me.save(), 1000))
    }

    async save() {
        let me   = this,
            text = String(me.getReference('text').value ?? '');

        clearTimeout(me.saveTimer);

        if (me.saved === null || text === me.saved) {
            return
        }

        try {
            await client.legacy('summary/note/submit', {text});
            me.saved = text
        } catch (e) {
            notifyError(me, e)
        }
    }

    destroy(...args) {
        // unsaved typing when the portlet is removed or the window closes
        this.save();
        super.destroy(...args)
    }
}

export default Neo.setupClass(NotePortlet);
