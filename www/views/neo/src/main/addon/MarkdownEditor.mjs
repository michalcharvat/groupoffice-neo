import Base      from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';
import DomAccess from '../../../node_modules/neo.mjs/src/main/DomAccess.mjs';
import DomEvents from '../../../node_modules/neo.mjs/src/main/DomEvents.mjs';

/**
 * Main thread side of GO.form.field.MarkdownField: a plain textarea with the
 * Markdown toolbar commands of GOUI MarkdownField (EasyMDE). The commands need the
 * live selection of the textarea, so they run here, not in the App worker.
 *
 * Loaded lazily per window by the field:
 *     await Neo.Main.importAddon({name: 'WS/MarkdownEditor', windowId})
 *
 * The field renders the DOM (toolbar buttons with data-cmd and an empty textarea);
 * this addon owns the textarea's value. The App worker gets:
 * - the text as a custom DOM event "htmlChange" (the value event of the editor
 *   addons, see HtmlEditor; debounced on input, immediately on blur and after a command)
 * - pasted or dropped images as "markdownFiles" {files}: the worker uploads them and
 *   inserts the Markdown with insertText()
 */

/** ms after the last input before the value goes to the worker */
const SYNC_DELAY = 300;

/** keyboard shortcuts with Ctrl / Cmd */
const SHORTCUTS = {b: 'bold', i: 'italic', k: 'link'};

const TABLE = '| Column 1 | Column 2 | Column 3 |\n| -------- | -------- | -------- |\n| Text     | Text     | Text     |';

class MarkdownEditor extends Base {
    static config = {
        className: 'GO.main.addon.MarkdownEditor',
        // no library files to load
        preloadFilesDelay: false,
        remote: {
            app: [
                'createInstance',
                'destroyInstance',
                'focus',
                'getValue',
                'insertText',
                'setValue'
            ]
        }
    }

    /**
     * field id → {root, editor, timer, token, listeners}
     * @member {Object} map={}
     */
    map = {}

    /**
     * @param {Object} data
     * @param {String} data.id      field id; textarea = id + '__editor'
     * @param {String} data.value   Markdown
     * @param {Number} [data.token] identifies this instance for destroyInstance()
     * @returns {Boolean} false when the field's DOM is missing
     */
    createInstance({id, value = '', token = null}) {
        let me   = this,
            root = DomAccess.getElement(id);

        if (me.map[id]) {
            me.destroyInstance({id})
        }

        const editor = DomAccess.getElement(id + '__editor');

        if (!root || !editor) {
            console.warn('MarkdownEditor: node not found', id);
            return false
        }

        const item = me.map[id] = {editor, listeners: [], root, timer: null, token};

        editor.value = value || '';

        const on = (el, type, fn) => {
            el.addEventListener(type, fn);
            item.listeners.push(() => el.removeEventListener(type, fn))
        };

        on(editor, 'input', () => me.scheduleSync(id));
        on(editor, 'blur', () => me.sync(id));
        on(editor, 'keydown', e => me.onKeyDown(id, e));
        on(editor, 'paste', e => me.onFiles(id, e, e.clipboardData));
        on(editor, 'dragover', e => me.hasFiles(e.dataTransfer) && e.preventDefault());
        on(editor, 'drop', e => me.onFiles(id, e, e.dataTransfer));

        // on the root, which neo keeps while the field lives: toolbar nodes may get re-rendered
        const command = e => e.target.closest?.('.go-htmlfield-toolbar') && e.target.closest('[data-cmd]');

        // keep the textarea's selection: a toolbar click must not focus the button
        on(root, 'mousedown', e => command(e) && e.preventDefault());
        on(root, 'click', e => {
            const button = command(e);
            button && !button.disabled && me.exec(id, button.dataset.cmd)
        });

        return true
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {Number} [data.token] only this instance: a late cleanup must not hit a newer editor
     * @returns {String|null} the last text, the worker may not have it yet
     */
    destroyInstance({id, token = null}) {
        const item = this.map[id];

        if (!item || (token !== null && item.token !== token)) {
            return null
        }

        clearTimeout(item.timer);
        item.listeners.forEach(off => off());
        delete this.map[id];

        return item.editor.value
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
        return this.map[id]?.editor.value ?? null
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.value
     */
    setValue({id, value}) {
        const item = this.map[id];

        if (item && item.editor.value !== (value || '')) {
            clearTimeout(item.timer);
            item.editor.value = value || ''
        }
    }

    /**
     * Inserts text at the cursor (replaces the selection), e.g. an uploaded image
     * @param {Object} data
     * @param {String} data.id
     * @param {String} data.text
     */
    insertText({id, text}) {
        const item = this.map[id];

        if (item) {
            const {selectionStart, selectionEnd} = item.editor;
            this.replace(item, selectionStart, selectionEnd, text);
            this.sync(id)
        }
    }

    scheduleSync(id) {
        const item = this.map[id];

        if (item) {
            clearTimeout(item.timer);
            item.timer = setTimeout(() => this.sync(id), SYNC_DELAY)
        }
    }

    /**
     * Sends the text to the field in the App worker
     * @param {String} id
     */
    sync(id) {
        const item = this.map[id];

        if (!item) {
            return
        }

        clearTimeout(item.timer);
        item.timer = null;

        this.send(item, {type: 'htmlChange', value: item.editor.value})
    }

    /**
     * Custom DOM event to the field in the App worker
     * @param {Object} item
     * @param {Object} data
     */
    send(item, data) {
        DomEvents.sendMessageToApp({
            id  : item.root.id,
            path: DomEvents.getPathFromElement(item.root).map(e => DomEvents.getTargetData(e)),
            ...data
        })
    }

    /**
     * @param {DataTransfer|null} transfer
     * @returns {Boolean}
     */
    hasFiles(transfer) {
        return !!transfer && [...transfer.types || []].includes('Files')
    }

    /**
     * Pasted or dropped images go to the worker for upload. Other content is
     * pasted / dropped as usual.
     * @param {String} id
     * @param {Event} e
     * @param {DataTransfer|null} transfer
     */
    onFiles(id, e, transfer) {
        const item   = this.map[id],
              images = [...transfer?.files || []].filter(file => file.type.startsWith('image/'));

        if (!item || !images.length || item.editor.readOnly) {
            return
        }

        e.preventDefault();

        // a drop puts the cursor where the images were dropped
        if (e.type === 'drop' && document.caretPositionFromPoint) {
            const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
            pos?.offsetNode === item.editor && item.editor.setSelectionRange(pos.offset, pos.offset)
        }

        // File objects survive postMessage (structured clone)
        this.send(item, {type: 'markdownFiles', files: images})
    }

    onKeyDown(id, e) {
        const cmd = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && SHORTCUTS[e.key.toLowerCase()];

        if (cmd) {
            e.preventDefault();
            this.exec(id, cmd)
        }
    }

    /**
     * Replaces a range of the textarea. execCommand('insertText') keeps the
     * browser's undo history; setRangeText() is the fallback.
     * @param {Object} item
     * @param {Number} start
     * @param {Number} end
     * @param {String} text
     * @param {Number} [selectStart] selection afterwards, relative to start (default: after the text)
     * @param {Number} [selectEnd]
     */
    replace(item, start, end, text, selectStart = text.length, selectEnd = selectStart) {
        const {editor} = item;

        editor.focus();
        editor.setSelectionRange(start, end);

        if (!document.execCommand('insertText', false, text)) {
            editor.setRangeText(text, start, end, 'end')
        }

        editor.setSelectionRange(start + selectStart, start + selectEnd)
    }

    /**
     * Toggles inline markup around the selection, e.g. **bold**
     * @param {Object} item
     * @param {String} mark
     * @param {String} placeholder text when nothing is selected
     */
    toggleInline(item, mark, placeholder) {
        const {editor}                       = item,
              {selectionStart: s, selectionEnd: e, value} = editor,
              n                              = mark.length;

        // already marked: remove the marks around the selection
        if (value.slice(s - n, s) === mark && value.slice(e, e + n) === mark) {
            this.replace(item, s - n, e + n, value.slice(s, e), 0, e - s);
            return
        }

        const text = value.slice(s, e) || placeholder;
        this.replace(item, s, e, mark + text + mark, n, n + text.length)
    }

    /**
     * Changes the selected lines
     * @param {Object} item
     * @param {Function} fn (line, index, lines) → new line
     */
    mapLines(item, fn) {
        const {editor}                                   = item,
              {selectionStart: s, selectionEnd: e, value} = editor,
              start                                      = value.lastIndexOf('\n', s - 1) + 1,
              endBreak                                   = value.indexOf('\n', e),
              end                                        = endBreak === -1 ? value.length : endBreak,
              lines                                      = value.slice(start, end).split('\n'),
              text                                       = lines.map(fn).join('\n');

        // a selection stays selected, a cursor goes to the end of the changed line(s)
        this.replace(item, start, end, text, s === e ? text.length : 0, text.length)
    }

    /**
     * Toggles a line prefix like "> " or "- ": removed when every line has it
     * @param {Object} item
     * @param {RegExp} test matches a line that has the prefix (and captures it)
     * @param {Function} prefix (index) → prefix
     */
    toggleLinePrefix(item, test, prefix) {
        const {selectionStart: s, selectionEnd: e, value} = item.editor,
              start = value.lastIndexOf('\n', s - 1) + 1,
              end   = value.indexOf('\n', e) === -1 ? value.length : value.indexOf('\n', e),
              all   = value.slice(start, end).split('\n').every(line => test.test(line));

        this.mapLines(item, (line, i) => all ? line.replace(test, '') : prefix(i) + line)
    }

    /**
     * Runs a toolbar command
     * @param {String} id
     * @param {String} cmd
     */
    exec(id, cmd) {
        const item = this.map[id];

        if (!item || item.editor.readOnly) {
            return
        }

        const {editor} = item,
              {selectionStart: s, selectionEnd: e, value} = editor,
              selected = value.slice(s, e);

        switch (cmd) {
            case 'bold':
                this.toggleInline(item, '**', 'bold');
                break;
            case 'italic':
                this.toggleInline(item, '*', 'italic');
                break;
            case 'strikethrough':
                this.toggleInline(item, '~~', 'strikethrough');
                break;
            case 'heading':
                // EasyMDE toggleHeadingSmaller: # → ## → … → ###### → none
                this.mapLines(item, line => {
                    const m = line.match(/^(#{1,6}) /);
                    return !m ? '# ' + line : m[1].length === 6 ? line.slice(7) : '#' + line
                });
                break;
            case 'quote':
                this.toggleLinePrefix(item, /^> ?/, () => '> ');
                break;
            case 'unordered-list':
                this.toggleLinePrefix(item, /^[-*+] (?!\[[ xX]\] )/, () => '- ');
                break;
            case 'ordered-list':
                this.toggleLinePrefix(item, /^\d+\. /, i => (i + 1) + '. ');
                break;
            case 'checklist':
                this.toggleLinePrefix(item, /^[-*+] \[[ xX]\] /, () => '- [ ] ');
                break;
            case 'code':
                if (selected.includes('\n') || !selected) {
                    const text = '```\n' + selected + '\n```';
                    this.replace(item, s, e, text, 4, 4 + selected.length)
                } else {
                    this.toggleInline(item, '`', 'code')
                }
                break;
            case 'link': {
                const text = selected || 'link',
                      url  = 'https://';
                // the URL is selected to type over
                this.replace(item, s, e, `[${text}](${url})`, text.length + 3, text.length + 3 + url.length);
                break
            }
            case 'table': {
                const before = s > 0 && value[s - 1] !== '\n' ? '\n\n' : '',
                      text   = before + TABLE + '\n';
                this.replace(item, s, e, text);
                break
            }
            default:
                // e.g. preview and image: handled by the field in the App worker
                return
        }

        this.sync(id)
    }
}

export default Neo.setupClass(MarkdownEditor);
