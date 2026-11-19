import Container from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar   from '../../../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import {LEVEL_DELETE, LEVEL_WRITE} from '../../../../../../../views/neo/src/Acl.mjs';
import Button      from '../../../../../../../views/neo/src/button/Button.mjs';
import {escapeHtml, sanitizeHtml} from '../../../../../../../views/neo/src/Format.mjs';
import {notify} from '../../../../../../../views/neo/src/Notify.mjs';
import {print} from '../../../../../../../views/neo/src/print.mjs';
import {contentToHtml} from '../../../../../../../views/neo/src/Markdown.mjs';
import {enableImageZoom} from '../../../../../../../views/neo/src/view/ImageWindow.mjs';
import CommentsPanel from '../../../../../../../views/neo/src/detail/CommentsPanel.mjs';
import FilesPanel    from '../../../../../../../views/neo/src/detail/FilesPanel.mjs';
import HistoryPanel  from '../../../../../../../views/neo/src/detail/HistoryPanel.mjs';
import AddLinkButton    from '../../../../../../../views/neo/src/link/AddLinkButton.mjs';
import LinkBrowseButton from '../../../../../../../views/neo/src/link/LinkBrowseButton.mjs';
import LinkCards        from '../../../../../../../views/neo/src/link/LinkCards.mjs';
import DetailFieldsets  from '../../../../../../../views/neo/src/customfields/DetailFieldsets.mjs';
import PasswordPrompt   from '../../../../../../../views/neo/src/view/PasswordPrompt.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import {decryptNote, getLastPassword, isLegacyEncrypted, isLocked} from './Encrypt.mjs';

const t = translator('community', 'notes');

/**
 * Right pane: the selected note, like the GOUI NoteDetail (toolbar with edit and a
 * more menu, the note in a card on the app background).
 *
 * HTML content is sanitised by the server on write (Note::internalValidate()) and
 * rendered with innerHTML, which does not run <script> elements. Markdown content is
 * not sanitised by the server: contentToHtml() renders and sanitises it. Clicking an
 * image opens it large (GOUI Image.enableZoom()).
 *
 * Encrypted content (Encrypt.mjs) shows a lock until it is decrypted: with the last
 * password that worked, else with the password the user enters after clicking it.
 * Decrypted HTML was never sanitised by the server, so it goes through sanitizeHtml().
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
                module   : LinkCards,
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

        let me = this;

        me.getReference('body').addDomListeners([{click: me.onDecryptClick, delegate: '.go-notes-decrypt', scope: me}]);

        me.getReference('moreButton').menu = [
            {text: t('Print'), icon: 'print', handler: () => me.onPrint()},
            {separator: true},
            {id: 'delete', text: t('Delete'), icon: 'delete', handler: () => me.onDelete()}
        ]
    }

    /**
     * @param {Object|null} note
     */
    setNote(note) {
        let me    = this,
            body  = me.getReference('body'),
            level = note?.permissionLevel || 0;

        me.note = note;

        me.getReference('editButton').disabled = !note || isLegacyEncrypted(note) || level < LEVEL_WRITE;
        me.getReference('moreButton').disabled = !note;
        me.getReference('moreButton').setMenuItemDisabled('delete', level < LEVEL_DELETE);

        me.getReference('addLinkButton').setEntity(note ? 'Note' : null, note?.id || null, note);

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

        if (isLocked(note)) {
            me.renderBody(note, `<p class="go-empty"><button type="button" class="go-notes-decrypt"><i class="go-icon">lock</i> ${escapeHtml(t('Click here to decrypt and read the content.'))}</button></p>`);

            const password = getLastPassword();
            password && me.decrypt(note, password, true);
            return
        }

        me.renderBody(note, contentToHtml(note.content, note.type))
    }

    /**
     * @param {Object} note
     * @param {String} html content, safe
     * @protected
     */
    renderBody(note, html) {
        const body = this.getReference('body');

        body.html = `
            <div class="go-card go-pad">
                <h3>${escapeHtml(note.name)}</h3>
                <br>
                <div class="go-image-zoom${note.type === 'markdown' ? ' go-markdown' : ''}">${html}</div>
            </div>`;

        // also after a popout: the addon is loaded per window
        enableImageZoom(body)
    }

    /**
     * Shows the decrypted content of the current note
     * @param {Object} note
     * @param {String} password
     * @param {Boolean} [silent=false] no error for a wrong password (the last password tried)
     * @returns {Promise<void>}
     */
    async decrypt(note, password, silent = false) {
        let me = this,
            content;

        try {
            content = await decryptNote(note, password)
        } catch (e) {
            if (!silent && !me.isDestroyed) {
                notify(me, t('Wrong password'), {title: t('Cannot decrypt'), iconCls: 'fa fa-triangle-exclamation', closable: true})
            }
            return
        }

        // another note was selected meanwhile (a reload of the same note is fine)
        if (me.isDestroyed || me.note?.id !== note.id || me.note.content !== note.content) {
            return
        }

        me.renderBody(note, note.type === 'markdown' ? contentToHtml(content, 'markdown') : sanitizeHtml(content))
    }

    async onDecryptClick() {
        let me   = this,
            note = me.note;

        if (!note || !isLocked(note)) {
            return
        }

        const password = await PasswordPrompt.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Enter password to decrypt')
        });

        password && me.note?.id === note.id && me.decrypt(me.note, password)
    }

    onEdit() {
        this.note && this.fire('edit', {note: this.note})
    }

    onDelete() {
        this.note && this.fire('delete', {note: this.note})
    }

    /**
     * Prints the note with its cards (GOUI NoteDetail print())
     */
    onPrint() {
        this.note && print(this.getReference('scroller'), {title: this.note.name})
    }
}

export default Neo.setupClass(NoteDetail);
