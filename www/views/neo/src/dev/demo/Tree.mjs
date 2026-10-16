import Component from '../../../node_modules/neo.mjs/src/component/Base.mjs';
import Container from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Button    from '../../button/Button.mjs';
import Tree      from '../../tree/Tree.mjs';
import {escapeHtml} from '../../Format.mjs';

const DATA = {
    europe : ['Netherlands', 'Czechia', 'Germany'],
    america: ['Canada', 'Mexico'],
    asia   : ['Japan', 'Vietnam']
};

/**
 * Dev demo: GOUI Tree — children loaded on expand (a fake provider with a delay),
 * checkboxes, an expanded node, leaves.
 */
class TreeDemo extends Container {
    static config = {
        className: 'GO.dev.demo.Tree',
        layout   : {ntype: 'hbox', align: 'start'},
        style    : {padding: '16px', gap: '24px', overflow: 'auto'},
        items    : [{
            module      : Tree,
            reference   : 'tree',
            width       : 320,
            height      : 420,
            defaultIcon : 'folder',
            nodeProvider: async node => {
                // loads take a moment, like a server
                await new Promise(resolve => setTimeout(resolve, 400));

                if (!node) {
                    return [
                        {id: 'world', text: 'World', icon: 'public', expanded: true},
                        {id: 'empty', text: 'Empty folder'},
                        {id: 'file', text: 'A leaf', icon: 'description', children: []}
                    ]
                }

                if (node.id === 'world') {
                    return Object.keys(DATA).map(id => ({id, text: id[0].toUpperCase() + id.slice(1), check: false}))
                }

                return (DATA[node.id] || []).map(text => ({id: node.id + '-' + text, text, icon: 'flag', check: false, children: []}))
            }
        }, {
            ntype : 'container',
            layout: {ntype: 'vbox', align: 'start'},
            style : {gap: '8px'},
            items : [{
                module : Button,
                ui     : 'secondary',
                text   : 'reload()',
                handler: data => data.component.up({className: 'GO.dev.demo.Tree'}).getReference('tree').reload()
            }, {
                module : Button,
                ui     : 'secondary',
                text   : 'getChecked()',
                handler: data => {
                    const demo = data.component.up({className: 'GO.dev.demo.Tree'});
                    demo.log('checked: ' + demo.getReference('tree').getChecked().map(n => n.text).join(', '))
                }
            }, {
                module   : Component,
                reference: 'output',
                tag      : 'pre',
                cls      : ['go-dev-output'],
                html     : ''
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me   = this,
            tree = me.getReference('tree');

        tree.on({
            expand     : ({node}) => me.log('expand ' + node.text),
            collapse   : ({node}) => me.log('collapse ' + node.text),
            checkChange: ({node, checked}) => me.log(`checkChange ${node.text}: ${checked}`),
            itemClick  : ({record}) => me.log('itemClick ' + record.text)
        })
    }

    log(text) {
        const output = this.getReference('output');
        output.html = escapeHtml(text) + '\n' + output.html
    }
}

export default Neo.setupClass(TreeDemo);
