import Base      from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';
import DomAccess from '../../../node_modules/neo.mjs/src/main/DomAccess.mjs';
import DomEvents from '../../../node_modules/neo.mjs/src/main/DomEvents.mjs';
import {editorJsSame, isHtmlEmpty} from '../../form/field/editorJsDoc.mjs';

/**
 * Library files of sf/editorjs (views/extjs3/scripts.txt), relative to its views/extjs3/, in load order
 * @type {String[]}
 */
const FILES = [
    'editorjs.umd.min.js',
    'tools/header.umd.js',
    'tools/image.umd.js',
    'tools/list.umd.js',
    'tools/paragraph.umd.js',
    'tools/table.umd.js',
    'tools/nested-checklist.umd.js',
    'tools/color-picker.umd.js',
    'tools/background-color-picker.js',
    'tools/strikethrough.umd.js',
    'tools/hyperlink.umd.js',
    'tools/alignment-blocktune.umd.js',
    'tools/break-line.umd.js',
    'tools/page-break.umd.js',
    'tools/image-resize-crop.umd.js',
    'tools/quote.umd.min.js',
    'tools/embed.umd.js',
    'tools/code.umd.js',
    'tools/flowcharts.umd.js',
    'tools/a2s.umd.js'
];

/** Colours of the colour pickers (sf/editorjs EditorField.js) */
const COLORS = [
    '#000000', '#111111', '#1c1c1c', '#333333', '#666666', '#808080',
    '#999999', '#b2b2b2', '#cccccc', '#dddddd', '#eeeeee', '#ffffff',
    '#ffff00', '#ffbf00', '#ff8000', '#ff4000', '#ff0000', '#bf0041',
    '#800080', '#55308d', '#2a6099', '#158466', '#00a933', '#81d41a',
    '#ffffd7', '#fff5ce', '#ffdbb6', '#ffd8ce', '#ffd7d7', '#f7d1d5',
    '#e0c2cd', '#dedce6', '#dee6ef', '#dee7e5', '#dde8cb', '#f6f9d4',
    '#ffffa6', '#ffe994', '#ffb66c', '#ffaa95', '#ffa6a6', '#ec9ba4',
    '#bf819e', '#b7b3ca', '#b4c7dc', '#b3cac7', '#afd095', '#e8f2a1'
];

/** ms after the last change before the document goes to the worker */
const SYNC_DELAY = 300;

/** block data keys whose strings are inline HTML (Editor.js renders them with innerHTML) */
const HTML_KEYS = new Set(['text', 'caption', 'content', 'title', 'message', 'items']);

/** elements dropped from stored HTML: it comes from other users and must not run code here */
const UNSAFE_TAGS = 'script,style,iframe,frame,frameset,object,embed,link,meta,base,form,input,button,textarea,select,svg,math,template';

/**
 * @summary Removes what could run code from stored inline HTML (other users' answers), keeping
 * formatting, classes and styles (colours of the colour pickers). Text without markup stays as it is.
 * @param {String} html
 * @returns {String}
 */
function cleanHtml(html) {
    if (!/<[a-z!/?]/i.test(html)) {
        return html
    }

    // DOMParser does not run scripts or load images
    const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');

    doc.body.querySelectorAll(UNSAFE_TAGS).forEach(el => el.remove());

    doc.body.querySelectorAll('*').forEach(el => {
        [...el.attributes].forEach(({name, value}) => {
            const url = value.replace(/[\u0000-\u0020\u007f-\u009f]+/g, '');

            if (name === 'style') {
                // formatting only (colour pickers, alignment): nothing that moves the text over the form
                const kept = [...el.style].filter(prop => /^(color|background-color|text-align|text-decoration(-line|-color)?|font-(weight|style))$/.test(prop))
                    .map(prop => `${prop}: ${el.style.getPropertyValue(prop)}`).join('; ');

                kept ? el.setAttribute('style', kept) : el.removeAttribute('style')
            } else if (name.startsWith('on') || (['href', 'src', 'xlink:href', 'action', 'formaction', 'srcset'].includes(name) &&
                /^[^/?#]*:/.test(url) && !/^(https?:|mailto:|tel:)/i.test(url))) {
                el.removeAttribute(name)
            }
        })
    });

    return doc.body.innerHTML
}

/**
 * @summary A copy of block data with its inline HTML cleaned (cleanHtml()); code-like blocks
 * keep their plain text.
 * @param {*} value
 * @param {Boolean} isHtml the value sits under an HTML key (arrays pass it on, objects reset it)
 * @returns {*}
 */
function cleanData(value, isHtml = false) {
    if (typeof value === 'string') {
        return isHtml ? cleanHtml(value) : value
    }

    if (Array.isArray(value)) {
        return value.map(v => cleanData(v, isHtml))
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, cleanData(v, HTML_KEYS.has(key))]))
    }

    return value
}

/**
 * @summary A stored document safe to render in the editor: its blocks' inline HTML cleaned.
 * @param {Object|null} doc
 * @returns {Object}
 */
function renderable(doc) {
    const blocks = Array.isArray(doc?.blocks) ? doc.blocks : [];

    return {
        ...doc,
        blocks: blocks
            // an embed becomes an iframe of its URL: https only
            .filter(block => block?.type !== 'embed' || (/^https:\/\//i.test(block.data?.embed ?? '') && /^https:\/\//i.test(block.data?.source ?? 'https://')))
            .map(block => ['code', 'flowcharts', 'a2s'].includes(block?.type) ? block : {...block, data: cleanData(block?.data)})
    }
}

/**
 * @summary A line break in HTML source text is whitespace: a space outside <pre>.
 * @param {Document} doc parsed paste HTML, changed in place
 */
function joinWrappedLines(doc) {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);

    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (/[\r\n]/.test(node.nodeValue) && !node.parentElement.closest('pre')) {
            node.nodeValue = node.nodeValue.replace(/[ \t]*\r?\n[ \t]*/g, ' ')
        }
    }
}

/**
 * @summary Turns runs of Word list paragraphs (`<p style="mso-list:l0 level2 lfo1">`) into nested
 * `<ul>` / `<ol>`, which the list tool can paste (sf/editorjs EditorField.js convertWordLists()).
 * @param {Document} doc parsed paste HTML, changed in place
 */
function convertWordLists(doc) {
    const listOf = el => /mso-list:\s*(l\d+)\s+level(\d+)/i.exec(el.getAttribute('style') || ''),
          items  = Array.from(doc.body.querySelectorAll('[style*="mso-list"]')).filter(listOf);
    let stack = [], lastRoot = null, lastListId = null;

    items.forEach(p => {
        const [, listId, levelStr] = listOf(p),
              level   = parseInt(levelStr, 10),
              marker  = Array.from(p.querySelectorAll('[style*="mso-list"]')).find(el => /mso-list:\s*ignore/i.test(el.getAttribute('style'))),
              ordered = !!marker && /^\s*\(?([0-9]+|[a-z]{1,3}|[ivxlcdm]+)[.)]/i.test(marker.textContent);

        marker && marker.remove();

        // a list continues only while its items are adjacent siblings of the same Word list
        let prev = p.previousSibling;

        while (prev && (prev.nodeType === Node.COMMENT_NODE || (prev.nodeType === Node.TEXT_NODE && !prev.textContent.trim()))) {
            prev = prev.previousSibling
        }

        if (!lastRoot || prev !== lastRoot || listId !== lastListId) {
            stack = []
        }

        lastListId = listId;

        while (stack.length && stack[stack.length - 1].level > level) {
            stack.pop()
        }

        if (!stack.length || stack[stack.length - 1].level < level) {
            // the list tool has one style per list and parses only nested lists of the root's tag
            const list = doc.createElement(stack.length ? stack[0].list.tagName : (ordered ? 'ol' : 'ul'));

            if (stack.length) {
                const parent = stack[stack.length - 1].list;
                (parent.lastElementChild || parent.appendChild(doc.createElement('li'))).appendChild(list)
            } else {
                p.parentNode.insertBefore(list, p);
                lastRoot = list
            }

            stack.push({level, list})
        }

        const li = doc.createElement('li');

        while (p.firstChild) {
            li.appendChild(p.firstChild)
        }

        stack[stack.length - 1].list.appendChild(li);
        p.remove()
    })
}

/**
 * @summary Main thread side of GO.form.field.EditorJsField: Editor.js needs the real DOM. The library is
 * sf/editorjs' copy (the classic client's `editorjsfield`), with its tools and its paste fixes for
 * Word. Loaded per window by the field:
 *
 *     await Neo.Main.importAddon({name: 'WS/EditorJs', windowId})
 *
 * - The document goes to the App worker as the custom DOM event "editorJsChange" {value}
 *   (debounced); getValue() returns the latest one before a save.
 * - Images: the image tool's uploads go to the worker as "editorJsUpload" {requestId, file | url};
 *   the worker uploads with the user's session and answers with resolveUpload().
 *
 * @class GO.main.addon.EditorJs
 * @extends Neo.main.addon.Base
 */
class EditorJs extends Base {
    static config = {
        className: 'GO.main.addon.EditorJs',
        // the library is loaded on the first createInstance()
        preloadFilesDelay: false,
        remote: {
            app: [
                'createInstance',
                'destroyInstance',
                'getValue',
                'resolveUpload',
                'setHtml',
                'setReadOnly',
                'setValue'
            ]
        }
    }

    /**
     * field id → {editor, holder, timer, uploads, listeners}
     * @member {Object} map={}
     */
    map = {}

    /**
     * Loading of the library, by base URL
     * @member {Object} loading={}
     */
    loading = {}

    /**
     * Upload requests waiting for the worker
     * @member {Number} uploadSeq=0
     */
    uploadSeq = 0

    /**
     * @summary Loads the Editor.js scripts in order, once per page.
     * @param {String} baseUrl sf/editorjs views/extjs3/ URL, with a trailing slash
     * @returns {Promise<void>}
     */
    loadLibrary(baseUrl) {
        let me = this;

        // not globalThis.EditorJS: it exists before the tools are loaded
        if (me.libraryReady) {
            return Promise.resolve()
        }

        me.loading[baseUrl] ??= (async () => {
            try {
                for (const file of FILES) {
                    await new Promise((resolve, reject) => {
                        const script = document.createElement('script');

                        script.src     = baseUrl + file;
                        script.onload  = resolve;
                        script.onerror = () => reject(new Error('Failed to load ' + script.src));
                        document.head.appendChild(script)
                    })
                }
            } catch (e) {
                delete me.loading[baseUrl];
                throw e
            }

            me.libraryReady = true
        })();

        return me.loading[baseUrl]
    }

    /**
     * @summary The tools of sf/editorjs EditorField.js, with uploads through the worker.
     * @param {String} id field id
     * @param {Object} labels translated texts {quote, quoteAuthor}
     * @returns {Object}
     */
    createTools(id, labels) {
        const me = this,
              g  = globalThis;

        /** paragraph that drops itself when it was pasted blank (Word marks empty lines as <p><o:p>&nbsp;</o:p></p>) */
        class Paragraph extends g.EditorJsParagraph {
            constructor(options) {
                super(options);
                this.blockApi = options.block
            }

            onPaste(event) {
                const html = event.detail.data.innerHTML;

                if (!/<img/i.test(html) && isHtmlEmpty(html)) {
                    const index = this.api.blocks.getBlockIndex(this.blockApi.id);

                    if (index !== undefined && index !== -1) {
                        this.api.blocks.delete(index);
                        return
                    }
                }

                super.onPaste(event)
            }
        }

        /** the list tool takes li.innerHTML as an item's text: a nested list would land in its parent's text */
        class List extends g.EditorjsList {
            onPaste(event) {
                super.onPaste(event);

                const element = event.detail.data,
                      list    = this.list;

                if (!list || !list.data || (element.tagName !== 'UL' && element.tagName !== 'OL')) {
                    return
                }

                const tag = element.tagName.toLowerCase(),
                      fix = (items, listEl) => {
                          const lis = listEl.querySelectorAll(':scope > li');

                          items.forEach((item, i) => {
                              if (!lis[i]) {
                                  return
                              }

                              const own = lis[i].cloneNode(true);
                              own.querySelectorAll(':scope > ' + tag).forEach(n => n.remove());
                              item.content = own.innerHTML;

                              const sub = lis[i].querySelector(':scope > ' + tag);
                              sub && fix(item.items, sub)
                          })
                      };

                fix(list.data.items, element);

                const wrapper = list.listWrapper;
                wrapper?.parentNode && wrapper.parentNode.replaceChild(list.render(), wrapper)
            }
        }

        return {
            header: {
                class        : g.EditorJsHeader,
                shortcut     : 'CMD+SHIFT+H',
                inlineToolbar: true,
                config       : {placeholder: 'Enter a header', levels: [1, 2, 3, 4, 5, 6], defaultLevel: 2},
                tunes        : ['alignment']
            },
            paragraph: {
                class        : Paragraph,
                shortcut     : 'CMD+SHIFT+P',
                inlineToolbar: true,
                config       : {preserveBlank: true},
                tunes        : ['alignment']
            },
            alignment: {
                class : g.EditorJsAlignmentBlockTune,
                config: {default: 'left', blocks: {header: 'center', list: 'right'}}
            },
            list : {class: List, shortcut: 'CMD+SHIFT+L', inlineToolbar: true},
            table: {class: g.EditorJsTable, shortcut: 'CMD+SHIFT+T', inlineToolbar: true},
            hyperlink: {
                class : g.EditorJsHyperlink,
                config: {
                    shortcut        : 'CMD+L',
                    target          : '_blank',
                    rel             : 'nofollow',
                    availableTargets: ['_blank', '_self'],
                    availableRels   : ['author', 'noreferrer'],
                    validate        : false
                }
            },
            nestedchecklist      : g.EditorJsNestedChecklist,
            strikethrough        : g.EditorJsStrikethrough,
            breakLine            : {class: g.EditorJsBreakLine, inlineToolbar: true, shortcut: 'CMD+SHIFT+ENTER'},
            pageBreak            : g.EditorJsPageBreak,
            ColorPicker          : {class: g.EditorJsColorPicker.default, config: {colors: COLORS, columns: 6}},
            BackgroundColorPicker: {class: g.EditorJsBackgroundColorPicker, config: {colors: COLORS, columns: 6}},
            quote: {
                class        : g.EditorJsQuote,
                inlineToolbar: true,
                shortcut     : 'CMD+SHIFT+O',
                config       : {quotePlaceholder: labels.quote, captionPlaceholder: labels.quoteAuthor}
            },
            embed      : g.EditorJsEmbed,
            code       : g.EditorJsCodeTool,
            flowcharts : g.EditorJsFlowcharts,
            a2s        : g.EditorJsA2s,
            imageResize: {class: g.ImageToolTune.ImageToolTune, config: {resize: true, crop: false}},
            image: {
                class           : g.EditorJsImageTool,
                shortcut        : 'CMD+SHIFT+I',
                isCaptionEnabled: true,
                tunes           : ['imageResize'],
                config          : {
                    uploader: {
                        uploadByFile: file => me.requestUpload(id, {file}),
                        uploadByUrl : url => me.requestUpload(id, {url})
                    },
                    features: {border: true, caption: 'optional', stretch: true}
                }
            }
        }
    }

    /**
     * @summary Creates the editor in the field's holder (`<id>__editor`).
     * @param {Object} data
     * @param {String} data.id field id
     * @param {String} data.baseUrl sf/editorjs views/extjs3/ URL
     * @param {Object|null} [data.value] Editor.js document {blocks}
     * @param {Boolean} [data.readOnly]
     * @param {Object} [data.labels] {placeholder, quote, quoteAuthor}
     * @param {Number|null} [data.token] the field's mount: destroyInstance() of an older mount leaves this one
     * @returns {Promise<Object|false>} {baseline} (see baseline()), false when the field's DOM is missing
     */
    async createInstance({id, baseUrl, value = null, readOnly = false, labels = {}, token = null}) {
        let me = this;

        await me.loadLibrary(baseUrl);

        me.map[id] && me.destroyInstance({id});

        // a script can fire load and still fail to run: no editor then, the field shows text
        if (!globalThis.EditorJS) {
            throw new Error('Editor.js did not load')
        }

        const holder = DomAccess.getElement(id + '__editor');

        if (!holder) {
            return false
        }

        const item = me.map[id] = {holder, editor: null, timer: null, uploads: new Map(), listeners: [], token},
              onPaste = e => me.onPaste(item, e);

        // no typing until the baseline is taken (see setValue())
        holder.inert = true;
        holder.addEventListener('paste', onPaste, true);
        item.listeners.push(['paste', onPaste, true]);

        item.editor = new globalThis.EditorJS({
            holder,
            data       : renderable(value),
            readOnly,
            minHeight  : 40,
            placeholder: labels.placeholder || '',
            tools      : me.createTools(id, labels),
            onChange   : () => me.scheduleSync(id)
        });

        try {
            await item.editor.isReady
        } catch (e) {
            holder.inert = false;
            me.map[id] === item && me.destroyInstance({id});
            throw e
        }

        // replaced or removed while starting
        if (me.map[id] !== item) {
            return false
        }

        try {
            return {baseline: await me.baseline(item)}
        } finally {
            holder.inert = false
        }
    }

    /**
     * @summary The document as the editor saves the one it just rendered: Editor.js normalises
     * (default tunes, its own sanitizer), so the worker compares later documents with this one,
     * not with the stored answer, to know whether the user changed anything.
     * @param {Object} item
     * @returns {Promise<Object|null>}
     */
    async baseline(item) {
        try {
            const value = await item.editor.save();
            return Array.isArray(value?.blocks) ? value : null
        } catch (e) {
            return null
        }
    }

    /**
     * @summary Sends the document after the changes stop for a moment.
     * @param {String} id
     */
    scheduleSync(id) {
        let me   = this,
            item = me.map[id];

        if (!item) {
            return
        }

        clearTimeout(item.timer);
        item.timer = setTimeout(() => me.sync(id), SYNC_DELAY)
    }

    /**
     * @summary Sends the document to the worker as "editorJsChange".
     * @param {String} id
     * @returns {Promise<Object|null>} the document
     */
    async sync(id, emit = true) {
        const item = this.map[id];

        if (!item) {
            return null
        }

        clearTimeout(item.timer);
        item.timer = null;

        let value;

        try {
            value = await item.editor.save()
        } catch (e) {
            // not in a saveable state (being rendered): the next change sends it
            return null
        }

        // Editor.js resolves undefined when a tool failed to save: that is no empty document
        if (this.map[id] !== item || !Array.isArray(value?.blocks)) {
            return null
        }

        emit && DomEvents.sendMessageToApp({
            id,
            path : DomEvents.getPathFromElement(DomAccess.getElement(id) || item.holder).map(el => DomEvents.getTargetData(el)),
            type : 'editorJsChange',
            token: item.token,
            value
        });

        return value
    }

    /**
     * @summary The current document straight from the editor (before a save).
     * @param {Object} data
     * @param {String} data.id
     * @returns {Promise<Object|null>}
     */
    async getValue({id}) {
        // no change event: the caller takes the returned value
        return this.sync(id, false)
    }

    /**
     * @summary Shows a document, an empty editor for none.
     * @param {Object} data
     * @param {String} data.id
     * @param {Object|null} data.value
     * @returns {Promise<Object|null>} the baseline of the shown document (see baseline())
     */
    async setValue({id, value}) {
        const item = this.map[id];

        if (!item) {
            return null
        }

        await item.editor.isReady;
        clearTimeout(item.timer);

        // no typing until the baseline is taken: typing would count as part of the loaded answer
        item.holder.inert = true;

        try {
            if (value?.blocks?.length) {
                await item.editor.render(renderable(value))
            } else {
                await item.editor.clear()
            }

            return await this.baseline(item)
        } finally {
            item.holder.inert = false
        }
    }

    /**
     * @summary Replaces the document with blocks made from HTML (Editor.js renderFromHTML(), as
     * sf/editorjs EditorField.js setValueFromHtml()); the caller takes the returned document as a change.
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.html
     * @returns {Promise<Object|null>} the new document
     */
    async setHtml({id, html}) {
        const item = this.map[id];

        if (!item) {
            return null
        }

        await item.editor.isReady;
        clearTimeout(item.timer);

        // the HTML may come from a converted upload: nothing in it may run code here
        await item.editor.blocks.renderFromHTML(cleanHtml(String(html ?? '')));

        // renderFromHTML() resolves before the blocks get their content (next frame): read until two reads agree
        let value = null;

        for (let i = 0; i < 10 && this.map[id] === item; i++) {
            await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 20)));

            const next = await this.sync(id, false);

            if (next && value && editorJsSame(next, value)) {
                return next
            }

            value = next
        }

        return value
    }

    /**
     * @summary Turns editing off or on.
     * @param {Object} data
     * @param {String} data.id
     * @param {Boolean} data.readOnly
     * @returns {Promise<void>}
     */
    async setReadOnly({id, readOnly}) {
        const item = this.map[id];

        if (item) {
            await item.editor.isReady;
            await item.editor.readOnly.toggle(!!readOnly)
        }
    }

    /**
     * @summary Asks the worker to upload an image (a file, or a URL the server fetches).
     * @param {String} id
     * @param {Object} what {file} or {url}
     * @returns {Promise<Object>} the image tool's answer {success, file: {url}}
     */
    requestUpload(id, what) {
        const item = this.map[id];

        if (!item) {
            return Promise.reject(new Error('Editor closed'))
        }

        const requestId = ++this.uploadSeq;

        return new Promise((resolve, reject) => {
            item.uploads.set(requestId, {resolve, reject});

            // File objects survive postMessage (structured clone)
            DomEvents.sendMessageToApp({
                id,
                path: DomEvents.getPathFromElement(DomAccess.getElement(id) || item.holder).map(el => DomEvents.getTargetData(el)),
                type: 'editorJsUpload',
                requestId,
                ...what
            })
        })
    }

    /**
     * @summary The worker's answer to an upload request.
     * @param {Object} data
     * @param {String} data.id
     * @param {Number} data.requestId
     * @param {String} [data.url] download URL of the uploaded image
     * @param {String} [data.error] why it failed
     */
    resolveUpload({id, requestId, url, error}) {
        const pending = this.map[id]?.uploads.get(requestId);

        if (!pending) {
            return
        }

        this.map[id].uploads.delete(requestId);
        url ? pending.resolve({success: 1, file: {url}}) : pending.reject(new Error(error || 'Upload failed'))
    }

    /**
     * @summary Rewrites a paste from Word before Editor.js sees it (sf/editorjs EditorField.js
     * onEditorJsPaste()): Word's picture of the selection is dropped when the HTML has text, its list
     * paragraphs become lists and its source line wrapping becomes spaces.
     * @param {Object} item
     * @param {ClipboardEvent} e
     */
    onPaste(item, e) {
        const data = e.clipboardData;

        // a synthetic paste inserts nothing into a native input; blocks copied inside Editor.js keep their data
        if (item.repasting || !data || e.target.matches('input, textarea') || Array.from(data.types).includes('application/x-editor-js')) {
            return
        }

        const html = data.getData('text/html');

        if (!html) {
            return
        }

        // DOMParser does not load images or run handlers
        const doc       = new DOMParser().parseFromString(html, 'text/html'),
              fromWord  = /urn:schemas-microsoft-com:office/i.test(html) || !!doc.querySelector('[style*="mso-"], [class^="Mso"]'),
              dropFiles = data.files.length > 0 && doc.body.textContent.trim() !== '';

        if (!fromWord && !dropFiles) {
            return
        }

        if (fromWord) {
            convertWordLists(doc);
            joinWrappedLines(doc)
        }

        e.preventDefault();
        e.stopPropagation();

        const rewritten = new DataTransfer();

        rewritten.setData('text/html', doc.body.innerHTML);
        rewritten.setData('text/plain', data.getData('text/plain'));
        !dropFiles && Array.from(data.files).forEach(file => rewritten.items.add(file));

        item.repasting = true;

        try {
            e.target.dispatchEvent(new ClipboardEvent('paste', {clipboardData: rewritten, bubbles: true, cancelable: true}))
        } finally {
            item.repasting = false
        }
    }

    /**
     * @summary Removes the editor of a field; waiting uploads fail.
     * @param {Object} data
     * @param {String} data.id
     * @param {Number|null} [data.token] only the editor of this mount
     */
    destroyInstance({id, token = null}) {
        let me   = this,
            item = me.map[id];

        if (!item || (token !== null && item.token !== token)) {
            return
        }

        delete me.map[id];
        clearTimeout(item.timer);
        item.listeners.forEach(([event, fn, capture]) => item.holder.removeEventListener(event, fn, capture));
        item.uploads.forEach(pending => pending.reject(new Error('Editor closed')));

        // Editor.js has destroy() only once ready: an editor still starting is destroyed when it is
        Promise.resolve(item.editor?.isReady)
            .then(() => item.editor?.destroy?.())
            .catch(() => {})
    }
}

export default Neo.setupClass(EditorJs);
