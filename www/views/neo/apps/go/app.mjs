import client from '../../src/jmap/Client.mjs';
import {load}  from '../../src/Translate.mjs';

client.baseUrl = Neo.config.goBaseUrl || '/';

// Dedicated-worker output is not visible to tools reading the page console:
// mirror errors and warnings to the main thread.
['error', 'warn'].forEach(method => {
    const original = console[method].bind(console);

    console[method] = (...args) => {
        original(...args);
        // shared worker: every open window gets it
        const value = '[app worker] ' + args.map(a => a instanceof Error ? a.stack : (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');

        Object.keys(Neo.apps || {}).forEach(windowId => Neo.Main?.log({method, value, windowId}).catch?.(() => {}))
    }
});
globalThis.addEventListener('error', e => console.error(e.error || e.message));
// neo prevents rejections nobody has to handle (destroyed instance, reply lost
// to a closed window's port)
globalThis.addEventListener('unhandledrejection', e => e.defaultPrevented || console.error(e.reason));

// One shared App worker serves all GO windows (Neo.config.useSharedWorkers).
// neo keeps a closed window's components alive: destroy its app and views.
//
// A window can also leave while its app is still booting (the first window of a
// worker needs seconds for translations and modules): neo's main thread only
// sends "disconnect" for apps it knows, so Neo.php also sends one on pagehide,
// onStart() skips a window that is gone, and every disconnect sweeps apps whose
// window has no port left. Such an app would otherwise live on, and the worker
// routes its DOM updates by app name to another GO window ("insertNode: Parent
// not found" there).
const windowConnected = windowId => Neo.currentWorker.ports.some(port => port.windowId === windowId);

// windows whose page went away (Neo.php sends "goWindowLeft" on pagehide); ids are
// fresh per page load, so a reconnect never reuses one
const leftWindows = new Set();

const destroyApp = windowId => {
    const app = Neo.apps?.[windowId];

    if (!app) {
        return
    }

    const {mainView} = app;

    try {
        app.destroy()
    } finally {
        mainView && !mainView.isDestroyed && mainView.destroy()
    }
};

// neo's "disconnect" needs an app name the port has registered, which a booting window
// does not have yet: this retires the exact port of the leaving page right away.
// Registered before the awaits below: the first window can leave while the app loads.
Neo.currentWorker.onGoWindowLeft = ({windowId}, sourcePort) => {
    if (!windowId) {
        return
    }

    leftWindows.add(windowId);
    sourcePort && Neo.currentWorker.removePort(sourcePort);
    destroyApp(windowId)
};

// Views call t() in static configs: translations first, then any view code
await load();

const [{default: PopupView}, {default: Viewport}] = await Promise.all([
    import('./view/PopupView.mjs'),
    import('./view/Viewport.mjs')
]);

// Module entry points (views/neo/Index.mjs of every installed module) register
// themselves with the ModuleRegistry. Top-level await: onStart() must stay
// synchronous, neo sets the booting window id only around that call.
const results = await Promise.allSettled((Neo.config.goModules || []).map(url => import(url)));

// prototype: component demos (src/dev)
await import('../../src/dev/Index.mjs');

results.forEach((result, i) => {
    if (result.status === 'rejected') {
        console.error('Failed to load neo module', Neo.config.goModules[i], result.reason)
    }
});

Neo.currentWorker.on('disconnect', ({windowId}) => {
    destroyApp(windowId);

    // only windows known to be gone: a live window's port may not carry its windowId yet
    Object.keys(Neo.apps || {}).forEach(id => {
        !windowConnected(id) && leftWindows.has(id) && destroyApp(id)
    })
});

// Logout or a different user resets every window, like the classic UI reloads
// on logout: no component of the previous user (dialog, popped out module) survives.
const reloadAllWindows = () => Object.keys(Neo.apps || {}).forEach(windowId => {
    Neo.Main.reloadWindow({windowId}).catch?.(() => {})
});

client.on('logout',      reloadAllWindows);
client.on('userChanged', reloadAllWindows);

// A login screen page and its worker carry the browser language; the user's own
// language needs a new page, which gets a new worker (Neo.php). A page rendered
// for a logged-in user already has it (goLanguageFixed), so this cannot loop.
client.on('login', () => {
    const language = client.user?.language;

    if (language && language !== Neo.config.goLanguage && !Neo.config.goLanguageFixed) {
        reloadAllWindows()
    }
});

export const onStart = () => {
    const windowId = Neo.bootingWindowId;

    // the window left while the app was loading (see goWindowLeft).
    // Not "no port with this windowId": a new window's port may not carry it yet.
    if (windowId && leftWindows.has(windowId)) {
        return null
    }

    // per window config: a popup carries the id of the dialog it adopts
    const popupId = Neo.windowConfigs?.[windowId]?.goPopup;

    return popupId
        ? Neo.app({mainView: {module: PopupView, popupId}, name: 'GOPopup'})
        : Neo.app({mainView: Viewport, name: 'GO'})
};
