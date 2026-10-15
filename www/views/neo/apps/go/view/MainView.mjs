import Button         from '../../../node_modules/neo.mjs/src/button/Base.mjs';
import Container      from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import HashHistory    from '../../../node_modules/neo.mjs/src/util/HashHistory.mjs';
import Toolbar        from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import GoButton       from '../../../src/button/Button.mjs';
import MenuList       from '../../../src/menu/List.mjs';
import {avatarColor, initials} from '../../../src/Format.mjs';
import client         from '../../../src/jmap/Client.mjs';
import GlobalSearch   from '../../../src/view/GlobalSearch.mjs';
import ModuleRegistry from '../../../src/ModuleRegistry.mjs';
import {notifyError}           from '../../../src/Notify.mjs';
import {closePopup, openPopup} from '../../../src/Popup.mjs';
import {t} from '../../../src/Translate.mjs';

// header menus open below their button, right edges aligned (they sit at the right)
const RIGHT = {edgeAlign: 't100-b100'};

/**
 * Top bar with the module menu and the user, below it one card per opened module.
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

    onConstructed() {
        super.onConstructed();

        let me        = this,
            available = ModuleRegistry.getAvailable();

        const userName = client.user?.displayName || client.user?.username || '';

        me.getReference('topbar').add([{
            // GO header logo (views/Extjs3/themes/Paper/img/logo-white.svg, see go.css)
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
            // not route: neo renders it as <a href="#name">, which <base href> turns
            // into views/neo/apps/go/#name
            handler  : () => Neo.Main.setRoute({value: m.name, windowId: me.windowId}),
            text     : m.title
        }, {
            module   : Button,
            cls      : ['go-module-popout'],
            iconCls  : 'fa fa-up-right-from-square',
            reference: 'popout-' + m.name,
            tooltip  : t('Open in new window'),
            handler  : () => me.popOutModule(m.name)
        }, {
            module   : Button,
            cls      : ['go-module-close'],
            iconCls  : 'fa fa-xmark',
            reference: 'close-' + m.name,
            tooltip  : t('Close'),
            handler  : () => me.closeModule(m.name)
        }]),
        '->', {
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
            module : GoButton,
            icon   : 'apps',
            cls    : ['go-header-button'],
            tooltip: t('Main menu'),
            menu   : {align: RIGHT, items: available.map(m => ({
                text   : m.title,
                icon   : m.icon || 'apps',
                handler: () => Neo.Main.setRoute({value: m.name, windowId: me.windowId})
            }))}
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

        me.getReference('search').resolveRoute = (entity, id) => {
            const module = available.find(m => m.routes?.[entity]);
            return module ? `${module.name}/${module.routes[entity](id)}` : null
        };

        // load the module code now: a popout click must reach window.open() while the
        // browser still counts it as user activation
        available.forEach(m => m.mainView().catch(() => {}));

        me.onHashChange = me.onHashChange.bind(me);
        HashHistory.on('change', me.onHashChange);

        // shared worker: neo pushes the initial hash only for the first window,
        // later windows find it in their window config
        const current = HashHistory.first(me.windowId) || Neo.windowConfigs?.[me.windowId]?.hash;

        if (current) {
            me.onHashChange(current)
        } else if (available.length === 1) {
            // only one module: open it right away
            Neo.Main.setRoute({value: available[0].name, windowId: me.windowId})
        } else {
            me.getReference('modules').layout.activeIndex = 0
        }
    }

    destroy(...args) {
        HashHistory.un('change', this.onHashChange);
        super.destroy(...args)
    }

    async onHashChange({hashString, windowId}) {
        // HashHistory is shared by all windows of the App worker
        if (windowId && windowId !== this.windowId) {
            return
        }

        let me              = this,
            [name, ...rest] = (hashString || '').split('/'),
            module          = ModuleRegistry.getAvailable().find(m => m.name === name);

        me.routeModule = module?.name || null;

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
        me.setPopoutDisabled(name, true);

        const popupName = await openPopup({
            id      : entry.view.id,
            windowId: me.windowId,
            // the cards area: an inactive card has no size
            rect    : await me.getReference('modules').getDomRect(),
            onAdopt : popupView => me.moveModuleToWindow(name, popupView),
            onClose : popupView => me.dockModule(name, popupView),
            onFailed: () => {
                entry.popup = null;
                me.isDestroyed || me.setPopoutDisabled(name, false)
            }
        });

        if (popupName) {
            entry.popup.name = popupName
        } else {
            entry.popup = null;
            me.setPopoutDisabled(name, false);
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
                text : `${module?.title || name} is open in a separate window.`
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

        me.syncActiveCard();

        me.setPopoutDisabled(name, false)
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
            items   : [{
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
     * Shows or hides a module's tab with its popout and close buttons
     * @param {String} name
     * @param {Boolean} visible
     */
    setTabVisible(name, visible) {
        ['module-', 'popout-', 'close-'].forEach(prefix => {
            const button = this.getReference(prefix + name);

            if (button && button.hidden === visible) {
                button.hidden = !visible
            }
        })
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

    /**
     * @param {String} name module
     * @param {Boolean} disabled
     */
    setPopoutDisabled(name, disabled) {
        const button = this.getReference('popout-' + name);

        if (button) {
            button.disabled = disabled
        }
    }
}

export default Neo.setupClass(MainView);
