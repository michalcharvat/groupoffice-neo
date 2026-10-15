import Container from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar   from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_DELETE, LEVEL_WRITE} from '../../../../../../../views/neo/src/Acl.mjs';
import Button      from '../../../../../../../views/neo/src/button/Button.mjs';
import {escapeHtml} from '../../../../../../../views/neo/src/Format.mjs';
import CommentsPanel from '../../../../../../../views/neo/src/detail/CommentsPanel.mjs';
import FilesPanel    from '../../../../../../../views/neo/src/detail/FilesPanel.mjs';
import HistoryPanel  from '../../../../../../../views/neo/src/detail/HistoryPanel.mjs';
import AddLinkButton    from '../../../../../../../views/neo/src/link/AddLinkButton.mjs';
import LinkBrowseButton from '../../../../../../../views/neo/src/link/LinkBrowseButton.mjs';
import LinkDetail       from '../../../../../../../views/neo/src/link/LinkDetail.mjs';
import DetailFieldsets  from '../../../../../../../views/neo/src/customfields/DetailFieldsets.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';

const t = translator('community', 'notes');

/**
 * Right pane: the selected note, like the GOUI NoteDetail (toolbar with edit and a
 * more menu, the note in a card on the app background).
 *
 * Content is HTML sanitised by the server on write (Note::cleanContent). It is
 * rendered with innerHTML, which does not run <script> elements.
 */
class NoteDetail extends Container {
    static config = {
        className: 'GO.notes.view.NoteDetail',
        cls      : ['go-notes-detail'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module   : Toolbar,
            cls      : ['go-border-bottom'],
            flex     : 'none',
            reference: 'toolbar',
            items    : ['->', {
                module   : Button,
                icon     : 'edit',
                reference: 'editButton',
                tooltip  : t('Edit'),
                disabled : true,
                handler  : 'up.onEdit'
            }, {
                module   : AddLinkButton,
                reference: 'addLinkButton'
            }, {
                module   : LinkBrowseButton,
                reference: 'linkBrowseButton'
            }, {
                module   : Button,
                icon     : 'more_vert',
                reference: 'moreButton',
                tooltip  : t('More'),
                disabled : true
            }]
        }, {
            // GOUI DetailPanel: the entity card, then go.detail.Panel's comments, files, history
            ntype    : 'container',
            cls      : ['go-detail-scroller'],
            flex     : 1,
            layout   : {ntype: 'vbox', align: 'stretch'},
            reference: 'scroller',
            items    : [{
                ntype    : 'component',
                reference: 'body',
                flex     : 'none',
                html     : ''
            }, {
                // a card per custom field set with values
                module   : DetailFieldsets,
                reference: 'customFields',
                flex     : 'none'
            }, {
                module   : CommentsPanel,
                reference: 'comments',
                flex     : 'none',
                hidden   : true
            }, {
                module   : FilesPanel,
                reference: 'files',
                flex     : 'none',
                hidden   : true
            }, {
                // shows itself when the note has links
                module   : LinkDetail,
                reference: 'links',
                flex     : 'none'
            }, {
                module   : HistoryPanel,
                reference: 'history',
                flex     : 'none',
                hidden   : true
            }]
        }]
    }

    /**
     * @member {Object|null} note=null record of GO.notes.model.Note
     */
    note = null

    onConstructed() {
        super.onConstructed();

        this.getReference('moreButton').menu = [{text: t('Delete'), icon: 'delete', handler: () => this.onDelete()}]
    }

    /**
     * @param {Object|null} note
     */
    setNote(note) {
        let me    = this,
            body  = me.getReference('body'),
            level = note?.permissionLevel || 0;

        me.note = note;

        me.getReference('editButton').disabled = !note || !!note.password || level < LEVEL_WRITE;
        me.getReference('moreButton').disabled = !note || level < LEVEL_DELETE;

        me.getReference('addLinkButton').setEntity(note ? 'Note' : null, note?.id || null);

        if (me.getReference('linkBrowseButton').target?.entityId !== note?.id) {
            me.getReference('linkBrowseButton').setEntity(note ? 'Note' : null, note?.id || null)
        }

        if (me.getReference('links').current?.entityId !== note?.id) {
            me.getReference('links').setEntity(note ? 'Note' : null, note?.id || null, note)
        }

        // also for the same note: setNote() follows a reload (e.g. after editing)
        me.getReference('customFields').setEntity(note ? 'Note' : null, note?.id || null);

        // the cards follow the note (same id: they keep their content while reloading)
        ['comments', 'files', 'history'].forEach(ref => {
            const card = me.getReference(ref);

            card.hidden = !note;

            if (card.current?.entityId !== note?.id) {
                card.setEntity(note ? 'Note' : null, note?.id || null, note)
            } else if (note) {
                card.current.record = note
            }
        });

        if (!note) {
            body.html = '';
            return
        }

        const content = note.password
            ? '<p class="go-empty"><i class="go-icon">lock</i> This note is encrypted. Open it in the classic UI to decrypt.</p>'
            : (note.content || '');

        body.html = `
            <div class="go-card go-pad">
                <h3>${escapeHtml(note.name)}</h3>
                <br>
                ${content}
            </div>`
    }

    onEdit() {
        this.note && this.fire('edit', {note: this.note})
    }

    onDelete() {
        this.note && this.fire('delete', {note: this.note})
    }
}

export default Neo.setupClass(NoteDetail);
