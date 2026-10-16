import Base from '../../../node_modules/neo.mjs/src/main/addon/Base.mjs';

/** body classes of GO's colour schemes (go/core/views/extjs3/User.js) */
const SCHEMES = ['light', 'dark', 'system'];

/**
 * Main thread side of the user's look & feel (src/Preferences.mjs):
 * - applyTheme(): html.compact for the "Compact" theme (MainLayout.js), body
 *   light / dark / system (+ dark when the OS is dark) for the colour scheme
 * - clearState(): removes the GOUI-compatible component state ("state-*" in
 *   localStorage), the "Reset windows and grids" button of Look & feel
 * - setBodyStyle(): CSS variables on <body>, the colour preview of System settings → Appearance
 *
 * Neo.php sets the classes of a logged-in user's page already and lets "system"
 * follow the OS; this addon changes them without a reload. Loaded per window:
 *     await Neo.Main.importAddon({name: 'WS/Preferences', windowId})
 */
class Preferences extends Base {
    static config = {
        className: 'GO.main.addon.Preferences',
        // no library files to load
        preloadFilesDelay: false,
        remote: {
            app: [
                'applyTheme',
                'clearState',
                'setBodyStyle'
            ]
        }
    }

    /**
     * @param {Object} data
     * @param {String} [data.theme]       'Paper' or 'Compact'
     * @param {String} [data.colorScheme] 'light', 'dark' or 'system'
     */
    applyTheme({theme, colorScheme}) {
        theme && document.documentElement.classList.toggle('compact', theme === 'Compact');

        if (SCHEMES.includes(colorScheme)) {
            document.body.classList.remove(...SCHEMES);
            document.body.classList.add(colorScheme);
            colorScheme === 'system' ? this.syncSystemScheme() : document.body.classList.toggle('dark', colorScheme === 'dark')
        }
    }

    /**
     * @protected
     */
    syncSystemScheme() {
        const {classList} = document.body;

        if (classList.contains('system')) {
            classList.toggle('dark', !!globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches)
        }
    }

    /**
     * @param {Object} data
     * @param {Object} data.props CSS property → value, null removes it
     * @param {String} [data.scheme] 'light' or 'dark': only a window showing that scheme
     */
    setBodyStyle({props, scheme}) {
        if (scheme && document.body.classList.contains('dark') !== (scheme === 'dark')) {
            return
        }

        Object.entries(props).forEach(([name, value]) => {
            value === null ? document.body.style.removeProperty(name) : document.body.style.setProperty(name, value)
        })
    }

    /**
     * @returns {Number} number of removed entries
     */
    clearState() {
        const keys = Object.keys(localStorage).filter(key => key.startsWith('state-'));

        keys.forEach(key => localStorage.removeItem(key));

        return keys.length
    }
}

export default Neo.setupClass(Preferences);
