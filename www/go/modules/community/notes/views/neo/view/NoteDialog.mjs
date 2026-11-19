import ComboBox     from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/ComboBox.mjs';
import Container    from '../../../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Button       from '../../../../../../../views/neo/src/button/Button.mjs';
import HtmlField    from '../../../../../../../views/neo/src/form/field/HtmlField.mjs';
import MarkdownField from '../../../../../../../views/neo/src/form/field/MarkdownField.mjs';
import ConfirmDialog from '../../../../../../../views/neo/src/view/ConfirmDialog.mjs';
import FormWindow   from '../../../../../../../views/neo/src/view/FormWindow.mjs';
import TextList     from '../../../../../../../views/neo/src/list/TextList.mjs';
import TextField    from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Text.mjs';
import PasswordField from '../../../../../../../views/neo/node_modules/neo.mjs/src/form/field/Password.mjs';
import DataSourceForm from '../../../../../../../views/neo/src/form/DataSourceForm.mjs';
import {notify}     from '../../../../../../../views/neo/src/Notify.mjs';
import PasswordPrompt from '../../../../../../../views/neo/src/view/PasswordPrompt.mjs';
import {translator} from '../../../../../../../views/neo/src/Translate.mjs';
import {canEncrypt, decrypt, encrypt, getLastPassword, isEncrypted} from './Encrypt.mjs';

const t = translator('community', 'notes');

/**
 * Create or edit a note (GOUI NoteDialog).
 *
 * The content is HTML or Markdown (Note.type). A new note gets the user's default
 * editor (notesSettings.defaultType) and can switch it, which clears the content;
 * an existing note keeps its type.
 *
 * Encryption (GOUI): the lock button shows a password and its confirmation; the content
 * is encrypted in the browser on save (Encrypt.mjs). An encrypted note is decrypted on
 * load with the last password that worked, else the user is asked; cancelling closes
 * the dialog. Turning the lock off saves the content unencrypted.
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

    /**
     * The lock button is on: the content is encrypted on save
     * @member {Boolean} encrypted=false
     */
    encrypted = false

    /**
     * The loaded note is encrypted, with this password
     * @member {String|null} loadedPassword=null
     */
    loadedPassword = null

    /**
     * Asking for the password of the loaded note: no save until it is decrypted
     * @member {Boolean} decrypting=false
     */
    decrypting = false

    /**
     * Content to send instead of the editor's (encrypted, or decrypted for good), undefined for none
     * @member {String|undefined} saveContent
     */
    saveContent = undefined

    /**
     * Text and password of the content encrypted by the last submit(), for onNoteSave()
     * @member {String|undefined} savedPlaintext
     */
    savedPlaintext = undefined

    /**
     * @member {String|null} savedPassword=null
     */
    savedPassword = null

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
            }, {
                module   : Button,
                reference: 'encryptButton',
                flex     : 'none',
                icon     : 'lock_open',
                tooltip  : t('Encrypt'),
                // crypto.subtle needs a secure context
                hidden   : !canEncrypt(),
                handler  : () => me.setEncrypted(!me.encrypted)
            }]
        }, {
            // no names: the passwords are no note properties
            module   : Container,
            reference: 'encryptFields',
            flex     : 'none',
            hidden   : true,
            layout   : {ntype: 'hbox', align: 'start'},
            cls      : ['go-notes-dialog-head'],
            items    : [{
                module       : PasswordField,
                reference    : 'password',
                labelText    : t('Password'),
                labelPosition: 'inline',
                autoComplete : 'new-password',
                flex         : 1
            }, {
                module       : PasswordField,
                reference    : 'passwordConfirm',
                labelText    : t('Confirm'),
                labelPosition: 'inline',
                autoComplete : 'new-password',
                flex         : 1
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

        me.form.on('load', ({data}) => me.onNoteLoad(data));

        me.form.on('beforesave', event => {
            // the type can only be set on create
            event.isNew && (event.data.type = me.type);

            if (me.saveContent !== undefined) {
                event.data.content = me.saveContent
            } else if (me.encrypted) {
                // typing after submit() took the text: never send it unencrypted
                delete event.data.content
            }
        });

        me.form.on('save', ({data}) => me.onNoteSave(data))
    }

    /**
     * Shows the lock button pressed and the password fields
     * @param {Boolean} encrypted
     */
    setEncrypted(encrypted) {
        let me = this;

        me.encrypted = encrypted;
        const button = me.getReference('encryptButton');

        button.pressed = encrypted;
        button.icon    = encrypted ? 'lock' : 'lock_open';
        me.getReference('encryptFields').hidden  = !encrypted
    }

    /**
     * @param {String} password
     */
    setPasswordFields(password) {
        let me = this;

        me.getReference('password').value        = password;
        me.getReference('passwordConfirm').value = password
    }

    /**
     * Note loaded or prepared: decrypts encrypted content
     * @param {Object} data
     * @protected
     */
    async onNoteLoad(data) {
        let me      = this,
            content = data?.content;

        me.loadedPassword = null;

        if (!isEncrypted(content)) {
            me.setEncrypted(false);
            return
        }

        me.decrypting = true;
        me.setEncrypted(true);
        // no cipher text in the editor while asking
        me.getReference('content').value = '';

        let password  = getLastPassword(),
            asked     = false,
            plaintext = null;

        while (true) {
            if (password) {
                plaintext = await decrypt(content, password).catch(() => null);

                if (me.isDestroyed) {
                    return
                }

                if (plaintext !== null) {
                    break
                }

                // the last password is tried silently
                asked && notify(me, t('Wrong password'), {title: t('Cannot decrypt'), iconCls: 'fa fa-triangle-exclamation', closable: true})
            }

            password = await PasswordPrompt.ask({
                appName : me.appName,
                windowId: me.windowId,
                title   : t('Enter password to decrypt')
            });
            asked = true;

            if (me.isDestroyed) {
                return
            }

            if (!password) {
                me.close();
                return
            }
        }

        const field = me.getReference('content');

        field.value = plaintext;
        me.form.setOriginalValue(me.form.getFieldPath(field), DataSourceForm.fieldValue(field));

        me.loadedPassword = password;
        me.setPasswordFields(password);
        me.decrypting = false
    }

    /**
     * Saved: the form took the note from the server, with the encrypted content and
     * empty password fields. Shows the text and the password again (the window stays
     * open when links fail).
     * @param {Object} data the saved note
     * @protected
     */
    onNoteSave(data) {
        let me = this;

        if (!isEncrypted(data?.content) || me.savedPlaintext === undefined) {
            me.loadedPassword = null;
            return
        }

        const field = me.getReference('content');

        field.value = me.savedPlaintext;
        me.form.setOriginalValue(me.form.getFieldPath(field), DataSourceForm.fieldValue(field));

        me.loadedPassword = me.savedPassword;
        me.setPasswordFields(me.savedPassword)
    }

    /**
     * Encrypts the content (or stores it decrypted when the lock was turned off), then saves
     * @returns {Promise<Object|false>}
     */
    async submit() {
        let me = this;

        if (me.decrypting) {
            return false
        }

        me.saveContent    = undefined;
        me.savedPlaintext = undefined;
        me.savedPassword  = null;

        if (me.encrypted || me.loadedPassword !== null) {
            const field     = me.getReference('content'),
                  plaintext = (await field.flush()) || '',
                  path      = me.form.getFieldPath(field),
                  modified  = !DataSourceForm.isSameValue(DataSourceForm.fieldValue(field), me.form.originalValues[path]);

            if (me.encrypted) {
                const passwordField = me.getReference('password'),
                      confirmField  = me.getReference('passwordConfirm'),
                      password      = passwordField.value || '';

                passwordField.error = password ? null : t('This field is required');
                confirmField.error  = password && password !== (confirmField.value || '') ? t('Passwords do not match') : null;

                if (!password || confirmField.error) {
                    return false
                }

                me.savedPlaintext = plaintext;
                me.savedPassword  = password;

                // unchanged text with the same password stays as it is
                if (me.form.isNew || modified || password !== me.loadedPassword) {
                    me.saveContent = await encrypt(plaintext, password)
                }
            } else {
                // lock turned off: the text is stored unencrypted
                me.saveContent = plaintext
            }
        }

        return super.submit()
    }

    /**
     * Turning encryption on or off, or a new password, is a change
     * @returns {Promise<Boolean>}
     */
    async isModified() {
        let me = this;

        if (me.decrypting) {
            return false
        }

        return await super.isModified()
            || me.encrypted !== (me.loadedPassword !== null)
            || (me.encrypted && (me.getReference('password').value || '') !== me.loadedPassword)
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
