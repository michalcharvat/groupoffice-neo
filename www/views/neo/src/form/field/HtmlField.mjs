import Field from '../../../node_modules/neo.mjs/src/form/field/Base.mjs';
import {t}   from '../../Translate.mjs';

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
    removeFormat       : {icon: 'format_clear',           title: 'Remove formatting'}
};

const ADDON = 'WS/HtmlEditor';

/** proxy of the main thread addon in this worker */
const editor = () => Neo.ns('GO.main.addon.HtmlEditor');

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
         * @member {Boolean} readOnly_=false
         */
        readOnly_: false,
        /**
         * isValid() is false while empty
         * @member {Boolean} required_=false
         */
        required_: false,
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

    get labelNode()   {return this.vdom.cn[0]}
    get toolbarNode() {return this.vdom.cn[1]}
    get linkBarNode() {return this.vdom.cn[2]}
    get editorNode()  {return this.vdom.cn[3]}

    construct(config) {
        super.construct(config);

        let me = this;

        me.toolbarNode.id = me.id + '__toolbar';
        me.linkBarNode.id = me.id + '__linkbar';
        me.editorNode.id  = me.id + '__editor';
        me.toolbarNode['aria-label'] = t('Formatting');
        me.renderToolbar();

        me.addDomListeners({
            htmlChange: me.onHtmlChange,
            scope     : me
        })
    }

    renderToolbar() {
        let me = this;

        me.toolbarNode.cn = me.toolbar.map(cmd => {
            if (cmd === '-') {
                return {cls: ['go-htmlfield-separator']}
            }

            const {icon, title, color} = COMMANDS[cmd],
                  text                 = t(title),
                  iconNode             = {tag: 'span', cls: ['go-icon'], 'aria-hidden': 'true', text: icon};

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
            editor().setValue({id: me.id, value: value || '', windowId}).catch(() => {})
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
            await Neo.Main.importAddon({name: ADDON, windowId});

            if (me.isDestroyed || !me.mounted || me.windowId !== windowId || generation !== me.#generation) {
                return
            }

            const sent = me.value || '';

            await editor().createInstance({
                id    : me.id,
                labels: {
                    cancel: t('Cancel'),
                    ok    : t('Ok'),
                    unlink: t('Remove link'),
                    url   : t('URL')
                },
                token : generation,
                value : sent,
                windowId
            });

            if (generation === me.#generation && !me.isDestroyed) {
                me.#editorWindowId = windowId;

                // value set while the editor was being created
                (me.value || '') !== sent && editor().setValue({id: me.id, value: me.value || '', windowId}).catch(() => {})
            } else {
                // unmounted, moved or destroyed meanwhile: destroyEditor() did not know
                // this instance yet, remove it from its window
                editor().destroyInstance({id: me.id, token: generation, windowId}).catch(() => {})
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

        editor().destroyInstance({id: me.id, windowId}).then(html => {
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
     * Focuses the editor
     */
    focus() {
        let {windowId} = this;

        this.#editorWindowId && editor().focus({id: this.id, windowId}).catch(() => {})
    }

    /**
     * Latest HTML straight from the editor, including typing the debounced sync
     * has not sent yet. Use before saving.
     * @returns {Promise<String>}
     */
    async flush() {
        let me       = this,
            windowId = me.#editorWindowId;

        if (windowId) {
            const html = await editor().getValue({id: me.id, windowId}).catch(() => null);

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
