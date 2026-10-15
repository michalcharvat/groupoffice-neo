import Component from '../../node_modules/neo.mjs/src/component/Base.mjs';
import Container from '../../node_modules/neo.mjs/src/container/Base.mjs';
import List      from '../../node_modules/neo.mjs/src/list/Base.mjs';
import Store     from '../../node_modules/neo.mjs/src/data/Store.mjs';
import MENU      from './menu.mjs';

const STATUS = {
    done: 'demo',
    neo : 'available, no demo yet',
    todo: 'to convert'
};

/** Static strings from menu.mjs only, nothing from the server */
function infoHtml(item) {
    return `<h2>${item.text}</h2>` +
        `<p><span class="go-dev-status go-dev-status-${item.status}">${STATUS[item.status]}</span></p>` +
        '<dl>' +
        (item.neo  ? `<dt>neo</dt><dd>${item.neo}</dd>` : '') +
        (item.goui ? `<dt>GOUI</dt><dd>${item.goui}</dd>` : '') +
        '</dl>'
}

function homeHtml() {
    const items = MENU.filter(item => item.status && item.id !== 'home'),
          count = status => items.filter(item => item.status === status).length;

    return '<h2>Dev</h2>' +
        '<p>Component pages like the GOUI docs (goui-docs/script/MainMenu.ts): one page per GOUI component, ' +
        'with a neo demo once it is converted. Status per component: docs/neo-core-components.md.</p>' +
        `<p><span class="go-dev-status go-dev-status-done">${count('done')} demo</span> ` +
        `<span class="go-dev-status go-dev-status-neo">${count('neo')} available, no demo yet</span> ` +
        `<span class="go-dev-status go-dev-status-todo">${count('todo')} to convert</span></p>`
}

/**
 * Prototype only: Dev module, route "#dev/<id>" with ids from menu.mjs.
 * Pages are created on first visit; a demo that fails to load shows its info page.
 */
class Playground extends Container {
    static config = {
        className: 'GO.dev.Playground',
        cls      : ['go-dev'],
        layout   : {ntype: 'hbox', align: 'stretch'},
        items    : [{
            module      : List,
            reference   : 'menu',
            cls         : ['go-dev-menu'],
            width       : 240,
            displayField: 'text',
            store       : {
                module     : Store,
                keyProperty: 'id',
                model      : {fields: [
                    {name: 'id', type: 'String'}, {name: 'text', type: 'String'},
                    {name: 'level', type: 'Integer'}, {name: 'header', type: 'Boolean'},
                    {name: 'status', type: 'String'}
                ]},
                data       : MENU.map(({id, text, level, header = false, status = ''}) => ({id, text, level, header, status}))
            },
            // static menu texts
            createItemContent(record) {
                const dot = record.status ? `<span class="go-dev-dot go-dev-status-${record.status}"></span>` : '';
                return `<span class="go-dev-item go-dev-level-${record.level}${record.header ? ' go-dev-header' : ''}">${dot}${record.text}</span>`
            }
        }, {
            module   : Container,
            reference: 'pages',
            flex     : 1,
            layout   : {ntype: 'card', activeIndex: null}
        }]
    }

    /** id → page component */
    pages = {}

    onConstructed() {
        super.onConstructed?.();
        this.getReference('menu').on('itemClick', this.onMenuClick, this);
        // the shell calls route() for "#dev/…"; plain "#dev" may not
        this.showPage('home').catch(e => console.error('Dev page', e))
    }

    onMenuClick({record}) {
        Neo.Main.setRoute({value: record.id === 'home' ? 'dev' : 'dev/' + record.id, windowId: this.windowId})
    }

    /**
     * Called by the shell for "#dev/<path>"
     * @param {String} path
     */
    route(path) {
        this.showPage(path || 'home').catch(e => console.error('Dev page', e))
    }

    async showPage(id) {
        let me    = this,
            item  = MENU.find(entry => entry.id === id && !entry.header) || MENU[0],
            cards = me.getReference('pages'),
            menu  = me.getReference('menu');

        me.currentId = item.id;
        // a string would be taken as a vdom id: pass the record
        menu.selectionModel.select(menu.store.get(item.id));

        if (!me.pages[item.id]) {
            const config = await me.createPageConfig(item);

            // destroyed, or created by an earlier call meanwhile
            if (me.isDestroyed || me.pages[item.id]) {
                return
            }

            me.pages[item.id] = cards.add(config)
        }

        if (me.currentId === item.id) {
            cards.layout.activeIndex = cards.indexOf(me.pages[item.id])
        }
    }

    async createPageConfig(item) {
        if (item.demo) {
            try {
                const {default: module} = await import(`./demo/${item.demo}.mjs`);
                return {module}
            } catch (e) {
                console.error('Dev demo', item.demo, e)
            }
        }

        return {
            module: Component,
            cls   : ['go-dev-info'],
            html  : item.id === 'home' ? homeHtml() : infoHtml(item)
        }
    }
}

export default Neo.setupClass(Playground);
