import Base      from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';
import DomAccess from '../../../node_modules/neo.mjs/src/main/DomAccess.mjs';
import DomEvents from '../../../node_modules/neo.mjs/src/main/DomEvents.mjs';

/**
 * Files of CodeMirror 5 (`codemirror` of views/neo/package.json, the classic sf/codemirror's
 * scripts.txt without folding), relative to the package, in load order
 * @type {String[]}
 */
const SCRIPTS = [
    'lib/codemirror.js',
    'addon/mode/loadmode.js',
    'mode/meta.js',
    'addon/edit/matchbrackets.js',
    'addon/edit/closebrackets.js'
];

/** @type {String[]} */
const STYLES = ['lib/codemirror.css', 'theme/material-darker.css'];

/** CodeMirror theme of the dark colour scheme (body.dark, src/main/addon/Preferences.mjs) */
const DARK_THEME = 'material-darker';

/** ms after the last change before the text goes to the worker */
const SYNC_DELAY = 200;

/**
 * @summary Main thread side of GO.form.field.CodeField: CodeMirror needs the real DOM. The library
 * is CodeMirror 5 of views/neo's node_modules (the classic client has its own copy in sf/codemirror);
 * modes load on demand from its mode/ folder. Loaded per window by the field:
 *
 *     await Neo.Main.importAddon({name: 'WS/CodeMirror', windowId})
 *
 * - The text goes to the App worker as the custom DOM event "codeMirrorChange" {value, token}
 *   (debounced); getValue() returns the current text before a save.
 * - The editors switch to a dark theme while the body has the class `dark`.
 *
 * @class GO.main.addon.CodeMirror
 * @extends Neo.main.addon.Base
 */
class CodeMirror extends Base {
    static config = {
        className: 'GO.main.addon.CodeMirror',
        // the library is loaded on the first createInstance()
        preloadFilesDelay: false,
        remote: {
            app: [
                'createInstance',
                'destroyInstance',
                'getValue',
                'setReadOnly',
                'setValue'
            ]
        }
    }

    /**
     * field id → {editor, holder, timer, token, resizeObserver}
     * @member {Object} map={}
     */
    map = {}

    /**
     * Loading of the library
     * @member {Promise|null} loading=null
     */
    loading = null

    /**
     * Watches the body's colour scheme class
     * @member {MutationObserver|null} themeObserver=null
     */
    themeObserver = null

    /**
     * @summary Loads the CodeMirror scripts in order and its styles, once per page.
     * @param {String} baseUrl URL of the codemirror package, with a trailing slash
     * @returns {Promise<void>}
     */
    loadLibrary(baseUrl) {
        let me = this;

        me.loading ??= (async () => {
            STYLES.forEach(file => {
                const link = document.createElement('link');

                link.rel  = 'stylesheet';
                link.href = baseUrl + file;
                document.head.appendChild(link)
            });

            for (const file of SCRIPTS) {
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');

                    script.src     = baseUrl + file;
                    script.onload  = resolve;
                    script.onerror = () => reject(new Error('Failed to load ' + script.src));
                    document.head.appendChild(script)
                })
            }

            globalThis.CodeMirror.modeURL = baseUrl + 'mode/%N/%N.js'
        })().catch(e => {
            me.loading = null;
            throw e
        });

        return me.loading
    }

    /**
     * @summary The theme for the current colour scheme.
     * @returns {String}
     */
    get theme() {
        return document.body.classList.contains('dark') ? DARK_THEME : 'default'
    }

    /**
     * @summary Sets a mode by name, file extension or MIME type ('json', 'php', 'text/x-sql');
     * plain text when CodeMirror has none.
     * @param {Object} editor
     * @param {String} mode
     */
    applyMode(editor, mode) {
        const CM   = globalThis.CodeMirror,
              key  = String(mode || '').toLowerCase(),
              info = CM.findModeByName(key) || CM.findModeByExtension(key) || CM.findModeByMIME(key);

        editor.setOption('mode', info?.mime || 'text/plain');
        info?.mode && info.mode !== 'null' && CM.autoLoadMode(editor, info.mode)
    }

    /**
     * @summary Creates the editor in the field's holder (`<id>__editor`).
     * @param {Object} data
     * @param {String} data.id field id
     * @param {String} data.baseUrl URL of the codemirror package
     * @param {String} [data.value='']
     * @param {String} [data.mode='json']
     * @param {Boolean} [data.readOnly=false]
     * @param {Number|null} [data.token] the field's mount: destroyInstance() of an older mount leaves this one
     * @returns {Promise<Object|false>} {baseline}: the editor's text of the value, false when the field's DOM is missing
     */
    async createInstance({id, baseUrl, value = '', mode = 'json', readOnly = false, token = null}) {
        let me = this;

        await me.loadLibrary(baseUrl);

        me.map[id] && me.destroyInstance({id});

        const holder = DomAccess.getElement(id + '__editor');

        if (!holder) {
            return false
        }

        const editor = globalThis.CodeMirror(holder, {
                  value            : value ?? '',
                  lineNumbers      : true,
                  matchBrackets    : true,
                  autoCloseBrackets: true,
                  readOnly         : !!readOnly,
                  theme            : me.theme
              }),
              item = me.map[id] = {editor, holder, timer: null, token};

        editor.setSize('100%', '100%');
        me.applyMode(editor, mode);
        editor.on('change', () => me.scheduleSync(id));

        // created in a hidden card or resized: CodeMirror measures again
        item.resizeObserver = new ResizeObserver(() => editor.refresh());
        item.resizeObserver.observe(holder);

        me.watchTheme();

        return {baseline: editor.getValue()}
    }

    /**
     * @summary Switches all editors of this window when the colour scheme changes.
     */
    watchTheme() {
        let me = this;

        me.themeObserver ??= new MutationObserver(() => {
            const theme = me.theme;
            Object.values(me.map).forEach(({editor}) => editor.getOption('theme') !== theme && editor.setOption('theme', theme))
        });

        me.themeObserver.observe(document.body, {attributes: true, attributeFilter: ['class']})
    }

    /**
     * @summary Sends the text after the changes stop for a moment.
     * @param {String} id
     */
    scheduleSync(id) {
        let me   = this,
            item = me.map[id];

        if (item) {
            clearTimeout(item.timer);
            item.timer = setTimeout(() => me.sync(id), SYNC_DELAY)
        }
    }

    /**
     * @summary Sends the text to the worker as "codeMirrorChange".
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
            path : DomEvents.getPathFromElement(DomAccess.getElement(id) || item.holder).map(el => DomEvents.getTargetData(el)),
            type : 'codeMirrorChange',
            token: item.token,
            value: item.editor.getValue()
        })
    }

    /**
     * @summary The current text straight from the editor (before a save).
     * @param {Object} data
     * @param {String} data.id
     * @returns {String|null} null when there is no editor
     */
    getValue({id}) {
        const item = this.map[id];

        if (!item) {
            return null
        }

        // no change event: the caller takes the returned value
        clearTimeout(item.timer);
        item.timer = null;

        return item.editor.getValue()
    }

    /**
     * @summary Shows a text.
     * @param {Object} data
     * @param {String} data.id
     * @param {String|null} data.value
     * @returns {String|null} the editor's text of it (the baseline), null when there is no editor
     */
    setValue({id, value}) {
        const item = this.map[id];

        if (!item) {
            return null
        }

        item.editor.setValue(value ?? '');
        // setValue() fires "change": the shown value is no edit
        clearTimeout(item.timer);
        item.timer = null;

        return item.editor.getValue()
    }

    /**
     * @summary Turns editing off or on.
     * @param {Object} data
     * @param {String} data.id
     * @param {Boolean} data.readOnly
     */
    setReadOnly({id, readOnly}) {
        this.map[id]?.editor.setOption('readOnly', !!readOnly)
    }

    /**
     * @summary Removes the editor of a field.
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
        item.resizeObserver.disconnect();
        item.editor.getWrapperElement().remove();

        if (!Object.keys(me.map).length) {
            me.themeObserver?.disconnect()
        }
    }
}

export default Neo.setupClass(CodeMirror);
