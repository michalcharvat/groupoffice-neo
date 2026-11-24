import Button from '../../button/Button.mjs';
import Page, {code, output, p} from './Page.mjs';
import {t}    from '../../Translate.mjs';

/**
 * Dev demo: GOUI Router (goui-docs Router.ts). neo has no route table per module: the
 * shell (apps/go/view/MainView.mjs) owns the hash. "#<module>/<path>" opens the module's
 * tab and calls route(path) on its main view; the module parses the path itself. This
 * page gets the rest of "#dev/router/<path>" from the Dev main view (Playground).
 */
class Router extends Page {
    static config = {
        className: 'GO.dev.demo.Router',
        heading  : t('Router')
    }

    pageItems() {
        return [
            p(t('The shell owns the URL hash. For "#<module>/<path>" it opens the tab of the module and calls route(path) on its main view, also when the hash changes later. The module parses the path itself, e.g. the notes module opens "#notes/note/5":')),
            code(`class NotesMain extends MainThreeColumnPanel {
    /**
     * Called by the shell for "#notes/<path>"
     * @param {String} path
     */
    route(path) {
        const [, id] = path.match(/^note\\/(\\d+)$/) || [];

        id && this.showNote(id)
    }
}`),
            p(t('To navigate, set the route; the shell then calls route() of the module:')),
            code(`Neo.Main.setRoute({value: 'notes/note/5', windowId: this.windowId})`),
            p(t('Try it: these buttons set "#dev/router/<path>", the Dev main view calls route(path) of this page.')),
            {
                ntype : 'container',
                layout: {ntype: 'hbox', wrap: 'wrap'},
                style : {gap: '8px'},
                items : ['hello', 'note/5', 'a/b/c'].map(path => ({
                    module : Button,
                    ui     : 'secondary',
                    text   : '#dev/router/' + path,
                    handler: data => Neo.Main.setRoute({value: 'dev/router/' + path, windowId: data.component.windowId})
                }))
            },
            output()
        ]
    }

    /**
     * Called by the Dev main view for "#dev/router/<path>"
     * @param {String} path
     */
    route(path) {
        const [, id] = path.match(/^note\/(\d+)$/) || [];

        this.log(`route('${path}')` + (id ? ` → note id ${id}` : ''))
    }
}

export default Neo.setupClass(Router);
