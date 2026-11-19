import Container  from '../../../../../views/neo/node_modules/neo.mjs/src/container/Base.mjs';
import Button     from '../../../../../views/neo/src/button/Button.mjs';
import {escapeHtml} from '../../../../../views/neo/src/Format.mjs';
import {notifyError} from '../../../../../views/neo/src/Notify.mjs';
import {t} from '../../../../../views/neo/src/Translate.mjs';

/**
 * One portlet on the start page (GO.summary.Portlet): a header with the portlet's icon and
 * title, refresh / settings when the portlet's view has refresh() / openSettings(), and a
 * menu to move or remove it. The body is the view of the registry entry
 * ({id, title, icon, view: () => import(...)}).
 *
 * A portlet view is a neo component; it may implement:
 * - refresh(): reload (header button "Refresh")
 * - openSettings(): its settings, saved by the view itself (header button "Settings")
 * - headerButtons(): more header button configs
 */
class Portlet extends Container {
    static config = {
        className: 'GO.summary.Portlet',
        baseCls  : ['go-portlet', 'neo-container'],
        layout   : {ntype: 'vbox', align: 'stretch'},
        /**
         * The registry entry
         * @member {Object|null} portlet=null
         */
        portlet: null,
        /**
         * The start page: moves and removes this portlet
         * @member {Object|null} startPage=null
         */
        startPage: null
    }

    /**
     * The portlet's view, once loaded
     * @member {Neo.component.Base|null} view=null
     */
    view = null

    construct(config) {
        super.construct(config);

        let me = this,
            {portlet} = me;

        me.items = [{
            ntype : 'container',
            cls   : ['go-portlet-header'],
            reference: 'header',
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            items : [{
                ntype: 'component',
                flex : 1,
                cls  : ['go-portlet-title'],
                html : `<i class="go-icon">${escapeHtml(portlet.icon || 'widgets')}</i><span>${escapeHtml(portlet.title)}</span>`
            }, {
                module : Button,
                icon   : 'more_vert',
                tooltip: t('More options'),
                menu   : [{
                    text   : t('Move up'),
                    icon   : 'arrow_upward',
                    handler: () => me.startPage.movePortlet(me, 'up')
                }, {
                    text   : t('Move down'),
                    icon   : 'arrow_downward',
                    handler: () => me.startPage.movePortlet(me, 'down')
                }, {
                    text   : t('Move to the other column'),
                    icon   : 'swap_horiz',
                    handler: () => me.startPage.movePortlet(me, 'column')
                }, {
                    text   : t('Remove'),
                    icon   : 'close',
                    handler: () => me.startPage.removePortlet(me)
                }]
            }]
        }, {
            ntype    : 'container',
            reference: 'body',
            cls      : ['go-portlet-body'],
            layout   : 'fit',
            items    : []
        }]
    }

    onConstructed() {
        super.onConstructed();
        this.loadView()
    }

    async loadView() {
        let me = this;

        try {
            const {default: View} = await me.portlet.view();

            if (me.isDestroyed) {
                return
            }

            me.view = me.getReference('body').add({module: View, portletId: me.portlet.id});

            const buttons = [
                ...me.view.headerButtons?.() || [],
                ...me.view.openSettings ? [{module: Button, icon: 'settings', tooltip: t('Settings'), handler: () => me.view.openSettings()}] : [],
                ...me.view.refresh ? [{module: Button, icon: 'refresh', tooltip: t('Refresh'), handler: () => me.view.refresh()}] : []
            ];

            // before the "more" menu
            buttons.length && me.getReference('header').insert(1, buttons)
        } catch (e) {
            notifyError(me, e)
        }
    }
}

export default Neo.setupClass(Portlet);
