import Base      from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';
import DomAccess from '../../../node_modules/neo.mjs/src/main/DomAccess.mjs';
import DomEvents from '../../../node_modules/neo.mjs/src/main/DomEvents.mjs';

/**
 * Main thread side of GO.form.field.HtmlField: the contenteditable editor and
 * its toolbar commands (document.execCommand needs the live selection, so the
 * commands run here, not in the App worker).
 *
 * Loaded lazily per window by the field:
 *     await Neo.Main.importAddon({name: 'WS/HtmlEditor', windowId})
 * neo resolves "WS/" to views/neo/src/main/addon/ (Neo.Main.importAddonModule).
 *
 * The field renders the DOM (toolbar buttons with data-cmd, an empty editor and
 * an empty link bar); this addon owns the editor's content and the link bar's
 * children, which the field's vdom never describes.
 *
 * The App worker gets the HTML as a custom DOM event "htmlChange" (debounced
 * on input, immediately on blur and before a command).
 */

/** commands with an on/off state shown on their button */
const STATE_COMMANDS = ['bold', 'italic', 'underline', 'strikeThrough', 'insertOrderedList', 'insertUnorderedList'];

/** elements dropped by setValue(): content comes from the server, but never runs code in the editor */
const UNSAFE_TAGS = 'script,style,iframe,object,embed,link,meta,base,form,frame,frameset';

/** URL schemes a link may use */
const LINK_SCHEME = /^(https?:|mailto:|tel:|\/|#)/i;

const URL_ATTRIBUTES = ['href', 'src', 'action', 'formaction', 'xlink:href', 'background', 'poster', 'srcset'];

/**
 * Allowlist, not a blacklist: browsers ignore control characters and whitespace
 * inside a scheme ("java&#10;script:"), so strip them before looking at it.
 * @param {String} value attribute value
 * @param {Boolean} image src: also inline images and mail parts
 * @returns {Boolean}
 */
function isSafeUrl(value, image) {
    const url = String(value).replace(/[\u0000-\u0020\u007f-\u009f]+/g, '');

    // no scheme: relative URL ("a/b", "?x", "#y")
    if (!/^[^/?#]*:/.test(url)) {
        return true
    }

    return LINK_SCHEME.test(url) || (image && /^(data:image\/(png|gif|jpe?g|webp);|cid:)/i.test(url))
}

/** ms after the last input before the value goes to the worker */
const SYNC_DELAY = 300;

class HtmlEditor extends Base {
    static config = {
        className: 'GO.main.addon.HtmlEditor',
        // no library files to load
        preloadFilesDelay: false,
        remote: {
            app: [
                'createInstance',
                'destroyInstance',
                'focus',
                'getValue',
                'setValue'
            ]
        }
    }

    /**
     * field id → {root, editor, linkBar, linkInput, range, timer, labels, listeners}
     * @member {Object} map={}
     */
    map = {}

    construct(config) {
        super.construct(config);

        document.addEventListener('selectionchange', () => this.onSelectionChange())
    }

    /**
     * @param {Object} data
     * @param {String} data.id      field id; editor = id + '__editor'
     * @param {String} data.value   HTML
     * @param {Object} data.labels  translated texts for the link bar
     * @param {Number} [data.token] identifies this instance for destroyInstance()
     * @returns {Boolean} false when the field's DOM is missing
     */
    createInstance({id, value = '', labels = {}, token = null}) {
        let me   = this,
            root = DomAccess.getElement(id);

        if (me.map[id]) {
            me.destroyInstance({id})
        }

        if (!root) {
            console.warn('HtmlEditor: node not found', id);
            return false
        }

        const item = me.map[id] = {
            editor   : DomAccess.getElement(id + '__editor'),
            labels,
            linkBar  : DomAccess.getElement(id + '__linkbar'),
            listeners: [],
            range    : null,
            root,
            timer    : null,
            token
        };

        me.fill(item.editor, value);
        me.buildLinkBar(item);

        const on = (el, type, fn) => {
            el.addEventListener(type, fn);
            item.listeners.push(() => el.removeEventListener(type, fn))
        };

        on(item.editor, 'input', () => me.scheduleSync(id));
        on(item.editor, 'blur', () => me.sync(id));
        on(item.editor, 'keydown', e => me.onKeyDown(id, e));
        // on the root, which neo keeps while the field lives: toolbar nodes may get re-rendered
        const inToolbar = e => e.target.closest?.('.go-htmlfield-toolbar');

        on(root, 'mousedown', e => {
            // keep the editor's selection: a toolbar click must not focus the button
            if (inToolbar(e) && e.target.closest('[data-cmd]') && e.target.tagName !== 'INPUT') {
                e.preventDefault()
            }
        });
        on(root, 'click', e => inToolbar(e) && me.onToolbarClick(id, e));
        on(root, 'input', e => inToolbar(e) && me.onColorInput(id, e));

        me.updateToolbar(id);

        return true
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Number} [data.token] only this instance: a late cleanup must not hit a newer editor
     * @returns {String|null} the last HTML, the worker may not have it yet
     */
    destroyInstance({id, token = null}) {
        const item = this.map[id];

        if (!item || (token !== null && item.token !== token)) {
            return null
        }

        clearTimeout(item.timer);
        item.listeners.forEach(off => off());
        delete this.map[id];

        return this.readValue(item)
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     */
    focus({id}) {
        this.map[id]?.editor.focus()
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @returns {String|null}
     */
    getValue({id}) {
        const item = this.map[id];
        return item ? this.readValue(item) : null
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.value HTML
     */
    setValue({id, value}) {
        const item = this.map[id];

        if (item && this.readValue(item) !== (value || '')) {
            clearTimeout(item.timer);
            this.fill(item.editor, value);
            this.updateToolbar(id)
        }
    }

    /**
     * Replaces the editor content. The HTML is parsed into an inert document
     * first; elements and attributes that could run code are removed.
     * @param {HTMLElement} editor
     * @param {String} html
     */
    fill(editor, html) {
        const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');

        doc.body.querySelectorAll(UNSAFE_TAGS).forEach(el => el.remove());
        doc.body.querySelectorAll('*').forEach(el => {
            [...el.attributes].forEach(attr => {
                const name = attr.name.toLowerCase();

                if (name.startsWith('on') ||
                    (URL_ATTRIBUTES.includes(name) && !isSafeUrl(attr.value, name === 'src'))) {
                    el.removeAttribute(attr.name)
                }
            })
        });

        editor.replaceChildren(...[...doc.body.childNodes].map(node => document.importNode(node, true)))
    }

    /**
     * @param {Object} item
     * @returns {String} '' for an editor without content
     */
    readValue(item) {
        const {editor} = item;

        if (!editor.textContent.trim() && !editor.querySelector('img,hr,table,li')) {
            return ''
        }

        return editor.innerHTML
    }

    scheduleSync(id) {
        const item = this.map[id];

        if (item) {
            clearTimeout(item.timer);
            item.timer = setTimeout(() => this.sync(id), SYNC_DELAY)
        }
    }

    /**
     * Sends the HTML to the field in the App worker
     * @param {String} id
     */
    sync(id) {
        const item = this.map[id];

        if (!item) {
            return
        }

        clearTimeout(item.timer);
        item.timer = null;

        DomEvents.sendMessageToApp({
            id,
            path : DomEvents.getPathFromElement(item.root).map(e => DomEvents.getTargetData(e)),
            type : 'htmlChange',
            value: this.readValue(item)
        })
    }

    /**
     * Restores the editor selection saved before a toolbar control took focus
     * @param {Object} item
     */
    restoreRange(item) {
        item.editor.focus();

        if (item.range) {
            const selection = getSelection();
            selection.removeAllRanges();
            selection.addRange(item.range)
        }
    }

    /**
     * @param {String} id
     * @param {String} cmd
     * @param {*} [value]
     */
    exec(id, cmd, value) {
        const item = this.map[id];

        // insertOrderedList & co. need a block to work on
        if (!item.editor.firstChild) {
            document.execCommand('defaultParagraphSeparator', false, 'p')
        }

        document.execCommand('styleWithCSS', false, cmd === 'foreColor' || cmd === 'backColor');
        document.execCommand(cmd === 'backColor' ? 'hiliteColor' : cmd, false, value);

        this.updateToolbar(id);
        this.sync(id)
    }

    onToolbarClick(id, e) {
        const item   = this.map[id],
              button = e.target.closest('[data-cmd]');

        if (!button || button.tagName === 'INPUT' || button.disabled) {
            return
        }

        const {cmd} = button.dataset;

        if (cmd === 'createLink') {
            this.showLinkBar(id)
        } else if (cmd === 'foreColor' || cmd === 'backColor') {
            // the colour input inside the label opens the picker
            this.saveRange(item)
        } else {
            this.restoreRange(item);
            this.exec(id, cmd)
        }
    }

    onColorInput(id, e) {
        const input = e.target;

        if (input.tagName === 'INPUT' && input.type === 'color') {
            this.restoreRange(this.map[id]);
            this.exec(id, input.dataset.cmd, input.value)
        }
    }

    onKeyDown(id, e) {
        // Tab in a list item: indent / outdent like GOUI
        if (e.key === 'Tab' && getSelection().anchorNode?.parentElement?.closest('li')) {
            e.preventDefault();
            this.exec(id, e.shiftKey ? 'outdent' : 'indent')
        }
    }

    onSelectionChange() {
        const selection = getSelection(),
              node      = selection.anchorNode;

        Object.entries(this.map).forEach(([id, item]) => {
            if (node && item.editor.contains(node)) {
                item.range = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
                this.updateToolbar(id)
            }
        })
    }

    saveRange(item) {
        const selection = getSelection();

        if (selection.rangeCount && item.editor.contains(selection.anchorNode)) {
            item.range = selection.getRangeAt(0).cloneRange()
        }
    }

    /**
     * Pressed state of the toolbar buttons (aria-pressed, not in the field's vdom)
     * @param {String} id
     */
    updateToolbar(id) {
        const item = this.map[id];

        item?.root.querySelector('.go-htmlfield-toolbar')?.querySelectorAll('[data-cmd]').forEach(button => {
            const {cmd} = button.dataset;

            if (STATE_COMMANDS.includes(cmd)) {
                let pressed = false;

                try {
                    pressed = item.editor.contains(getSelection().anchorNode) && document.queryCommandState(cmd)
                } catch (e) {}

                button.setAttribute('aria-pressed', String(pressed))
            }
        })
    }

    /**
     * URL row below the toolbar for "Create link" (GOUI uses prompt(), which
     * would block the page)
     * @param {Object} item
     */
    buildLinkBar(item) {
        const {labels, linkBar} = item;

        if (!linkBar) {
            return
        }

        const input  = document.createElement('input'),
              ok     = document.createElement('button'),
              unlink = document.createElement('button'),
              cancel = document.createElement('button');

        input.type        = 'url';
        input.placeholder = 'https://';
        input.className   = 'go-htmlfield-linkinput';
        input.setAttribute('aria-label', labels.url || 'URL');

        [[ok, labels.ok || 'OK', 'apply'], [unlink, labels.unlink || 'Remove link', 'unlink'], [cancel, labels.cancel || 'Cancel', 'cancel']]
            .forEach(([button, text, action]) => {
                button.type           = 'button';
                button.textContent    = text;
                button.className      = 'go-htmlfield-linkbutton';
                button.dataset.action = action
            });

        linkBar.replaceChildren(input, ok, unlink, cancel);
        linkBar.hidden = true;

        item.linkInput = input;

        linkBar.onmousedown = e => {
            e.target.tagName === 'BUTTON' && e.preventDefault()
        };
        linkBar.onclick = e => {
            const action = e.target.dataset?.action;
            action && this.onLinkAction(item, action)
        };
        input.onkeydown = e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.onLinkAction(item, 'apply')
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.onLinkAction(item, 'cancel')
            }
        }
    }

    showLinkBar(id) {
        const item = this.map[id];

        if (!item.linkBar) {
            return
        }

        this.saveRange(item);

        const anchor = this.selectedAnchor(item);

        item.linkInput.value = anchor ? anchor.getAttribute('href') || '' : 'https://';
        item.linkBar.hidden  = false;
        item.linkInput.focus();
        item.linkInput.select()
    }

    selectedAnchor(item) {
        const node = item.range?.startContainer,
              el   = node?.nodeType === 1 ? node : node?.parentElement;

        return el && item.editor.contains(el) ? el.closest('a') : null
    }

    onLinkAction(item, action) {
        const id     = Object.keys(this.map).find(key => this.map[key] === item),
              url    = item.linkInput.value.trim(),
              anchor = this.selectedAnchor(item);

        item.linkBar.hidden = true;
        this.restoreRange(item);

        if (action === 'unlink' || (action === 'apply' && !url)) {
            if (anchor) {
                // select the whole link so unlink removes it
                const range = document.createRange();
                range.selectNodeContents(anchor);
                getSelection().removeAllRanges();
                getSelection().addRange(range)
            }
            this.exec(id, 'unlink')
        } else if (action === 'apply') {
            if (!LINK_SCHEME.test(url)) {
                // "example.com" → https://example.com; never javascript: & co.
                if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
                    return
                }
            }

            const href = LINK_SCHEME.test(url) ? url : 'https://' + url;

            if (anchor) {
                anchor.setAttribute('href', href);
                this.sync(id)
            } else if (getSelection().isCollapsed) {
                // no text selected: insert the URL as the link text
                document.execCommand('insertHTML', false, '<a href="' + href.replace(/[&"<>]/g, c => `&#${c.charCodeAt(0)};`) + '">' +
                    href.replace(/[&<>]/g, c => `&#${c.charCodeAt(0)};`) + '</a>');
                this.sync(id)
            } else {
                this.exec(id, 'createLink', href)
            }
        }
    }
}

export default Neo.setupClass(HtmlEditor);
