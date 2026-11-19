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

/**
 * "@name" right before the caret, after a space or at the start of the text. The
 * characters match the server's parser (Comment::parseMentions(): [\w-] and inner dots).
 */
const MENTION = /(?:^|[\s\u00a0])@([\w.-]*)$/;

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
                'setValue',
                'showMentions'
            ]
        }
    }

    /**
     * field id → {root, editor, linkBar, linkInput, range, timer, labels, listeners,
     * mentions, mention, mentionMenu, mentionItems, mentionActive, mentionSuppress}
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
     * @param {Boolean} [data.mentions] "@name" asks the worker for suggestions ("mentionQuery"), see showMentions()
     * @returns {Boolean} false when the field's DOM is missing
     */
    createInstance({id, value = '', labels = {}, token = null, mentions = false}) {
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
            mention  : null,
            mentions,
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

        on(item.editor, 'input', () => {
            me.scheduleSync(id);
            me.checkMention(id)
        });
        on(item.editor, 'blur', () => {
            me.hideMentions(item);
            me.sync(id)
        });
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
        item.mentionMenu?.remove();
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
        } else if (cmd === 'mention') {
            this.restoreRange(item);
            this.startMention(id)
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
        if (this.onMentionKey(this.map[id], e)) {
            return
        }

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
                this.updateToolbar(id);
                // caret moved into or out of an "@name"
                this.checkMention(id)
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

    /**
     * Toolbar "Mention user": types "@" (after a space when needed) and opens the suggestions
     * @param {String} id
     */
    startMention(id) {
        const selection = getSelection(),
              node      = selection.anchorNode,
              before    = node?.nodeType === 3 ? node.textContent.slice(0, selection.anchorOffset) : '';

        document.execCommand('insertText', false, before && !/[\s ]$/.test(before) ? ' @' : '@');
        this.checkMention(id)
    }

    /**
     * Looks for "@name" before the caret. A new name is sent to the worker as the DOM event
     * "mentionQuery" {query}; it answers with showMentions().
     * @param {String} id
     */
    checkMention(id) {
        const item = this.map[id];

        if (!item?.mentions || item.editor.contentEditable === 'false') {
            return
        }

        const selection = getSelection(),
              node      = selection.anchorNode;
        let state       = null;

        if (selection.rangeCount && selection.isCollapsed && node?.nodeType === 3 && item.editor.contains(node)) {
            const match = MENTION.exec(node.textContent.slice(0, selection.anchorOffset));

            if (match) {
                state = {node, query: match[1], start: selection.anchorOffset - match[1].length - 1}
            }
        }

        // closed with Escape: stays closed for this "@"
        const suppress = item.mentionSuppress;

        if (state && suppress?.node === state.node && suppress.start === state.start) {
            state = null
        } else if (!state) {
            item.mentionSuppress = null
        }

        if (!state) {
            this.hideMentions(item);
            return
        }

        const old = item.mention;
        item.mention = state;

        if (old?.query === state.query && old.node === state.node && old.start === state.start) {
            return
        }

        item.mentionMenu?.isConnected && this.positionMentions(item);

        DomEvents.sendMessageToApp({
            id,
            path : DomEvents.getPathFromElement(item.root).map(e => DomEvents.getTargetData(e)),
            query: state.query,
            type : 'mentionQuery'
        })
    }

    /**
     * Suggestions from the worker for an "@name"; ignored when the user typed on meanwhile
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.query the name they are for
     * @param {Object[]} data.items {value, display, sub}: value is typed after the "@"
     */
    showMentions({id, query, items = []}) {
        const item = this.map[id];

        if (!item?.mention || item.mention.query !== query || document.activeElement !== item.editor) {
            return
        }

        item.mentionItems  = items;
        item.mentionActive = 0;

        let menu = item.mentionMenu;

        if (!menu) {
            menu = item.mentionMenu = document.createElement('div');
            menu.className = 'go-htmlfield-mentions';
            menu.id        = id + '__mentions';
            menu.setAttribute('role', 'listbox');
            menu.setAttribute('aria-label', item.labels.mention || 'Mention user');
            // keep the focus in the editor
            menu.addEventListener('mousedown', e => {
                e.preventDefault();
                const option = e.target.closest('[data-index]');
                option && this.pickMention(item, Number(option.dataset.index))
            })
        }

        menu.replaceChildren(...(items.length ? items.map((entry, index) => {
            const option = document.createElement('div'),
                  text   = document.createElement('span');

            option.className = 'go-htmlfield-mention';
            option.id        = id + '__mention_' + index;
            option.dataset.index = String(index);
            option.setAttribute('role', 'option');
            text.textContent = entry.display ?? entry.value;
            option.append(text);

            if (entry.sub) {
                const sub = document.createElement('small');
                sub.textContent = entry.sub;
                option.append(sub)
            }

            return option
        }) : [Object.assign(document.createElement('div'), {
            className  : 'go-htmlfield-mention go-htmlfield-mention-empty',
            textContent: item.labels.noResults || 'No results found'
        })]));

        // the theme classes (CSS variables) live on the app's root element, not on body
        const themed = item.root.closest('[class*="neo-theme-"]');
        menu.className = ['go-htmlfield-mentions', ...[...(themed?.classList || [])].filter(c => c.startsWith('neo-theme-'))].join(' ');

        menu.isConnected || document.body.append(menu);
        this.positionMentions(item);
        this.markActiveMention(item)
    }

    /**
     * Below the caret, above it when there is no room
     * @param {Object} item
     */
    positionMentions(item) {
        const menu      = item.mentionMenu,
              selection = getSelection();

        if (!menu || !selection.rangeCount) {
            return
        }

        let rect = selection.getRangeAt(0).getBoundingClientRect();

        // an empty line has no caret rect
        if (!rect.height) {
            rect = item.editor.getBoundingClientRect()
        }

        menu.style.left = Math.max(0, Math.min(rect.left, innerWidth - menu.offsetWidth - 8)) + 'px';
        menu.style.top  = (rect.bottom + menu.offsetHeight + 4 > innerHeight ?
            Math.max(0, rect.top - menu.offsetHeight - 4) : rect.bottom + 4) + 'px'
    }

    markActiveMention(item) {
        const editor = item.editor;

        item.mentionMenu?.querySelectorAll('[data-index]').forEach(option => {
            const active = Number(option.dataset.index) === item.mentionActive;

            option.classList.toggle('active', active);
            option.setAttribute('aria-selected', String(active));
            active && option.scrollIntoView({block: 'nearest'})
        });

        if (item.mentionMenu?.isConnected && item.mentionItems?.length) {
            editor.setAttribute('aria-activedescendant', editor.id.replace(/__editor$/, '') + '__mention_' + item.mentionActive)
        } else {
            editor.removeAttribute('aria-activedescendant')
        }
    }

    /**
     * @param {Object} item
     */
    hideMentions(item) {
        item.mention      = null;
        item.mentionItems = null;
        item.mentionMenu?.remove();
        item.editor.removeAttribute('aria-activedescendant')
    }

    /**
     * Arrow keys, Enter, Tab and Escape while the suggestions show
     * @param {Object} item
     * @param {KeyboardEvent} e
     * @returns {Boolean} true when the key was used
     */
    onMentionKey(item, e) {
        const count = item?.mentionItems?.length;

        if (!item?.mentionMenu?.isConnected || e.isComposing) {
            return false
        }

        switch (e.key) {
            case 'ArrowDown':
            case 'ArrowUp':
                if (!count) {
                    return false
                }
                item.mentionActive = (item.mentionActive + (e.key === 'ArrowDown' ? 1 : -1) + count) % count;
                this.markActiveMention(item);
                break;
            case 'Enter':
            case 'Tab':
                if (!count) {
                    return false
                }
                this.pickMention(item, item.mentionActive);
                break;
            case 'Escape':
                item.mentionSuppress = {node: item.mention.node, start: item.mention.start};
                this.hideMentions(item);
                break;
            default:
                return false
        }

        e.preventDefault();
        e.stopPropagation();
        return true
    }

    /**
     * Replaces the typed "@name" with "@value" and a space
     * @param {Object} item
     * @param {Number} index
     */
    pickMention(item, index) {
        const entry = item.mentionItems?.[index],
              state = item.mention;

        if (!entry || !state || !state.node.isConnected) {
            return
        }

        const range = document.createRange();

        range.setStart(state.node, state.start);
        range.setEnd(state.node, Math.min(state.start + 1 + state.query.length, state.node.length));
        getSelection().removeAllRanges();
        getSelection().addRange(range);

        this.hideMentions(item);
        // insertText keeps the browser's undo stack
        document.execCommand('insertText', false, '@' + entry.value + ' ');

        const id = Object.keys(this.map).find(key => this.map[key] === item);
        id && this.sync(id)
    }
}

export default Neo.setupClass(HtmlEditor);
