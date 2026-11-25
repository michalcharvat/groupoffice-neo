import Component from '../../node_modules/neo.mjs/src/component/Base.mjs';
import Container from '../../node_modules/neo.mjs/src/container/Base.mjs';
import TextField from '../../node_modules/neo.mjs/src/form/field/Text.mjs';
import client    from '../jmap/Client.mjs';
import {getState, setState} from '../State.mjs';
import {focusWithoutTooltip} from '../tooltip.mjs';
import {t} from '../Translate.mjs';

/** keys the tiles handle themselves: no page scroll, no caret move, Tab stays inside */
const NAV_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' ', 'Tab'];

/**
 * Text of a title given as HTML, for searching
 * @param {String} html
 * @returns {String}
 */
function htmlText(html) {
    return String(html).replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
}

/** ms of the closing animation (AppLauncher.scss go-app-launcher-out) */
const CLOSE_MS = 150;

/**
 * Icon of a module like the GO 6.8 start menu: the core/moduleIcon blob, with the time the
 * cache was cleared so a new icon shows after an upgrade
 * @param {String|null} pkg package, null for legacy modules
 * @param {String} name module name
 * @returns {String}
 */
export function moduleIconUrl(pkg, name) {
    const mtime = client.session?.cacheClearedAt;

    return `${client.apiUrl}download.php?blob=${encodeURIComponent(`core/moduleIcon/${pkg || 'legacy'}/${name}`)}` +
        (mtime ? '&mtime=' + encodeURIComponent(mtime) : '')
}

/**
 * The user's main menu choice (My account → Look & feel): 'launcher' (default) or 'list'.
 * Stored in this browser per user, like the other neo view state (src/State.mjs).
 * @param {String} windowId
 * @returns {Promise<String>}
 */
export async function getMainMenuMode(windowId) {
    const {mode} = await getState(stateId(), windowId);

    return mode === 'list' ? 'list' : 'launcher'
}

/**
 * @param {String} mode 'launcher' or 'list'
 * @param {String} windowId
 * @returns {Promise<void>}
 */
export async function setMainMenuMode(mode, windowId) {
    await setState(stateId(), {mode: mode === 'list' ? 'list' : 'launcher'}, windowId)
}

function stateId() {
    return 'neo-main-menu-' + (client.user?.id || 0)
}

/**
 * GO 6.8 start menu (MainLayout.js startMenu, Paper _modules.scss #startMenu): a full-screen
 * overlay with the logo, a search field and a grid of the user's apps.
 *
 * - `setApps(apps)` gives the tiles: [{name, title, iconUrl, icon, badge, classic}]. `title` is
 *   HTML like the module titles of the registry (escape server text); `classic` marks an app
 *   that opens the classic client in a new tab. The launcher sorts them by title.
 * - A click, Enter or Space on a tile fires `open` {name, app}; Enter in the search field opens
 *   the first match. Shift+click or Shift+Enter fires `openBeside` {name, app, preventDefault()}
 *   for a later "open beside" (dock workspace); unless a listener calls preventDefault() the
 *   app opens as usual.
 * - Arrow keys, Home and End move between the tiles, ArrowUp from the first row back to the
 *   search field. Escape, a click outside the tiles and opening an app close it; focus goes back
 *   to the element given to `open(returnFocusId)`.
 * - `setBadge(name, text)` updates the count on a tile (src/Badges.mjs).
 * - `setRow(items)` shows a row of buttons above the tiles (a main view extension's entries, e.g. the
 *   workspaces of sf/workspaces): [{text, iconCls, pressed, title, onDrop, onDragHover}], `text` is
 *   HTML. A click, Enter or Space closes the launcher and fires `rowItem` {index, item}. Tab goes
 *   search field → row → tiles, ArrowLeft / ArrowRight move within the row.
 * - Tiles of neo apps can be dragged (main thread addon WS/DockDrag, only while the page has a drop
 *   target) onto a row button with `onDrop`: `rowDrop` {index, item, module} fires and the launcher
 *   stays open. Resting on a row button with `onDragHover` fires `rowDragHover` {index, item, module,
 *   seeThrough()}; once what it shows is ready a listener calls seeThrough(): the launcher turns
 *   see-through for the rest of that drag, so it goes on into what shows below (a workspace's
 *   dock), and closes when the drag ends.
 *
 * 6.8 shows the modules of its sub-menus (inSubmenu) in the grid as well, with the others; neo
 * has no sub-menus, so every app is a tile.
 */
class AppLauncher extends Container {
    static config = {
        className: 'GO.view.AppLauncher',
        baseCls  : ['go-app-launcher', 'neo-container'],
        hidden   : true,
        role     : 'dialog',
        layout   : {ntype: 'vbox', align: 'stretch'},
        items    : [{
            ntype : 'container',
            cls   : ['go-app-launcher-header'],
            flex  : 'none',
            layout: 'base',
            items : [{
                // the header logo: System settings → Appearance replaces it (go\core\webclient\Neo::brandingCss())
                module: Component,
                cls   : ['go-app-launcher-logo'],
                role  : 'img'
            }, {
                module         : TextField,
                reference      : 'field',
                cls            : ['go-app-launcher-search'],
                hideLabel      : true,
                clearable      : false,
                autoComplete   : false,
                placeholderText: t('Module name') + '...'
            }]
        }, {
            // setRow(): entries of main view extensions
            module   : Component,
            reference: 'row',
            cls      : ['go-app-launcher-row'],
            flex     : 'none',
            hidden   : true,
            role     : 'toolbar',
            vdom     : {cn: []}
        }, {
            module   : Component,
            reference: 'grid',
            cls      : ['go-app-launcher-grid'],
            flex     : 1,
            role     : 'listbox',
            vdom     : {cn: []}
        }]
    }

    /**
     * All tiles, sorted by title
     * @member {Object[]} apps=[]
     */
    apps = []

    /**
     * Tiles matching the search, in the order shown
     * @member {Object[]} shown=[]
     */
    shown = []

    /**
     * Index in `shown` of the tile with the focus, -1 in the search field
     * @member {Number} activeIndex=-1
     */
    activeIndex = -1

    /**
     * DOM id that gets the focus back on close
     * @member {String|null} returnFocusId=null
     */
    returnFocusId = null
    /**
     * How the launcher was opened ('pointer' | 'keyboard'), for the focus it gives back
     * @member {String|undefined} returnFocusModality=undefined
     */
    returnFocusModality = undefined

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.vdom['aria-label'] = t('Main menu');
        me.vdom['aria-modal'] = 'true';
        me.update();

        me.getReference('field').on('change', ({value}) => me.filter(value));

        // Tab in the search field goes to the tiles, not out of the overlay
        Neo.main.DomEvents.registerPreventDefaultKeys({
            id      : me.getReference('field').getInputElId(),
            keys    : ['Tab'],
            windowId: me.windowId
        });

        me.addDomListeners([
            {click  : me.onClick,   scope: me},
            {keydown: me.onKeyDown, scope: me},
            // dragging a tile (WS/DockDrag)
            {goDockDragStart: me.onTileDragStart, scope: me},
            {goDockDrop     : me.onRowDrop,      scope: me},
            {goDockDragHover: me.onRowDragHover, scope: me},
            {goDockDragEnd  : me.onTileDragEnd,  scope: me}
        ])
    }

    /**
     * @param {Object[]} apps [{name, title, iconUrl, icon, badge, classic}]
     */
    setApps(apps) {
        let me = this;

        me.apps = apps.map(app => ({...app, text: htmlText(app.title)})).sort((a, b) => a.text.localeCompare(b.text));
        me.filter(me.getReference('field').value)
    }

    /**
     * Buttons of the row above the tiles, see setRow()
     * @member {Object[]} rowItems=[]
     */
    rowItems = []

    /**
     * A tile is dragged on past a row button (rowDragHover): the launcher is see-through until the drag ends
     * @member {Boolean} dragThrough=false
     */
    dragThrough = false

    /**
     * The tile drag running now, a new object per drag (onTileDragStart())
     * @member {Object|null} tileDrag=null
     */
    tileDrag = null

    /**
     * Row buttons whose keys are registered, see setRow()
     * @member {Number} registeredRow=0
     */
    registeredRow = 0

    /**
     * The row of buttons above the tiles: [{text, iconCls, pressed, title}], text is HTML (escape user data)
     * @param {Object[]} items
     */
    setRow(items) {
        let me  = this,
            row = me.getReference('row');

        me.rowItems = items || [];

        row.vdom.cn = me.rowItems.map((item, index) => ({
            tag     : 'button',
            id      : me.rowId(index),
            cls     : ['go-app-launcher-row-item', ...item.pressed ? ['go-pressed'] : []],
            type    : 'button',
            // a tile can be dropped on it (WS/DockDrag)
            ...item.onDrop ? {'data-go-dock-tab': 'true'} : {},
            title   : item.title || null,
            tabIndex: index === 0 ? 0 : -1,
            cn      : [...item.iconCls ? [{tag: 'i', cls: [...item.iconCls.split(' '), 'go-app-launcher-row-icon']}] : [], {
                tag : 'span',
                // HTML, see above
                html: String(item.text)
            }]
        }));

        row.hidden = !me.rowItems.length;
        row.update();

        // Tab and the arrow keys move the focus (registered once per position, like the tiles)
        for (; me.registeredRow < me.rowItems.length; me.registeredRow++) {
            Neo.main.DomEvents.registerPreventDefaultKeys({
                id      : me.rowId(me.registeredRow),
                keys    : ['ArrowLeft', 'ArrowRight', 'Tab'],
                windowId: me.windowId
            })
        }
    }

    /**
     * @param {Number} index
     * @returns {String} DOM id of a row button
     */
    rowId(index) {
        return `${this.id}__row-${index}`
    }

    /**
     * @param {Object[]} path a dom event's path
     * @returns {Number} index of the row button in it, -1
     * @protected
     */
    rowIndexOf(path) {
        const node = path.find(node => node.cls?.includes('go-app-launcher-row-item'));

        return node ? Number(node.id.split('__row-')[1]) : -1
    }

    /**
     * A row button: the launcher closes, `rowItem` fires
     * @param {Number} index
     * @protected
     */
    launchRowItem(index) {
        let me   = this,
            item = me.rowItems[index];

        if (!item || !me.isOpen()) {
            return
        }

        me.close(false);
        me.fire('rowItem', {index, item})
    }

    /**
     * A tile dropped on a row button
     * @param {Object} data {module, path}
     * @protected
     */
    onRowDrop(data) {
        let me    = this,
            index = me.rowIndexOf(data.path || []),
            item  = me.rowItems[index];

        item?.onDrop && me.fire('rowDrop', {index, item, module: data.module})
    }

    /**
     * A tile drag starts: a new object per drag, see onRowDragHover()
     * @protected
     */
    onTileDragStart() {
        this.tileDrag = {}
    }

    /**
     * The pointer rested on a row button while dragging a tile: what shows below takes the drag on
     * (seeThrough(), called by the listener once it shows)
     * @param {Object} data {module, path}
     * @protected
     */
    onRowDragHover(data) {
        let me    = this,
            drag  = me.tileDrag,
            index = me.rowIndexOf(data.path || []),
            item  = me.rowItems[index];

        if (!drag || !item?.onDragHover || !me.isOpen()) {
            return
        }

        me.fire('rowDragHover', {index, item, module: data.module, seeThrough: () => {
            // the drag ended (or another one began) meanwhile
            if (me.tileDrag === drag && me.isOpen() && !me.dragThrough) {
                me.dragThrough = true;
                me.addCls('go-drag-through')
            }
        }})
    }

    /**
     * A tile drag ended: a see-through launcher goes, without an animation (it is invisible already)
     * @protected
     */
    onTileDragEnd() {
        let me = this;

        me.tileDrag = null;

        if (!me.dragThrough) {
            return
        }

        me.dragThrough = false;
        clearTimeout(me.closeTimer);
        me.closing = false;
        me.removeCls('go-drag-through');
        me.hidden = true
    }

    /**
     * Count on a tile (src/Badges.mjs)
     * @param {String} name app name
     * @param {String|null} text
     */
    setBadge(name, text) {
        const app = this.apps.find(app => app.name === name && !app.classic);

        if (app && (app.badge || null) !== (text || null)) {
            app.badge = text || null;
            this.renderTiles()
        }
    }

    /**
     * @param {String|null} [returnFocusId] DOM id that gets the focus back on close
     * @param {String} [modality] 'pointer' | 'keyboard': how the launcher was opened; a pointer
     *     open gives the focus back without a focus ring (Neo.main.DomAccess.focus() modality)
     */
    open(returnFocusId = null, modality = undefined) {
        let me = this;

        if (!me.hidden && !me.closing) {
            return
        }

        clearTimeout(me.closeTimer);
        me.closing       = false;
        me.dragThrough   = false;
        me.returnFocusId = returnFocusId;
        me.returnFocusModality = modality;
        me.activeIndex   = -1;
        me.removeCls(['go-closing', 'go-drag-through']);
        me.getReference('field').value = '';
        me.filter('');
        me.hidden = false;

        // 6.8: the search field gets the focus, not on touch devices (the keyboard would cover
        // the tiles): there the first tile, so Escape and the arrow keys still reach the launcher
        me.timeout(100).then(() => {
            if (!me.isDestroyed && me.isOpen()) {
                Neo.config.hasTouchEvents ? me.shown.length && me.focusTile(0) : me.getReference('field').focus()
            }
        })
    }

    /**
     * @param {Boolean} [restoreFocus=true]
     */
    close(restoreFocus = true) {
        let me = this;

        if (me.hidden || me.closing) {
            return
        }

        me.closing = true;
        me.addCls('go-closing');

        me.closeTimer = setTimeout(() => {
            if (me.isDestroyed || !me.closing) {
                return
            }

            me.closing = false;
            me.hidden  = true;
            me.removeCls('go-closing')
        }, CLOSE_MS);

        // the button gets the focus back, its tooltip doesn't show ("Main menu" stayed after Escape)
        restoreFocus && me.returnFocusId && focusWithoutTooltip(me, {id: me.returnFocusId, modality: me.returnFocusModality})
    }

    /**
     * @returns {Boolean} shown and not closing
     */
    isOpen() {
        return !this.hidden && !this.closing
    }

    destroy(...args) {
        let me       = this,
            windowId = me.windowId,
            // the main thread keeps a registration per id (a new launcher after a login adds its own)
            ids      = [me.getReference('field')?.getInputElId()];

        for (let i = 0; i < me.registeredTiles; i++) {
            ids.push(me.tileId(i))
        }

        for (let i = 0; i < me.registeredRow; i++) {
            ids.push(me.rowId(i))
        }

        clearTimeout(me.closeTimer);

        ids.filter(Boolean).forEach(id => {
            Promise.resolve(Neo.main.DomEvents.unregisterPreventDefaultKeys({id, windowId})).catch(() => {})
        });

        super.destroy(...args)
    }

    /**
     * 6.8: the module name and the title, lower case, both searched
     * @param {String} text
     * @protected
     */
    filter(text) {
        let me     = this,
            search = String(text || '').trim().toLowerCase();

        me.shown = search ? me.apps.filter(app =>
            (app.name.replace('-', '') + ' ' + app.text).toLowerCase().includes(search)) : me.apps;

        me.activeIndex = -1;
        me.renderTiles()
    }

    /**
     * @param {Number} index in `shown`
     * @returns {String} DOM id of the tile
     */
    tileId(index) {
        return `${this.id}__tile-${index}`
    }

    /**
     * Rebuilds the tiles
     * @protected
     */
    renderTiles() {
        let me   = this,
            grid = me.getReference('grid');

        grid.vdom.cn = me.shown.length ? me.shown.map((app, index) => ({
            id      : me.tileId(index),
            cls     : ['go-app-launcher-tile', ...app.classic ? ['go-classic'] : []],
            role    : 'option',
            // a neo app can be dragged into a workspace (WS/DockDrag)
            ...app.classic ? {} : {'data-go-module': app.name},
            tabIndex: index === Math.max(me.activeIndex, 0) ? 0 : -1,
            title   : app.classic ? t('Opens the classic UI in a new tab') : null,
            cn      : [{
                cls: ['go-app-launcher-icon'],
                cn : [app.iconUrl ? {
                    tag      : 'img',
                    src      : app.iconUrl,
                    alt      : '',
                    // the tile is dragged (WS/DockDrag), not its image
                    draggable: 'false'
                } : {
                    tag : 'i',
                    cls : ['go-icon'],
                    text: app.icon || 'apps'
                }, ...app.badge ? [{
                    cls : ['go-app-launcher-badge'],
                    text: String(app.badge)
                }] : [], ...app.classic ? [{
                    tag : 'i',
                    cls : ['go-icon', 'go-app-launcher-external'],
                    text: 'open_in_new'
                }] : []]
            }, {
                cls : ['go-app-launcher-title'],
                // HTML, see setApps()
                html: String(app.title)
            }]
        })) : [{
            cls : ['go-app-launcher-empty'],
            text: t('No items found')
        }];

        grid.update();

        // arrow keys and Space move between tiles, they must not scroll the grid (tile ids are
        // by position: register each once)
        for (; me.registeredTiles < me.shown.length; me.registeredTiles++) {
            Neo.main.DomEvents.registerPreventDefaultKeys({
                id      : me.tileId(me.registeredTiles),
                keys    : NAV_KEYS,
                windowId: me.windowId
            })
        }
    }

    /**
     * Tiles whose keys are registered, see renderTiles()
     * @member {Number} registeredTiles=0
     */
    registeredTiles = 0

    /**
     * @param {Object} data click dom event
     * @protected
     */
    onClick(data) {
        let me   = this,
            path = data.path || [],
            tile = path.find(node => node.cls?.includes('go-app-launcher-tile')),
            row  = me.rowIndexOf(path);

        if (tile) {
            me.launch(Number(tile.id.split('__tile-')[1]), !!data.shiftKey);
            return
        }

        if (row > -1) {
            me.launchRowItem(row);
            return
        }

        // 6.8: a click anywhere but the search field closes it
        path.some(node => node.cls?.includes('go-app-launcher-search')) || me.close()
    }

    /**
     * @param {Object} data keydown dom event
     * @protected
     */
    onKeyDown(data) {
        let me    = this,
            key   = data.key,
            path  = data.path || [],
            tile  = path.find(node => node.cls?.includes('go-app-launcher-tile')),
            index = tile ? Number(tile.id.split('__tile-')[1]) : -1,
            row   = me.rowIndexOf(path);

        if (key === 'Escape') {
            me.close();
            return
        }

        if (row > -1) {
            me.onRowKeyDown(row, key);
            return
        }

        // focus stays in the overlay: search field → row → tiles → search field
        if (key === 'Tab') {
            if (index < 0 && me.rowItems.length) {
                me.focusRow(0)
            } else if (index < 0 && me.shown.length) {
                me.focusTile(Math.max(me.activeIndex, 0))
            } else if (index >= 0) {
                me.getReference('field').focus()
            }

            return
        }

        if (index < 0) {
            // search field: Enter opens the first match (6.8), ArrowDown goes to the tiles
            if (key === 'Enter' && me.shown.length) {
                me.launch(0, !!data.shiftKey)
            } else if (key === 'ArrowDown' && me.shown.length) {
                me.focusTile(0)
            }

            return
        }

        if (key === 'Enter' || key === ' ') {
            me.launch(index, !!data.shiftKey);
            return
        }

        const last = me.shown.length - 1;

        switch (key) {
            case 'ArrowLeft':
                me.focusTile(Math.max(0, index - 1));
                break;
            case 'ArrowRight':
                me.focusTile(Math.min(last, index + 1));
                break;
            case 'Home':
                me.focusTile(0);
                break;
            case 'End':
                me.focusTile(last);
                break;
            case 'ArrowUp':
            case 'ArrowDown':
                me.moveRow(index, key === 'ArrowDown' ? 1 : -1);
                break;
        }
    }

    /**
     * A key on a row button. Enter and Space click it (a native button).
     * @param {Number} index
     * @param {String} key
     * @protected
     */
    onRowKeyDown(index, key) {
        let me   = this,
            last = me.rowItems.length - 1;

        if (key === 'Tab') {
            me.shown.length ? me.focusTile(Math.max(me.activeIndex, 0)) : me.getReference('field').focus()
        } else if (key === 'ArrowLeft') {
            me.focusRow(Math.max(0, index - 1))
        } else if (key === 'ArrowRight') {
            me.focusRow(Math.min(last, index + 1))
        }
    }

    /**
     * @param {Number} index
     * @protected
     */
    focusRow(index) {
        Neo.main.DomAccess.focus({id: this.rowId(index), windowId: this.windowId})
    }

    /**
     * ArrowUp / ArrowDown: the tile in the same column of the row above or below, the
     * search field above the first row. The columns follow the window width (auto-fill).
     * @param {Number} index
     * @param {Number} direction 1 down, -1 up
     * @protected
     */
    async moveRow(index, direction) {
        let me      = this,
            columns = await me.countColumns(),
            target  = index + direction * columns;

        if (me.isDestroyed) {
            return
        }

        if (target < 0) {
            me.activeIndex = -1;
            me.getReference('field').focus()
        } else if (target <= me.shown.length - 1) {
            me.focusTile(target)
        } else if (Math.floor(index / columns) < Math.floor((me.shown.length - 1) / columns)) {
            // the last row is shorter: its last tile
            me.focusTile(me.shown.length - 1)
        }
    }

    /**
     * @returns {Promise<Number>} tiles in the first row
     * @protected
     */
    async countColumns() {
        let me  = this,
            ids = me.shown.slice(0, 24).map((app, index) => me.tileId(index));

        if (ids.length < 2) {
            return 1
        }

        const rects = await me.getDomRect(ids),
              top   = rects[0]?.y;

        let columns = 0;

        while (columns < rects.length && Math.abs(rects[columns].y - top) < 2) {
            columns++
        }

        return Math.max(1, columns)
    }

    /**
     * @param {Number} index
     * @protected
     */
    focusTile(index) {
        let me = this;

        if (index !== me.activeIndex) {
            me.activeIndex = index;
            me.renderTiles()
        }

        Neo.main.DomAccess.focus({id: me.tileId(index), windowId: me.windowId})
    }

    /**
     * Opens an app: `openBeside` first with Shift, then `open` unless that was prevented
     * @param {Number} index in `shown`
     * @param {Boolean} beside Shift was held
     * @protected
     */
    launch(index, beside) {
        let me  = this,
            app = me.shown[index];

        // a key or click during the closing animation
        if (!app || !me.isOpen()) {
            return
        }

        if (beside) {
            let prevented = false;

            me.fire('openBeside', {name: app.name, app, preventDefault: () => {prevented = true}});

            if (prevented) {
                me.close(false);
                return
            }
        }

        // a classic app opens in another browser tab: the focus returns to the button here
        me.close(!!app.classic);
        me.fire('open', {name: app.name, app})
    }
}

export default Neo.setupClass(AppLauncher);
