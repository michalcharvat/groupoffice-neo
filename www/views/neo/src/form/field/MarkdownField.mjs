import HtmlField                       from './HtmlField.mjs';
import client                          from '../../jmap/Client.mjs';
import uploader, {Uploader}            from '../../jmap/Uploader.mjs';
import {addImageSize, markdownToHtml}  from '../../Markdown.mjs';
import {notifyError}                   from '../../Notify.mjs';
import {t}                             from '../../Translate.mjs';

/**
 * Markdown editor field, port of GOUI MarkdownField (EasyMDE): a textarea with a
 * Markdown toolbar, a preview and image upload by pasting, dropping or the image button.
 *
 * Like HtmlField, the editor lives on the main thread: the addon
 * GO.main.addon.MarkdownEditor (src/main/addon/MarkdownEditor.mjs) runs the toolbar
 * commands on the textarea and sends the text back. This field renders the frame,
 * the preview (markdownToHtml(), sanitised) and uploads images: they are inserted as
 * a blob download URL, which the server parses to attach the blobs to the entity.
 *
 *     {module: MarkdownField, name: 'content', labelText: t('Content'), flex: 1}
 */

/** GOUI MarkdownField toolbar, '-' = separator */
const DEFAULT_TOOLBAR = [
    'bold', 'italic', 'strikethrough', 'heading', '-',
    'quote', 'unordered-list', 'ordered-list', 'checklist', '-',
    'code', 'link', 'image', 'table', '-',
    'preview'
];

/** cmd → Material icon + title (titles via t() at render time) */
const COMMANDS = {
    bold            : {icon: 'format_bold',          title: 'Bold'},
    italic          : {icon: 'format_italic',        title: 'Italic'},
    strikethrough   : {icon: 'format_strikethrough', title: 'Strikethrough'},
    heading         : {icon: 'title',                title: 'Heading'},
    quote           : {icon: 'format_quote',         title: 'Quote'},
    'unordered-list': {icon: 'format_list_bulleted', title: 'Bullet list'},
    'ordered-list'  : {icon: 'format_list_numbered', title: 'Numbered list'},
    checklist       : {icon: 'checklist',            title: 'Checklist'},
    code            : {icon: 'code',                 title: 'Code'},
    link            : {icon: 'link',                 title: 'Link'},
    image           : {icon: 'image',                title: 'Image'},
    table           : {icon: 'table',                title: 'Table'},
    preview         : {icon: 'visibility',           title: 'Preview'}
};

class MarkdownField extends HtmlField {
    static config = {
        className: 'GO.form.field.MarkdownField',
        ntype    : 'go-markdownfield',
        baseCls  : ['go-htmlfield', 'go-markdownfield'],
        /**
         * Shows the rendered Markdown instead of the editor
         * @member {Boolean} preview_=false
         */
        preview_: false,
        /**
         * Commands, '-' = separator. See COMMANDS.
         * @member {String[]} toolbar=DEFAULT_TOOLBAR
         */
        toolbar: DEFAULT_TOOLBAR,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {cls: ['go-htmlfield-label'], removeDom: true},
            {cls: ['go-htmlfield-toolbar'], role: 'toolbar', cn: []},
            {tag: 'textarea', cls: ['go-markdownfield-editor'], spellcheck: 'true'},
            {cls: ['go-markdownfield-preview', 'go-markdown'], removeDom: true},
            {cls: ['go-markdownfield-status']}
        ]}
    }

    /**
     * Uploads running (flush() waits for them)
     * @member {Set} uploads=new Set()
     */
    uploads = new Set()

    get addonName() {return 'WS/MarkdownEditor'}
    get addon()     {return Neo.ns('GO.main.addon.MarkdownEditor')}
    get commands()  {return COMMANDS}

    get labelNode()   {return this.vdom.cn[0]}
    get toolbarNode() {return this.vdom.cn[1]}
    get linkBarNode() {return null}
    get editorNode()  {return this.vdom.cn[2]}
    get previewNode() {return this.vdom.cn[3]}
    get statusNode()  {return this.vdom.cn[4]}

    construct(config) {
        super.construct(config);

        let me = this;

        me.setStatus();

        me.addDomListeners([
            {markdownFiles: me.onMarkdownFiles, scope: me},
            {change: me.onFileInputChange, delegate: '.go-markdownfield-file', scope: me},
            {click : me.onPreviewClick,    delegate: '.go-markdownfield-previewbtn', scope: me}
        ])
    }

    getEditorLabels() {
        return {}
    }

    renderToolbar() {
        let me = this;

        me.toolbarNode.cn = me.toolbar.map(cmd => {
            if (cmd === '-') {
                return {cls: ['go-htmlfield-separator']}
            }

            const {icon, title} = COMMANDS[cmd],
                  text          = t(title),
                  iconNode      = {tag: 'span', cls: ['go-icon'], 'aria-hidden': 'true', text: icon};

            if (cmd === 'image') {
                // the label opens the file chooser of its input; the worker uploads the files
                return {
                    tag  : 'label',
                    cls  : ['go-htmlfield-btn', 'go-markdownfield-upload'],
                    title: text,
                    cn   : [iconNode, {tag: 'input', type: 'file', accept: 'image/*', multiple: true,
                        cls: ['go-markdownfield-file'], 'aria-label': text}]
                }
            }

            const button = {
                tag         : 'button',
                type        : 'button',
                cls         : ['go-htmlfield-btn'],
                title       : text,
                'aria-label': text,
                'data-cmd'  : cmd,
                cn          : [iconNode]
            };

            if (cmd === 'preview') {
                button.cls = [...button.cls, 'go-markdownfield-previewbtn'];
                button['aria-pressed'] = String(me.preview)
            }

            return button
        });

        me.updateDepth = -1;
        me.update()
    }

    afterSetPlaceholder(value, oldValue) {
        this.editorNode.placeholder = value || null;
        this.update()
    }

    afterSetReadOnly(value, oldValue) {
        let me = this;

        me.editorNode.readonly = value || null;
        me.update();
        me.toggleCls('go-readonly', value);
        me.syncReadOnly()
    }

    /**
     * The addon sets the textarea's readOnly (the vdom attribute alone does not reach it)
     */
    syncReadOnly() {
        const me = this, windowId = me.editorWindowId;

        windowId && me.addon.setReadOnly({id: me.id, value: me.readOnly, windowId}).catch(() => {})
    }

    afterSetValue(value, oldValue) {
        super.afterSetValue(value, oldValue);
        this.preview && this.renderPreview()
    }

    /**
     * Toggles the preview: the textarea stays in the DOM (hidden by CSS), the addon holds it
     */
    afterSetPreview(value, oldValue) {
        let me = this;

        if (oldValue === undefined) {
            return
        }

        me.renderPreview();
        me.toggleCls('go-preview', value);
        me.renderToolbar();

        value || me.focus()
    }

    renderPreview() {
        let me   = this,
            node = me.previewNode;

        node.html      = me.preview ? markdownToHtml(me.value) : '';
        node.removeDom = !me.preview;
        me.update()
    }

    async onPreviewClick() {
        let me = this;

        // render the last typing, the sync is debounced
        await me.flush();
        me.isDestroyed || (me.preview = !me.preview)
    }

    /**
     * @param {String|null} text null: the drop / paste hint
     */
    setStatus(text = null) {
        let me = this;

        me.statusNode.text = text ?? t('Attach files by dropping or pasting them');
        me.update()
    }

    onFileInputChange({files}) {
        files?.length && this.uploadImages([...files])
    }

    onMarkdownFiles(data) {
        data.id === this.id && data.files?.length && this.uploadImages([...data.files])
    }

    /**
     * Uploads images and inserts them at the cursor as ![name](download URL)
     * @param {File[]} files
     */
    async uploadImages(files) {
        let me = this;

        if (me.readOnly) {
            return
        }

        // upload and insert: flush() waits for both
        const upload = (async () => {
            const texts = (await Promise.all(files.map(file => me.uploadImage(file)))).filter(Boolean);

            // the addon sends the new text back as htmlChange
            if (texts.length && !me.isDestroyed && me.editorWindowId) {
                await me.addon.insertText({id: me.id, text: texts.join('\n'), windowId: me.editorWindowId})
            }
        })();

        me.uploads.add(upload);
        me.setStatus(t('Uploading...'));

        try {
            await upload
        } catch (e) {
            console.error('MarkdownField: insert failed', e)
        } finally {
            me.uploads.delete(upload);
            me.isDestroyed || me.uploads.size || me.setStatus()
        }
    }

    /**
     * @param {File} file
     * @returns {Promise<String|null>} the Markdown of the image, null when the upload failed
     */
    async uploadImage(file) {
        let me = this;

        try {
            const [blob, size] = await Promise.all([uploader.upload(file, {component: me}), MarkdownField.getImageSize(file)]);
            let url = client.apiUrl + 'download.php?blob=' + encodeURIComponent(blob.blobId || blob.id);

            size && (url = addImageSize(url, size.width, size.height));

            return `![${String(file.name || '').replace(/[[\]\\]/g, '')}](${url})`
        } catch (e) {
            if (Uploader.isAbort(e)) {
                return null
            }

            console.error(e);
            me.isDestroyed || notifyError(me, new Error(t('Failed to upload {name}').replace('{name}', file.name)));
            return null
        }
    }

    /**
     * Image dimensions, so other clients know the aspect ratio before the image loads
     * @param {File} file
     * @returns {Promise<{width: Number, height: Number}|undefined>}
     */
    static async getImageSize(file) {
        try {
            const bitmap = await createImageBitmap(file),
                  size   = {width: bitmap.width, height: bitmap.height};

            bitmap.close();
            return size
        } catch (e) {
            // not supported for this image type, e.g. SVG
            return undefined
        }
    }

    /**
     * Waits for running uploads, then takes the last typing along (FormWindow calls it before saving)
     * @returns {Promise<String>}
     */
    async flush() {
        await Promise.allSettled([...this.uploads]);
        return super.flush()
    }
}

export default Neo.setupClass(MarkdownField);
