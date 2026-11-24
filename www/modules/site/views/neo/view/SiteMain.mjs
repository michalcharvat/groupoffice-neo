import Container from '../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Toolbar   from '../../../../../views/neo/node_modules/neo.mjs/src/toolbar/Base.mjs';
import Button    from '../../../../../views/neo/src/button/Button.mjs';
import Splitter  from '../../../../../views/neo/src/component/Splitter.mjs';
import client    from '../../../../../views/neo/src/jmap/Client.mjs';
import {notify, notifyError} from '../../../../../views/neo/src/Notify.mjs';
import {escapeHtml, decodeEntities} from '../../../../../views/neo/src/Format.mjs';
import {t as coreT, translator} from '../../../../../views/neo/src/Translate.mjs';
import {LEVEL_DELETE, LEVEL_WRITE} from '../../../../../views/neo/src/Acl.mjs';
import ConfirmDialog from '../../../../../views/neo/src/view/ConfirmDialog.mjs';
import MainThreeColumnPanel from '../../../../../views/neo/src/view/MainThreeColumnPanel.mjs';
import ContentPanel from './ContentPanel.mjs';
import SiteTree     from './SiteTree.mjs';

const t = translator('legacy', 'site');

/**
 * Website Manager (GO.site.MainPanel): the tree of sites, their content and menus in the
 * west, the content editor in the center and the Markdown cheat sheet in the east
 * (site/site/cheatSheet). The menus of the tree's nodes open the site, content, menu and
 * menu item dialogs (GO.site.treeNodes.*).
 *
 * Unlike the default MainThreeColumnPanel the center (the editor) flexes and the east has a
 * fixed width; the east splitter resizes the panel after it.
 */
class SiteMain extends MainThreeColumnPanel {
    static config = {
        className: 'GO.site.view.SiteMain',
        baseCls  : ['go-main-3-col', 'go-mobile-cards', 'go-site', 'neo-container'],
        stateName: 'site',
        /**
         * Route prefix, set by the shell
         * @member {String|null} moduleName=null
         */
        moduleName: null
    }

    /**
     * Site id → the user's level on its ACL (site/site/load permission_level)
     * @member {Map} siteLevels
     */
    siteLevels = new Map()

    createWest() {
        let me = this;

        return {
            module: Container,
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Toolbar,
                flex  : 'none',
                cls   : ['go-bg-mid', 'go-border-bottom'],
                items : [{
                    ntype: 'component',
                    cls  : ['go-toolbar-heading'],
                    text : t('Website Manager')
                }, '->', {
                    module : Button,
                    icon   : 'refresh',
                    tooltip: coreT('Refresh'),
                    handler: () => me.reloadTree()
                }, me.hideWestButton()]
            }, {
                module   : SiteTree,
                reference: 'tree',
                flex     : 1,
                rowMenu  : node => me.nodeMenu(node),
                listeners: {
                    load         : ({nodes}) => me.loadSiteLevels(nodes),
                    nodeSelect   : ({node}) => me.onNodeSelect(node),
                    contentToMenu: data => me.contentToMenu(data),
                    error        : ({error}) => notifyError(me, error)
                }
            }]
        }
    }

    createCenter() {
        let me = this;

        return {
            module    : ContentPanel,
            reference : 'content',
            startItems: [me.showWestButton()],
            endItems  : [{
                module : Button,
                icon   : 'help',
                tooltip: t('Cheat sheet'),
                handler: () => me.setCheatSheetShown(me.getReference('east').hidden)
            }],
            listeners: {
                saved   : data => me.onContentSaved(data),
                advanced: ({id}) => me.openContentDialog(id)
            }
        }
    }

    createEast() {
        let me = this;

        return {
            module: Container,
            layout: {ntype: 'vbox', align: 'stretch'},
            items : [{
                module: Toolbar,
                flex  : 'none',
                cls   : ['go-bg-mid', 'go-border-bottom'],
                items : [{
                    ntype: 'component',
                    cls  : ['go-toolbar-heading'],
                    text : t('Cheat sheet')
                }, '->', {
                    module : Button,
                    icon   : 'close',
                    tooltip: coreT('Close'),
                    handler: () => me.setCheatSheetShown(false)
                }]
            }, {
                ntype    : 'component',
                reference: 'cheatSheet',
                cls      : ['go-scroll', 'go-pad'],
                flex     : 1
            }]
        }
    }

    /**
     * MainThreeColumnPanel's items with a flexing center and a fixed east (GO.site.MainPanel:
     * west 300px, east 500px)
     */
    createItems() {
        let me = this;

        const panel = (config, cls, extra) => ({...config, cls: [...(config.cls || []), ...[cls].flat()], ...extra});

        me._items = [
            panel(me.createWest(), 'go-west', {reference: 'west', flex: 'none', width: '30rem', minWidth: '14rem'}),
            {module: Splitter, reference: 'westSplitter', stateId: 'site-west-splitter'},
            panel(me.createCenter(), ['go-center', 'go-active'], {flex: 1, minWidth: '30rem'}),
            {module: Splitter, reference: 'eastSplitter', resizeTarget: 'next', stateId: 'site-east-splitter'},
            panel(me.createEast(), 'go-east', {reference: 'east', flex: 'none', width: '50rem', minWidth: '14rem'})
        ];

        Container.prototype.createItems.call(me)
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('content').tree = me.getReference('tree');
        me.loadCheatSheet()
    }

    /**
     * site/site/cheatSheet sends Markdown examples in a <pre>: shown as text, so the HTML in
     * the examples stays visible instead of being rendered
     * @returns {Promise<void>}
     */
    async loadCheatSheet() {
        let me = this;

        try {
            const html = await client.legacyText('site/site/cheatSheet'),
                  text = decodeEntities(html.replace(/^\s*<pre[^>]*>/i, '').replace(/<\/pre>\s*$/i, ''));

            me.isDestroyed || (me.getReference('cheatSheet').html = `<pre class="go-site-cheatsheet" style="margin:0;padding:0 var(--go-gap, 8px);white-space:pre-wrap;font-family:monospace">${escapeHtml(text.trim())}</pre>`)
        } catch (e) {
            console.error('Site cheat sheet', e)
        }
    }

    /**
     * @param {Boolean} shown
     */
    setCheatSheetShown(shown) {
        this.getReference('east').hidden         = !shown;
        this.getReference('eastSplitter').hidden = !shown
    }

    /**
     * The user's level on each site: the menus and the editor offer changes only with write
     * permission (the controllers check it, ExtJS showed the server's error). The tree lists
     * only sites the user can read.
     * @param {Object[]} nodes the tree's root nodes (sites)
     * @returns {Promise<void>}
     */
    async loadSiteLevels(nodes) {
        let me    = this,
            apply = () => {
                if (!me.isDestroyed) {
                    me.getReference('tree').mayChange = siteId => me.mayChange(siteId);
                    me.getReference('content').setMayWrite(siteId => me.mayChange(siteId))
                }
            };

        apply();

        await Promise.all(nodes.filter(node => node.site.type === 'site').map(async node => {
            let level = 0;

            try {
                const {data} = await client.legacy('site/site/load', {id: node.site.siteId}, {method: 'GET'});
                level = +data.permission_level || 0
            } catch (e) {
                // site/site/load (renderForm) refuses without write permission
            }

            me.siteLevels.set(String(node.site.siteId), level);
            apply()
        }))
    }

    /**
     * @param {String|Number} siteId
     * @param {Number} [level]
     * @returns {Boolean} the user has the level on the site (not known yet: false)
     */
    mayChange(siteId, level=LEVEL_WRITE) {
        const known = this.siteLevels.get(String(siteId));
        return known !== undefined && known >= level
    }

    reloadTree() {
        return this.getReference('tree').reload().catch(e => notifyError(this, e))
    }

    /**
     * A click on a node: content items open in the editor
     * @param {Object} node
     */
    async onNodeSelect(node) {
        const content = this.getReference('content');

        if (node.site.type === 'content' && node.site.modelId && String(content.current?.id) !== String(node.site.modelId)) {
            if (!await content.confirmLeave()) {
                return
            }
            content.load(node.site.modelId);
            this.activatePanel('center')
        }
    }

    /**
     * After a save the tree shows the new title and selects the item
     * @param {Object} data {id, siteId}
     */
    async onContentSaved({id, siteId}) {
        let me      = this,
            tree    = me.getReference('tree'),
            nodeId  = `${siteId}_content_${id}`,
            parents = [];

        await me.reloadTree();

        if (me.isDestroyed || !tree.getNode(nodeId)) {
            return
        }

        // the first item of a folder: the folder came back collapsed (an empty one can't be
        // expanded, so its state wasn't saved); open the item's ancestors to show it
        for (let parent = tree.getParentNode(nodeId); parent; parent = tree.getParentNode(parent.id)) {
            parents.unshift(parent.id)
        }

        for (const parentId of parents) {
            await tree.expand(parentId)
        }

        const record = !me.isDestroyed && tree.store.get(nodeId);

        if (record) {
            tree.selectionModel.select(record);
            Neo.main.DomAccess.scrollIntoView({id: tree.getItemId(record), behavior: 'auto', block: 'nearest', windowId: me.windowId})
                .catch(() => {})
        }
    }

    /**
     * Menu of a tree node (GO.site.treeNodes.*Node contextmenu())
     * @param {Object} node
     * @returns {Object[]}
     */
    nodeMenu(node) {
        let me     = this,
            {siteId, type, modelId} = node.site,
            write  = me.mayChange(siteId),
            remove = me.mayChange(siteId, LEVEL_DELETE),
            items  = list => list.filter(item => !item.change || (item.change === 'delete' ? remove : write));

        switch (type) {
            case 'site':
                return items([
                    {text: coreT('View'), icon: 'open_in_new', handler: () => me.openUrl(client.baseUrl + 'modules/site/index.php?site_id=' + encodeURIComponent(siteId))},
                    {text: t('Properties'), icon: 'settings', change: 'write', handler: () => me.openSiteDialog(siteId)}
                ]);

            case 'content':
                if (!modelId) {
                    return items([{text: t('Add content'), icon: 'add', change: 'write', handler: () => me.addContent(siteId)}])
                }
                return items([
                    {text: t('Advanced options'), icon: 'settings', change: 'write', handler: () => me.openContentDialog(modelId)},
                    {text: coreT('View'), icon: 'open_in_new', handler: () => me.openUrl(client.baseUrl + 'modules/site/index.php?site_id=' + encodeURIComponent(siteId) + '&slug=' + encodeURIComponent(node.slug || ''))},
                    {text: t('Add content'), icon: 'add', change: 'write', handler: () => me.addContent(siteId, modelId)},
                    {text: t('Delete content'), icon: 'delete', change: 'delete', handler: () => me.deleteContent(node)}
                ]);

            case 'menu':
                if (!modelId) {
                    return items([{text: t('Add menu'), icon: 'add', change: 'write', handler: () => me.openMenuDialog(siteId, null)}])
                }
                return items([
                    {text: t('Properties'), icon: 'settings', change: 'write', handler: () => me.openMenuDialog(siteId, modelId)},
                    {text: t('New item'), icon: 'add', change: 'write', handler: () => me.openMenuItemDialog(modelId, null)},
                    {text: t('Delete'), icon: 'delete', change: 'delete', handler: () => me.deleteMenu(node)}
                ]);

            case 'menuitem':
                return items([
                    {text: t('Properties'), icon: 'settings', change: 'write', handler: () => me.openMenuItemDialog(node.menuId, modelId)},
                    {text: t('New item'), icon: 'add', change: 'write', handler: () => me.openMenuItemDialog(node.menuId, null, modelId)},
                    {text: t('Delete'), icon: 'delete', change: 'delete', handler: () => me.deleteMenuItem(node)}
                ]);
        }

        return []
    }

    /**
     * @param {String} url
     */
    openUrl(url) {
        Neo.Main.windowOpen({url, windowId: this.windowId, windowName: '_blank'})
    }

    /**
     * @param {String|Number} siteId
     * @param {String|Number|null} parentId
     */
    async addContent(siteId, parentId=null) {
        const content = this.getReference('content');

        if (!await content.confirmLeave()) {
            return
        }
        content.create(siteId, parentId);
        this.activatePanel('center')
    }

    /**
     * Opens a dialog module and reloads the tree after a save
     * @param {Function} load () => import(...)
     * @param {Object} config of the dialog's open()
     * @param {Function} [afterSave]
     * @protected
     */
    async openDialog(load, config, afterSave) {
        let me = this;

        try {
            const {default: Dialog} = await load(),
                  dialog = await Dialog.open({appName: me.appName, windowId: me.windowId, ...config});

            dialog.on('save', () => {
                me.reloadTree();
                afterSave?.()
            })
        } catch (e) {
            notifyError(me, e)
        }
    }

    openSiteDialog(id) {
        this.openDialog(() => import('./SiteDialog.mjs'), {id})
    }

    openContentDialog(id) {
        let me = this;

        me.openDialog(() => import('./ContentDialog.mjs'), {id}, () => {
            // the editor shows the item: reload it like ExtJS (the dialog saved other fields)
            const content = me.getReference('content');
            String(content.current?.id) === String(id) && !content.isDirty() && content.load(id)
        })
    }

    openMenuDialog(siteId, id) {
        this.openDialog(() => import('./MenuDialog.mjs'), {siteId, id})
    }

    openMenuItemDialog(menuId, id, parentId=null) {
        this.openDialog(() => import('./MenuItemDialog.mjs'), {menuId, id, parentId})
    }

    /**
     * Asks, calls a delete route and reloads the tree
     * @param {Object} options title, message, route, params, refused (text when the node has children), node
     * @returns {Promise<Boolean>} deleted
     * @protected
     */
    async confirmDelete({node, refused, title, message, route, params}) {
        let me = this;

        // GO.ErrorDialog in ExtJS; a refusal, not a failure: no error in the console
        if (node.hasChildren) {
            notify(me, refused, {title: title, iconCls: 'fa fa-triangle-exclamation'});
            return false
        }

        if (!await ConfirmDialog.ask({appName: me.appName, windowId: me.windowId, title, message}) || me.isDestroyed) {
            return false
        }

        try {
            await client.legacy(route, params);
            me.reloadTree();
            return true
        } catch (e) {
            notifyError(me, e);
            return false
        }
    }

    async deleteContent(node) {
        let me = this;

        const deleted = await me.confirmDelete({
            node,
            refused: t('You cannot delete this item because it has subitems. Please delete the subitems first.'),
            title  : t('Delete content'),
            message: t('Are you sure that you want to delete this content item'),
            route  : 'site/content/delete',
            params : {id: node.site.modelId}
        });

        const content = me.getReference('content');
        deleted && String(content.current?.id) === String(node.site.modelId) && content.clear()
    }

    deleteMenu(node) {
        return this.confirmDelete({
            node,
            refused: t('The selected menu-item has children and cannot be deleted.'),
            title  : t('Delete menu item'),
            message: t('Do you really want to delete this menu item?'),
            route  : 'site/menu/delete',
            params : {id: node.site.modelId, site_id: node.site.siteId}
        })
    }

    deleteMenuItem(node) {
        return this.confirmDelete({
            node,
            refused: t('The selected menu-item has children and cannot be deleted.'),
            title  : t('Delete menu item'),
            message: t('Do you really want to delete this menu item?'),
            route  : 'site/menuItem/delete',
            params : {id: node.site.modelId, menu_id: node.menuId}
        })
    }

    /**
     * A content item dropped on a menu or menu item becomes a menu item there
     * (GO.site.treeNodes.ContentNode beforeNodeDrop())
     * @param {Object} data {content, target} tree nodes
     */
    async contentToMenu({content, target}) {
        let me = this;

        const yes = await ConfirmDialog.ask({
            appName : me.appName,
            windowId: me.windowId,
            title   : t('Create menu item from content'),
            message : t('Are you sure that you want to create a menu item from this content item?')
        });

        if (!yes || me.isDestroyed) {
            return
        }

        try {
            await client.legacy('site/menuItem/createFromContent', {
                target : JSON.stringify(target.site),
                content: JSON.stringify(content.site)
            });
            me.reloadTree()
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(SiteMain);
