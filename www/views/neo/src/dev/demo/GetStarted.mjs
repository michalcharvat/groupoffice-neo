import Button      from '../../button/Button.mjs';
import Page, {code, h3, p, pageOf} from './Page.mjs';
import {notify}    from '../../Notify.mjs';
import {t}         from '../../Translate.mjs';

/**
 * Dev demo: GOUI "Get started" (goui-docs GetStarted.ts) for the neo web client:
 * where the code lives, a module entry and a live "Hello world".
 */
class GetStarted extends Page {
    static config = {
        className: 'GO.dev.demo.GetStarted',
        heading  : t('Get started')
    }

    pageItems() {
        return [
            p(t('The neo web client lives in www/views/neo. The shell app is in apps/go, the GO classes (GO.*) that modules build on are in src: buttons, grids, forms, dialogs, the JMAP client. Use a GO class where one exists, a raw neo.mjs class only where GO has none.')),
            p(t('A module shows in neo through go/modules/<package>/<module>/views/neo/Index.mjs. It registers itself in the ModuleRegistry; its main view is loaded when the user opens the module:')),
            code(`import ModuleRegistry from '../../../../../../views/neo/src/ModuleRegistry.mjs';

ModuleRegistry.register({
    package   : 'community',
    name      : 'hello',
    title     : 'Hello',
    icon      : 'waving_hand',
    capability: 'go:community:hello',
    mainView  : () => import('./view/HelloMain.mjs')
});`),
            p(t('The main view is a neo container class, the default export of its file:')),
            code(`import Container from '…/neo.mjs/src/container/Base.mjs';
import Button    from '…/views/neo/src/button/Button.mjs';
import {notify}  from '…/views/neo/src/Notify.mjs';
import {t}       from '…/views/neo/src/Translate.mjs';

class HelloMain extends Container {
    static config = {
        className: 'GO.hello.HelloMain',
        items    : [{
            module : Button,
            ui     : 'primary',
            text   : t('Say hello'),
            handler: data => notify(data.component, t('Hello world'))
        }]
    }
}

export default Neo.setupClass(HelloMain);`),
            h3(t('Try it')),
            {
                module : Button,
                ui     : 'primary',
                icon   : 'waving_hand',
                text   : t('Say hello'),
                style  : {alignSelf: 'start'},
                handler: data => notify(pageOf(data.component), t('Hello world'))
            },
            h3(t('Read more')),
            p(t('www/views/neo/README.md (layout of the code, how to build the theme) and docs/neo-*.md: the GO classes compared with GOUI (neo-core-components.md), small modules, the e-mail and files modules.'))
        ]
    }
}

export default Neo.setupClass(GetStarted);
