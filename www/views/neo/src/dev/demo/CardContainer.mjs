import Button       from '../../button/Button.mjs';
import Component    from '../../../node_modules/neo.mjs/src/component/Base.mjs';
import TabContainer from '../../../node_modules/neo.mjs/src/tab/Container.mjs';
import Toolbar      from '../../../node_modules/neo.mjs/src/toolbar/Base.mjs';
import Page, {h3, p} from './Page.mjs';
import {t}          from '../../Translate.mjs';

const TEXTS = [
    'Deserunt harum quas cumque. Molestiae alias quia quod nihil sequi dignissimos quia. Quo quia tenetur tenetur. Hic est at veniam. Nisi commodi quia cum libero tempore qui illo in.',
    'Minus perferendis sequi omnis rerum. Omnis molestiae voluptates quo. Dolorum possimus corporis distinctio officiis. Illum labore beatae numquam laboriosam rerum eveniet ullam qui.',
    'Voluptatum cum repellendus aut et. Et tempore rerum numquam cupiditate amet sed consequuntur. Quam natus voluptatem ullam. Ut ipsum autem ex eum doloremque ducimus velit.'
];

/**
 * Dev demo: GOUI Card container (goui-docs CardContainer.ts). GOUI cards() + cardmenu()
 * is neo's tab container (header buttons over a card layout); a container with
 * layout: {ntype: 'card'} switched by own buttons is the plain card container.
 */
class CardContainer extends Page {
    static config = {
        className: 'GO.dev.demo.CardContainer',
        heading  : t('Card container')
    }

    pageItems() {
        const me = this;

        return [
            p(t('A card container holds several components but shows only one, like a pile of cards. With a card menu on top it is a tab panel: neo\'s tab container (Neo.tab.Container), as in the GO dialogs.')),
            {
                module: TabContainer,
                height: 220,
                cls   : ['go-card'],
                style : {margin: 0},
                items : TEXTS.map((text, i) => ({
                    module: Component,
                    header: {text: t('Tab') + ' ' + (i + 1)},
                    style : {padding: '16px'},
                    text
                }))
            },
            h3(t('Card layout')),
            p(t("Without the tab header: layout: {ntype: 'card'} and layout.activeIndex chooses the visible card.")),
            {
                module: Toolbar,
                style : {padding: 0, gap: '8px'},
                items : TEXTS.map((text, i) => ({
                    module : Button,
                    ui     : 'secondary',
                    text   : t('Card') + ' ' + (i + 1),
                    handler: () => {me.getReference('cards').layout.activeIndex = i}
                }))
            },
            {
                ntype    : 'container',
                reference: 'cards',
                height   : 120,
                cls      : ['go-card'],
                style    : {margin: 0},
                layout   : {ntype: 'card', activeIndex: 0},
                items    : TEXTS.map(text => ({module: Component, style: {padding: '16px'}, text}))
            }
        ]
    }
}

export default Neo.setupClass(CardContainer);
