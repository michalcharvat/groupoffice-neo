import Field             from '../../../node_modules/neo.mjs/src/form/field/Base.mjs';
import client            from '../../jmap/Client.mjs';
import uploader, {Uploader} from '../../jmap/Uploader.mjs';
import {notifyError}     from '../../Notify.mjs';
import {sanitizeHtml}    from '../../Format.mjs';
import {t, translator}   from '../../Translate.mjs';
import {editorJsSame, editorJsToHtml, isEditorJsEmpty, isHtmlEmpty, restoreImageUrls, rootImageUrls, toEditorJsDoc} from './editorJsDoc.mjs';

// the editor's own texts belong to sf/editorjs, the module that ships the library
const tEditor = translator('sf', 'editorjs');

/** Main thread addon, src/main/addon/EditorJs.mjs */
const ADDON = 'WS/EditorJs';

/** Capability of sf/editorjs: the library and its tools are its files */
const CAPABILITY = 'go:sf:editorjs';

/**
 * @summary Block editor (Editor.js) of sf/editorjs, the classic `editorjsfield`. The value is the
 * Editor.js document `{time, blocks, version}`, null when empty.
 *
 * The editor lives on the main thread (GO.main.addon.EditorJs) and sends the document after each change
 * (debounced); flush() takes the latest one before a save (FormWindow calls it). A re-save of the
 * loaded document without a content change keeps the loaded value, so the form sees no change.
 * Images are uploaded here, with the user's session, as blobs (`download.php?blob=`): the server
 * keeps the blobs it finds in the document (sf/editorjs EditorTrait).
 *
 * Without sf/editorjs, or when its library does not load, the field shows the document as
 * read-only text and keeps the value as it is. setValueFromHtml() turns HTML into blocks (a
 * converted .docx) as a change of the user.
 *
 *     {module: EditorJsField, name: 'content', labelText: t('Content'), required: true}
 *
 * @class GO.form.field.EditorJsField
 * @extends Neo.form.field.Base
 */
class EditorJsField extends Field {
    static config = {
        className: 'GO.form.field.EditorJsField',
        ntype    : 'go-editorjsfield',
        baseCls  : ['go-editorjsfield'],
        /**
         * @member {String|null} labelText_=null
         * @reactive
         */
        labelText_: null,
        /**
         * @member {Boolean} readOnly_=false
         * @reactive
         */
        readOnly_: false,
        /**
         * Editor.js document or null
         * @member {Object|null} value=null
         */
        value: null,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {tag: 'label', cls: ['go-editorjsfield-label'], removeDom: true},
            {cls: ['go-editorjsfield-holder', 'editorjs-holder']}
        ]}
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
     * The editor's own save of the value it was loaded with (Editor.js normalises), and that value:
     * a document equal to the baseline is no change
     * @member {Object|null} #baseline=null
     */
    #baseline = null
    /**
     * @member {Object|null} #baselineValue=null
     */
    #baselineValue = null
    /**
     * The baseline of the loaded answer {baseline, value}, kept across remounts
     * @member {Object|null} #originalBaseline=null
     */
    #originalBaseline = null
    /**
     * The editor's render or last read in flight; flush() waits for it
     * @member {Promise|null} #pending=null
     */
    #pending = null
    /**
     * The value just came from the current editor: it is not sent back
     * @member {Boolean} #fromEditor=false
     */
    #fromEditor = false

    /**
     * HTML for setValueFromHtml() that waits for the editor
     * @member {String|null} #pendingHtml=null
     */
    #pendingHtml = null
    /**
     * Image URLs shown absolute (rootImageUrls()) → their stored form, restored on the way back
     * @member {Map} #imageUrls
     */
    #imageUrls = new Map()
    /**
     * The editor being created (with a waiting import); flush() waits for it
     * @member {Promise|null} #creating=null
     */
    #creating = null

    /**
     * No editor (sf/editorjs missing or its library did not load): the document is read-only text
     * @member {Boolean} fallback=false
     */
    fallback = false

    /**
     * Uploads running (flush() waits for them)
     * @member {Set} uploads=new Set()
     */
    uploads = new Set()

    /**
     * @summary Proxy of the main thread addon in this worker.
     * @returns {Object}
     */
    get addon() {return Neo.ns('GO.main.addon.EditorJs')}

    /**
     * @summary The vdom node of the label.
     * @returns {Object}
     */
    get labelNode()  {return this.vdom.cn[0]}

    /**
     * @summary The vdom node the editor is created in.
     * @returns {Object}
     */
    get holderNode() {return this.vdom.cn[1]}

    /**
     * @summary The holder id for the addon, the DOM listeners.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.holderNode.id = me.id + '__editor';

        me.addDomListeners({
            editorJsChange: me.onEditorChange,
            editorJsUpload: me.onEditorUpload,
            scope         : me
        })
    }

    /**
     * @summary Enter makes a new block in the editor: it never submits the form.
     * @returns {Boolean}
     */
    ownsEnterKey() {
        return true
    }

    /**
     * @summary Shows the label above the editor.
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetLabelText(value, oldValue) {
        let node = this.labelNode;

        node.text      = value || '';
        node.removeDom = !value;
        this.update()
    }

    /**
     * @summary Turns editing off or on.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetReadOnly(value, oldValue) {
        let me       = this,
            windowId = me.#editorWindowId;

        me.toggleCls('go-readonly', value);
        windowId && me.addon.setReadOnly({id: me.id, readOnly: value, windowId}).catch(() => {})
    }

    /**
     * @summary Shows a value set from code (form load, reset) in the editor.
     * @param {Object|null} value
     * @param {Object|null} oldValue
     */
    afterSetValue(value, oldValue) {
        super.afterSetValue(value, oldValue);

        let me       = this,
            windowId = me.#editorWindowId;

        if (!me.#fromEditor) {
            // a load or reset is a new state: an import still waiting for the editor is dropped
            me.#pendingHtml = null;
            windowId && me.showValue(value, windowId)
        }

        me.fallback && me.renderFallback();
        me.validateCls()
    }

    /**
     * @summary Shows the document as read-only text in place of the editor.
     */
    renderFallback() {
        let me = this;

        me.holderNode.html = editorJsToHtml(rootImageUrls(toEditorJsDoc(me.value), client.apiUrl), sanitizeHtml) || '';
        me.update()
    }

    /**
     * @summary Turns off the editor for good: the field shows the document as text.
     */
    useFallback() {
        let me = this;

        me.fallback     = true;
        me.#pendingHtml = null;
        me.addCls('go-editorjsfield-fallback');
        me.renderFallback()
    }

    /**
     * @summary Replaces the document with blocks made from HTML, as the user's change (sf/editorjs
     * `setValueFromHtml()`, dms: the content of an uploaded .docx). Empty HTML changes nothing; before
     * the editor exists the HTML waits for it. Without the editor nothing can convert it: no change.
     * @param {String} html
     * @returns {Promise<Object|null>} the value
     */
    async setValueFromHtml(html) {
        let me = this;

        // an image alone is content too (a .docx of one picture)
        if (me.fallback || (!/<img/i.test(String(html ?? '')) && isHtmlEmpty(html))) {
            return me.value
        }

        me.#pendingHtml = String(html);

        // a render in flight first: it would replace the converted blocks
        await Promise.allSettled([me.#pending]);

        // the editor of now: a remount meanwhile has its own
        const windowId = me.#editorWindowId,
              token    = me.#editorToken;

        // no editor yet: createEditor() takes it; a value set meanwhile dropped it
        if (!windowId || me.isDestroyed || me.#pendingHtml !== String(html)) {
            return me.value
        }

        me.#pendingHtml = null;

        const request = me.addon.setHtml({id: me.id, html: String(html), windowId}).catch(() => null);

        me.#pending = request;

        const doc = await request;

        doc && !me.isDestroyed && me.#editorToken === token && me.applyEditorValue(doc);

        return me.value
    }

    /**
     * @summary A value as the editor shows it: relative image URLs made absolute (neo's <base href>
     * would resolve them inside the client).
     * @param {Object|null} value
     * @returns {Object|null}
     */
    displayDoc(value) {
        return rootImageUrls(toEditorJsDoc(value), client.apiUrl, this.#imageUrls)
    }

    /**
     * @summary Shows a value in the editor and keeps the editor's save of it as the baseline.
     * @param {Object|null} value
     * @param {String} windowId
     */
    showValue(value, windowId) {
        let me = this;

        me.#baseline = null;

        // flush() waits for it: a save while rendering would read a half-shown document
        me.#pending = me.addon.setValue({id: me.id, value: me.displayDoc(value), windowId})
            .then(baseline => me.setBaseline(baseline, value))
            .catch(() => {})
    }

    /**
     * @summary Keeps the editor's save of a shown value, unless the value changed meanwhile.
     * @param {Object|null} baseline
     * @param {Object|null} value the value shown
     */
    setBaseline(baseline, value) {
        let me = this;

        if (!me.isDestroyed && me.value === value) {
            me.#baseline      = restoreImageUrls(baseline || null, me.#imageUrls);
            me.#baselineValue = value;

            // the loaded answer's own: kept when a remount takes an edited value as its baseline
            if (value === (me.originalConfig?.value ?? null)) {
                me.#originalBaseline = {baseline: me.#baseline, value}
            }
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
            me.#creating = me.createEditor()
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

        // also while the editor is still being created there: that create is dropped (generation)
        if (oldValue && value !== oldValue && (me.#editorWindowId === oldValue || me.mounted)) {
            me.#generation++;
            me.destroyEditor();
            me.mounted && (me.#creating = me.createEditor())
        }
    }

    /**
     * @summary Loads the addon in this window and creates the editor with the current value.
     * @returns {Promise<void>}
     */
    async createEditor() {
        let me         = this,
            generation = me.#generation,
            {windowId} = me;

        if (me.fallback) {
            return
        }

        if (!client.hasCapability(CAPABILITY)) {
            me.useFallback();
            return
        }

        try {
            await Neo.Main.importAddon({name: ADDON, windowId});
            // the holder may still be on its way to the DOM
            await me.promiseUpdate();

            if (me.isDestroyed || !me.mounted || me.windowId !== windowId || generation !== me.#generation) {
                return
            }

            const sent         = me.value,
                  sentReadOnly = me.readOnly;

            const created = await me.addon.createInstance({
                id      : me.id,
                baseUrl : client.baseUrl + 'go/modules/sf/editorjs/views/extjs3/',
                readOnly: sentReadOnly,
                value   : me.displayDoc(sent),
                labels  : {
                    quote      : tEditor('Enter a quote'),
                    quoteAuthor: tEditor("Quote's author")
                },
                token   : generation,
                windowId
            });

            if (created && generation === me.#generation && me.windowId === windowId && !me.isDestroyed) {
                me.#editorWindowId = windowId;
                me.#editorToken    = generation;
                // set while the editor was being created
                me.readOnly !== sentReadOnly && me.addon.setReadOnly({id: me.id, readOnly: me.readOnly, windowId}).catch(() => {});
                me.value !== sent ? me.showValue(me.value, windowId) : me.setBaseline(created?.baseline, sent);
                me.#pendingHtml !== null && await me.setValueFromHtml(me.#pendingHtml)
            } else {
                me.addon.destroyInstance({id: me.id, token: generation, windowId}).catch(() => {})
            }
        } catch (e) {
            // not for a create of an older mount (popout): the current editor may work
            if (e !== Neo.isDestroyed && !me.isDestroyed && generation === me.#generation) {
                console.error('EditorJsField: editor failed', e);
                notifyError(me, new Error(t('The editor could not be loaded')));
                me.useFallback()
            }
        }
    }

    /**
     * @summary Takes the last document of the editor, then removes it.
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

        // the old editor's last typing (flush() waits for it): when a new editor exists meanwhile (popout), it
        // gets the value too; a value set meanwhile (another record, reset) wins
        me.#pending = me.addon.getValue({id: me.id, windowId})
            .then(value => !me.isDestroyed && value && me.value === before && me.applyEditorValue(value, false))
            .catch(() => {})
            .finally(() => me.addon.destroyInstance({id: me.id, token, windowId}).catch(() => {}))
    }

    /**
     * @summary Takes a document of the editor; one with the same content keeps the current value, one
     * with the content of the loaded value gets the loaded value back (the form then sees no change).
     * @param {Object} doc
     * @param {Boolean} [fromCurrent=true] the current editor has it already (false: an old editor's last read)
     */
    applyEditorValue(doc, fromCurrent = true) {
        doc = restoreImageUrls(doc, this.#imageUrls);

        let me       = this,
            oldValue = me.value,
            original = me.originalConfig?.value ?? null,
            empty    = v => isEditorJsEmpty(toEditorJsDoc(v)),
            value    = isEditorJsEmpty(doc) ? null : doc;

        // the editor's normalised save of what it was loaded with, or the loaded content again: no change
        if (me.#baseline && editorJsSame(doc, me.#baseline)) {
            value = me.#baselineValue
        } else if (me.#originalBaseline?.value === original && me.#originalBaseline.baseline && editorJsSame(doc, me.#originalBaseline.baseline)) {
            value = original
        } else if (value === null ? empty(original) : editorJsSame(value, toEditorJsDoc(original))) {
            value = original
        }

        if (value === oldValue || (value === null && empty(oldValue)) || (value !== null && editorJsSame(value, toEditorJsDoc(oldValue)))) {
            return
        }

        me.isTouched   = true;
        me.#fromEditor = fromCurrent;
        me.value       = value;
        me.#fromEditor = false;
        me.fireUserChangeEvent(value, oldValue)
    }

    /**
     * @summary The editor's document changed.
     * @param {Object} data {id, value}
     */
    onEditorChange(data) {
        // not from an editor of an older mount (popout: the old one's late change)
        data.id === this.id && this.#editorWindowId && (data.token ?? null) === this.#editorToken && !this.readOnly &&
            this.applyEditorValue(data.value)
    }

    /**
     * @summary The image tool wants an image: uploads a file as a blob, or lets the server fetch a URL
     * (sf/editorjs Editor/uploadFromUrl), and answers the addon with the download URL.
     * @param {Object} data {id, requestId, file | url}
     */
    onEditorUpload(data) {
        let me = this;

        if (data.id !== me.id) {
            return
        }

        const windowId = me.#editorWindowId,
              upload   = (async () => {
                  let url = null, error = null;

                  try {
                      if (data.file) {
                          const blob = await uploader.upload(data.file, {component: me});
                          url = client.apiUrl + 'download.php?blob=' + encodeURIComponent(blob.blobId || blob.id)
                      } else {
                          const result = await client.call('sf/editorjs/Editor/uploadFromUrl', {url: data.url});
                          url = result?.file?.url || null
                      }
                  } catch (e) {
                      if (!Uploader.isAbort(e)) {
                          error = e.message || String(e);
                          console.error(e);
                          // the image tool shows only a generic message
                          me.isDestroyed || notifyError(me, e)
                      }
                  }

                  windowId && me.addon.resolveUpload({id: me.id, requestId: data.requestId, url, error, windowId}).catch(() => {})
              })();

        me.uploads.add(upload);
        upload.finally(() => me.uploads.delete(upload))
    }

    /**
     * @summary The latest document straight from the editor, after running uploads (before a save).
     * @returns {Promise<Object|null>}
     */
    async flush() {
        let me = this;

        // an editor being created (it takes a waiting import), a render or a removed editor's last read first
        await Promise.allSettled([...me.uploads, me.#creating, me.#pending]);
        await Promise.allSettled([me.#pending]);

        let windowId = me.#editorWindowId;

        if (windowId) {
            const value = await me.addon.getValue({id: me.id, windowId}).catch(() => null);
            value && !me.isDestroyed && me.applyEditorValue(value)
        }

        return me.value
    }

    /**
     * @summary Whether the document has no content.
     * @returns {Boolean}
     */
    isEmpty() {
        return isEditorJsEmpty(toEditorJsDoc(this.value))
    }

    /**
     * @summary A required field needs content (not without the editor: nobody could give it).
     * @returns {Boolean}
     */
    isValid() {
        // without the editor nobody can fill it in: the server's own check decides
        return this.fallback || !(this.required && this.isEmpty())
    }

    /**
     * @summary Checks the field, marks it when asked.
     * @param {Boolean} [silent=true]
     * @returns {Boolean}
     */
    validate(silent = true) {
        let valid = this.isValid();

        silent || this.validateCls(true);

        return valid
    }

    /**
     * @summary Marks an invalid field once touched (or when forced).
     * @param {Boolean} [force=false]
     */
    validateCls(force = false) {
        let me      = this,
            invalid = !me.isValid() && (force || me.isTouched);

        me.cls.includes('go-invalid') !== invalid && me.toggleCls('go-invalid', invalid)
    }

    /**
     * @summary Re-checks the mark when the field was touched.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetIsTouched(value, oldValue) {
        super.afterSetIsTouched(value, oldValue);
        this.validateCls()
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

export default Neo.setupClass(EditorJsField);
