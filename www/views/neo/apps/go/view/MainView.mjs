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
import {t} from '../../../src/Translate.mjs';
import ConfirmDialog       from '../../../src/view/ConfirmDialog.mjs';
import TextPrompt          from '../../../src/view/TextPrompt.mjs';
import Workspace, {emptyDocument, normalizeDocument, tabsDocument} from '../../../src/view/Workspace.mjs';
import SaveQueue, {stableJson} from '../../../src/workspace/SaveQueue.mjs';
import {getWindowItem, setWindowItem} from '../../../src/windowStorage.mjs';

// GO's breakpoints (goui/style/_config.scss): 576px narrow, 1200px medium / wide
const NARROW = 576;
const MEDIUM = 1200;
// sessionStorage: the workspace this browser window shows
const WINDOW_KEY = 'go-workspace-id';

const stableEqual = (a, b) => stableJson(a ?? null) === stableJson(b ?? null);

// a new panel id (a dock item id, unique within the workspace)
const newPanelId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// header menus open below their button, right edges aligned (they sit at the right)
const RIGHT = {edgeAlign: 't100-b100'};

/**
 * Top bar with the module menu and the user, below it the workspace (GO.view.Workspace, the
 * neo.mjs dock): one panel per opened module, split, tabbed, maximized as the user drags them.
 * The panels and the layout per screen profile are saved in the user's Workspace entity
 * (docs/neo-workspace.md); a phone (narrow profile) shows one module at a time and saves nothing.
 *
 * Routing: "#<module>" opens a module in the focused panel's group, everything after the first
 * "/" is passed to the module's main view as route(path), e.g. "#notes/note/5". "#ws/<id>" shows
 * a workspace in this window.
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
            // the workspace (docs/neo-workspace.md): one panel per open module
            module   : Workspace,
            reference: 'modules',
            cls      : ['go-modules', 'go-workspace-empty'],
            flex     : 1
        }]
    }

    /**
     * module name → {panelId, host, view, popup, placeholder}
     */
    openModules = {}

    /**
     * Panels of the shown workspace: panel id → {module, route}
     * @member {Object} panels={}
     */
    panels = {}

    /**
     * The shown workspace {id, name, panels, layouts}
     * @member {Object|null} workspace=null
     */
    workspace = null

    /**
     * The user's workspaces, for the switcher
     * @member {Object[]} workspaces=[]
     */
    workspaces = []

    /**
     * narrow, medium or wide (docs/neo-workspace.md, "Screen profiles")
     * @member {String|null} profile=null
     */
    profile = null

    /**
     * Applying a document from the server: no saves, closed items are not closed modules
     * @member {Number} loading=0
     */
    loading = 0

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
            title: Neo.config.goTitle || 'Group Office'
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
            iconCls  : 'fa fa-xmark',
            reference: 'close-' + m.name,
            tooltip  : t('Close'),
            handler  : () => me.closeModule(m.name)
        }]),
        '->', {
            // workspace switcher (docs/neo-workspace.md): the shown workspace, a menu of the others
            module   : GoButton,
            icon     : 'dashboard',
            cls      : ['go-header-button', 'go-workspace-button'],
            reference: 'workspaceButton',
            tooltip  : t('Workspaces'),
            hidden   : true,
            handler  : () => me.openWorkspaceMenu()
        }, {
            // go.Notifier status icon: shown while there are notifications, the count on it
            module   : GoButton,
            icon     : 'notifications',
            cls      : ['go-header-button', 'go-notification-button'],
            reference: 'notificationButton',
            tooltip  : t('Notifications'),
            hidden   : true,
            handler  : () => me.toggleNotifications()
        }, {
            // GO #secondary-menu: search, add, main menu, user
            module : GoButton,
            icon   : 'search',
            cls    : ['go-header-button'],
            tooltip: t('Search'),
            handler: () => me.getReference('search').open()
        }, {
            module : GoButton,
            icon   : 'add',
            cls    : ['go-header-button'],
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
            reference: 'mainMenuButton',
            tooltip  : t('Main menu'),
            handler  : () => me.openMainMenu()
        }, {
            // go.util.avatar(): initials on a colour from the name
            module : GoButton,
            cls    : ['go-header-avatar'],
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

        me.getReference('topbar').addDomListeners({
            contextmenu    : me.onTabContextMenu,
            // dragging a module tab into the workspace (src/main/addon/DockDrag.mjs)
            goDockDragStart: me.onModuleDragStart,
            goDockDragEnd  : me.onModuleDragEnd,
            scope          : me
        });

        Neo.Main.importAddon({name: 'WS/DockDrag', windowId: me.windowId}).catch(e => console.warn('DockDrag', e));

        const ws = me.getReference('modules');

        ws.set({
            resolveHost: panelId => me.hostOf(panelId),
            hostIds    : () => Object.values(me.openModules).map(entry => entry.panelId)
        });
        ws.on({
            documentChange: me.onDocumentChange,
            panelActivate : me.onPanelActivate,
            panelClose    : me.onPanelClose,
            scope         : me
        });
        ws.addDomListeners({goDockDrop: me.onModuleDrop, scope: me});

        // conflicts with another window, see src/workspace/SaveQueue.mjs
        me.saveQueue = new SaveQueue({
            onError    : e => notifyError(me, e),
            onDestroyed: id => String(id) === String(me.workspace?.id) && me.loadWorkspace(null),
            // a save was merged with another window's change: show the result
            // not while a load runs (a switch away from this workspace, or a reload that reads it anyway)
            onMerged   : id => !me.loadsRunning && String(id) === String(me.workspace?.id) && me.reloadFromRemote(id)
        });
        me.removeStateListener = client.on?.('stateChange', ({changed}) => changed?.includes('Workspace') && me.onRemoteChange());
        client.watch?.(['Workspace']);

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

    destroy(...args) {
        HashHistory.un('change', this.hashListenerId);
        this.removeStateListener?.();
        // the last change of this window
        this.saveQueue?.flush();
        this.resizeAddon?.unregister({id: this.id, windowId: this.windowId});
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

    // ---------------------------------------------------------------- workspace

    /**
     * Boot: the screen profile, then the window's workspace, then the address
     * @param {Object|null} current the window's first hash
     * @protected
     */
    async start(current) {
        let me = this;

        await me.observeSize();

        const hash   = current?.hashString || '',
              wsId   = hash.match(/^ws\/(\d+)/)?.[1] || await getWindowItem(me.windowId, WINDOW_KEY);

        try {
            await me.loadWorkspace(wsId || null)
        } catch (e) {
            notifyError(me, e)
        }

        if (me.isDestroyed) {
            return
        }

        if (current && !hash.startsWith('ws/') && hash !== '') {
            me.onHashChange(current);
            return
        }

        // the workspace's focused panel, else the user's start module (My account) or the only module
        const focused   = me.focusedModule(),
              available = ModuleRegistry.getAvailable(),
              start     = available.find(m => m.name === client.user?.start_module) || (available.length === 1 && available[0]);

        if (focused) {
            me.routeToPanel(focused, true)
        } else if (start) {
            Neo.Main.setRoute({value: start.name, windowId: me.windowId})
        }
    }

    /**
     * Watches the window width: the screen profile
     * @protected
     */
    async observeSize() {
        let me = this;

        me.addDomListeners({resize: me.onResize, scope: me});

        try {
            const addon = await Neo.currentWorker.getAddon('ResizeObserver', me.windowId);

            addon.register({id: me.id, windowId: me.windowId});
            me.resizeAddon = addon;

            const rect = await me.getDomRect();
            me.setProfile(me.profileFor(rect?.width))
        } catch (e) {
            console.warn('GO.view.MainView: no ResizeObserver', e);
            me.setProfile('wide')
        }
    }

    /**
     * @param {Number} width
     * @returns {String}
     */
    profileFor(width) {
        return !width ? 'wide' : width <= NARROW ? 'narrow' : width < MEDIUM ? 'medium' : 'wide'
    }

    /**
     * @param {Object} data resize event
     * @protected
     */
    onResize(data) {
        const width = data.contentRect?.width ?? data.rect?.width;

        width && this.setProfile(this.profileFor(width))
    }

    /**
     * Narrow: one module at a time, nothing saved. Medium and wide: each its own layout.
     * @param {String} profile
     */
    async setProfile(profile) {
        let me  = this,
            old = me.profile,
            ws  = me.getReference('modules');

        if (old === profile) {
            return
        }

        me.profile = profile;
        ws.toggleCls('go-workspace-narrow', profile === 'narrow');
        me.updateWorkspaceButton();

        // the change belongs to the profile it was made in
        me.saveQueue.flush();

        if (!me.workspace || old === null) {
            return
        }

        if (profile === 'narrow') {
            ws.restore();
            await me.applyDocument(tabsDocument(me.panelList(), ws.focusedPanelId));
            return
        }

        if (old === 'narrow') {
            // the server state, plus the module the user switched to on the small screen
            const focused = me.focusedModule();

            await me.loadWorkspace(me.workspace.id, focused);
            return
        }

        await me.applyLayout()
    }

    /**
     * Loads a workspace into this window: its panels (module views) and the layout of the profile
     * @param {String|Number|null} id null: the default one
     * @param {String|null} [keepModule] a module to keep as the focused panel (added when the workspace lacks it)
     * @param {String|null} [focusModule] a module to focus when the workspace has it
     */
    async loadWorkspace(id, keepModule = null, focusModule = null) {
        let me  = this,
            // a later load (another switch, a push) supersedes this one
            seq = me.loadSeq = (me.loadSeq || 0) + 1,
            stale = () => me.isDestroyed || seq !== me.loadSeq;

        me.loadsRunning = (me.loadsRunning || 0) + 1;

        try {
            return await me.doLoadWorkspace(id, keepModule, focusModule, seq, stale)
        } finally {
            me.loadsRunning--
        }
    }

    /**
     * @protected
     */
    async doLoadWorkspace(id, keepModule, focusModule, seq, stale) {
        let me = this,
            response, workspace;

        // the window's last change reaches the server before it is read back
        await me.saveQueue.flush();

        const {list} = await client.queryGet('Workspace', {filter: {mine: true}, properties: ['id', 'name', 'isDefault', 'sortOrder']}),
              meta   = list.find(w => String(w.id) === String(id)) || list.find(w => w.isDefault) || list[0];

        if (stale()) {
            return
        }

        me.workspaces = list;

        if (!meta) {
            return
        }

        // a copy read while no edit of this window waits: an edit made meanwhile is saved, then read again
        for (let attempt = 0; attempt < 3; attempt++) {
            response  = await client.call('Workspace/get', {ids: [meta.id]});
            workspace = response.list[0];

            if (stale() || !workspace || !me.saveQueue.isPending(workspace.id)) {
                break
            }

            await me.saveQueue.flush()
        }

        if (stale() || !workspace) {
            return
        }

        // a change still queued (a failed save) stays queued: it is sent with the next flush
        me.saveQueue.setBase(workspace, response.state);

        const panels = Array.isArray(workspace.panels) ? {} : JSON.parse(JSON.stringify(workspace.panels || {})),
              keep   = keepModule && me.openModules[keepModule];

        // a panel of a module this user may no longer open is left out (re-checked here, too)
        Object.entries(panels).forEach(([panelId, panel]) => {
            ModuleRegistry.getAvailable().some(m => m.name === panel.module) || delete panels[panelId]
        });

        if (keep && !Object.values(panels).some(p => p.module === keepModule)) {
            panels[keep.panelId] = {module: keepModule, route: me.panels[keep.panelId]?.route || ''}
        }

        me.workspace = workspace;
        me.panels    = panels;
        me.updateWorkspaceButton();
        setWindowItem(me.windowId, WINDOW_KEY, String(workspace.id));

        me.loading++;

        try {
            const ws = me.getReference('modules');

            // the old panes are parked while their ids still count as preserved
            ws.restore();
            await ws.setDocument(emptyDocument());

            // module views: reused by module name, the others closed
            const wanted = new Set(Object.values(panels).map(p => p.module));

            Object.keys(me.openModules).forEach(name => wanted.has(name) || me.openModules[name].popup || me.destroyModule(name));

            for (const [panelId, panel] of Object.entries(panels)) {
                const entry = await me.ensureModule(ModuleRegistry.get(panel.module), panelId);

                if (stale()) {
                    return
                }

                // every visible pane shows its own route; a deep link is applied after this (start())
                entry?.view.route?.(panel.route || '')
            }

            const focusEntry = focusModule && me.openModules[focusModule],
                  focus      = keep?.panelId || (focusEntry && panels[focusEntry.panelId] ? focusEntry.panelId : undefined);

            await me.applyLayout(focus)
        } finally {
            me.loading--
        }

        me.syncTabs()
    }

    /**
     * Shows the stored layout of the current profile, reconciled with the panels
     * @param {String} [focusPanelId]
     * @protected
     */
    async applyLayout(focusPanelId) {
        let me     = this,
            ws     = me.getReference('modules'),
            list   = me.panelList(),
            doc;

        if (me.profile === 'narrow') {
            doc = tabsDocument(list, focusPanelId || ws.focusedPanelId)
        } else {
            doc = me.reconcile(normalizeDocument(me.workspace?.layouts?.[me.profile]), list) || tabsDocument(list, focusPanelId)
        }

        await me.applyDocument(doc);

        const focus = focusPanelId && ws.hasPanel(focusPanelId) ? focusPanelId :
            Object.values(ws.dockModel.nodes).find(n => n.type === 'tabs' && n.activeItemId)?.activeItemId || null;

        if (focusPanelId && ws.hasPanel(focusPanelId)) {
            await ws.showPanel(focusPanelId, {title: me.panelTitle(focusPanelId)})
        }

        ws.setFocusedPanel(focus);
        me.syncTabs()
    }

    /**
     * A stored layout against the current panels (docs/neo-workspace.md, "Reconciling profiles"):
     * items without a panel go, panels it doesn't know become tabs of its first group
     * @param {Object|null} doc
     * @param {Object[]} panels [{id, title}]
     * @returns {Object|null}
     */
    reconcile(doc, panels) {
        if (!doc) {
            return null
        }

        const ids = new Set(panels.map(p => p.id));

        Object.keys(doc.items).forEach(id => {
            if (!ids.has(id)) {
                delete doc.items[id];

                Object.values(doc.nodes).forEach(node => {
                    if (node.type === 'tabs' && node.items.includes(id)) {
                        node.items = node.items.filter(item => item !== id);
                        node.activeItemId === id && (node.activeItemId = node.items[0] || null)
                    }
                })
            }
        });

        let tabs = Object.entries(doc.nodes).find(([, node]) => node.type === 'tabs' && node.items.length)?.[0];

        panels.forEach(({id, title}) => {
            if (doc.items[id]) {
                doc.items[id].title = title;
                return
            }

            doc.items[id] = {title};

            if (!tabs) {
                return
            }

            doc.nodes[tabs].items.push(id);
            doc.nodes[tabs].activeItemId ??= id
        });

        // nothing usable left (every group emptied): the panels as tabs
        if (!tabs || !Object.values(doc.nodes).some(n => n.type === 'tabs' && n.items.length)) {
            return null
        }

        return doc
    }

    /**
     * @param {Object} doc
     * @returns {Promise<void>}
     * @protected
     */
    async applyDocument(doc) {
        let me = this;

        me.loading++;

        try {
            const landed = await me.getReference('modules').setDocument(doc);

            // the dock's validator refused a stored layout: the panels as tabs
            landed || await me.getReference('modules').setDocument(tabsDocument(me.panelList()))
        } finally {
            me.loading--
        }

        me.updateEmpty()
    }

    /**
     * @returns {Object[]} [{id, title}] of the panels
     */
    panelList() {
        return Object.keys(this.panels).map(id => ({id, title: this.panelTitle(id)}))
    }

    /**
     * @param {String} panelId
     * @returns {String}
     */
    panelTitle(panelId) {
        const name = this.panels[panelId]?.module;

        return ModuleRegistry.get(name)?.title || name || ''
    }

    /**
     * @returns {String|null} module of the focused panel
     */
    focusedModule() {
        const id = this.getReference('modules').focusedPanelId;

        return (id && this.panels[id]?.module) || null
    }

    /**
     * @param {String} panelId
     * @returns {Neo.container.Base|null}
     */
    hostOf(panelId) {
        return Object.values(this.openModules).find(entry => entry.panelId === panelId)?.host || null
    }

    /**
     * Sets the address to a module's panel route
     * @param {String} name module
     * @param {Boolean} [replace] without a history entry
     */
    routeToPanel(name, replace = false) {
        let me     = this,
            entry  = me.openModules[name],
            route  = (entry && me.panels[entry.panelId]?.route) || '',
            value  = route ? name + '/' + route : name;

        if (me.activeHash === value) {
            return
        }

        replace ? replaceRoute(me.windowId, value) : Neo.Main.setRoute({value, windowId: me.windowId})
    }

    /**
     * Any committed dock change: save it (medium and wide only)
     * @param {Object} data
     * @protected
     */
    onDocumentChange({document}) {
        let me = this;

        me.updateEmpty(document);

        if (!me.loading) {
            me.scheduleSave(document, true)
        }
    }

    /**
     * @param {Object} [document] the committed dock document
     * @param {Boolean} [layoutEdited=false] the dock changed, not only a panel's route: the layout is written
     */
    scheduleSave(document, layoutEdited = false) {
        let me = this;

        if (!me.workspace || me.profile === 'narrow' || me.loading) {
            return
        }

        // only panels of the document: a module still loading is no panel yet
        const ws     = me.getReference('modules'),
              doc    = document || ws.getDocument(),
              panels = {};

        Object.keys(doc.items || {}).forEach(id => me.panels[id] && (panels[id] = {...me.panels[id]}));

        me.saveQueue.schedule({
            workspaceId: me.workspace.id,
            profile    : me.profile,
            panels,
            layout     : doc,
            layoutEdited
        });

        // what this window now holds for the profile
        me.workspace.layouts = {...Array.isArray(me.workspace.layouts) ? {} : me.workspace.layouts, [me.profile]: doc}
    }

    /**
     * @param {Object} [document]
     * @protected
     */
    updateEmpty(document) {
        const ws = this.getReference('modules');

        ws.toggleCls('go-workspace-empty', !Object.keys((document || ws.dockModel)?.items || {}).length)
    }

    /**
     * The focused panel changed (click, tab, opened): its module is the active one
     * @param {Object} data
     * @protected
     */
    onPanelActivate({panelId}) {
        let me   = this,
            name = panelId && me.panels[panelId]?.module;

        me.activeModule = name || null;
        me.syncTabs();

        // the address follows the focused panel (Back moves between routes of that panel);
        // not while a workspace loads: a deep link being opened wins (start(), onHashChange())
        name && !me.loading && me.routeModule !== name && me.routeToPanel(name, true)
    }

    /**
     * The user closed a panel in the dock
     * @param {Object} data
     * @protected
     */
    onPanelClose({panelId}) {
        let me = this;

        if (me.loading) {
            return
        }

        const name = me.panels[panelId]?.module;

        delete me.panels[panelId];

        if (name && me.openModules[name]?.panelId === panelId) {
            const entry = me.openModules[name];

            // a popped out module goes with its panel
            entry.popup?.name && closePopup(entry.popup.name, me.windowId);
            me.destroyModule(name)
        }

        me.syncTabs();

        if (me.routeModule === name) {
            const next = me.focusedModule();

            next ? me.routeToPanel(next, true) : replaceRoute(me.windowId, '')
        }
    }

    /**
     * Another window saved a workspace: reload ours when its panels or our profile's layout changed
     * (the window that saved last wins, docs/neo-workspace.md "Saving and conflicts")
     * @protected
     */
    async onRemoteChange() {
        let me  = this,
            id  = me.workspace?.id,
            seq = me.loadSeq,
            // the window moved on (another workspace, a load) while this was read
            stale = () => me.isDestroyed || seq !== me.loadSeq || String(id) !== String(me.workspace?.id);

        if (!id || me.isDestroyed) {
            return
        }

        try {
            // names and the list of the switcher (renamed, created or deleted in another window)
            const {list} = await client.queryGet('Workspace', {filter: {mine: true}, properties: ['id', 'name', 'isDefault', 'sortOrder']});

            if (stale()) {
                return
            }

            me.workspaces = list;
            const meta = list.find(w => String(w.id) === String(id));
            meta && (me.workspace.name = meta.name);
            me.updateWorkspaceButton();

            if (me.saveQueue.isPending(id)) {
                return
            }

            const response = await client.call('Workspace/get', {ids: [id]}),
                  remote   = response.list[0];

            if (stale() || me.saveQueue.isPending(id)) {
                return
            }

            if (!remote) {
                await me.loadWorkspace(null);
                return
            }

            const base = me.saveQueue.base[id] || {};

            if (stableEqual(remote.panels, base.panels) && stableEqual(remote.layouts, base.layouts)) {
                return
            }

            const ours = me.profile !== 'narrow' && !stableEqual(remote.layouts?.[me.profile], base.layouts?.[me.profile]);

            if (ours || !stableEqual(remote.panels, base.panels)) {
                notify(me, t('This workspace was changed in another window.'));
                await me.reloadFromRemote(id)
            } else {
                // another profile only
                me.saveQueue.setBase(remote, response.state);
                me.workspace.layouts = remote.layouts
            }
        } catch (e) {
            console.warn('GO.view.MainView: workspace reload failed', e)
        }
    }

    /**
     * Shows the server copy of the current workspace (another window changed it). A panel closed there
     * stays closed: the address moves on to a panel that is left.
     * @param {String|Number} id
     */
    async reloadFromRemote(id) {
        let me = this;

        // this window keeps its own focused panel, unless the other window closed it
        await me.loadWorkspace(id, null, me.routeModule);

        if (me.isDestroyed || String(id) !== String(me.workspace?.id)) {
            return
        }

        // the focused panel, its route as the other window left it
        const focused = me.routeModule && me.openModules[me.routeModule] ? me.routeModule : me.focusedModule();
        focused ? me.routeToPanel(focused, true) : replaceRoute(me.windowId, '')
    }

    // ---------------------------------------------------------------- switcher

    updateWorkspaceButton() {
        let me     = this,
            button = me.getReference('workspaceButton');

        if (!button) {
            return
        }

        button.set({
            hidden: !me.workspace || me.profile === 'narrow',
            text  : me.workspace?.name || ''
        })
    }

    /**
     * Top bar workspace menu: the workspaces, new, rename, delete
     */
    openWorkspaceMenu() {
        let me      = this,
            current = me.workspace;

        MenuList.showAt({
            appName : me.appName,
            target  : me.getReference('workspaceButton').id,
            windowId: me.windowId,
            align   : RIGHT,
            items   : [...me.workspaces.map(w => ({
                // user data: the menu renders text as HTML
                text   : escapeHtml(w.name),
                icon   : String(w.id) === String(current?.id) ? 'check' : 'dashboard',
                handler: () => me.switchWorkspace(w.id)
            })), {separator: true}, {
                text   : t('New workspace'),
                icon   : 'add',
                handler: () => me.createWorkspace()
            }, {
                text    : t('Rename'),
                icon    : 'edit',
                disabled: !current,
                handler : () => me.renameWorkspace()
            }, {
                text    : t('Delete'),
                icon    : 'delete',
                disabled: !current || me.workspaces.length < 2,
                handler : () => me.deleteWorkspace()
            }]
        })
    }

    /**
     * Shows another workspace in this window: "#ws/<id>" (the router loads it)
     * @param {String|Number} id
     */
    switchWorkspace(id) {
        Neo.Main.setRoute({value: 'ws/' + id, windowId: this.windowId})
    }

    async createWorkspace() {
        let me = this;

        const name = await TextPrompt.ask({appName: me.appName, windowId: me.windowId, title: t('New workspace'), label: t('Name'), value: ''});

        if (!name?.trim() || me.isDestroyed) {
            return
        }

        try {
            const response = await client.set('Workspace', {create: {n: {name: name.trim(), sortOrder: me.workspaces.length}}});

            me.switchWorkspace(response.created.n.id)
        } catch (e) {
            notifyError(me, e)
        }
    }

    async renameWorkspace() {
        let me = this,
            ws = me.workspace;

        const name = await TextPrompt.ask({appName: me.appName, windowId: me.windowId, title: t('Rename'), label: t('Name'), value: ws.name});

        if (!name?.trim() || name.trim() === ws.name || me.isDestroyed) {
            return
        }

        try {
            await client.set('Workspace', {update: {[ws.id]: {name: name.trim()}}});
            ws.name = name.trim();
            me.workspaces.forEach(w => String(w.id) === String(ws.id) && (w.name = ws.name));
            me.updateWorkspaceButton()
        } catch (e) {
            notifyError(me, e)
        }
    }

    async deleteWorkspace() {
        let me = this,
            ws = me.workspace;

        const yes = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Delete'),
            message : t('Delete the workspace "{name}"?').replace('{name}', escapeHtml(ws.name))
        });

        if (!yes || me.isDestroyed) {
            return
        }

        try {
            me.saveQueue.drop(ws.id);
            await client.set('Workspace', {destroy: [ws.id]});
            setWindowItem(me.windowId, WINDOW_KEY, null);
            await me.loadWorkspace(null);
            me.routeToPanel(me.focusedModule() || '', true)
        } catch (e) {
            notifyError(me, e)
        }
    }

    // ---------------------------------------------------------------- drag from the top bar

    /**
     * A module tab starts a drag: the panel it is or will be
     * @param {Object} data {module}
     * @protected
     */
    onModuleDragStart({module: name}) {
        let me = this;

        if (me.profile === 'narrow' || !ModuleRegistry.get(name)) {
            return
        }

        me.dragPanelId = me.openModules[name]?.panelId || newPanelId();
        me.getReference('modules').beginExternalDrag(me.dragPanelId, {title: ModuleRegistry.get(name).title})
    }

    /**
     * @param {Object} data {module, dropped}
     * @protected
     */
    onModuleDragEnd({dropped}) {
        dropped || this.getReference('modules').endExternalDrag()
    }

    /**
     * A module tab dropped on the workspace: split, tab or move (the dock's drop indicators)
     * @param {Object} data {clientX, clientY, module}
     * @protected
     */
    async onModuleDrop({clientX, clientY, module: name}) {
        let me      = this,
            module  = ModuleRegistry.get(name),
            panelId = me.dragPanelId,
            ws      = me.getReference('modules');

        me.dragPanelId = null;

        if (!module || !panelId) {
            ws.endExternalDrag();
            return
        }

        const isNew = !me.openModules[name];

        // the module view exists before the dock asks for its pane
        isNew && await me.ensureModule(module, panelId);

        const landed = await ws.dropExternal({clientX, clientY});

        if (!landed && isNew) {
            delete me.panels[panelId];
            me.destroyModule(name);
            return
        }

        if (landed) {
            ws.setFocusedPanel(panelId);
            me.routeToPanel(name)
        }
    }

    // ---------------------------------------------------------------- modules

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

        if (name === 'ws') {
            // "#ws/<id>": this window shows that workspace, the address goes on to its focused panel
            if (rest[0] && String(rest[0]) !== String(me.workspace?.id)) {
                try {
                    await me.loadWorkspace(rest[0])
                } catch (e) {
                    notifyError(me, e)
                }
            }

            const focused = me.focusedModule();
            replaceRoute(me.windowId, focused ? me.panelRoute(focused) : '');
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

        const route = rest.join('/');

        await me.openModule(module);

        const entry = me.openModules[name];

        // undefined when the module was closed while its code loaded
        if (!entry) {
            return
        }

        entry.view.route?.(route);

        if (me.panels[entry.panelId] && me.panels[entry.panelId].route !== route) {
            me.panels[entry.panelId].route = route;
            me.scheduleSave()
        }
    }

    /**
     * @param {String} name module
     * @returns {String} "<module>/<route>"
     */
    panelRoute(name) {
        const route = this.panels[this.openModules[name]?.panelId]?.route;

        return route ? name + '/' + route : name
    }

    /**
     * Creates a module's view in its panel host, once
     * @param {Object} module ModuleRegistry entry
     * @param {String} [panelId] for a panel of a loaded workspace
     * @returns {Promise<Object|null>} the openModules entry, null when cancelled
     */
    async ensureModule(module, panelId) {
        let me    = this,
            entry = me.openModules[module.name];

        if (entry) {
            if (panelId && entry.panelId !== panelId) {
                entry.panelId = entry.host.panelId = panelId
            }

            me.panels[entry.panelId] ??= {module: module.name, route: ''};
            return entry
        }

        const token = me.openTokens[module.name] = Symbol();

        const {default: ViewClass} = await module.mainView();

        // closed (closeModule) or the shell destroyed while the code loaded
        if (me.isDestroyed || me.openTokens[module.name] !== token) {
            return null
        }

        // another hash change may have opened it meanwhile
        if (!me.openModules[module.name]) {
            panelId ??= newPanelId();

            const host = Neo.create({
                module  : Container,
                appName : me.appName,
                windowId: me.windowId,
                // a module's layout follows the panel width (MainThreeColumnPanel container queries)
                cls     : ['go-module-host'],
                layout  : 'fit',
                // the dock's tab button
                header  : {text: module.title, iconCls: module.iconCls},
                items   : [{module: ViewClass, moduleName: module.name}]
            });

            host.panelId = panelId;
            me.openModules[module.name] = {name: module.name, panelId, host, view: host.items[0]};
            me.panels[panelId] ??= {module: module.name, route: ''}
        }

        return me.openModules[module.name]
    }

    /**
     * Opens a module: its panel shown and focused (a new one in the focused panel's group).
     * The panel's route is set by onHashChange(), which compares it with the stored one.
     * @param {Object} module ModuleRegistry entry
     */
    async openModule(module) {
        let me    = this,
            entry = await me.ensureModule(module);

        if (!entry) {
            return
        }

        await me.getReference('modules').showPanel(entry.panelId, {title: module.title});

        me.activeModule = module.name;
        me.syncTabs()
    }

    /**
     * Destroys a module's view and host (its panel is gone)
     * @param {String} name
     * @protected
     */
    destroyModule(name) {
        let me    = this,
            entry = me.openModules[name];

        delete me.openTokens[name];

        if (!entry) {
            return
        }

        delete me.openModules[name];
        me.activeModule === name && (me.activeModule = null);

        // a popped out view lives in the popup until it closes: dockModule() destroys the host then
        entry.closed = true;
        entry.popup || entry.host.destroy(true)
    }

    /**
     * Top bar tabs: one per panel of the workspace, pressed for the focused one
     */
    syncTabs() {
        let me    = this,
            shown = new Set(Object.values(me.panels).map(p => p.module));

        ModuleRegistry.getAvailable().forEach(m => {
            const button = me.getReference('module-' + m.name);

            me.setTabVisible(m.name, shown.has(m.name) || !!me.openModules[m.name]?.popup);
            button && button.pressed !== (m.name === me.activeModule) && (button.pressed = m.name === me.activeModule)
        });

        me.updateWorkspaceButton()
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
     * The view keeps its state; closing the window puts it back into its panel.
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
            // the panel; a panel in a hidden tab has no size: the workspace
            rect    : await me.popupRect(entry),
            // bound to this entry: the module may be closed and opened again before the popup reports
            onAdopt : popupView => me.moveModuleToWindow(entry, popupView),
            onClose : popupView => me.dockModule(entry, popupView),
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
     * @param {Object} entry
     * @returns {Promise<Object>}
     * @protected
     */
    async popupRect(entry) {
        const rect = entry.host.mounted ? await entry.host.getDomRect() : null;

        return rect?.width ? rect : this.getReference('modules').getDomRect()
    }

    /**
     * @param {Object} entry openModules entry
     * @param {GO.view.PopupView} popupView
     */
    moveModuleToWindow(entry, popupView) {
        let me     = this,
            name   = entry.name,
            module = ModuleRegistry.get(name);

        if (entry.closed || entry.host.isDestroyed) {
            return
        }

        entry.placeholder = entry.host.add({
            ntype : 'container',
            cls   : ['go-module-placeholder'],
            layout: {ntype: 'vbox', align: 'center', pack: 'center'},
            items : [{
                ntype: 'component',
                cls  : ['go-empty'],
                text : t('{module} is open in a separate window.').replace('{module}', escapeHtml(module?.title || name))
            }, {
                module : Button,
                iconCls: 'fa fa-down-left-and-up-right-to-center',
                text   : t('Bring it back'),
                handler: () => entry.popup?.name && closePopup(entry.popup.name, me.windowId)
            }]
        });

        entry.host.remove(entry.view, false);

        entry.view.set({appName: popupView.appName, windowId: popupView.windowId});
        popupView.add(entry.view);
        me.syncTabs()
    }

    /**
     * The popup window closed: the module view goes back to its panel
     * @param {Object} entry openModules entry
     * @param {GO.view.PopupView} popupView
     */
    dockModule(entry, popupView) {
        let me   = this,
            view = popupView.items[0];

        // silent: the popup window is gone, there is no DOM to update
        view && popupView.remove(view, false, true);

        // the opener closed first, or the panel was closed meanwhile: the view and its host go, once
        if (me.isDestroyed || entry.closed || entry.host.isDestroyed || entry.view !== view || me.openModules[entry.name] !== entry) {
            entry.popup = null;
            view?.destroy();
            // the host of a closed panel (destroyModule() left it for the popup)
            const orphan = me.isDestroyed || entry.closed || me.openModules[entry.name] !== entry;
            orphan && !entry.host.isDestroyed && entry.host.destroy(true);
            return
        }

        entry.popup = null;
        view.set({appName: me.appName, windowId: me.windowId});
        entry.placeholder && entry.host.remove(entry.placeholder);
        entry.placeholder = null;
        entry.host.add(view);
        me.syncTabs()
    }

    /**
     * Closes a module tab: its panel leaves the workspace (the neighbour takes the space) and
     * its view is destroyed, until the module is opened again (main menu, link).
     * @param {String} name
     */
    closeModule(name) {
        this.removeModules([name])
    }

    /**
     * @param {String|null} keep module to keep open, null closes all
     */
    closeModules(keep = null) {
        this.removeModules(Object.values(this.panels).map(p => p.module).filter(name => name !== keep), keep)
    }

    /**
     * Closes modules, then navigates once: to `prefer`, the focused module or nothing ("#")
     * @param {String[]} names
     * @param {String|null} [prefer]
     * @protected
     */
    async removeModules(names, prefer = null) {
        let me = this,
            ws = me.getReference('modules');

        for (const name of names) {
            const entry = me.openModules[name];

            // still loading: cancel it
            delete me.openTokens[name];

            if (entry) {
                // the panelClose event cleans up (onPanelClose())
                await ws.closePanel(entry.panelId)
            }
        }

        if (prefer && me.openModules[prefer]) {
            await ws.showPanel(me.openModules[prefer].panelId, {title: ModuleRegistry.get(prefer)?.title});
            me.routeToPanel(prefer)
        } else if (!me.focusedModule()) {
            replaceRoute(me.windowId, '')
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

}

export default Neo.setupClass(MainView);
