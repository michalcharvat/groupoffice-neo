import Component from '../../../node_modules/neo.mjs/src/component/Base.mjs';
import Container from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Tree      from '../../tree/Tree.mjs';
import {escapeHtml} from '../../Format.mjs';

/**
 * Folders of the tree demo: id → {text, parent, leaf}; the order of the keys is the order of
 * the nodes. Folders load their children on expand like a server tree.
 */
const FOLDERS = {
    projects : {text: 'Projects', parent: null},
    website  : {text: 'Website', parent: 'projects'},
    intranet : {text: 'Intranet', parent: 'projects'},
    plan     : {text: 'plan.md', parent: 'website', leaf: true},
    archive  : {text: 'Archive', parent: null},
    y2025    : {text: '2025', parent: 'archive'},
    readme   : {text: 'readme.txt', parent: null, leaf: true}
};

/**
 * Dev demo: drag and drop (GOUI DragAndDrop.ts). Native HTML5 drag and drop through the
 * WS/DragDrop main thread addon: GO.tree.Tree with dragNodes / dropOn / dropBetween.
 */
class DragAndDropDemo extends Container {
    static config = {
        className: 'GO.dev.demo.DragAndDrop',
        cls      : ['go-dev-dnd'],
        layout   : 'base',
        items    : [{
            module: Component,
            tag   : 'h3',
            text  : 'Tree: drag nodes onto, before or after other nodes'
        }, {
            ntype : 'container',
            cls   : ['go-dev-dnd-row'],
            layout: {ntype: 'hbox', align: 'start'},
            items : [{
                module      : Tree,
                reference   : 'tree',
                cls         : ['go-dev-dnd-box'],
                width       : 320,
                height      : 320,
                defaultIcon : 'folder',
                dragNodes   : true,
                dropOn      : true,
                dropBetween : true,
                nodeProvider: async node => {
                    // loads take a moment, like a server
                    await new Promise(resolve => setTimeout(resolve, 200));

                    return Object.entries(FOLDERS)
                        .filter(([, folder]) => folder.parent === (node?.id ?? null))
                        .map(([id, folder]) => ({
                            id,
                            text: folder.text,
                            ...folder.leaf ? {icon: 'description', children: []} : {}
                        }))
                }
            }, {
                module   : Component,
                reference: 'output',
                tag      : 'pre',
                cls      : ['go-dev-output'],
                flex     : 1,
                html     : ''
            }]
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me = this;

        me.getReference('tree').on('drop', data => me.onTreeDrop(data))
    }

    /**
     * Saves the move in FOLDERS (the "server") and moves the node in the tree
     * @param {Object} data drop event of GO.tree.Tree
     */
    onTreeDrop({dragNode, node, position}) {
        let me     = this,
            tree   = me.getReference('tree'),
            target = node ? FOLDERS[node.id] : null;

        if (!dragNode || (target?.leaf && position === 'on')) {
            me.log(`drop refused: ${node?.text ?? 'root'} (${position})`);
            return
        }

        const folder = FOLDERS[dragNode.id],
              ids    = Object.keys(FOLDERS).filter(id => id !== dragNode.id);

        folder.parent = position === 'on' ? (node?.id ?? null) : target.parent;

        // keep the order of the keys in FOLDERS like the order in the tree
        const index = node && position !== 'on' ? ids.indexOf(node.id) + (position === 'after' ? 1 : 0) : ids.length;

        ids.splice(index, 0, dragNode.id);
        const entries = ids.map(id => [id, FOLDERS[id]]);

        Object.keys(FOLDERS).forEach(id => delete FOLDERS[id]);
        entries.forEach(([id, value]) => FOLDERS[id] = value);

        tree.moveNode(dragNode.id, node?.id ?? null, position);
        me.log(`drop ${dragNode.text} ${position} ${node?.text ?? 'root'}`)
    }

    log(text) {
        const output = this.getReference('output');
        output.html = escapeHtml(text) + '\n' + output.html
    }
}

export default Neo.setupClass(DragAndDropDemo);
