import Base      from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';
import DomEvents from '../../../node_modules/neo.mjs/src/main/DomEvents.mjs';

/**
 * Main thread side of window-wide keyboard shortcuts (GO.view.MainView `hotKeys` of main view
 * extensions, docs/neo-small-modules.md): a key combination works wherever the focus is, also on
 * the page body where no component gets the keydown.
 *
 * Combinations are written as modifiers + KeyboardEvent.code: "Ctrl+Alt+Digit1", "Ctrl+Alt+Shift+KeyZ".
 * The code, not the key: Alt changes the key on macOS ("¡" for Option+1) and on many layouts.
 * AltGr (Windows reports it as Ctrl+Alt) types characters (Czech: AltGr+1 = "~") and never matches.
 *
 * A match is prevented and sent as the custom DOM event goHotKey {combo} to the registered
 * component (the main view).
 *
 * Loaded per window: await Neo.Main.importAddon({name: 'WS/HotKeys', windowId}), then
 * register({id, combos, windowId}).
 */
class HotKeys extends Base {
    static config = {
        className        : 'GO.main.addon.HotKeys',
        preloadFilesDelay: false,
        remote           : {
            app: ['register', 'unregister']
        }
    }

    /**
     * component id → Set of combinations
     * @member {Map} targets
     */
    targets = new Map()

    construct(config) {
        super.construct(config);

        let me = this;

        me.listeners = new AbortController();
        // capture: before a focused field or grid handles the key
        document.addEventListener('keydown', e => me.onKeyDown(e), {capture: true, signal: me.listeners.signal})
    }

    destroy(...args) {
        this.listeners?.abort();
        super.destroy(...args)
    }

    /**
     * @param {Object} data
     * @param {String} data.id the component that gets goHotKey
     * @param {String[]} data.combos
     */
    register({id, combos}) {
        this.targets.set(id, new Set(combos || []))
    }

    /**
     * @param {Object} data
     * @param {String} data.id
     */
    unregister({id}) {
        this.targets.delete(id)
    }

    /**
     * @param {KeyboardEvent} e
     * @returns {String|null} "Ctrl+Alt+Shift+KeyZ"
     */
    static comboOf(e) {
        if (!e.code || e.repeat || e.getModifierState?.('AltGraph') || ['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
            return null
        }

        return [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta', e.code].filter(Boolean).join('+')
    }

    /**
     * @param {KeyboardEvent} e
     */
    onKeyDown(e) {
        const combo = HotKeys.comboOf(e);

        if (!combo) {
            return
        }

        for (const [id, combos] of this.targets) {
            const el = document.getElementById(id);

            if (el && combos.has(combo)) {
                e.preventDefault();
                e.stopPropagation();

                DomEvents.sendMessageToApp({
                    id,
                    path: DomEvents.getPathFromElement(el).map(node => DomEvents.getTargetData(node)),
                    type: 'goHotKey',
                    combo
                });
                return
            }
        }
    }
}

export default Neo.setupClass(HotKeys);
