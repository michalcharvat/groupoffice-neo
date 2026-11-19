import Field                from '../../../node_modules/neo.mjs/src/form/field/Base.mjs';
import client               from '../../jmap/Client.mjs';
import uploader, {Uploader} from '../../jmap/Uploader.mjs';
import {notifyError}        from '../../Notify.mjs';
import {t}                  from '../../Translate.mjs';

/**
 * Rich text field, port of GOUI HtmlField (contenteditable + toolbar).
 *
 * The editor lives on the main thread: the main thread addon
 * GO.main.addon.HtmlEditor (src/main/addon/HtmlEditor.mjs, loaded per window on
 * mount) runs the toolbar commands and sends the HTML back as "htmlChange".
 * This field only renders the frame: label, toolbar buttons (data-cmd), an empty
 * link bar and an empty editor element whose content the addon owns.
 *
 *     {module: HtmlField, name: 'content', labelText: t('Content'), flex: 1}
 *
 * Works in a form.Container like any neo field (name, value, getSubmitValue(),
 * isDirty, change event). Moving to another window (popout dialog) recreates the
 * editor there with the current value.
 *
 * imageUpload (GOUI "insertimage" + client.upload(), e.g. notes): images pasted, dropped
 * or chosen with the toolbar's image button are uploaded as blobs and kept as
 * <img data-blob-id="…" src="…/download.php?blob=…">; the server attaches the blobs it
 * finds in the HTML. flush() waits for running uploads.
 */

/** GOUI default toolbar, minus image, code and source edit */
const DEFAULT_TOOLBAR = [
    'bold', 'italic', 'underline', 'strikeThrough', '-',
    'foreColor', 'backColor', '-',
    'insertOrderedList', 'insertUnorderedList', 'indent', 'outdent', '-',
    'createLink', 'removeFormat'
];

/** cmd → Material icon + title (titles via t() at render time) */
const COMMANDS = {
    bold               : {icon: 'format_bold',            title: 'Bold'},
    italic             : {icon: 'format_italic',          title: 'Italic'},
    underline          : {icon: 'format_underlined',      title: 'Underline'},
    strikeThrough      : {icon: 'format_strikethrough',   title: 'Strikethrough'},
    foreColor          : {icon: 'format_color_text',      title: 'Text color', color: '#d32f2f'},
    backColor          : {icon: 'format_color_fill',      title: 'Background color', color: '#ffeb3b'},
    insertOrderedList  : {icon: 'format_list_numbered',   title: 'Numbered list'},
    insertUnorderedList: {icon: 'format_list_bulleted',   title: 'Bullet list'},
    indent             : {icon: 'format_indent_increase', title: 'Indent'},
    outdent            : {icon: 'format_indent_decrease', title: 'Outdent'},
    createLink         : {icon: 'link',                   title: 'Create link'},
    // imageUpload: a label around a file input, the addon inserts the chosen images
    image              : {icon: 'image',                  title: 'Image'},
    // added by GO.form.field.HtmlFieldMentionPlugin
    mention            : {icon: 'alternate_email',        title: 'Mention user'},
    removeFormat       : {icon: 'format_clear',           title: 'Remove formatting'}
};


class HtmlField extends Field {
    static config = {
        className: 'GO.form.field.HtmlField',
        ntype    : 'go-htmlfield',
        baseCls  : ['go-htmlfield'],
        /**
         * @member {String|null} labelText_=null
         */
        labelText_: null,
        /**
         * Shown while the editor is empty
         * @member {String|null} placeholder_=null
         */
        placeholder_: null,
        /**
         * Pasted image files (screenshots) are inserted as data: images. Chrome ignores
         * them otherwise. For the e-mail composer: the server embeds data: images on send.
         * @member {Boolean} pasteImages=false
         */
        pasteImages: false,
        /**
         * Pasted, dropped and chosen images (toolbar "image" button, added after "createLink")
         * are uploaded as blobs. Overrides pasteImages.
         * @member {Boolean} imageUpload=false
         */
        imageUpload: false,
        /**
         * @member {Boolean} readOnly_=false
         */
        readOnly_: false,
        /**
         * Commands, '-' = separator. See COMMANDS.
         * @member {String[]} toolbar=DEFAULT_TOOLBAR
         */
        toolbar: DEFAULT_TOOLBAR,
        /**
         * @member {String} value=''
         */
        value: '',
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {cls: ['go-htmlfield-label'], removeDom: true},
            {cls: ['go-htmlfield-toolbar'], role: 'toolbar', cn: []},
            {cls: ['go-htmlfield-linkbar']},
            {cls: ['go-htmlfield-editor'], contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', spellcheck: 'true'}
        ]}
    }

    /**
     * Set by GO.form.field.HtmlFieldMentionPlugin: the editor reports "@name" ("mentionQuery")
     * @member {GO.form.field.HtmlFieldMentionPlugin|null} mentionPlugin=null
     */
    mentionPlugin = null

    /**
     * Window the main thread editor was created in, null while there is none
     * @member {String|null} #editorWindowId=null
     */
    #editorWindowId = null
    /**
     * Increased on every mount / unmount: a late createInstance reply of an old mount is ignored
     * @member {Number} #generation=0
     */
    #generation = 0
    /**
     * Window whose editor the value just came from: no echo back to it
     * @member {String|null} #valueSource=null
     */
    #valueSource = null

    /**
     * Uploads running (flush() waits for them)
     * @member {Set} uploads=new Set()
     */
    uploads = new Set()

    /**
     * Upload results, token → blobId (null: failed). Applied again when the editor is
     * recreated (popout): its images still carry their data-upload token.
     * @member {Map} #uploadedImages=new Map()
     */
    #uploadedImages = new Map()

    /**
     * Main thread addon that runs the editor, see Neo.Main.importAddon()
     * @returns {String}
     */
    get addonName() {return 'WS/HtmlEditor'}

    /**
     * Proxy of the main thread addon in this worker
     * @returns {Object}
     */
    get addon() {return Neo.ns('GO.main.addon.HtmlEditor')}

    /**
     * Window of the main thread editor, null while there is none
     * @returns {String|null}
     */
    get editorWindowId() {return this.#editorWindowId}

    get labelNode()   {return this.vdom.cn[0]}
    get toolbarNode() {return this.vdom.cn[1]}
    get linkBarNode() {return this.vdom.cn[2]}
    get editorNode()  {return this.vdom.cn[3]}

    construct(config) {
        super.construct(config);

        let me = this;

        me.toolbarNode.id = me.id + '__toolbar';
        // subclasses without a link bar return null
        me.linkBarNode && (me.linkBarNode.id = me.id + '__linkbar');
        me.editorNode.id  = me.id + '__editor';
        me.toolbarNode['aria-label'] = t('Formatting');
        me.renderToolbar();

        me.addDomListeners({
            htmlChange: me.onHtmlChange,
            htmlFiles : me.onHtmlFiles,
            scope     : me
        })
    }

    /**
     * Translated texts the addon shows itself
     * @returns {Object}
     */
    getEditorLabels() {
        return {
            cancel   : t('Cancel'),
            mention  : t('Mention user'),
            noResults: t('No results found'),
            ok       : t('Ok'),
            unlink   : t('Remove link'),
            url      : t('URL')
        }
    }

    /**
     * Toolbar command → {icon, title, color}
     * @returns {Object}
     */
    get commands() {return COMMANDS}

    /**
     * The toolbar commands, with "image" when images are uploaded (imageUpload)
     * @returns {String[]}
     */
    getToolbarCommands() {
        let toolbar = this.toolbar;

        if (this.imageUpload && !toolbar.includes('image')) {
            const index = toolbar.indexOf('createLink');

            toolbar = [...toolbar];
            toolbar.splice(index < 0 ? toolbar.length : index + 1, 0, 'image')
        } else if (!this.imageUpload) {
            toolbar = toolbar.filter(cmd => cmd !== 'image')
        }

        return toolbar
    }

    renderToolbar() {
        let me = this;

        me.toolbarNode.cn = me.getToolbarCommands().map(cmd => {
            if (cmd === '-') {
                return {cls: ['go-htmlfield-separator']}
            }

            const {icon, title, color} = me.commands[cmd],
                  text                 = t(title),
                  iconNode             = {tag: 'span', cls: ['go-icon'], 'aria-hidden': 'true', text: icon};

            // image: the label opens the file chooser of its input, the addon inserts the images
            if (cmd === 'image') {
                return {
                    tag  : 'label',
                    cls  : ['go-htmlfield-btn', 'go-htmlfield-upload'],
                    title: text,
                    cn   : [iconNode, {tag: 'input', type: 'file', accept: 'image/*', multiple: true,
                        cls: ['go-htmlfield-file'], 'aria-label': text}]
                }
            }

            // colour: the label opens the native colour picker of its input
            return color ? {
                tag  : 'label',
                cls  : ['go-htmlfield-btn', 'go-htmlfield-color'],
                title: text,
                cn   : [iconNode, {tag: 'input', type: 'color', value: color, 'data-cmd': cmd, 'aria-label': text}]
            } : {
                tag         : 'button',
                type        : 'button',
                cls         : ['go-htmlfield-btn'],
                title       : text,
                'aria-label': text,
                'data-cmd'  : cmd,
                cn          : [iconNode]
            }
        });

        me.updateDepth = -1;
        me.update()
    }

    afterSetLabelText(value, oldValue) {
        let node = this.labelNode;

        node.text      = value || '';
        node.removeDom = !value;
        this.update()
    }

    afterSetPlaceholder(value, oldValue) {
        this.editorNode['data-placeholder'] = value || null;
        this.update()
    }

    afterSetReadOnly(value, oldValue) {
        let me = this;

        // the toolbar stays in the DOM (hidden by CSS): the addon holds its nodes
        me.editorNode.contenteditable = value ? 'false' : 'true';
        me.update();
        me.toggleCls('go-readonly', value)
    }

    afterSetValue(value, oldValue) {
        super.afterSetValue(value, oldValue);

        let me       = this,
            windowId = me.#editorWindowId;

        // typed in that editor: it has the value already
        if (windowId && windowId !== me.#valueSource) {
            me.addon.setValue({id: me.id, value: value || '', windowId}).catch(() => {})
        }

        me.validateCls()
    }

    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        let me = this;

        me.#generation++;

        if (value) {
            me.createEditor()
        } else if (oldValue) {
            me.destroyEditor()
        }
    }

    /**
     * Moved to another window while mounted (popout)
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        let me = this;

        if (oldValue && me.#editorWindowId === oldValue) {
            me.#generation++;
            me.destroyEditor();
            me.mounted && me.createEditor()
        }
    }

    async createEditor() {
        let me         = this,
            generation = me.#generation,
            {windowId} = me;

        try {
            // not Neo.currentWorker.getAddon(): it caches per windowId, and a reloaded
            // tab keeps its windowId but not its addons. importAddon() is idempotent.
            await Neo.Main.importAddon({name: me.addonName, windowId});

            if (me.isDestroyed || !me.mounted || me.windowId !== windowId || generation !== me.#generation) {
                return
            }

            const sent = me.value || '';

            await me.addon.createInstance({
                id      : me.id,
                labels  : me.getEditorLabels(),
                mentions: !!me.mentionPlugin,
                pasteImages: !!me.pasteImages,
                uploadImages: !!me.imageUpload,
                blobUrl : client.apiUrl + 'download.php?blob=',
                token   : generation,
                value   : sent,
                windowId
            });

            if (generation === me.#generation && !me.isDestroyed) {
                me.#editorWindowId = windowId;
                // subclasses whose editor node needs the readOnly flag from the addon
                me.syncReadOnly?.();

                // value set while the editor was being created
                (me.value || '') !== sent && me.addon.setValue({id: me.id, value: me.value || '', windowId}).catch(() => {});

                // uploads that finished while there was no editor
                me.#uploadedImages.forEach((blobId, token) =>
                    me.addon.setImageBlob({id: me.id, token, blobId, windowId}).catch(() => {}))
            } else {
                // unmounted, moved or destroyed meanwhile: destroyEditor() did not know
                // this instance yet, remove it from its window
                me.addon.destroyInstance({id: me.id, token: generation, windowId}).catch(() => {})
            }
        } catch (e) {
            e !== Neo.isDestroyed && console.error('HtmlField: editor failed', e)
        }
    }

    /**
     * Takes the last HTML of the editor (the debounced sync may not have run)
     */
    destroyEditor() {
        let me       = this,
            windowId = me.#editorWindowId;

        if (!windowId) {
            return
        }

        me.#editorWindowId = null;

        me.addon.destroyInstance({id: me.id, windowId}).then(html => {
            typeof html === 'string' && !me.isDestroyed && me.applyEditorValue(html, windowId)
        }).catch(() => {})
    }

    /**
     * @param {String} html
     * @param {String} windowId the editor it came from
     */
    applyEditorValue(html, windowId) {
        let me       = this,
            oldValue = me.value;

        if (html === (oldValue || '')) {
            return
        }

        me.#valueSource = windowId;
        me.value = html;
        me.#valueSource = null;

        me.fireUserChangeEvent(html, oldValue)
    }

    /**
     * @param {Object} data
     * @param {String} data.value
     */
    onHtmlChange(data) {
        let me = this;

        // events of an old window's editor
        if (data.id === me.id && me.#editorWindowId) {
            me.isTouched = true;
            me.applyEditorValue(data.value, me.#editorWindowId)
        }
    }

    /**
     * Images the addon inserted (paste, drop, image button): upload them
     * @param {Object} data
     * @param {File[]} data.files
     * @param {String[]} data.tokens the images' data-upload, see GO.main.addon.HtmlEditor.setImageBlob()
     */
    onHtmlFiles(data) {
        let me = this;

        if (data.id !== me.id || !me.imageUpload || !data.files?.length) {
            return
        }

        const upload = Promise.all(data.files.map((file, i) => me.uploadInsertedImage(file, data.tokens[i])));

        me.uploads.add(upload);
        upload.finally(() => me.uploads.delete(upload))
    }

    /**
     * Uploads one image and tells the editor its blob (null when the upload failed)
     * @param {File} file
     * @param {String} token
     * @returns {Promise<void>}
     */
    async uploadInsertedImage(file, token) {
        let me     = this,
            blobId = null;

        try {
            const blob = await uploader.upload(file, {component: me});

            blobId = blob.blobId || blob.id
        } catch (e) {
            if (!Uploader.isAbort(e)) {
                console.error(e);
                me.isDestroyed || notifyError(me, new Error(t('Failed to upload {name}').replace('{name}', file.name)))
            }
        }

        if (me.isDestroyed) {
            return
        }

        me.#uploadedImages.set(token, blobId);

        // the current editor, also after a popout; the addon sends the new HTML back as htmlChange
        const windowId = me.#editorWindowId;
        windowId && await me.addon.setImageBlob({id: me.id, token, blobId, windowId}).catch(() => {})
    }

    /**
     * Focuses the editor
     */
    focus() {
        let {windowId} = this;

        this.#editorWindowId && this.addon.focus({id: this.id, windowId}).catch(() => {})
    }

    /**
     * Inserts plain text at the caret (ExtJS insertAtCursor), e.g. a template tag
     * @param {String} text
     * @returns {Promise<void>}
     */
    async insertText(text) {
        let windowId = this.#editorWindowId;

        windowId && await this.addon.insertText({id: this.id, text, windowId}).catch(() => {})
    }

    /**
     * Latest HTML straight from the editor, including typing the debounced sync
     * has not sent yet, after running image uploads. Use before saving.
     * @returns {Promise<String>}
     */
    async flush() {
        await Promise.allSettled([...this.uploads]);

        let me       = this,
            windowId = me.#editorWindowId;

        if (windowId) {
            const html = await me.addon.getValue({id: me.id, windowId}).catch(() => null);

            typeof html === 'string' && me.applyEditorValue(html, windowId)
        }

        return me.value || ''
    }

    isEmpty() {
        return !this.value
    }

    isValid() {
        return !(this.required && this.isEmpty())
    }

    validate(silent = true) {
        let valid = this.isValid();

        silent || this.validateCls(true);

        return valid
    }

    /**
     * @param {Boolean} [force] mark even when not touched
     */
    validateCls(force = false) {
        let me      = this,
            invalid = !me.isValid() && (force || me.isTouched);

        me.cls.includes('go-invalid') !== invalid && me.toggleCls('go-invalid', invalid)
    }

    afterSetIsTouched(value, oldValue) {
        super.afterSetIsTouched(value, oldValue);
        this.validateCls()
    }

    destroy(...args) {
        this.destroyEditor();
        super.destroy(...args)
    }
}

export default Neo.setupClass(HtmlField);
