import Button        from '../../button/Button.mjs';
import Component     from '../../../node_modules/neo.mjs/src/component/Base.mjs';
import MainThreeColumnPanel from '../../view/MainThreeColumnPanel.mjs';
import Splitter      from '../../component/Splitter.mjs';
import Page, {h3, p, pageOf} from './Page.mjs';
import {print}       from '../../print.mjs';
import {notifyError} from '../../Notify.mjs';
import {t}           from '../../Translate.mjs';

/**
 * Box with a coloured dashed border, like the GOUI docs layout examples
 * @param {String} text
 * @param {String} color
 * @param {Object} [config]
 * @returns {Object}
 */
function box(text, color, config = {}) {
    return {module: Component, text, ...config, style: {border: `1px dashed ${color}`, padding: '8px', ...config.style}}
}

/**
 * @summary A module layout whose east starts hidden, like a planning board before a bar opens its detail
 */
class DemoThreeColumns extends MainThreeColumnPanel {
    static config = {
        className : 'GO.dev.demo.DemoThreeColumns',
        eastHidden: true
    }

    /**
     * @summary The west box.
     */
    createWest() {
        return box(t('West'), 'red')
    }

    /**
     * @summary The center with the open and close buttons.
     */
    createCenter() {
        return {
            ntype : 'container',
            layout: {ntype: 'vbox', align: 'start'},
            style : {border: '1px dashed blue', gap: '8px', padding: '8px'},
            items : [
                {module: Button, text: t('Open detail'), handler: 'up.onOpenDetail'},
                {module: Button, text: t('Close detail'), handler: 'up.onCloseDetail'}
            ]
        }
    }

    /**
     * @summary The east with a close button (a phone shows only this card).
     */
    createEast() {
        return {
            ntype : 'container',
            layout: {ntype: 'vbox', align: 'start'},
            style : {border: '1px dashed green', gap: '8px', padding: '8px'},
            items : [{module: Component, text: t('East')}, {module: Button, text: t('Close detail'), handler: 'up.onCloseDetail'}]
        }
    }

    /**
     * @summary Shows the east panel, as a row click would.
     */
    onOpenDetail() {
        this.activatePanel('east')
    }

    /**
     * @summary Hides the east panel again.
     */
    onCloseDetail() {
        this.setEastHidden(true)
    }
}

Neo.setupClass(DemoThreeColumns);

/**
 * Dev demo: GOUI Layout (goui-docs Layout.ts). GOUI builds layouts with CSS classes
 * (hbox, vbox, gap); neo uses layout configs on the container: {ntype: 'hbox'},
 * {ntype: 'vbox'}, {ntype: 'card'}, and flex / width / height on the items.
 */
class Layout extends Page {
    static config = {
        className: 'GO.dev.demo.Layout',
        heading  : t('Layout')
    }

    /**
     * @summary The demo sections of the page.
     * @returns {Object[]}
     */
    pageItems() {
        return [
            p(t("Layouts are layout configs of a container: layout: {ntype: 'hbox'} or {ntype: 'vbox'}, items take a fixed width / height or a flex share. The gap is a style.")),
            h3('hbox'),
            {
                ntype : 'container',
                layout: {ntype: 'hbox', align: 'stretch'},
                style : {gap: '8px'},
                items : [box(t('Left'), 'red', {width: 100}), box(t('Center'), 'blue', {flex: 1}), box(t('Right'), 'green', {width: 100})]
            },
            h3('vbox'),
            {
                ntype : 'container',
                layout: {ntype: 'vbox', align: 'stretch'},
                height: 300,
                style : {gap: '8px'},
                items : [box(t('Top'), 'red', {height: 72}), box(t('Center'), 'blue', {flex: 1}), box(t('Bottom'), 'green', {height: 72})]
            },
            h3(t('Surface color')),
            p(t('The theme variables --bg-lowest … --bg-highest distinguish the surfaces of the application; the class go-bg-mid sets the mid one, go-card puts a white card on it.')),
            {
                ntype: 'container',
                cls  : ['go-card'],
                style: {margin: 0, overflow: 'hidden'},
                items: ['lowest', 'low', 'mid', 'high', 'highest'].map(level => ({
                    module: Component,
                    text  : `--bg-${level}`,
                    style : {background: `var(--bg-${level})`, padding: '12px'}
                }))
            },
            h3(t('Splitter')),
            p(t('GO.component.Splitter resizes its previous (or, with resizeTarget: \'next\', its next) sibling; with a stateId it remembers the size like GOUI. In a vbox it needs direction: \'horizontal\'. Try resizing the panels.')),
            {
                ntype : 'container',
                layout: {ntype: 'hbox', align: 'stretch'},
                height: 100,
                items : [
                    box(t('Left'), 'red', {width: 120, minWidth: 60}),
                    {module: Splitter},
                    box(t('Center'), 'blue', {flex: 1, minWidth: 60}),
                    {module: Splitter, resizeTarget: 'next'},
                    box(t('Right'), 'green', {width: 120, minWidth: 60})
                ]
            },
            {
                ntype : 'container',
                layout: {ntype: 'vbox', align: 'stretch'},
                height: 300,
                items : [
                    box(t('Top'), 'red', {height: 80, minHeight: 30}),
                    {module: Splitter, direction: 'horizontal'},
                    box(t('Middle'), 'blue', {flex: 1, minHeight: 60}),
                    {module: Splitter, direction: 'horizontal', resizeTarget: 'next'},
                    box(t('Bottom'), 'green', {height: 80, minHeight: 30})
                ]
            },
            h3(t('Module layout')),
            p(t("GO.view.MainThreeColumnPanel with eastHidden: true: the center takes the free width until activatePanel('east') shows the detail; setEastHidden(true) hides it again and the center flexes once more.")),
            {module: DemoThreeColumns, height: 240},
            h3(t('Cards')),
            p(t("layout: {ntype: 'card'} shows one item at a time, see the Card container page.")),
            h3(t('Print')),
            box(t('Only this element will be printed with the button below'), 'gray', {reference: 'printBox'}),
            {
                module : Button,
                ui     : 'secondary',
                icon   : 'print',
                text   : t('Print'),
                style  : {alignSelf: 'start'},
                handler: data => {
                    const page = pageOf(data.component);
                    print(page.getReference('printBox'), {title: t('Layout')}).catch(e => notifyError(page, e))
                }
            }
        ]
    }
}

export default Neo.setupClass(Layout);
