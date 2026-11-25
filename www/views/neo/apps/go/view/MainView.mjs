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
import {LAST_STATE, WINDOW_KEY, parseWindowTabs, restoredTabs, serializeWindowTabs} from '../../../src/moduleTabs.mjs';

// header menus open below their button, right edges aligned (they sit at the right)
const RIGHT = {edgeAlign: 't100-b100'};

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

/**
 * Top bar with the module menu and the user, below it one card per opened module.
 * Only the modules open in this window have a tab (src/moduleTabs.mjs).
 *
 * Modules may extend it (ModuleRegistry `mainViewExtension`, e.g. sf/workspaces: workspace tabs with
 * a dock, docs/neo-workspace.md): an extension adds cards (addCard(), showCard()) and top bar items
 * (insertTopbarItems()), takes module views over from their standalone tab (claimModuleView(),
 * releaseModuleView(), unclaimModuleView()) and answers hooks (start, onHashChange, showModule,
 * onActiveCardChange, onBadge, fallbackRoute, beforeLogout, destroy, launcherItems, openBeside,
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
     * Pending openModule() per module name: closeModule() cancels it
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
     * Module views an extension took over (claimModuleView()): module name → {view, owner}.
     * Such a module has no standalone card or tab.
     * @member {Object} claimed={}
     */
    claimed = {}

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
            // into views/neo/apps/go/#name
            handler  : () => Neo.Main.setRoute({value: m.name, windowId: me.windowId}),
            text     : m.title
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
            }, ...client.isAdmin || client.mayChangeUsers || client.mayChangeGroups || client.mayChangeCustomFields ? [{
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

        // the extensions start first (restore what the window showed, take module views), then the
        // window's module tabs come back, then the address is routed
        me.ready = me.startExtensions(current)
            .then(() => me.isDestroyed || me.restoreTabs())
            .then(() => me.isDestroyed || me.start(current));

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
     * Header user menu "System settings" (administrators, user and group managers), route "#systemsettings/<card>"
     * @param {String|null} [activeItem] card to show
     * @param {Boolean} [fromRoute] opened by the address: closing leaves it
     */
    async openSystemSettings(activeItem = null, fromRoute = false) {
        let me = this;

        // user and group managers see their cards only (SystemSettingsDialog CORE_CARDS)
        if (!client.isAdmin && !client.mayChangeUsers && !client.mayChangeGroups && !client.mayChangeCustomFields) {
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
            me.onHashChange(current)
        } else if (me.extensionStartRoute) {
            // routed here too: the address may already be this route (a later window of the shared
            // worker can start without its first hash), then setRoute() fires no hashchange
            me.onHashChange({hashString: me.extensionStartRoute, windowId: me.windowId});
            Neo.Main.setRoute({value: me.extensionStartRoute, windowId: me.windowId})
        } else if (current) {
            me.onHashChange(current)
        } else if (start) {
            Neo.Main.setRoute({value: start.name, windowId: me.windowId})
        } else {
            me.getReference('modules').layout.activeIndex = 0
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
        await Promise.all(views.map(mv => setWindowItem(mv.windowId, WINDOW_KEY, null)));

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
     * Header main menu button: the app launcher, or a list (My account → Look & feel)
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

        // the extensions' entries (launcherItems hook): {text (HTML), iconCls, icon, pressed, title, handler}
        me.launcherItems = me.callExtensions('launcherItems').flat().filter(Boolean);

        if (mode === 'list') {
            me.mainMenuList = MenuList.showAt({
                appName : me.appName,
                target  : button.id,
                windowId: me.windowId,
                items   : [...me.launcherItems.map(item => ({
                    text   : item.text,
                    icon   : item.icon || 'dashboard',
                    handler: item.handler
                })), ...me.launcherItems.length ? [{separator: true}] : [], ...apps.map(m => ({
                    text   : m.title,
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
     * Apps menu items of the modules only the classic client has (docs/neo-switch.md, D3):
     * below the neo modules, each opens the classic client in a new browser tab
     * @returns {Object[]}
     */
    classicMenuItems() {
        const apps = getClassicApps();

        return apps.length ? [{separator: true}, ...apps.map(app => ({
            // server data: the menu renders text as HTML
            text   : escapeHtml(app.title),
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

        let me              = this,
            [name, ...rest] = (hashString || '').split('/'),
            module          = ModuleRegistry.getAvailable().find(m => m.name === name);

        // for start(): a hash other than the window's first one came meanwhile (while the extensions
        // started and the tabs were restored) and wins over it
        me.hashSeen = hashString || '';

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
     * Shows a module: in an extension's card when one has it (showModule hook), else as its own tab
     * @param {Object} module ModuleRegistry entry
     * @param {String|null} route passed to the view's route(), null: the view keeps its route
     * @returns {Promise<Neo.component.Base|null>} the module's view
     */
    async showModule(module, route) {
        let me = this;

        for (const extension of me.extensions) {
            let view = null;

            try {
                view = await extension.showModule?.(module, route)
            } catch (e) {
                e === Neo.isDestroyed || console.error('Main view extension showModule', e)
            }

            if (view) {
                return view
            }
        }

        await me.openModule(module);

        // undefined when the module was closed while its code loaded
        const view = me.openModules[module.name]?.view || null;

        if (route !== null && view) {
            view.route?.(route);
            // its deep link when the module moves to another window while another one shows
            me.openModules[module.name].route = route
        }

        return view
    }

    async openModule(module) {
        let me      = this,
            cards   = me.getReference('modules'),
            entry   = me.openModules[module.name];

        if (!entry) {
            const token = me.openTokens[module.name] = Symbol();

            const {default: ViewClass} = await module.mainView();

            // closed (closeModule) or the shell destroyed while the code loaded
            if (me.isDestroyed || me.openTokens[module.name] !== token) {
                return
            }

            // another hash change may have opened it meanwhile
            entry = me.openModules[module.name] ??= {
                view: cards.add({module: ViewClass, moduleName: module.name})
            };
        }

        // a popped out module keeps its placeholder card here
        cards.layout.activeIndex = cards.indexOf(entry.placeholder || entry.view);

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

        // keeps a deep link ("#notes/note/5") when the module is showing already
        me.routeModule !== module.name && Neo.Main.setRoute({value: module.name, windowId: me.windowId});

        const view = await me.showModule(module, null);

        view?.onQuickAdd?.()
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
     * "Move to window N: …" menu items, one per other window of this App worker
     * @param {Function} handler (mainView) the target window's main view
     * @param {Boolean} [disabled=false]
     * @returns {Object[]}
     */
    windowMenuItems(handler, disabled = false) {
        const views = getMainViews();

        return views.filter(mv => mv !== this).map(mv => ({
            // the title may be user data (a workspace name): the menu renders text as HTML
            text    : escapeHtml(fmt(t('Move to window {number}: {title}'), {number: views.indexOf(mv) + 1, title: mv.describe()})),
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
            hash  = me.activeHash || '',
            last  = me.openModules[name]?.route,
            route = hash === name || hash.startsWith(name + '/') ? hash : last ? name + '/' + last : name;

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

        if (me.claimed[name]) {
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
     * Stores the tabs for this window (reload) and as the user's last ones (a new window, the next login)
     * @protected
     */
    saveTabs() {
        let me     = this,
            userId = me.tabsUserId;

        if (!me.tabsRestored || me.tabsLoggingOut || me.isDestroyed || !userId || client.user?.id !== userId) {
            return
        }

        const tabs = me.getTabs();

        setWindowItem(me.windowId, WINDOW_KEY, serializeWindowTabs(tabs, userId));
        setState(LAST_STATE + userId, {tabs}, me.windowId)
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
                  lastTabs   = !userId || windowTabs ? null : (await getState(LAST_STATE + userId, me.windowId)).tabs;

            if (me.isDestroyed) {
                return
            }

            restoredTabs({
                windowTabs,
                lastTabs : Array.isArray(lastTabs) ? lastTabs : null,
                available: ModuleRegistry.getAvailable().map(m => m.name),
                // and closed meanwhile: not brought back
                claimed  : [...Object.keys(me.claimed), ...me.tabsClosedEarly],
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
        me.claimed[name]?.owner.onBadge?.(name, text);
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
        const show = ModuleRegistry.getAvailable().some(m => badges.get(m.name) && !me.claimed[m.name] && me.getReference('module-' + m.name)?.hidden !== false);

        button.toggleCls('go-badge-dot', show)
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
        }
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
     * An extension takes a module's view: from its standalone card and tab (both go), or created
     * when the module isn't open. The extension adds it to its own container. A module popped out
     * into its own window stays there (null).
     * @param {String} name module
     * @param {Object} owner the extension
     * @returns {Promise<Neo.component.Base|null>} the view
     */
    async claimModuleView(name, owner) {
        let me     = this,
            module = ModuleRegistry.getAvailable().find(m => m.name === name),
            claim  = me.claimed[name];

        if (!module) {
            return null
        }

        if (claim) {
            if (claim.owner !== owner) {
                // the other extension lets it go (out of its container)
                claim.owner.onModuleViewReleased?.(name, claim.view);
                claim.owner = owner
            }

            return claim.view
        }

        const entry = me.openModules[name];

        if (entry?.popup) {
            return null
        }

        let view;

        if (entry) {
            delete me.openModules[name];
            // its open finished: an open token left would count it as being opened (isFree() of sf/workspaces)
            delete me.openTokens[name];
            me.getReference('modules').remove(entry.view, false);
            view = entry.view;
            me.removeTab(name);
            me.activeModule === name && (me.activeModule = null);
            me.syncActiveCard()
        } else {
            const token = me.openTokens[name] = Symbol();

            const {default: ViewClass} = await module.mainView();

            if (me.isDestroyed || me.openTokens[name] !== token) {
                return null
            }

            delete me.openTokens[name];

            // claimed or opened meanwhile
            if (me.claimed[name] || me.openModules[name]) {
                return me.claimModuleView(name, owner)
            }

            view = Neo.create({module: ViewClass, appName: me.appName, windowId: me.windowId, moduleName: name})
        }

        me.claimed[name] = {view, owner};
        // also a tab of a module whose view wasn't created yet (restored): the module shows in the extension now
        me.removeTab(name);

        return view
    }

    /**
     * An extension gives a module's view back: it becomes a standalone tab again (not shown; route
     * to it to show it). The extension has removed it from its container.
     * @param {String} name
     */
    releaseModuleView(name) {
        let me    = this,
            claim = me.claimed[name];

        if (!claim) {
            return
        }

        delete me.claimed[name];

        if (claim.view.isDestroyed) {
            return
        }

        const cards = me.getReference('modules');

        claim.view.set({appName: me.appName, windowId: me.windowId});
        me.openModules[name] = {view: cards.add(claim.view)};
        me.addTab(name);
        me.syncActiveCard()
    }

    /**
     * An extension destroyed (or will destroy) a module's view it held: the module is closed
     * @param {String} name
     */
    unclaimModuleView(name) {
        delete this.claimed[name];
        this.updateMainMenuDot()
    }

}

export default Neo.setupClass(MainView);
