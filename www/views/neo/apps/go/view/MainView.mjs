import Button         from '../../../node_modules/neo.mjs/src/button/Base.mjs';
import Container      from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import HashHistory    from '../../../node_modules/neo.mjs/src/util/HashHistory.mjs';
import Toolbar        from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import GoButton       from '../../../src/button/Button.mjs';
import MenuList       from '../../../src/menu/List.mjs';
import {avatarColor, decodeEntities, escapeHtml, initials} from '../../../src/Format.mjs';

import {classicAppByRoute, classicUrl, getClassicApps} from '../../../src/classicApps.mjs';
import {resolveRoute} from '../../../src/link/linkTypes.mjs';
import client         from '../../../src/jmap/Client.mjs';
import AppLauncher, {getMainMenuMode, moduleIconUrl} from '../../../src/view/AppLauncher.mjs';
import GlobalSearch   from '../../../src/view/GlobalSearch.mjs';
import ModuleRegistry from '../../../src/ModuleRegistry.mjs';
import {maySeeSystemSettings} from '../../../src/systemsettings/cards.mjs';
import badges         from '../../../src/Badges.mjs';
import activityWatcher    from '../../../src/alerts/ActivityWatcher.mjs';
import alerts             from '../../../src/alerts/Alerts.mjs';
import notificationCenter from '../../../src/alerts/NotificationCenter.mjs';
import NotificationPanel  from '../../../src/alerts/NotificationPanel.mjs';
import reminders          from '../../../src/alerts/Reminders.mjs';
import {notify, notifyError}   from '../../../src/Notify.mjs';
import {openTab, replaceRoute}  from '../../../src/history.mjs';
import {closePopup, openPopup, popupsSupported} from '../../../src/Popup.mjs';
import {applyTheme}            from '../../../src/Preferences.mjs';
import {fmt, t} from '../../../src/Translate.mjs';
import {hideTooltip} from '../../../src/tooltip.mjs';
import {getState, setState} from '../../../src/State.mjs';
import {getWindowItem, setWindowItem} from '../../../src/windowStorage.mjs';
import {LAST_STATE, SERVER_STATE, WINDOW_KEY, decodeServerTabs, encodeServerTabs, parseWindowTabs, pickLastTabs, restoredTabs,
    serializeWindowTabs, withClassicOnly} from '../../../src/moduleTabs.mjs';

// header menus open below their button, right edges aligned (they sit at the right)
const RIGHT = {edgeAlign: 't100-b100'};


/**
 * ms the boot's "Loading..." card waits after the first route for a card to show (MainView construct())
 * @type {Number}
 */
const LOADING_GRACE = 5000;

/**
 * Text of a module title given as HTML
 * @param {String} html
 * @returns {String}
 */
const htmlToText = html => decodeEntities(String(html).replace(/<[^>]*>/g, ''));

// the main views of the App worker's windows, in the order they opened (moving a module to another window)
const mainViews = new Set();

/**
 * @returns {GO.view.MainView[]} the main views of all windows of this App worker
 */
export function getMainViews() {
    return [...mainViews].filter(mv => !mv.isDestroyed)
}

// the user's last tabs on their way to the server (src/moduleTabs.mjs): changes of a second are sent at once
const SERVER_TABS_DELAY = 1000,
      // logout waits for a pending save at most this long
      SERVER_TABS_LOGOUT_WAIT = 3000;
let serverTabs        = null, // the queued save {userId, tabs, windowId}
    serverTabsLatest  = null, // the last save queued: only its success marks the local copy as sent
    serverTabsFlying  = 0,    // requests on their way: the session's copy is not yet what the server holds
    serverTabsTimer   = null,
    // the request on its way: one at a time, so an older set never overwrites a newer one
    serverTabsSending = Promise.resolve(),
    // a save failed: the session's copy may not be what the server holds, always send
    serverTabsUnsure  = false;

/**
 * The session's copy of the server's client state value (a new window reads it)
 * @param {Object} session
 * @param {String} value
 */
function setSessionServerTabs(session, value) {
    session.state = {...(Array.isArray(session.state) ? {} : session.state), [SERVER_STATE]: value}
}

/**
 * Sends the user's last tabs to the server after SERVER_TABS_DELAY
 * @param {Number} userId
 * @param {String[]} tabs
 * @param {String} windowId the window whose localStorage is marked as sent afterwards
 */
function queueServerTabs(userId, tabs, windowId) {
    serverTabs = serverTabsLatest = {userId, tabs, windowId};
    clearTimeout(serverTabsTimer);
    serverTabsTimer = setTimeout(flushServerTabs, SERVER_TABS_DELAY)
}

/**
 * Sends the queued tabs now, after the request on its way. When it fails, the localStorage copy stays
 * marked as pending and wins at the next boot of this browser, which sends it again.
 * @returns {Promise<void>}
 */
function flushServerTabs() {
    const save = serverTabs;

    clearTimeout(serverTabsTimer);
    serverTabsTimer = null;
    serverTabs      = null;

    if (save) {
        serverTabsFlying++;
        serverTabsSending = serverTabsSending.then(() => sendServerTabs(save)).finally(() => serverTabsFlying--)
    }

    return serverTabsSending
}

/**
 * @param {Object} save {userId, tabs, windowId}
 * @returns {Promise<void>}
 */
async function sendServerTabs(save) {
    const session = client.session;

    // another account meanwhile (the session changes before client.user)
    if (!session || session.userId !== save.userId || client.user?.id !== save.userId) {
        return
    }

    try {
        const {modules} = await client.call('core/Webclient/saveOpenModules', {modules: save.tabs});

        if (client.session !== session) {
            return
        }

        setSessionServerTabs(session, encodeServerTabs(modules));

        // nothing newer queued or on its way: the local copy is on the server (another window's storage when
        // this one closed)
        if (serverTabsLatest === save) {
            serverTabsUnsure = false;

            const windowId = getMainViews().some(mv => mv.windowId === save.windowId) ? save.windowId : getMainViews()[0]?.windowId;

            windowId && await setState(LAST_STATE + save.userId, {tabs: save.tabs, pending: false}, windowId)
        }
    } catch (e) {
        serverTabsUnsure = true;
        console.warn('GO.view.MainView: module tabs not stored on the server', e)
    }
}

/**
 * Top bar with the module menu and the user, below it one card per opened module.
 * Only the modules open in this window have a tab (src/moduleTabs.mjs).
 *
 * Modules may extend it (ModuleRegistry `mainViewExtension`, e.g. sf/workspaces: workspace tabs with
 * a dock, docs/neo-workspace.md): an extension adds cards (addCard(), showCard()) and top bar items
 * (insertTopbarItems()), takes module views over from their standalone tab (claimModuleView(),
 * releaseModuleView(), unclaimModuleView()) and answers hooks (start, onHashChange, showModule,
 * onActiveCardChange, onBadge, showsBadge, fallbackRoute, beforeLogout, destroy, launcherItems, openBeside, routeOf,
 * searchResults, hotKeys, cardTitle), see docs/neo-small-modules.md.
 * Without an extension nothing of this runs.
 *
 * Routing: "#<module>" opens a module, everything after the first "/" is passed
 * to the module's main view as route(path), e.g. "#notes/note/5".
 */
class MainView extends Container {
    static config = {
        className: 'GO.view.MainView',
        cls      : ['go-main'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            module   : Toolbar,
            cls      : ['go-topbar'],
            reference: 'topbar',
            flex     : 'none'
        }, {
            // GO's header search, over the top bar
            module   : GlobalSearch,
            reference: 'search',
            flex     : 'none'
        }, {
            // go.Notifier's notification area, opened by the bell in the top bar
            module   : NotificationPanel,
            reference: 'notifications',
            flex     : 'none'
        }, {
            // GO 6.8 start menu: the main menu button opens it (or a list, My account)
            module   : AppLauncher,
            reference: 'launcher',
            flex     : 'none'
        }, {
            ntype    : 'container',
            reference: 'modules',
            cls      : ['go-modules'],
            flex     : 1,
            layout   : {ntype: 'card', activeIndex: null, removeInactiveCards: false},
            items    : [{
                ntype: 'component',
                cls  : ['go-welcome'],
                text : t('Select a module from the menu.')
            }]
        }]
    }

    /**
     * module name → {index, view}
     */
    openModules = {}

    /**
     * Modules with a tab in the top bar (src/moduleTabs.mjs): opened in this window, restored after a
     * reload (their view is created when shown). Not the modules an extension holds.
     * @member {Set<String>} tabs
     */
    tabs = new Set()

    /**
     * The window's tabs are restored (restoreTabs()): changes are stored from then on
     * @member {Boolean} tabsRestored=false
     */
    tabsRestored = false

    /**
     * Tabs closed while restoreTabs() ran: the stored set doesn't bring them back
     * @member {Set<String>} tabsClosedEarly
     */
    tabsClosedEarly = new Set()

    /**
     * The user this window's tabs belong to (the user logged in when it was built): nothing is stored
     * for another one (an account switch before the windows reload)
     * @member {Number|null} tabsUserId=null
     */
    tabsUserId = null

    /**
     * Logout is clearing the stored tabs: nothing is stored meanwhile
     * @member {Boolean} tabsLoggingOut=false
     */
    tabsLoggingOut = false

    /**
     * Pending openModule() per module name: closeModule() cancels it. A pending claimModuleView() has its
     * own entry per claim ("<module>|<key>", see claimId()): two panels opening at once don't cancel each
     * other, unclaimModuleView() cancels it.
     * @member {Object} openTokens={}
     */
    openTokens = {}

    /**
     * Hashes this window started to handle (with extensions: the last one wins, see onHashChange())
     * @member {Number} hashSeq=0
     */
    hashSeq = 0

    /**
     * The last hash that reached onHashChange() (with extensions), null before
     * @member {String|null} hashSeen=null
     */
    hashSeen = null

    /**
     * The boot's "Loading..." card (showLoadingCard()), until the first route has shown
     * @member {Neo.component.Base|null} loadingCard=null
     */
    loadingCard = null

    /**
     * The boot's grace for the "Loading..." card is over: it goes once no route is running
     * @member {Boolean} loadingExpired=false
     */
    loadingExpired = false

    /**
     * onHashChange() calls that have not finished
     * @member {Number} routesRunning=0
     */
    routesRunning = 0

    /**
     * The routing of the window's first address (start()), see construct()
     * @member {Promise|null} startRouting=null
     */
    startRouting = null

    /**
     * Module named by this window's current hash
     * @member {String|null} routeModule=null
     */
    routeModule = null

    /**
     * Open System settings dialog
     * @member {GO.systemsettings.SystemSettingsDialog|null} systemSettings=null
     */
    systemSettings = null

    /**
     * Classes of the modules' main view extensions (ModuleRegistry `mainViewExtension`), set by the Viewport
     * @member {Function[]} extensionClasses=[]
     */
    extensionClasses = []

    /**
     * The extensions of this window, created in onConstructed()
     * @member {Object[]} extensions=[]
     */
    extensions = []

    /**
     * Module views an extension holds (claimModuleView()): "<module>|<key>" (claimId()) → {view, owner,
     * name, key}. The key tells the views of one module apart (sf/workspaces: "<workspaceId>/<panelId>").
     * A `singleInstance` module (ModuleRegistry) has one view per window: then the claim has no
     * standalone card or tab beside it; any other module may have a standalone tab and claims at once.
     * @member {Object} claimed={}
     */
    claimed = {}

    /**
     * Navigations started in this window (routeHash(), showStandalone(), quickAdd()): a slow one that was
     * overtaken doesn't write the address or open a dialog afterwards
     * @member {Number} navCount=0
     */
    navCount = 0

    /**
     * A hash quickAdd() set for the view it showed: its hash change is no second navigation (routeHash())
     * @member {String|null} expectedHash=null
     */
    expectedHash = null

    /**
     * An extension's card shown instead of a module (showCard())
     * @member {Neo.component.Base|null} activeCard=null
     */
    activeCard = null

    /**
     * Window-wide key combinations of the extensions (hotKeys hook): combo → handler
     * @member {Object} hotKeys={}
     */
    hotKeys = {}

    /**
     * The launcher row's entries of the extensions (launcherItems hook), shown last
     * @member {Object[]} launcherItems=[]
     */
    launcherItems = []

    /**
     * @summary Builds the top bar (logo, module buttons) and the rest of the shell of this window.
     */
    onConstructed() {
        super.onConstructed();

        let me        = this,
            available = ModuleRegistry.getAvailable();

        mainViews.add(me);
        me.tabsUserId = client.user?.id ?? null;

        const userName = client.user?.displayName || client.user?.username || '';

        me.getReference('topbar').add([{
            // GO header logo (views/Extjs3/themes/Paper/img/logo-white.svg, see MainView.scss)
            ntype: 'component',
            cls  : ['go-brand'],
            role : 'img',
            title: Neo.config.goTitle || 'GroupOffice'
        },
        // hidden until opened (tabs), in GO's module order
        ...available.flatMap(m => [{
            module   : Button,
            cls      : ['go-module-button'],
            hidden   : true,
            iconCls  : m.iconCls,
            reference: 'module-' + m.name,
            // the module's count (src/Badges.mjs), GO.mainLayout.setNotification()
            badgeText: badges.text(m.name) || null,
            // not route: neo renders it as <a href="#name">, which <base href> turns
            // into views/neo/apps/go/#name. The standalone view, not a workspace panel of the module.
            handler  : () => me.showStandalone(m.name),
            // module titles are HTML (bookmarks escape their names), vdom text is not
            text     : htmlToText(m.title)
        }, {
            module   : Button,
            cls      : ['go-module-close'],
            flex     : 'none',
            hidden   : true,
            iconCls  : 'fa fa-xmark',
            reference: 'close-' + m.name,
            tooltip  : t('Close'),
            handler  : () => me.closeModule(m.name)
        }]),
        '->', {
            // go.Notifier status icon: shown while there are notifications, the count on it
            module   : GoButton,
            icon     : 'notifications',
            cls      : ['go-header-button', 'go-notification-button'],
            flex     : 'none',
            reference: 'notificationButton',
            tooltip  : t('Notifications'),
            hidden   : true,
            handler  : () => me.toggleNotifications()
        }, {
            // GO #secondary-menu: search, add, main menu, user
            module : GoButton,
            icon   : 'search',
            cls    : ['go-header-button'],
            flex   : 'none',
            tooltip: t('Search'),
            handler: () => me.getReference('search').open()
        }, {
            module : GoButton,
            icon   : 'add',
            cls    : ['go-header-button'],
            flex   : 'none',
            tooltip: t('Add'),
            hidden : !available.some(m => m.quickAdd),
            menu   : {align: RIGHT, items: available.filter(m => m.quickAdd).map(m => ({
                text   : m.quickAdd.text,
                icon   : m.quickAdd.icon,
                handler: () => me.quickAdd(m)
            }))}
        }, {
            module   : GoButton,
            icon     : 'apps',
            cls      : ['go-header-button', 'go-main-menu-button'],
            flex     : 'none',
            reference: 'mainMenuButton',
            tooltip  : t('Main menu'),
            handler  : data => me.openMainMenu(data)
        }, {
            // go.util.avatar(): initials on a colour from the name
            module : GoButton,
            cls    : ['go-header-avatar'],
            flex   : 'none',
            text   : initials(userName),
            style  : {backgroundColor: avatarColor(userName)},
            menu   : {align: RIGHT, items: [{
                text    : userName,
                icon    : 'account_circle',
                disabled: true
            }, {
                text   : t('My account'),
                icon   : 'manage_accounts',
                handler: () => me.openUserSettings()
            }, ...maySeeSystemSettings() ? [{
                text   : t('System settings'),
                icon   : 'settings',
                handler: () => me.openSystemSettings()
            }] : [], ...client.isAdmin ? [{
                // go.license.LicenseDialog (MainLayout: admins); a license set in config.php shows read-only
                text   : t('Register'),
                icon   : 'app_registration',
                handler: () => me.openLicense()
            }] : [], ...Neo.config.goWebclientSwitch ? [{
                // docs/neo-switch.md D2: remembered for this browser (cookie GO_WEBCLIENT)
                text   : t('Switch to the classic UI'),
                icon   : 'history',
                handler: () => me.switchToClassic()
            }] : [], {
                text   : t('Logout'),
                icon   : 'logout',
                handler: () => me.logout()
            }]}
        }]);

        // right click on a module tab: close it, the others or all
        Neo.main.DomEvents.registerPreventDefaultTargets({
            name    : 'contextmenu',
            cls     : ['go-module-button'],
            windowId: me.windowId
        });

        me.getReference('topbar').addDomListeners({contextmenu: me.onTabContextMenu, scope: me});

        me.initExtensions();

        me.getReference('launcher').on({
            open      : ({app}) => app.classic ? me.openClassic(app.route) : Neo.Main.setRoute({value: app.name, windowId: me.windowId}),
            // Shift+click or Shift+Enter on a tile: an extension may open it beside (sf/workspaces: split right)
            openBeside: ({app, preventDefault}) => {
                if (!app.classic && me.callExtensions('openBeside', app.name).some(Boolean)) {
                    preventDefault();
                    // the launcher closes without giving the focus back: the button's tooltip would stay
                    hideTooltip(me)
                }
            },
            rowItem   : ({index}) => {
                hideTooltip(me);
                me.launcherItems[index]?.handler?.()
            },
            // a tile dropped on a row entry (sf/workspaces: into that workspace); the launcher stays open
            rowDrop   : async ({item, module}) => {
                await item.onDrop(module);
                me.updateLauncherRow()
            },
            // ... or the pointer rested on it: once it shows, the launcher is see-through and the drag goes on below
            rowDragHover: async ({item, module, seeThrough}) => {
                await item.onDragHover(module) && seeThrough()
            }
        });

        // one resolver for search, links, alerts and reminders: a neo route or "classic/<hash>"
        me.getReference('search').resolveRoute = resolveRoute;

        // results of the extensions (searchResults hook) above the server's
        me.extensions.length && (me.getReference('search').extraResults = text =>
            Promise.all(me.callExtensions('searchResults', text).map(p => Promise.resolve(p).catch(e => {
                console.warn('Main view extension searchResults', e);
                return []
            }))).then(results => results.flat().filter(Boolean)));

        me.initHotKeys();

        // load the module code now: a popout click must reach window.open() while the
        // browser still counts it as user activation
        available.forEach(m => m.mainView().catch(() => {}));

        // by event id: un() with a function matches by name, and every window's MainView
        // has a "bound onHashChange" (see Dialog.mjs)
        me.hashListenerId = HashHistory.on('change', me.onHashChange.bind(me));

        // shared worker: neo pushes the initial hash only for the first window,
        // later windows find it in their window config
        const current = HashHistory.first(me.windowId) || Neo.windowConfigs?.[me.windowId]?.hash;

        // a page rendered for the login screen has no user theme yet (Neo.php)
        applyTheme({theme: client.user?.theme, colorScheme: client.user?.themeColorScheme}, [me.windowId]);

        // an extension's start can take seconds on the first load (sf/workspaces loads the window's
        // workspaces): "Loading..." instead of an empty main area until the window has routed
        me.extensions.length && me.showLoadingCard();

        // the extensions start first (restore what the window showed, take module views), then the
        // window's module tabs come back, then the address is routed
        me.ready = me.startExtensions(current)
            .then(() => me.isDestroyed || me.restoreTabs())
            .then(() => me.isDestroyed || me.start(current));

        // it goes when another card shows (replaceLoadingCard()). The first route may still be on its way
        // after the boot (a hash set by setRoute() or replaceRoute(), a newer hash), so it stays a moment
        // longer; a route that shows nothing must not leave it for good (startRouting: not part of
        // ready, onHashChange() awaits ready)
        me.loadingCard && me.ready
            .then(() => me.startRouting)
            .catch(e => e === Neo.isDestroyed || console.error('GO.view.MainView: start', e))
            .finally(() => me.isDestroyed || me.timeout(LOADING_GRACE).then(() => {
                // a route still loading (a slow workspace) removes it when it ends (onHashChange())
                me.loadingExpired = true;
                me.isDestroyed || me.routesRunning || me.removeLoadingCard()
            }));

        // notifications: core alerts and popup reminders of the user, desktop notifications through this window
        notificationCenter.attach(me.windowId);
        me.removeNotificationListener = notificationCenter.onChange(({messages}) => me.updateNotificationButton(messages));
        me.updateNotificationButton(notificationCenter.messages, false);
        alerts.start();
        reminders.start();

        // counts on the module tabs and main menu items
        me.removeBadgeListener = badges.onChange(({name}) => me.updateBadge(name));
        badges.start();
        me.updateMainMenuDot();
        activityWatcher.register(me.windowId);

        // a click outside the notification area closes it (the ExtJS east panel slides in)
        me.getReference('modules').addDomListeners({click: () => me.getReference('notifications').hidden || me.getReference('notifications').close()});

        // modules that act after login (OTP: setup enforced by the administrator)
        ModuleRegistry.callHook('onMainView', me)
    }

    /**
     * Bell in the top bar: hidden without messages, the count on it, "unseen" after a new one
     * @param {Object[]} messages
     * @param {Boolean} [flash=true]
     */
    updateNotificationButton(messages, flash = true) {
        let me     = this,
            button = me.getReference('notificationButton'),
            ids    = new Set(messages.map(m => m.id)),
            added  = [...ids].some(id => !me.seenNotifications?.has(id));

        me.seenNotifications = ids;
        button.hidden = !messages.length;
        button.text   = messages.length ? String(messages.length) : '';

        if (flash && added && me.getReference('notifications').hidden) {
            button.addCls('go-unseen')
        }

        messages.length || me.getReference('notifications').close()
    }

    toggleNotifications() {
        let me = this;

        me.getReference('notificationButton').removeCls('go-unseen');
        me.getReference('notifications').toggle()
    }

    /**
     * Header user menu "My account"
     */
    async openUserSettings() {
        let me = this;

        try {
            const {default: UserSettingsDialog} = await import('../../../src/usersettings/UserSettingsDialog.mjs');

            me.isDestroyed || Neo.create(UserSettingsDialog, {appName: me.appName, windowId: me.windowId})
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * Header user menu "Register" (administrators): license key or trial license
     */
    async openLicense() {
        let me = this;

        try {
            const {default: LicenseDialog} = await import('../../../src/license/LicenseDialog.mjs');

            me.isDestroyed || Neo.create(LicenseDialog, {appName: me.appName, windowId: me.windowId})
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * @summary Opens System settings, for users who may see one of its cards.
     *
     * Header user menu "System settings" (anyone who may see a card), route "#systemsettings/<card>"
     * @param {String|null} [activeItem] card to show
     * @param {Boolean} [fromRoute] opened by the address: closing leaves it
     */
    async openSystemSettings(activeItem = null, fromRoute = false) {
        let me = this;

        // non-admins see only the cards they may see (cards.mjs)
        if (!maySeeSystemSettings()) {
            return
        }

        if (me.systemSettings && !me.systemSettings.isDestroyed) {
            activeItem && me.systemSettings.showCard(activeItem);
            return
        }

        try {
            const {default: SystemSettingsDialog} = await import('../../../src/systemsettings/SystemSettingsDialog.mjs');

            if (me.isDestroyed) {
                return
            }

            me.systemSettings = Neo.create(SystemSettingsDialog, {appName: me.appName, windowId: me.windowId, activeItem});
            me.systemSettings.on('close', () => {
                me.systemSettings = null;
                // "#systemsettings" would stay in the address bar: back to the module, so it can open again
                fromRoute && !me.isDestroyed && Neo.Main.setRoute({value: me.routeModule || '', windowId: me.windowId})
            })
        } catch (e) {
            notifyError(me, e)
        }
    }

    /**
     * Creates the modules' extensions of this window (ModuleRegistry `mainViewExtension`)
     * @protected
     */
    initExtensions() {
        let me = this;

        me.extensions = me.extensionClasses.map(Extension => {
            try {
                return new Extension({mainView: me})
            } catch (e) {
                console.error('Main view extension', e);
                return null
            }
        }).filter(Boolean)
    }

    /**
     * Window-wide key combinations of the extensions (hotKeys hook, main-thread addon WS/HotKeys)
     * @protected
     */
    async initHotKeys() {
        let me = this;

        me.callExtensions('hotKeys').forEach(keys => keys && Object.assign(me.hotKeys, keys));

        const combos = Object.keys(me.hotKeys);

        if (!combos.length) {
            return
        }

        me.addDomListeners({goHotKey: ({combo}) => me.hotKeys[combo]?.(), scope: me});

        try {
            await Neo.Main.importAddon({name: 'WS/HotKeys', windowId: me.windowId});
            me.isDestroyed || Neo.ns('GO.main.addon.HotKeys').register({id: me.id, combos, windowId: me.windowId})
        } catch (e) {
            console.warn('GO.view.MainView: no hot keys', e)
        }
    }

    /**
     * Calls a hook of every extension
     * @param {String} name
     * @param {...*} args
     * @returns {*[]} the results
     * @protected
     */
    callExtensions(name, ...args) {
        return this.extensions.map(extension => {
            try {
                return extension[name]?.(...args)
            } catch (e) {
                console.error(`Main view extension ${name}`, e);
                return undefined
            }
        })
    }

    /**
     * The extensions' start(current): each may resolve to a route to show when the window has no hash
     * @param {Object|null} current the window's first hash
     * @returns {Promise<void>}
     * @protected
     */
    async startExtensions(current) {
        const routes = await Promise.all(this.callExtensions('start', current).map(p => Promise.resolve(p).catch(e => {
            // the window closed meanwhile
            e === Neo.isDestroyed || console.error('Main view extension start', e);
            return null
        })));

        this.extensionStartRoute = routes.find(route => typeof route === 'string' && route) || null
    }

    /**
     * Boot: the window's first hash, else what an extension restored, else the user's start module
     * (My account) or the only module
     * @param {Object|null} current the window's first hash
     * @protected
     */
    start(current) {
        let me        = this,
            available = ModuleRegistry.getAvailable(),
            start     = available.find(m => m.name === client.user?.start_module) || (available.length === 1 && available[0]);

        // a hash that came while the extensions started is shown instead (onHashChange())
        if (me.hashSeen != null && me.hashSeen !== (current?.hashString || '')) {
            return
        }

        if (current?.hashString) {
            me.startRouting = me.onHashChange(current)
        } else if (me.extensionStartRoute) {
            // routed here too: the address may already be this route (a later window of the shared
            // worker can start without its first hash), then setRoute() fires no hashchange
            me.startRouting = me.onHashChange({hashString: me.extensionStartRoute, windowId: me.windowId});
            Neo.Main.setRoute({value: me.extensionStartRoute, windowId: me.windowId})
        } else if (current) {
            me.startRouting = me.onHashChange(current)
        } else if (start) {
            Neo.Main.setRoute({value: start.name, windowId: me.windowId})
        } else {
            me.getReference('modules').layout.activeIndex = 0;
            me.replaceLoadingCard()
        }
    }

    destroy(...args) {
        mainViews.delete(this);
        // the window may be gone already
        Object.keys(this.hotKeys).length && Promise.resolve(Neo.ns('GO.main.addon.HotKeys')?.unregister?.({id: this.id, windowId: this.windowId})).catch(() => {});
        HashHistory.un('change', this.hashListenerId);
        this.removeNotificationListener?.();
        this.removeBadgeListener?.();
        notificationCenter.detach(this.windowId);
        activityWatcher.unregister(this.windowId);
        this.callExtensions('destroy');
        super.destroy(...args)
    }

    /**
     * Avatar menu "Logout": the extensions save what they hold first (beforeLogout())
     */
    async logout() {
        let me = this;

        await Promise.all(me.callExtensions('beforeLogout').map(p => Promise.resolve(p).catch(e => console.warn('beforeLogout', e))));

        // the next login of this browser opens the user's last tabs (also in the other windows of the session)
        const views = getMainViews();

        views.forEach(mv => mv.tabsLoggingOut = true);
        await Promise.all([
            // a hanging request doesn't keep the user logged in
            Promise.race([flushServerTabs(), new Promise(resolve => setTimeout(resolve, SERVER_TABS_LOGOUT_WAIT))]),
            ...views.map(mv => setWindowItem(mv.windowId, WINDOW_KEY, null))
        ]);

        client.logout().catch(e => {
            // still logged in: the windows store their tabs again
            views.forEach(mv => {
                mv.tabsLoggingOut = false;
                mv.saveTabs()
            });
            notifyError(me, e)
        })
    }

    /**
     * Avatar menu "Switch to the classic UI": remember it for this browser and load every
     * window in the classic client (the page URL without ?webclient=, which would win)
     */
    async switchToClassic() {
        try {
            await client.call('core/Webclient/setPreference', {client: 'classic'});
            const url = client.baseUrl + 'index.php';
            Object.keys(Neo.apps || {}).forEach(windowId => Neo.Main.redirectTo({url, windowId}))
        } catch (e) {
            notifyError(this, e)
        }
    }

    /**
     * The open launcher's row again (its entries changed, e.g. the workspace shown)
     */
    updateLauncherRow() {
        let me       = this,
            launcher = me.getReference('launcher');

        if (!me.isDestroyed && launcher?.isOpen()) {
            me.launcherItems = me.callExtensions('launcherItems').flat().filter(Boolean);
            launcher.setRow(me.launcherItems)
        }
    }

    /**
     * @summary Header main menu button: the app launcher, or a list (My account → Look & feel).
     * @param {Object} [data] the button's click: detail 0 is a click by the keyboard (Enter, Space)
     */
    async openMainMenu(data) {
        let me       = this,
            button   = me.getReference('mainMenuButton'),
            launcher = me.getReference('launcher'),
            apps     = ModuleRegistry.getAvailable();

        if (launcher.isOpen()) {
            launcher.close();
            return
        }

        // a second click closes the list
        if (me.mainMenuList && !me.mainMenuList.isDestroyed) {
            me.mainMenuList.hidden = true;
            me.mainMenuList = null;
            return
        }

        const mode = await getMainMenuMode(me.windowId);

        if (me.isDestroyed) {
            return
        }

        // the button gets the focus back on close: with a focus ring only when opened by the keyboard
        const modality = data?.detail === 0 ? 'keyboard' : 'pointer';

        // the extensions' entries (launcherItems hook): {text (HTML), iconCls, icon, pressed, title, handler,
        // onDrop(module), onDragHover(module)} (AppLauncher.setRow())
        me.launcherItems = me.callExtensions('launcherItems').flat().filter(Boolean);

        if (mode === 'list') {
            me.mainMenuList = MenuList.showAt({
                appName : me.appName,
                target  : button.id,
                windowId: me.windowId,
                items   : [...me.launcherItems.map(item => ({
                    text   : htmlToText(item.text),
                    icon   : item.icon || 'dashboard',
                    handler: item.handler
                })), ...me.launcherItems.length ? [{separator: true}] : [], ...apps.map(m => ({
                    text   : htmlToText(m.title),
                    icon   : m.icon || 'apps',
                    image  : m.iconUrl || null,
                    badge  : badges.text(m.name) || null,
                    handler: () => Neo.Main.setRoute({value: m.name, windowId: me.windowId})
                })), ...me.classicMenuItems()]
            });
            me.mainMenuList.returnFocusModality = modality;
            return
        }

        launcher.setRow(me.launcherItems);

        launcher.setApps([...apps.map(m => ({
            name   : m.name,
            title  : m.title,
            iconUrl: m.iconUrl || moduleIconUrl(m.package, m.name),
            badge  : badges.text(m.name) || null
        })), ...getClassicApps().map(app => ({
            name   : app.name,
            // server data; the launcher renders titles as HTML
            title  : escapeHtml(app.title),
            iconUrl: moduleIconUrl(app.package, app.name),
            route  : app.route,
            classic: true
        }))]);

        launcher.open(button.id, modality)
    }

    /**
     * @summary Apps menu items of the modules only the classic client has (docs/neo-switch.md, D3).
     * @description Below the neo modules, each opens the classic client in a new browser tab
     * @returns {Object[]}
     */
    classicMenuItems() {
        const apps = getClassicApps();

        return apps.length ? [{separator: true}, ...apps.map(app => ({
            // vdom text: neo escapes it
            text   : app.title,
            icon   : 'open_in_new',
            handler: () => this.openClassic(app.route)
        }))] : []
    }

    /**
     * Open the classic client at a hash in a new browser tab, for that tab only
     * @param {String} hash without "#"
     */
    openClassic(hash) {
        openTab(this.windowId, classicUrl(hash)).catch(e => notifyError(this, e))
    }

    /**
     * Hashes neo has no module for (docs/neo-switch.md, D5):
     * - "classic/<hash>": a link, search result or alert of a classic-only module, opened in a
     *   new tab while this window goes back to where it was
     * - "<entity>/<id>" (Entity::url(), e.g. "contact/5"): the neo route of the entity, else the
     *   classic client in this window when one of its modules has the entity
     * - "<module>" of a classic-only module: the classic client in this window
     * @param {String} name first part of the hash
     * @param {String[]} rest
     * @returns {Boolean} handled
     */
    routeUnknownHash(name, rest) {
        const me = this;

        // rewritten hashes replace their history entry, so Back doesn't run them again
        if (name === 'classic') {
            rest.length && me.openClassic(rest.join('/'));
            replaceRoute(me.windowId, me.activeHash || '');
            return true
        }

        if (rest.length === 1 && rest[0] !== '') {
            const route = resolveRoute(name, rest[0]);

            if (route?.startsWith('classic/')) {
                Neo.Main.redirectTo({url: classicUrl(route.slice(8)), windowId: me.windowId});
                return true
            }

            if (route) {
                replaceRoute(me.windowId, route);
                return true
            }
        }

        if (classicAppByRoute(name)) {
            Neo.Main.redirectTo({url: classicUrl([name, ...rest].join('/')), windowId: me.windowId});
            return true
        }

        // handled by the Viewport (password recovery card)
        if (name === 'recover') {
            return true
        }

        // a link to something neither client shows (deleted entity type, module without access)
        if (name) {
            notify(me, t('Not found'));
            replaceRoute(me.windowId, me.activeHash || '');
            return true
        }

        return false
    }

    async onHashChange({hashString, windowId}) {
        // HashHistory is shared by all windows of the App worker
        if (windowId && windowId !== this.windowId) {
            return
        }

        const me = this;

        // the boot's "Loading..." card waits for the routes that are running
        me.routesRunning++;

        try {
            return await me.routeHash(hashString)
        } finally {
            me.routesRunning--;
            me.loadingExpired && !me.routesRunning && !me.isDestroyed && me.removeLoadingCard()
        }
    }

    /**
     * Shows what a hash of this window points to (onHashChange())
     * @param {String} hashString
     * @returns {Promise<void>}
     * @protected
     */
    async routeHash(hashString) {
        let me              = this,
            [name, ...rest] = (hashString || '').split('/'),
            module          = ModuleRegistry.getAvailable().find(m => m.name === name);

        // for start(): a hash other than the window's first one came meanwhile (while the extensions
        // started and the tabs were restored) and wins over it
        me.hashSeen = hashString || '';

        // quickAdd() showed the view already: the address only follows it
        if (me.expectedHash !== null && (hashString || '') === me.expectedHash) {
            me.expectedHash = null;
            me.hashSeq++;
            me.routeModule = module?.name || null;
            me.activeHash  = hashString || null;
            return
        }

        me.expectedHash = null;
        me.navCount++;

        if (me.extensions.length) {
            const seq = ++me.hashSeq;

            // what the extensions restored comes first (startExtensions())
            await me.ready;

            // a newer hash came while the extensions started: only the last one is shown
            if (me.isDestroyed || seq !== me.hashSeq) {
                return
            }
        }

        if (name === 'systemsettings') {
            me.openSystemSettings(rest[0] || null, true);
            return
        }

        if (!module && me.extensions.length) {
            const previousHash = me.activeHash;

            // the hash this window last handled, also one of an extension (routeToPanel(…, ifHash) of sf/workspaces)
            me.activeHash = hashString || null;

            const handled = await Promise.all(me.callExtensions('onHashChange', {name, rest, hashString}));

            if (handled.some(Boolean)) {
                return
            }

            // not an extension's: a classic link or an unknown hash goes back to the address before it
            me.activeHash === (hashString || null) && (me.activeHash = previousHash)
        }

        if (!module && me.routeUnknownHash(name, rest)) {
            return
        }

        me.routeModule = module?.name || null;
        me.activeHash  = hashString || null;

        if (!module) {
            return
        }

        await me.showModule(module, rest.join('/'))
    }

    /**
     * Shows a module: in an extension's card when one has it (showModule hook), else as its own tab.
     * The hook resolves to the view it showed, to false when it handled the module without a view to
     * show (unavailable, e.g. in a popup, or superseded by a newer navigation: nothing more happens), or
     * to null when it doesn't handle the module (then it opens standalone).
     * @param {Object} module ModuleRegistry entry
     * @param {String|null} route passed to the view's route(), null: the view keeps its route
     * @param {Number} [nav] the navigation (navCount) it belongs to, see openModule()
     * @returns {Promise<Neo.component.Base|null>} the module's view
     */
    async showModule(module, route, nav) {
        let me = this;

        for (const extension of me.extensions) {
            let view = null;

            try {
                view = await extension.showModule?.(module, route)
            } catch (e) {
                e === Neo.isDestroyed || console.error('Main view extension showModule', e)
            }

            if (view === false) {
                return null
            }

            if (view) {
                return view
            }
        }

        await me.openModule(module, nav);

        // undefined when the module was closed while its code loaded
        const view = me.openModules[module.name]?.view || null;

        if (route !== null && view) {
            view.route?.(route);
            // its deep link when the module moves to another window while another one shows
            me.openModules[module.name].route = route
        }

        return view
    }

    /**
     * @param {Object} module ModuleRegistry entry
     * @param {Number} [nav] the navigation (navCount) it belongs to: overtaken by a newer one while the
     *     code loaded, the module is made but not shown
     * @returns {Promise<void>}
     */
    async openModule(module, nav) {
        let me      = this,
            cards   = me.getReference('modules'),
            entry   = me.openModules[module.name];

        if (!entry) {
            const token = me.openTokens[module.name] = Symbol();

            let ViewClass;

            try {
                ({default: ViewClass} = await module.mainView())
            } catch (e) {
                // the module's code failed to load: no view is being made any more (hasModuleView())
                me.openTokens[module.name] === token && delete me.openTokens[module.name];
                throw e
            }

            // closed (closeModule) or the shell destroyed while the code loaded
            if (me.isDestroyed || me.openTokens[module.name] !== token) {
                return
            }

            // one view per window: an extension claimed it meanwhile (the address finds it there)
            if (me.isSingleInstance(module.name) && me.claimsOf(module.name).length) {
                delete me.openTokens[module.name];
                return
            }

            // another hash change may have opened it meanwhile
            entry = me.openModules[module.name] ??= {
                view: cards.add({module: ViewClass, moduleName: module.name})
            };
        }

        if (nav !== undefined && nav !== me.navCount) {
            return
        }

        // a popped out module keeps its placeholder card here
        cards.layout.activeIndex = cards.indexOf(entry.placeholder || entry.view);
        me.replaceLoadingCard();

        me.addTab(module.name);

        me.activeModule = module.name;

        if (me.activeCard) {
            me.activeCard = null;
            me.callExtensions('onActiveCardChange', null)
        }

        ModuleRegistry.getAvailable().forEach(m => {
            const button = me.getReference('module-' + m.name);

            if (button) {
                button.pressed = m.name === module.name
            }
        })
    }

    /**
     * Header "+" menu: opens the module and lets its main view create an item
     * @param {Object} module ModuleRegistry entry with quickAdd
     */
    async quickAdd(module) {
        let me = this;

        // one navigation: the view the routing chooses (a workspace panel or the standalone tab), with
        // its route ("#notes/note/5" stays)
        const nav = ++me.navCount;

        let view = await me.showModule(module, null, nav);

        // one view per window: a workspace claimed it while its code loaded; the routing finds it there now
        if (!view && nav === me.navCount && me.isSingleInstance(module.name) && me.claimsOf(module.name).length) {
            view = await me.showModule(module, null, nav)
        }

        // gone, or the user went elsewhere while the module loaded
        if (!view || me.isDestroyed || nav !== me.navCount) {
            return
        }

        // the address follows the view shown; its hash change routes nothing again (routeHash())
        const value = me.callExtensions('routeOf', view).find(Boolean) || me.standaloneRoute(module.name);

        if (value && me.activeHash !== value) {
            me.expectedHash = value;
            Neo.Main.setRoute({value, windowId: me.windowId})
        }

        view.onQuickAdd?.()
    }

    /**
     * @param {String} name
     * @returns {String} "<module>/<route>" of the module's standalone view (the module alone without one)
     */
    standaloneRoute(name) {
        const route = this.openModules[name]?.route;

        return route ? name + '/' + route : name
    }

    /**
     * A click on a module's top bar tab (and a module moved out of a workspace): shows its standalone
     * view, never a workspace panel of the module, and sets the address to that view's route, also
     * when the address is unchanged. A `singleInstance` module an extension holds has no tab: the
     * address finds it.
     * @param {String} name
     * @param {String} [route] the view's new route ("note/5"), else it keeps its own
     * @returns {Promise<void>}
     */
    async showStandalone(name, route) {
        let me     = this,
            module = ModuleRegistry.getAvailable().find(m => m.name === name);

        if (!module) {
            return
        }

        if (me.isSingleInstance(name) && me.claimsOf(name).length) {
            Neo.Main.setRoute({value: name, windowId: me.windowId});
            return
        }

        // a hash routed meanwhile (an extension still starting) doesn't show something else after this
        me.extensions.length && me.hashSeq++;

        const nav = ++me.navCount;

        await me.openModule(module, nav);

        const entry = me.openModules[name];

        // one view per window: a workspace claimed it while its code loaded; the address finds it there
        if (!entry && !me.isDestroyed && nav === me.navCount && me.isSingleInstance(name) && me.claimsOf(name).length) {
            Neo.Main.setRoute({value: route ? name + '/' + route : name, windowId: me.windowId});
            return
        }

        if (me.isDestroyed || !entry || me.activeModule !== name || nav !== me.navCount) {
            return
        }

        if (route !== undefined) {
            entry.view.route?.(route);
            entry.route = route
        }

        const value = me.standaloneRoute(name);

        me.routeModule = name;

        if (me.activeHash !== value) {
            Neo.Main.setRoute({value, windowId: me.windowId})
        }
    }

    /**
     * Moves a module view into its own browser window (src/Popup.mjs).
     * The view keeps its state; closing the window puts it back.
     * @param {String} name
     */
    async popOutModule(name) {
        let me     = this,
            module = ModuleRegistry.getAvailable().find(m => m.name === name);

        if (!module || me.openModules[name]?.popup) {
            return
        }

        // not opened yet: create its view first
        me.openModules[name] || await me.openModule(module);

        const entry = me.openModules[name];

        if (!entry || entry.popup) {
            return
        }

        entry.popup = {name: null};

        const popupName = await openPopup({
            id      : entry.view.id,
            windowId: me.windowId,
            // the cards area: an inactive card has no size
            rect    : await me.getReference('modules').getDomRect(),
            onAdopt : popupView => me.moveModuleToWindow(name, popupView),
            onClose : popupView => me.dockModule(name, popupView),
            onFailed: () => {
                entry.popup = null
            }
        });

        if (popupName) {
            entry.popup.name = popupName
        } else {
            entry.popup = null;
            console.warn('GO.view.MainView: popup window was blocked')
        }
    }

    /**
     * @param {String} name
     * @param {GO.view.PopupView} popupView
     */
    moveModuleToWindow(name, popupView) {
        let me     = this,
            cards  = me.getReference('modules'),
            entry  = me.openModules[name],
            module = ModuleRegistry.get(name);

        entry.placeholder = cards.add({
            ntype : 'container',
            cls   : ['go-module-placeholder'],
            layout: {ntype: 'vbox', align: 'center', pack: 'center'},
            items : [{
                ntype: 'component',
                cls  : ['go-empty'],
                text : fmt(t('{module} is open in a separate window.'), {module: module?.title || name})
            }, {
                module : Button,
                iconCls: 'fa fa-down-left-and-up-right-to-center',
                text   : t('Bring it back'),
                handler: () => entry.popup?.name && closePopup(entry.popup.name, me.windowId)
            }]
        });

        cards.remove(entry.view, false);

        me.syncActiveCard();

        entry.view.set({appName: popupView.appName, windowId: popupView.windowId});
        popupView.add(entry.view)
    }

    /**
     * The popup window closed: the module view goes back to its card
     * @param {String} name
     * @param {GO.view.PopupView} popupView
     */
    dockModule(name, popupView) {
        let me     = this,
            entry  = me.openModules[name],
            {view} = entry;

        entry.popup = null;

        // silent: the popup window is gone, there is no DOM to update
        popupView.remove(view, false, true);

        if (me.isDestroyed) {
            // the opener closed first
            view.destroy();
            return
        }

        const cards = me.getReference('modules');

        view.set({appName: me.appName, windowId: me.windowId});
        cards.insert(cards.indexOf(entry.placeholder), view);
        cards.remove(entry.placeholder);
        entry.placeholder = null;

        me.syncActiveCard()
    }

    /**
     * Closes a module tab: its view is destroyed, the tab leaves the top bar until the
     * module is opened again (main menu, link). A popped out module stays open.
     * @param {String} name
     */
    closeModule(name) {
        this.removeModules([name])
    }

    /**
     * @param {String|null} keep module to keep open, null closes all
     */
    closeModules(keep = null) {
        this.removeModules(ModuleRegistry.getAvailable().map(m => m.name).filter(name => name !== keep), keep)
    }

    /**
     * Closes modules, then navigates once: to `prefer`, the last open module or nothing ("#")
     * @param {String[]} names
     * @param {String|null} [prefer]
     * @protected
     */
    removeModules(names, prefer = null) {
        let me    = this,
            cards = me.getReference('modules'),
            closedActive = false;

        names.forEach(name => {
            const entry = me.openModules[name];

            // a popped out module stays open
            if (entry?.popup) {
                return
            }

            // still loading and named by the hash: moving away is needed,
            // or selecting it again sets the same hash and fires no change
            if (!entry && me.openTokens[name] && me.routeModule === name) {
                closedActive = true
            }

            delete me.openTokens[name];

            if (entry) {
                delete me.openModules[name];
                cards.remove(entry.view)
            }

            me.removeTab(name);

            if (me.activeModule === name) {
                me.activeModule = null;
                closedActive    = true
            }
        });

        // removed cards shift the others: the same activeIndex can now mean another card
        me.syncActiveCard();

        if (closedActive || (prefer && me.activeModule !== prefer)) {
            const next = prefer || Object.keys(me.openModules).at(-1) || me.callExtensions('fallbackRoute').find(Boolean) || '';

            Neo.Main.setRoute({value: next, windowId: me.windowId})
        }
    }

    /**
     * @param {Object} data contextmenu dom event
     * @protected
     */
    onTabContextMenu(data) {
        const me     = this,
              node   = data.path?.find(node => node.cls?.includes('go-module-button')),
              button = node && Neo.getComponent(node.id),
              name   = button?.reference?.startsWith('module-') && button.reference.slice(7);

        // an extension's tab (sf/workspaces) has its own menu
        if (!name) {
            return
        }

        MenuList.showAt({
            appName : me.appName,
            target  : button.id,
            windowId: me.windowId,
            items   : [...popupsSupported() ? [{
                text    : t('Open in new window'),
                icon    : 'open_in_new',
                // already in its own window
                disabled: !!me.openModules[name]?.popup,
                handler : () => me.popOutModule(name)
            }] : [], ...me.windowMenuItems(target => me.sendModuleToWindow(name, target), !!me.openModules[name]?.popup), {
                text   : t('Close'),
                icon   : 'close',
                handler: () => me.closeModule(name)
            }, {
                text   : t('Close others'),
                icon   : 'tab_close_right',
                handler: () => me.closeModules(name)
            }, {
                text   : t('Close all'),
                icon   : 'tab_close',
                handler: () => me.closeModules()
            }]
        })
    }

    /**
     * @summary "Move to window N: …" menu items, one per other window of this App worker.
     * @param {Function} handler (mainView) the target window's main view
     * @param {Boolean} [disabled=false]
     * @returns {Object[]}
     */
    windowMenuItems(handler, disabled = false) {
        const views = getMainViews();

        return views.filter(mv => mv !== this).map(mv => ({
            // the title may be user data (a workspace name), vdom text: neo escapes it
            text    : fmt(t('Move to window {number}: {title}'), {number: views.indexOf(mv) + 1, title: mv.describe()}),
            icon    : 'move_group',
            disabled,
            handler : () => handler(mv)
        }))
    }

    /**
     * What this window shows, for a menu of the windows: the shown module, or an extension's card
     * (cardTitle hook)
     * @returns {String}
     */
    describe() {
        let me = this;

        if (me.activeCard) {
            return me.callExtensions('cardTitle', me.activeCard).find(Boolean) || ''
        }

        return htmlToText(ModuleRegistry.get(me.activeModule)?.title || '') || t('Select a module from the menu.')
    }

    /**
     * Moves a standalone module to another window: it closes here and opens there with its route
     * (a new view there; an extension of that window may show it in one of its cards)
     * @param {String} name
     * @param {GO.view.MainView} target
     */
    sendModuleToWindow(name, target) {
        let me    = this,
            // the standalone view's own route: the address may be a workspace panel's of the module
            route = me.standaloneRoute(name);

        if (!target || target.isDestroyed || target === me || me.openModules[name]?.popup) {
            return
        }

        me.closeModule(name);
        Neo.Main.setRoute({value: route, windowId: target.windowId});
        notify(me, fmt(t('{module} moved to window {number}.'), {
            module: htmlToText(ModuleRegistry.get(name)?.title || name),
            number: getMainViews().indexOf(target) + 1
        }))
    }

    /**
     * The modules with a tab, in tab order
     * @returns {String[]}
     */
    getTabs() {
        return ModuleRegistry.getAvailable().map(m => m.name).filter(name => this.tabs.has(name))
    }

    /**
     * Gives a module a tab (opened in this window). A module an extension holds has none.
     * @param {String} name
     */
    addTab(name) {
        let me = this;

        // one view per window, held by an extension
        if (me.isSingleInstance(name) && me.claimsOf(name).length) {
            return
        }

        me.setTabVisible(name, true);
        me.tabsClosedEarly.delete(name);

        if (!me.tabs.has(name)) {
            me.tabs.add(name);
            me.saveTabs()
        }
    }

    /**
     * Removes a module's tab (closed, or taken by an extension)
     * @param {String} name
     */
    removeTab(name) {
        let me = this;

        me.setTabVisible(name, false);
        me.tabsRestored || me.tabsClosedEarly.add(name);

        if (me.tabs.delete(name)) {
            me.saveTabs()
        }
    }

    /**
     * Stores the tabs for this window (reload) and as the user's last ones (a new window, the next login,
     * on the server and as a local copy until the server has them)
     * @protected
     */
    saveTabs() {
        let me     = this,
            userId = me.tabsUserId;

        if (!me.tabsRestored || me.tabsLoggingOut || me.isDestroyed || !userId || client.user?.id !== userId) {
            return
        }

        const tabs   = me.getTabs(),
              stored = client.session?.state?.[SERVER_STATE],
              // the classic client's tabs of modules neo doesn't have stay for the classic client
              last   = withClassicOnly(tabs, decodeServerTabs(stored), name => !!ModuleRegistry.get(name)?.mainView),
              // unchanged on the server (a reload) and nothing else on its way: no request
              sent   = !serverTabs && !serverTabsFlying && !serverTabsUnsure && encodeServerTabs(last) === stored;

        setWindowItem(me.windowId, WINDOW_KEY, serializeWindowTabs(tabs, userId));
        setState(LAST_STATE + userId, {tabs, pending: !sent}, me.windowId);
        sent || queueServerTabs(userId, last, me.windowId)
    }

    /**
     * Boot: the tabs this window had (reload), else the user's last ones. Their views
     * are created when shown. Modules an extension holds (workspace panels) get none.
     * @returns {Promise<void>}
     * @protected
     */
    async restoreTabs() {
        let me     = this,
            userId = me.tabsUserId;

        try {
            const windowTabs = userId ? parseWindowTabs(await getWindowItem(me.windowId, WINDOW_KEY), userId) : null,
                  local      = !userId || windowTabs ? null : await getState(LAST_STATE + userId, me.windowId),
                  // the session's copy after the local one: a save acknowledged meanwhile updated both
                  lastTabs   = local && pickLastTabs({server: decodeServerTabs(client.session?.state?.[SERVER_STATE]), local});

            if (me.isDestroyed) {
                return
            }

            restoredTabs({
                windowTabs,
                lastTabs : Array.isArray(lastTabs) ? lastTabs : null,
                available: ModuleRegistry.getAvailable().map(m => m.name),
                // and closed meanwhile: not brought back
                // a `singleInstance` module an extension holds has no tab; the others may have one beside
                claimed  : [...Object.values(me.claimed).filter(c => me.isSingleInstance(c.name)).map(c => c.name), ...me.tabsClosedEarly],
                // the address opened them while this ran (without extensions it is routed right away)
                open     : [...me.tabs]
            }).forEach(name => {
                me.tabs.add(name);
                me.setTabVisible(name, true)
            })
        } catch (e) {
            console.warn('GO.view.MainView: module tabs not restored', e)
        }

        me.tabsRestored = true;
        me.tabsClosedEarly.clear();
        me.saveTabs()
    }

    /**
     * Shows or hides a module's tab with its close button
     * @param {String} name
     * @param {Boolean} visible
     */
    setTabVisible(name, visible) {
        ['module-', 'close-'].forEach(prefix => {
            const button = this.getReference(prefix + name);

            if (button && button.hidden === visible) {
                button.hidden = !visible
            }
        });

        this.updateMainMenuDot()
    }

    /**
     * Shows a module's count (src/Badges.mjs) on its tab and app launcher tile
     * @param {String} name module name
     */
    updateBadge(name) {
        let me   = this,
            text = badges.text(name) || null,
            tab  = me.getReference('module-' + name);

        if (me.isDestroyed) {
            return
        }

        tab && tab.badgeText !== text && (tab.badgeText = text);
        // every extension: one may show the module without a view of it yet (a workspace panel not shown)
        me.callExtensions('onBadge', name, text);
        me.updateMainMenuDot();
        me.getReference('launcher')?.setBadge(name, text);

        // an open list (main menu "list" mode): its items are the modules, in registry order
        const index = ModuleRegistry.getAvailable().findIndex(m => m.name === name);

        index > -1 && me.mainMenuList && !me.mainMenuList.isDestroyed && me.mainMenuList.setItemBadge(index, text)
    }

    /**
     * A dot on the main menu button while a module without a visible tab has a count
     */
    updateMainMenuDot() {
        let me     = this,
            button = me.getReference('mainMenuButton');

        if (!button || me.isDestroyed) {
            return
        }

        // a module an extension holds shows its count there (onBadge())
        const show = ModuleRegistry.getAvailable().some(m => badges.get(m.name) && !me.claimsOf(m.name).length &&
            !me.callExtensions('showsBadge', m.name).some(Boolean) && me.getReference('module-' + m.name)?.hidden !== false);

        button.toggleCls('go-badge-dot', show)
    }

    /**
     * Shows "Loading..." in the main area while the window boots (see construct())
     * @returns {Neo.component.Base} the card
     * @protected
     */
    showLoadingCard() {
        const cards = this.getReference('modules'),
              card  = this.loadingCard = cards.add({ntype: 'component', cls: ['go-loading'], text: t('Loading...')});

        cards.layout.activeIndex = cards.indexOf(card);

        return card
    }

    /**
     * Removes the boot's "Loading..." card (when still shown: an empty main area); the card shown instead keeps showing (removing a card
     * shifts the indexes of the cards after it)
     * @protected
     */
    removeLoadingCard() {
        const me     = this,
              card   = me.loadingCard,
              cards  = me.getReference('modules'),
              active = cards.items[cards.layout.activeIndex];

        if (!card) {
            return
        }

        me.loadingCard = null;

        cards.remove(card);
        cards.layout.activeIndex = null;

        active && active !== card && (cards.layout.activeIndex = cards.indexOf(active))
    }

    /**
     * Shows the active module's card (its view, or its placeholder while popped out)
     */
    syncActiveCard() {
        const me    = this,
              cards = me.getReference('modules'),
              entry = me.openModules[me.activeModule];

        // adding or removing cards does not move activeIndex: the same number can
        // now mean another card, and setting an unchanged value is a no-op
        cards.layout.activeIndex = null;

        if (entry) {
            cards.layout.activeIndex = cards.indexOf(entry.placeholder || entry.view)
        } else if (me.activeCard && !me.activeCard.isDestroyed) {
            cards.layout.activeIndex = cards.indexOf(me.activeCard)
        } else if (me.loadingCard) {
            // still booting: nothing to show yet
            cards.layout.activeIndex = cards.indexOf(me.loadingCard)
        }

        me.replaceLoadingCard()
    }

    /**
     * Removes the boot's "Loading..." card once another card shows
     * @protected
     */
    replaceLoadingCard() {
        const {loadingCard} = this,
              cards         = this.getReference('modules');

        loadingCard && cards.layout.activeIndex !== cards.indexOf(loadingCard) && this.removeLoadingCard()
    }

    // ------------------------------------------------------------ extension API (docs/neo-small-modules.md)

    /**
     * Inserts items into the top bar, before the module tabs or after them
     * @param {Object[]} items configs
     * @param {Object} [options]
     * @param {Boolean} [options.start=false] before the module tabs (right after the logo)
     * @returns {Neo.component.Base[]}
     */
    insertTopbarItems(items, {start = false} = {}) {
        const topbar = this.getReference('topbar'),
              // after the logo, or before the '->' spacer in front of the notification button
              at     = start ? 1 : topbar.indexOf(this.getReference('notificationButton')) - 1;

        return [].concat(topbar.insert(at, items))
    }

    /**
     * Adds a card to the main card layout (below the top bar); it shows with showCard()
     * @param {Object} config
     * @returns {Neo.component.Base}
     */
    addCard(config) {
        return this.getReference('modules').add(config)
    }

    /**
     * Shows an extension's card: no module tab is pressed then
     * @param {Neo.component.Base} card
     */
    showCard(card) {
        let me = this;

        me.activeModule = null;
        me.activeCard   = card;
        me.syncActiveCard();

        ModuleRegistry.getAvailable().forEach(m => {
            const button = me.getReference('module-' + m.name);

            button && button.pressed && (button.pressed = false)
        });

        me.callExtensions('onActiveCardChange', card)
    }

    /**
     * Removes an extension's card (destroyed)
     * @param {Neo.component.Base} card
     */
    removeCard(card) {
        let me = this;

        if (me.activeCard === card) {
            me.activeCard = null;
            me.callExtensions('onActiveCardChange', null)
        }

        me.getReference('modules').remove(card);
        me.syncActiveCard()
    }

    /**
     * @param {String} name module
     * @returns {Boolean} the module's view exists once per window (ModuleRegistry `singleInstance`)
     */
    isSingleInstance(name) {
        return !!ModuleRegistry.get(name)?.singleInstance
    }

    /**
     * @param {String} name module
     * @returns {Object[]} the claims {view, owner, name, key} of the module's views
     */
    claimsOf(name) {
        return Object.values(this.claimed).filter(claim => claim.name === name)
    }

    /**
     * @param {String} name module
     * @returns {Boolean} a view of the module is in this window or being made: standalone, claimed
     */
    hasModuleView(name) {
        const me = this;

        return !!me.openModules[name] || me.claimsOf(name).length > 0 ||
            Object.keys(me.openTokens).some(id => id === name || id.startsWith(name + '|'))
    }

    /**
     * An extension takes a view of a module for one of its places (key; sf/workspaces: a panel,
     * "<workspaceId>/<panelId>"). Another key gets another view, created here; the extension adds it to
     * its own container. A `singleInstance` module has one view per window: its view is taken from its
     * standalone card and tab (both go), from the claim of another key (the owner lets it go,
     * onModuleViewReleased()), or created; popped out into its own window it stays there (null).
     * @param {String} name module
     * @param {Object} owner the extension
     * @param {String} [key=name] the extension's place for the view
     * @returns {Promise<Neo.component.Base|null>} the view
     */
    async claimModuleView(name, owner, key = name) {
        let me     = this,
            module = ModuleRegistry.getAvailable().find(m => m.name === name),
            id     = claimId(name, key),
            single = me.isSingleInstance(name),
            claim  = me.claimed[id] || (single ? me.claimsOf(name)[0] : null);

        if (!module) {
            return null
        }

        if (claim) {
            if (claim.owner !== owner || claim.key !== key) {
                // the other owner or place lets it go (out of its container)
                claim.owner.onModuleViewReleased?.(name, claim.view, claim.key);
                delete me.claimed[claimId(name, claim.key)];
                claim.owner = owner;
                claim.key   = key;
                me.claimed[id] = claim
            }

            return claim.view
        }

        const entry = single ? me.openModules[name] : null;

        if (entry?.popup) {
            return null
        }

        let view;

        if (entry) {
            delete me.openModules[name];
            // its open finished: an open token left would count it as being opened (hasModuleView())
            delete me.openTokens[name];
            me.getReference('modules').remove(entry.view, false);
            view = entry.view;
            me.removeTab(name);
            me.activeModule === name && (me.activeModule = null);
            me.syncActiveCard()
        } else {
            const token = me.openTokens[id] = Symbol();

            let ViewClass;

            try {
                ({default: ViewClass} = await module.mainView())
            } catch (e) {
                // the module's code failed to load: no view is being made any more (hasModuleView())
                me.openTokens[id] === token && delete me.openTokens[id];
                throw e
            }

            // unclaimed meanwhile (the place is gone), or the shell destroyed
            if (me.isDestroyed || me.openTokens[id] !== token) {
                return null
            }

            delete me.openTokens[id];

            // claimed meanwhile, or (one view per window) opened or claimed for another place
            if (me.claimed[id] || (single && (me.openModules[name] || me.claimsOf(name).length))) {
                return me.claimModuleView(name, owner, key)
            }

            view = Neo.create({module: ViewClass, appName: me.appName, windowId: me.windowId, moduleName: name})
        }

        me.claimed[id] = {view, owner, name, key};
        // also a tab of a module whose view wasn't created yet (restored): the module shows in the extension now
        single && me.removeTab(name);
        me.updateMainMenuDot();

        return view
    }

    /**
     * An extension gives a module's view back: it becomes the standalone tab (not shown; showStandalone()
     * or a route shows it). The extension has removed it from its container. The module has one
     * standalone view: when it has one already, the view given back is destroyed.
     * @param {String} name
     * @param {String} [key=name]
     */
    releaseModuleView(name, key = name) {
        let me    = this,
            id    = claimId(name, key),
            claim = me.claimed[id];

        if (!claim) {
            return
        }

        delete me.claimed[id];
        me.updateMainMenuDot();

        if (claim.view.isDestroyed) {
            return
        }

        if (me.openModules[name]) {
            claim.view.destroy();
            return
        }

        const cards = me.getReference('modules');

        claim.view.set({appName: me.appName, windowId: me.windowId});
        me.openModules[name] = {view: cards.add(claim.view)};
        me.addTab(name);
        me.syncActiveCard()
    }

    /**
     * An extension destroyed (or will destroy) a module's view it held, or its place is gone while the
     * view is being made (that claim then resolves to null)
     * @param {String} name
     * @param {String} [key=name]
     */
    unclaimModuleView(name, key = name) {
        const id = claimId(name, key);

        delete this.claimed[id];
        delete this.openTokens[id];
        this.updateMainMenuDot()
    }

}

/**
 * @param {String} name module
 * @param {String} key an extension's place for a view of it
 * @returns {String} the claim's key in MainView.claimed and openTokens ("<module>|<key>", never a bare
 *     module name: those are the standalone views' open tokens)
 */
function claimId(name, key) {
    return name + '|' + key
}

export default Neo.setupClass(MainView);
