import Field  from './Field.mjs';
import client from '../../jmap/Client.mjs';
import {t}    from '../../Translate.mjs';

/** Main thread addon, src/main/addon/CodeMirror.mjs */
const ADDON = 'WS/CodeMirror';

/**
 * @summary Code editor (CodeMirror 5, `codemirror` of views/neo/package.json), the classic client's
 * `sfcodemirroreditor` of sf/codemirror. The value is the text.
 *
 * The editor lives on the main thread (GO.main.addon.CodeMirror) and sends the text after each change
 * (debounced); flush() takes the latest one before a save (FormWindow calls it). Text equal to the
 * editor's own text of the loaded value keeps the loaded value, so an untouched form saves nothing.
 * When the library does not load the field is a plain monospace textarea.
 *
 *     {module: CodeField, name: 'configuration', labelText: t('Configuration'), mode: 'json', editorHeight: 300}
 *
 * @class GO.form.field.CodeField
 * @extends GO.form.field.Field
 */
class CodeField extends Field {
    static config = {
        className: 'GO.form.field.CodeField',
        ntype    : 'go-codefield',
        baseCls  : ['go-field', 'go-codefield'],
        /**
         * CodeMirror mode: a name, file extension or MIME type ('json', 'javascript', 'php', 'sql', …).
         * 'json' also checks the text on validate().
         * @member {String} mode_='json'
         * @reactive
         */
        mode_: 'json',
        /**
         * Height of the editor, px or a CSS length (neo's own height is the whole field's)
         * @member {Number|String} editorHeight_=300
         * @reactive
         */
        editorHeight_: 300,
        /**
         * The text
         * @member {String|null} value=null
         */
        value: null
    }

    /**
     * Window the editor was created in, null while there is none
     * @member {String|null} #editorWindowId=null
     */
    #editorWindowId = null
    /**
     * Increased on every mount / unmount: a late createInstance of an old mount is dropped
     * @member {Number} #generation=0
     */
    #generation = 0
    /**
     * The mount (generation) the current editor was created for
     * @member {Number|null} #editorToken=null
     */
    #editorToken = null
    /**
     * The editor's text of the shown value {text, value}: that text is no change
     * @member {Object|null} #baseline=null
     */
    #baseline = null
    /**
     * The editor's text of the loaded value {text, value}, kept across remounts
     * @member {Object|null} #originalBaseline=null
     */
    #originalBaseline = null
    /**
     * Render or last read of the editor in flight; flush() waits for it
     * @member {Promise|null} #pending=null
     */
    #pending = null
    /**
     * The value just came from the current editor: it is not sent back
     * @member {Boolean} #fromEditor=false
     */
    #fromEditor = false

    /**
     * The library did not load: the field is a textarea
     * @member {Boolean} fallback=false
     */
    fallback = false

    /**
     * @summary Proxy of the main thread addon in this worker.
     * @returns {Object}
     */
    get addon() {return Neo.ns('GO.main.addon.CodeMirror')}

    /**
     * @summary The DOM listeners of the editor and the fallback textarea.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {codeMirrorChange: me.onEditorChange, scope: me},
            {input: me.onTextareaInput, delegate: '.go-codefield-textarea', scope: me}
        ])
    }

    /**
     * @summary Enter makes a new line: it never submits the form.
     * @returns {Boolean}
     */
    ownsEnterKey() {
        return true
    }

    /**
     * @summary The editor's holder, or the textarea without the library.
     * @returns {Object[]}
     */
    createControl() {
        let me     = this,
            height = typeof me.editorHeight === 'number' ? me.editorHeight + 'px' : me.editorHeight;

        if (me.fallback) {
            return [{
                tag       : 'textarea',
                id        : me.id + '__input',
                cls       : ['go-field-input', 'go-codefield-textarea'],
                spellcheck: 'false',
                style     : {height},
                value     : me.value ?? '',
                ...me.inputFlags()
            }]
        }

        return [{id: me.id + '__editor', cls: ['go-codefield-editor'], style: {height}}]
    }

    /**
     * @summary A new height.
     * @param {Number|String} value
     * @param {Number|String} oldValue
     */
    afterSetEditorHeight(value, oldValue) {
        oldValue !== undefined && this.renderControl()
    }

    /**
     * @summary A new mode for the editor; for json the text is checked again.
     * @param {String} value
     * @param {String} oldValue
     */
    afterSetMode(value, oldValue) {
        let me = this;

        // also while the editor is being created: that create is dropped (generation)
        if (oldValue !== undefined && me.mounted) {
            me.#generation++;
            me.destroyEditor();
            me.createEditor()
        }

        me.error && me.validate(false)
    }

    /**
     * @summary Turns editing off or on.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetReadOnly(value, oldValue) {
        super.afterSetReadOnly(value, oldValue);

        let windowId = this.#editorWindowId;

        windowId && this.addon.setReadOnly({id: this.id, readOnly: !!value, windowId}).catch(() => {})
    }

    /**
     * @summary Shows a value set from code (form load, reset) in the editor.
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetValue(value, oldValue) {
        super.afterSetValue(value, oldValue);

        let me       = this,
            windowId = me.#editorWindowId;

        !me.#fromEditor && windowId && me.showValue(value, windowId)
    }

    /**
     * @summary Shows a value in the editor and keeps the editor's text of it as the baseline.
     * @param {String|null} value
     * @param {String} windowId
     */
    showValue(value, windowId) {
        let me = this;

        me.#baseline = null;
        me.#pending  = me.addon.setValue({id: me.id, value: value ?? '', windowId})
            .then(text => me.setBaseline(text, value))
            .catch(() => {})
    }

    /**
     * @summary Keeps the editor's text of a shown value, unless the value changed meanwhile.
     * @param {String|null} text
     * @param {String|null} value the value shown
     */
    setBaseline(text, value) {
        let me = this;

        if (me.isDestroyed || me.value !== value || typeof text !== 'string') {
            return
        }

        me.#baseline = {text, value};

        if (value === (me.originalConfig?.value ?? null)) {
            me.#originalBaseline = {text, value}
        }
    }

    /**
     * @summary Creates the editor when the field is shown, removes it when not.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
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
     * @summary Moved to another window while mounted (popout): the editor is created there.
     * @param {String} value
     * @param {String} oldValue
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        let me = this;

        if (oldValue && value !== oldValue && (me.#editorWindowId === oldValue || me.mounted)) {
            me.#generation++;
            me.destroyEditor();
            me.mounted && me.createEditor()
        }
    }

    /**
     * @summary Loads the addon in this window and creates the editor with the current value; when the
     * library does not load, the field becomes a textarea.
     * @returns {Promise<void>}
     */
    async createEditor() {
        let me         = this,
            generation = me.#generation,
            {windowId} = me;

        if (me.fallback) {
            return
        }

        try {
            await Neo.Main.importAddon({name: ADDON, windowId});
            // the box content (the holder) may still be on its way to the DOM
            await me.promiseUpdate();

            if (me.isDestroyed || !me.mounted || me.windowId !== windowId || generation !== me.#generation) {
                return
            }

            const sent         = me.value,
                  sentReadOnly = me.readOnly,
                  created      = await me.addon.createInstance({
                      id      : me.id,
                      baseUrl : client.baseUrl + 'views/neo/node_modules/codemirror/',
                      value   : sent ?? '',
                      mode    : me.mode,
                      readOnly: !!sentReadOnly,
                      token   : generation,
                      windowId
                  });

            if (created && generation === me.#generation && me.windowId === windowId && !me.isDestroyed) {
                me.#editorWindowId = windowId;
                me.#editorToken    = generation;
                // set while the editor was being created
                me.readOnly !== sentReadOnly && me.addon.setReadOnly({id: me.id, readOnly: !!me.readOnly, windowId}).catch(() => {});
                me.value !== sent ? me.showValue(me.value, windowId) : me.setBaseline(created.baseline, sent)
            } else {
                me.addon.destroyInstance({id: me.id, token: generation, windowId}).catch(() => {})
            }
        } catch (e) {
            // not for a create of an older mount (popout, mode change): the current editor may work
            if (e !== Neo.isDestroyed && !me.isDestroyed && generation === me.#generation) {
                // the library did not load: a plain textarea
                console.warn('CodeField: CodeMirror not available, using a textarea', e);
                me.fallback = true;
                me.renderControl()
            }
        }
    }

    /**
     * @summary Takes the last text of the editor, then removes it.
     */
    destroyEditor() {
        let me       = this,
            windowId = me.#editorWindowId,
            token    = me.#editorToken;

        if (!windowId) {
            return
        }

        me.#editorWindowId = null;
        me.#editorToken    = null;

        const before = me.value;

        // the old editor's last typing; a value set meanwhile (another record, reset) wins
        me.#pending = me.addon.getValue({id: me.id, windowId})
            .then(text => !me.isDestroyed && typeof text === 'string' && me.value === before && me.applyEditorText(text, false))
            .catch(() => {})
            .finally(() => me.addon.destroyInstance({id: me.id, token, windowId}).catch(() => {}))
    }

    /**
     * @summary Takes a text of the editor; the editor's text of the loaded or shown value gives that
     * value back (the form then sees no change).
     * @param {String} text
     * @param {Boolean} [fromCurrent=true] the current editor has it already (false: an old editor's last read)
     */
    applyEditorText(text, fromCurrent = true) {
        let me       = this,
            original = me.#originalBaseline,
            value    = text;

        if (original && original.value === (me.originalConfig?.value ?? null) && text === original.text) {
            value = original.value
        } else if (me.#baseline && text === me.#baseline.text) {
            value = me.#baseline.value
        }

        if (value === me.value) {
            return
        }

        me.#fromEditor = fromCurrent;

        try {
            me.userChange(value)
        } finally {
            me.#fromEditor = false
        }
    }

    /**
     * @summary The editor's text changed.
     * @param {Object} data {id, token, value}
     */
    onEditorChange(data) {
        let me = this;

        // not from an editor of an older mount (popout: the old one's late change)
        data.id === me.id && me.#editorWindowId && (data.token ?? null) === me.#editorToken && !me.readOnly &&
            me.applyEditorText(data.value)
    }

    /**
     * @summary Typing in the fallback textarea.
     * @param {Object} data {target, value}
     */
    onTextareaInput(data) {
        let me       = this,
            node     = me.boxNode.cn[0],
            original = me.originalConfig?.value ?? null;

        me.syncInputValue(node, data.value);
        // the textarea's text of the loaded value (line breaks as \n) is no change
        me.userChange(data.value === String(original ?? '').replace(/\r\n?/g, '\n') ? original : data.value)
    }

    /**
     * @summary Shows the value in the editor also when it did not change: the editor may hold
     * typing not sent yet.
     * @param {String|null} [value=null]
     */
    reset(value = null) {
        let me = this;

        super.reset(value);
        me.#editorWindowId && me.showValue(me.value, me.#editorWindowId)
    }

    /**
     * @summary Whitespace only counts as empty.
     * @returns {Boolean}
     */
    isEmpty() {
        return !String(this.value ?? '').trim()
    }

    /**
     * @summary The latest text straight from the editor (before a save).
     * @returns {Promise<String|null>}
     */
    async flush() {
        let me = this;

        await me.#pending;

        let windowId = me.#editorWindowId;

        if (windowId) {
            const text = await me.addon.getValue({id: me.id, windowId}).catch(() => null);
            typeof text === 'string' && !me.isDestroyed && me.applyEditorText(text)
        }

        return me.value
    }

    /**
     * @summary Required, the validator, and for json the parse error.
     * @returns {String|null}
     * @protected
     */
    getError() {
        let me    = this,
            error = super.getError();

        if (error || me.mode !== 'json' || !me.value?.trim()) {
            return error
        }

        try {
            JSON.parse(me.value);
            return null
        } catch (e) {
            return t('Invalid JSON') + ': ' + e.message
        }
    }

    /**
     * @summary Removes the editor, then the field.
     * @param {...*} args
     */
    destroy(...args) {
        this.destroyEditor();
        super.destroy(...args)
    }
}

export default Neo.setupClass(CodeField);
