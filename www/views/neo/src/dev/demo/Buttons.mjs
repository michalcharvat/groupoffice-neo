import Button       from '../../button/Button.mjs';
import ColorMenu    from '../../menu/ColorMenu.mjs';
import Component    from '../../../node_modules/neo.mjs/src/component/Base.mjs';
import MenuList     from '../../menu/List.mjs';
import SearchButton from '../../button/SearchButton.mjs';
import Toolbar      from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Page, {h3, output, p, pageOf} from './Page.mjs';
import {notify}     from '../../Notify.mjs';
import {t}          from '../../Translate.mjs';

/**
 * Click handler of the demo buttons: logs and shows a toast
 * @param {Object} data neo button handler data
 */
function onClick(data) {
    const button = data.component,
          page   = pageOf(button),
          msg    = `${t('You clicked')}: ${button.text || button.icon}`;

    page.log(msg);
    notify(page, msg)
}

/**
 * Row of buttons that wraps
 * @param {Object[]} items
 * @returns {Object}
 */
function row(items) {
    return {module: Toolbar, layout: {ntype: 'hbox', align: 'center', wrap: 'wrap'}, style: {gap: '8px', padding: 0}, items}
}

/**
 * Dev demo: GOUI Buttons (goui-docs Button.ts) with GO.button.Button: ui ghost (GOUI
 * default, flat), primary ("filled primary"), secondary ("outlined"); Material icons by
 * name; menus are GO.menu.List (icons, separators, submenus); GO.button.SearchButton;
 * a context menu with MenuList.showAt().
 */
class Buttons extends Page {
    static config = {
        className: 'GO.dev.demo.Buttons',
        heading  : t('Buttons')
    }

    pageItems() {
        const me = this;

        return [
            p(t('GO.button.Button is flat by default like GOUI. ui: \'primary\' is the filled primary button, ui: \'secondary\' the outlined one; icon names a Material Symbols icon.')),
            h3(t('Basic')),
            row([
                {module: Button, text: t('Basic'), handler: onClick},
                {module: Button, text: t('Primary'), ui: 'primary', handler: onClick},
                {module: Button, text: t('Secondary'), ui: 'secondary', handler: onClick},
                {module: Button, text: t('Disabled'), disabled: true, handler: onClick},
                {module: Button, text: t('Disabled'), ui: 'primary', disabled: true, handler: onClick}
            ]),
            h3(t('Icons from the Material font')),
            row([
                {module: Button, icon: 'more_vert', tooltip: t('More options'), handler: onClick},
                {module: Button, icon: 'close', ui: 'primary', handler: onClick},
                {module: Button, icon: 'save', ui: 'secondary', handler: onClick},
                {module: Button, icon: 'add', text: t('Add'), ui: 'primary', handler: onClick},
                {module: Button, icon: 'search', cls: ['small'], tooltip: t('Small'), handler: onClick},
                {module: Button, icon: 'delete', text: t('Disabled'), disabled: true, handler: onClick}
            ]),
            h3(t('Toggle')),
            row(['format_bold', 'format_italic', 'format_underlined'].map(icon => ({
                module : Button,
                icon,
                pressed: false,
                handler: data => {
                    const button = data.component;
                    button.pressed = !button.pressed;
                    pageOf(button).log(`${icon} pressed: ${button.pressed}`)
                }
            }))),
            h3(t('A toolbar with menu buttons')),
            {
                module: Toolbar,
                cls   : ['go-bg-mid', 'go-border-bottom'],
                items : [{
                    module: Button,
                    text  : t('Menu'),
                    menu  : [{
                        text : t('Alerts'),
                        icon : 'notifications',
                        items: [
                            {text: t('Success'), handler: () => notify(me, t('That went super!'), {iconCls: 'fa fa-circle-check'})},
                            {text: t('Error'), handler: () => notify(me, t('That went wrong!'), {title: t('Error'), iconCls: 'fa fa-triangle-exclamation', closable: true})},
                            {text: t('Notice'), handler: () => notify(me, t('Heads up.'))}
                        ]
                    }, {
                        text   : t('Mask 1s'),
                        icon   : 'hourglass_empty',
                        handler: () => {
                            me.isLoading = t('Loading...');
                            setTimeout(() => {me.isLoading = false}, 1000)
                        }
                    }, {
                        separator: true
                    }, {
                        text : t('Test'),
                        items: [
                            {text: 'Test 1.1', handler: () => me.log('Test 1.1')},
                            {text: 'Test 1.2', items: [
                                {text: 'Test 1.2.1', handler: () => me.log('Test 1.2.1')},
                                {text: 'Test 1.2.2', handler: () => me.log('Test 1.2.2')}
                            ]}
                        ]
                    }, {
                        text    : t('Disabled'),
                        icon    : 'block',
                        disabled: true
                    }]
                }, {
                    module   : Button,
                    reference: 'colorButton',
                    text     : t('Color'),
                    icon     : 'palette',
                    menu     : {module: ColorMenu}
                }, '->', {
                    module   : SearchButton,
                    reference: 'search'
                }, {
                    module: Button,
                    icon  : 'more_vert',
                    menu  : [
                        {text: t('Item 1'), handler: () => me.log('Item 1')},
                        {text: t('Item 2'), handler: () => me.log('Item 2')},
                        {text: t('Item 3'), items: [{text: 'Item 3.1'}, {text: 'Item 3.2'}]}
                    ]
                }]
            },
            h3(t('Navigation')),
            p(t('A button with a route sets the URL hash, see the Router page.')),
            row([
                {module: Button, text: t('Home'), route: 'dev'},
                {module: Button, text: t('Form'), route: 'dev/form'},
                {module: Button, text: t('Table'), route: 'dev/table'},
                {module: Button, text: t('Window'), route: 'dev/window'}
            ]),
            h3(t('Context menu')),
            {
                module   : Component,
                reference: 'contextTarget',
                cls      : ['go-dev-context-target'],
                text     : t('Right click on me to show context menu'),
                height   : 100,
                style    : {border: '1px solid var(--fg-line)', borderRadius: '8px', padding: '16px'}
            },
            h3(t('Collapsible card')),
            {
                ntype: 'container',
                cls  : ['go-card'],
                style: {margin: 0},
                items: [{
                    module: Toolbar,
                    items : [{ntype: 'component', tag: 'h3', style: {margin: 0}, text: t('Collapsible card')}, '->', {
                        module : Button,
                        icon   : 'expand_less',
                        tooltip: t('Collapse'),
                        handler: data => {
                            const body = me.getReference('collapseBody');
                            body.hidden = !body.hidden;
                            data.component.icon = body.hidden ? 'expand_more' : 'expand_less'
                        }
                    }]
                }, {
                    module   : Component,
                    reference: 'collapseBody',
                    style    : {padding: '0 16px 16px'},
                    text     : t('Click the button in the toolbar to collapse and expand this body. Also checkout the Panel component.')
                }]
            },
            output()
        ]
    }

    onConstructed() {
        super.onConstructed();

        let me     = this,
            target = me.getReference('contextTarget');

        me.getReference('search').on('search', ({text}) => me.log(`search: '${text}'`));
        const colorButton = me.getReference('colorButton');
        colorButton.menuListReady.then(() => colorButton.menuList.on('colorSelect', ({color}) => me.log(`color: "${color}"`)));

        target.addDomListeners([{contextmenu: me.onContextMenu, scope: me}])
    }

    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        // the browser menu would cover ours
        value && Neo.main.DomEvents.registerPreventDefaultTargets({name: 'contextmenu', cls: ['go-dev-context-target'], windowId: this.windowId})
    }

    onContextMenu() {
        let me = this;

        MenuList.showAt({
            appName : me.appName,
            windowId: me.windowId,
            target  : me.getReference('contextTarget').id,
            align   : {edgeAlign: 't0-b0'},
            items   : [
                {text: t('Open'), icon: 'open_in_browser', handler: () => me.log('Open')},
                {text: t('Edit'), icon: 'edit', handler: () => me.log('Edit')},
                {separator: true},
                {text: t('Delete'), icon: 'delete', handler: () => me.log('Delete')}
            ]
        })
    }
}

export default Neo.setupClass(Buttons);
