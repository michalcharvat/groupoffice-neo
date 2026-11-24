import Button    from '../../button/Button.mjs';
import Component from '../../../node_modules/neo.mjs/src/component/Base.mjs';
import Panel     from '../../../node_modules/neo.mjs/src/container/Panel.mjs';
import Page, {p} from './Page.mjs';
import {t}       from '../../Translate.mjs';

/**
 * Dev demo: GOUI Panel (goui-docs Panel.ts) with neo's container/Panel: a title header
 * over the content. GO has no Panel class of its own; a collapsible card is
 * GO.detail.Card (detail views) or a header button that hides the body (Buttons page).
 */
class PanelDemo extends Page {
    static config = {
        className: 'GO.dev.demo.Panel',
        heading  : t('Panel')
    }

    pageItems() {
        return [
            p(t('This page demonstrates the Panel component.')),
            {
                module : Panel,
                cls    : ['go-card'],
                style  : {margin: 0},
                headers: [{dock: 'top', text: t('Panel component')}],
                items  : [{
                    module: Component,
                    style : {padding: '16px'},
                    text  : t('This is a basic panel with a title and content.')
                }]
            },
            {
                module : Panel,
                cls    : ['go-card'],
                style  : {margin: 0},
                headers: [{dock: 'top', text: t('Header and footer')}, {dock: 'bottom', items: ['->', {module: Button, ui: 'primary', text: t('OK')}]}],
                items  : [{
                    module: Component,
                    style : {padding: '16px'},
                    text  : t('Headers can dock at the top or the bottom, a bottom header is a footer toolbar.')
                }]
            }
        ]
    }
}

export default Neo.setupClass(PanelDemo);
