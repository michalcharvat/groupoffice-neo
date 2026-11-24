import Button         from '../../../node_modules/neo.mjs/src/button/Base.mjs';
import Container      from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import HashHistory    from '../../../node_modules/neo.mjs/src/util/HashHistory.mjs';
import Toolbar        from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import GoButton       from '../../../src/button/Button.mjs';
import MenuList       from '../../../src/menu/List.mjs';
import {avatarColor, escapeHtml, initials} from '../../../src/Format.mjs';
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

// header menus open below their button, right edges aligned (they sit at the right)
const RIGHT = {edgeAlign: 't100-b100'};

/**
 * Top bar with the module menu and the user, below it one card per opened module. A module may
 * provide another main area with a subclass (ModuleRegistry `mainArea`, e.g. sf/workspaces: a
 * dock, docs/neo-workspace.md); the hooks are initModulesArea() and start() plus the module
 * methods it overrides.
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
     * Pending openModule() per module name: closeModule() cancels it
     * @member {Object} openTokens={}
     */
    openTokens = {}

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

    onConstructed() {
        super.onConstructed();

        let me        = this,
            available = ModuleRegistry.getAvailable();

        const userName = client.user?.displayName || client.user?.username || '';

        me.getReference('topbar').add([{
            // GO header logo (views/Extjs3/themes/Paper/img/logo-white.svg, see MainView.scss)
            ntype: 'component',
            cls  : ['go-brand'],
            role : 'img',
            title: Neo.config.goTitle || 'GroupOffice'
        },
        ...available.flatMap(m => [{
            module   : Button,
            cls      : ['go-module-button'],
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
            handler  : () => me.openMainMenu()
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
                handler: () => client.logout().catch(e => notifyError(me, e))
            }]}
        }]);

        // right click on a module tab: close it, the others or all
        Neo.main.DomEvents.registerPreventDefaultTargets({
            name    : 'contextmenu',
            cls     : ['go-module-button'],
            windowId: me.windowId
        });

        me.getReference('topbar').addDomListeners({contextmenu: me.onTabContextMenu, scope: me});

        me.initModulesArea();

        me.getReference('launcher').on('open', ({app}) => app.classic ? me.openClassic(app.route) :
            Neo.Main.setRoute({value: app.name, windowId: me.windowId}));

        // one resolver for search, links, alerts and reminders: a neo route or "classic/<hash>"
        me.getReference('search').resolveRoute = resolveRoute;

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

        me.start(current);

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
     * Sets up the main area below the top bar. Here one card per opened module; a module's
     * main area (ModuleRegistry `mainArea`) overrides it.
     * @protected
     */
    initModulesArea() {
    }

    /**
     * Boot: the window's first hash, else the user's start module (My account) or the only module
     * @param {Object|null} current the window's first hash
     * @protected
     */
    start(current) {
        let me        = this,
            available = ModuleRegistry.getAvailable(),
            start     = available.find(m => m.name === client.user?.start_module) || (available.length === 1 && available[0]);

        if (current) {
            me.onHashChange(current)
        } else if (start) {
            Neo.Main.setRoute({value: start.name, windowId: me.windowId})
        } else {
            me.getReference('modules').layout.activeIndex = 0
        }
    }

    destroy(...args) {
        HashHistory.un('change', this.hashListenerId);
        this.removeNotificationListener?.();
        this.removeBadgeListener?.();
        notificationCenter.detach(this.windowId);
        activityWatcher.unregister(this.windowId);
        super.destroy(...args)
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
     */
    async openMainMenu() {
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

        if (mode === 'list') {
            me.mainMenuList = MenuList.showAt({
                appName : me.appName,
                target  : button.id,
                windowId: me.windowId,
                items   : [...apps.map(m => ({
                    text   : m.title,
                    icon   : m.icon || 'apps',
                    image  : m.iconUrl || null,
                    badge  : badges.text(m.name) || null,
                    handler: () => Neo.Main.setRoute({value: m.name, windowId: me.windowId})
                })), ...me.classicMenuItems()]
            });
            return
        }

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

        launcher.open(button.id)
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

        if (name === 'systemsettings') {
            me.openSystemSettings(rest[0] || null, true);
            return
        }

        if (!module && me.routeUnknownHash(name, rest)) {
            return
        }

        me.routeModule = module?.name || null;
        me.activeHash  = hashString || null;

        if (!module) {
            return
        }

        await me.openModule(module);
        // undefined when the module was closed while its code loaded
        me.openModules[name]?.view.route?.(rest.join('/'))
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

        me.setTabVisible(module.name, true);

        me.activeModule = module.name;

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
        me.activeModule !== module.name && Neo.Main.setRoute({value: module.name, windowId: me.windowId});
        await me.openModule(module);
        me.openModules[module.name]?.view.onQuickAdd?.()
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

            me.setTabVisible(name, false);

            if (me.activeModule === name) {
                me.activeModule = null;
                closedActive    = true
            }
        });

        // removed cards shift the others: the same activeIndex can now mean another card
        me.syncActiveCard();

        if (closedActive || (prefer && me.activeModule !== prefer)) {
            const next = prefer || Object.keys(me.openModules).at(-1) || '';

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
              name   = button?.reference?.replace(/^module-/, '');

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
            }] : [], {
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

        const show = ModuleRegistry.getAvailable().some(m => badges.get(m.name) && me.getReference('module-' + m.name)?.hidden !== false);

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
        }
    }

}

export default Neo.setupClass(MainView);
