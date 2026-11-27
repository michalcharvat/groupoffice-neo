import Panel from '../../../../../../../views/neo/src/detail/Panel.mjs';
import {escapeHtml, sanitizeHtml} from '../../../../../../../views/neo/src/Format.mjs';
import {notify} from '../../../../../../../views/neo/src/Notify.mjs';
import {blobImages, contentToHtml} from '../../../../../../../views/neo/src/Markdown.mjs';
import {enableImageZoom} from '../../../../../../../views/neo/src/view/ImageWindow.mjs';
import PasswordPrompt   from '../../../../../../../views/neo/src/view/PasswordPrompt.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import {decryptNote, getLastPassword, isLegacyEncrypted, isLocked} from './Encrypt.mjs';

const t = translator('community', 'notes');

/**
 * @summary Right pane: the selected note, like the GOUI NoteDetail, on GO.detail.Panel (toolbar,
 * custom fields, comments, files, links, history); the note in a card on the app background.
 *
 * HTML content is sanitised by the server on write (Note::internalValidate()) and
 * rendered with innerHTML, which does not run <script> elements. Markdown content is
 * not sanitised by the server: contentToHtml() renders and sanitises it. Clicking an
 * image opens it large (GOUI Image.enableZoom()).
 *
 * Encrypted content (Encrypt.mjs) shows a lock until it is decrypted: with the last
 * password that worked, else with the password the user enters after clicking it.
 * Decrypted HTML was never sanitised by the server, so it goes through sanitizeHtml().
 * @class GO.notes.view.NoteDetail
 * @extends GO.detail.Panel
 */
class NoteDetail extends Panel {
    static config = {
        className : 'GO.notes.view.NoteDetail',
        cls       : ['go-notes-detail'],
        entityName: 'Note',
        cards     : ['customFields', 'comments', 'files', 'links', 'history']
    }

    /**
     * @summary The note card.
     * @returns {Object[]}
     */
    createBody() {
        return [{ntype: 'component', reference: 'body', html: ''}]
    }

    /**
     * @summary Opens the password prompt from the lock.
     */
    onConstructed() {
        super.onConstructed();
        this.getReference('body').addDomListeners([{click: this.onDecryptClick, delegate: '.go-notes-decrypt', scope: this}])
    }

    /**
     * @summary Legacy encrypted notes are read-only.
     * @param {Object} note
     * @returns {Boolean}
     */
    canEdit(note) {
        return !isLegacyEncrypted(note) && super.canEdit(note)
    }

    /**
     * @summary Renders the note, a lock for encrypted content until it is decrypted.
     * @param {Object|null} note record of GO.notes.model.Note
     */
    renderRecord(note) {
        let me   = this,
            body = me.getReference('body');

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
     * @summary Shows the decrypted content of the current note
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
        if (me.isDestroyed || me.record?.id !== note.id || me.record.content !== note.content) {
            return
        }

        me.renderBody(note, note.type === 'markdown' ? contentToHtml(content, 'markdown') : sanitizeHtml(blobImages(content)))
    }

    /**
     * @summary Asks for the password and decrypts the shown note.
     */
    async onDecryptClick() {
        let me   = this,
            note = me.record;

        if (!note || !isLocked(note)) {
            return
        }

        const password = await PasswordPrompt.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Enter password to decrypt')
        });

        password && me.record?.id === note.id && me.decrypt(me.record, password)
    }
}

export default Neo.setupClass(NoteDetail);
