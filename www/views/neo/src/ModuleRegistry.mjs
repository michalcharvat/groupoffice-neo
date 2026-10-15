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
 *     userSettings: {title: 'Notes', iconCls: 'fa fa-sticky-note', panel: () => import('./view/SettingsPanel.mjs')}
 * });
 */
class ModuleRegistry {
    #modules = new Map()

    register(module) {
        this.#modules.set(module.name, module)
    }

    get(name) {
        return this.#modules.get(name)
    }

    /**
     * Modules the logged-in user has access to
     * @returns {Object[]}
     */
    getAvailable() {
        return [...this.#modules.values()].filter(m => !m.capability || client.hasCapability(m.capability))
    }
}

export default new ModuleRegistry();
