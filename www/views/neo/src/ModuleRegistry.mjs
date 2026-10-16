import client from './jmap/Client.mjs';

/**
 * Modules register their neo UI here from their views/neo/Index.mjs.
 *
 * ModuleRegistry.register({
 *     package   : 'community',
 *     name      : 'notes',
 *     title     : 'Notes',
 *     iconCls   : 'fa fa-sticky-note',
 *     capability: 'go:community:notes',
 *     icon      : 'sticky_note_2',                        // Material icon, header main menu
 *     quickAdd  : {text: 'Note', icon: 'sticky_note_2'},  // header "+" menu → mainView.onQuickAdd()
 *     routes    : {Note: id => 'note/' + id},             // header search result → "#notes/note/5"
 *     mainView  : () => import('./view/NotesMain.mjs'),  // lazy, default export = neo class
 *     // optional card in My account (src/usersettings/UserSettingsDialog.mjs)
 *     userSettings: {title: 'Notes', iconCls: 'fa fa-sticky-note', panel: () => import('./view/SettingsPanel.mjs')},
 *     // optional card(s) in System settings (src/systemsettings/SystemSettingsDialog.mjs)
 *     systemSettings: {title: 'Notes', iconCls: 'fa fa-sticky-note', panel: () => import('./view/SystemSettingsPanel.mjs')},
 *     // optional login step per authenticator id (2FA, GO go.AuthenticationManager.register()),
 *     // see apps/go/view/LoginView.mjs; available before login (no capability check)
 *     loginPanels: {otpauthenticator: () => import('./view/OtpLoginPanel.mjs')},
 *     // optional: custom field types and field set extensions for the custom fields admin
 *     // (registerFieldType() / registerFieldSetExtension(), src/customfields/admin/), loaded when it opens
 *     customFieldsAdmin: () => import('./customfields/admin.mjs'),
 *     // optional, called with each window's main view after login (e.g. a dialog to show then)
 *     onMainView: mainView => {},
 *     // optional, awaited after login before the main view is built: may register more modules
 *     onLogin     : async () => {}
 * });
 *
 * A module without a mainView only adds settings cards: it is not an app in the header.
 */
class ModuleRegistry {
    #modules = new Map()

    register(module) {
        this.#modules.set(module.name, module)
    }

    /**
     * Login step of a secondary authenticator, from any registered module
     * @param {String} id authenticator id, e.g. 'otpauthenticator'
     * @returns {Function|null} () => import(...)
     */
    getLoginPanel(id) {
        return [...this.#modules.values()].find(m => m.loginPanels?.[id])?.loginPanels[id] || null
    }

    /**
     * Configs that modules the user has access to register under `key`,
     * e.g. 'onlineMeeting' (jitsimeet: online meeting services of the calendar's event dialog)
     * @param {String} key
     * @returns {Object[]}
     */
    getConfigs(key) {
        return this.#accessible().filter(m => m[key]).map(m => m[key])
    }

    /**
     * Calls a function config (e.g. onMainView) of every module the user has access to
     * @param {String} name
     * @param {...*} args
     */
    callHook(name, ...args) {
        this.#accessible().forEach(m => {
            try {
                m[name]?.(...args)
            } catch (e) {
                console.error(`${name} of ${m.name}`, e)
            }
        })
    }

    unregister(name) {
        this.#modules.delete(name)
    }

    /**
     * Runs the modules' onLogin() (e.g. bookmarks shown as modules). A failing module
     * does not keep the others from loading.
     * @returns {Promise<void>}
     */
    async init() {
        await Promise.all([...this.#modules.values()].filter(m => m.onLogin).map(m =>
            Promise.resolve().then(() => m.onLogin()).catch(e => console.error(`Module ${m.name} onLogin`, e))))
    }

    get(name) {
        return this.#modules.get(name)
    }

    /**
     * Modules (apps) the logged-in user has access to
     * @returns {Object[]}
     */
    getAvailable() {
        return this.#accessible().filter(m => m.mainView)
    }

    /**
     * The settings cards modules register under `key` ('userSettings' or 'systemSettings'),
     * one config or an array of them: {title, iconCls, itemId, panel: () => import(...)}.
     * The panels' code is loaded; a module whose panel fails to load is left out.
     * @param {String} key
     * @param {Function} [filter] (module) => Boolean, e.g. the user's rights
     * @returns {Promise<Object[]>} {module, title, iconCls, itemId, panel: neo class}
     */
    async loadSettingsPanels(key, filter = () => true) {
        const entries = this.#accessible().filter(m => m[key] && filter(m)).flatMap(m =>
            [].concat(m[key]).map((settings, i) => ({
                module : m,
                title  : settings.title || m.title,
                // Font Awesome (tab buttons)
                iconCls: settings.iconCls || m.iconCls || null,
                itemId : settings.itemId || `${m.package}-${m.name}` + (i ? '-' + i : ''),
                load   : settings.panel
            }))
        );

        const classes = await Promise.all(entries.map(entry => entry.load().then(mod => mod.default).catch(e => {
            console.error(`${key} of ${entry.module.name}`, e);
            return null
        })));

        return entries.map(({load, ...entry}, i) => ({...entry, panel: classes[i]})).filter(entry => entry.panel)
    }

    /**
     * @returns {Object[]} registered modules the user has the capability of
     */
    #accessible() {
        return [...this.#modules.values()].filter(m => !m.capability || client.hasCapability(m.capability))
    }
}

export default new ModuleRegistry();
