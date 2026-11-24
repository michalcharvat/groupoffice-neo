import Button    from '../../button/Button.mjs';
import Component from '../../../node_modules/neo.mjs/src/component/Base.mjs';
import NeoTip    from '../../../node_modules/neo.mjs/src/tooltip/Base.mjs';
import {escapeHtml} from '../../Format.mjs';
import Page, {code, p} from './Page.mjs';
import {t}       from '../../Translate.mjs';

const LOREM = '<h3 style="margin:0">Lorem Ipsum Dolor Sit Amet</h3>' +
    '<p><strong>Lorem ipsum</strong> dolor sit amet, <em>consectetur</em> adipiscing elit. Nullam eget sapien nec urna facilisis dictum.</p>' +
    '<ul><li>Vestibulum ante ipsum primis</li><li>In faucibus orci luctus et</li><li>Ultrices posuere cubilia Curae</li></ul>' +
    '<blockquote style="margin:0">"Quisque facilisis, enim vel cursus dictum, velit erat pretium nisi."</blockquote>';

/**
 * Dev demo: GOUI Tooltip (goui-docs TooltipPage.ts). Every neo component has a
 * `tooltip` config (text, or a Neo.tooltip.Base config with html); one shared tooltip
 * serves them all. GO.button.Button shows its tooltip for icon-only buttons.
 */
class Tooltip extends Page {
    static config = {
        className: 'GO.dev.demo.Tooltip',
        heading  : t('Tooltip')
    }

    pageItems() {
        return [
            p(t('Any component takes a tooltip config: a text, or an object with the html of a larger tooltip:')),
            {
                module : Button,
                ui     : 'primary',
                text   : t('I have a tooltip'),
                style  : {alignSelf: 'start'},
                tooltip: t('Hello I am the tooltip!')
            },
            p(t('A larger tooltip with HTML (static HTML only: escape user data):')),
            {
                module : Button,
                ui     : 'primary',
                text   : t('I have a tooltip'),
                style  : {alignSelf: 'start'},
                tooltip: {html: LOREM, cls: ['go-dev-tooltip'], maxWidth: 400}
            },
            p(t('Icon buttons describe themselves with a tooltip:')),
            {
                module : Button,
                icon   : 'delete',
                style  : {alignSelf: 'start'},
                tooltip: t('Delete')
            },
            p(t('Many targets in one component (events of a calendar, rows of a list) share one Neo.tooltip.Base with a delegate selector; its html is set in targetOver (calendar CalendarView.createTooltip()). The targets must be vdom nodes of the component, not raw html. Hover the names:')),
            {
                module   : Component,
                // vdom nodes, not html: the delegate is looked up in the component's vdom
                vdom     : {cn: ['Anna', 'Bert', 'Carla'].map(name => ({
                    tag  : 'span',
                    data : {name},
                    text : name,
                    style: {marginRight: '16px', textDecoration: 'underline dotted'}
                }))}
            },
            code(`me.hoverTip = Neo.create({
    module     : Tooltip,          // Neo.tooltip.Base
    appName    : me.appName,
    windowId   : me.windowId,
    componentId: me.id,
    delegate   : '[data-name]',
    listeners  : {
        targetOver: ({data}) => {
            const node = data.path.find(n => n.id === data.currentTarget);
            me.hoverTip.html = escapeHtml(describe(node.data.name))
        }
    }
})`)
        ]
    }

    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);
        value && !this.hoverTip && this.createHoverTip()
    }

    createHoverTip() {
        const me = this;

        /** @member {Neo.tooltip.Base} hoverTip (not "tooltip": a Component config) */
        me.hoverTip = Neo.create({
            module     : NeoTip,
            appName    : me.appName,
            windowId   : me.windowId,
            componentId: me.id,
            delegate   : '[data-name]',
            listeners  : {
                targetOver: ({data}) => {
                    const node = data.path.find(n => n.id === data.currentTarget);
                    me.hoverTip.html = escapeHtml(`${node?.data?.name}: ${t('shared tooltip with a delegate')}`)
                }
            }
        })
    }

    destroy(...args) {
        this.hoverTip?.destroy();
        super.destroy(...args)
    }
}

export default Neo.setupClass(Tooltip);
