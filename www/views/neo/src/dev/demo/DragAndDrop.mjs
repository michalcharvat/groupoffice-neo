import Component from '../../../node_modules/neo.mjs/src/component/Base.mjs';
import Container from '../../../node_modules/neo.mjs/src/container/Base.mjs';
import Store     from '../../../node_modules/neo.mjs/src/data/Store.mjs';
import {dropIndex, enableDragDrop} from '../../component/dragDrop.mjs';
import TextList  from '../../list/TextList.mjs';
import Tree      from '../../tree/Tree.mjs';
import {escapeHtml} from '../../Format.mjs';

/**
 * @param {Object[]} data
 * @returns {Object} config of a local store with string ids
 */
const listStore = data => ({
    module     : Store,
    keyProperty: 'id',
    model      : {fields: [{name: 'id', type: 'String'}, {name: 'text', type: 'String'}, {name: 'book', type: 'String'}]},
    data
});

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
 * WS/DragDrop main thread addon: GO.tree.Tree with dragNodes / dropOn / dropBetween, rows
 * dropped onto containers (notes onto note books), sortable lists (between items, across two
 * lists of the same group, horizontal).
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
        }, {
            module: Component,
            tag   : 'h3',
            text  : 'Rows onto containers: drag notes onto a note book'
        }, {
            ntype : 'container',
            cls   : ['go-dev-dnd-row'],
            layout: {ntype: 'hbox', align: 'start'},
            items : [{
                module      : TextList,
                displayField: 'text',
                reference: 'notes',
                cls      : ['go-dev-dnd-box'],
                width    : 240,
                store    : listStore([
                    {id: 'n1', text: 'Shopping list', book: 'Personal'},
                    {id: 'n2', text: 'Meeting notes', book: 'Work'},
                    {id: 'n3', text: 'Ideas', book: 'Personal'}
                ]),
                createItemContent: record => escapeHtml(`${record.text} (${record.book})`)
            }, {
                module      : TextList,
                displayField: 'text',
                reference: 'books',
                cls      : ['go-dev-dnd-box'],
                width    : 240,
                store    : listStore([{id: 'Personal', text: 'Personal'}, {id: 'Work', text: 'Work'}, {id: 'Archive', text: 'Archive'}])
            }]
        }, {
            module: Component,
            tag   : 'h3',
            text  : 'Sortable lists: drag items between each other, also to the other list'
        }, {
            ntype : 'container',
            cls   : ['go-dev-dnd-row'],
            layout: {ntype: 'hbox', align: 'start'},
            items : [{
                module      : TextList,
                displayField: 'text',
                reference: 'sortA',
                cls      : ['go-dev-dnd-box'],
                width    : 240,
                store    : listStore(['Monday', 'Tuesday', 'Wednesday', 'Thursday'].map(text => ({id: text, text})))
            }, {
                module      : TextList,
                displayField: 'text',
                reference: 'sortB',
                cls      : ['go-dev-dnd-box'],
                width    : 240,
                store    : listStore(['Friday', 'Saturday', 'Sunday'].map(text => ({id: text, text})))
            }]
        }, {
            module      : TextList,
            displayField: 'text',
            reference: 'chips',
            cls      : ['go-dev-dnd-chips'],
            store    : listStore(['red', 'orange', 'yellow', 'green', 'blue'].map(text => ({id: text, text})))
        }]
    }

    onConstructed() {
        super.onConstructed();

        let me    = this,
            notes = me.getReference('notes'),
            books = me.getReference('books'),
            log   = e => console.error('Drag and drop demo', e);

        me.getReference('tree').on('drop', data => me.onTreeDrop(data));

        enableDragDrop(notes, {drag: '.neo-list-item', group: 'dev-notes', onDrop: () => {}}).catch(log);
        enableDragDrop(books, {
            drop  : '.neo-list-item',
            group : 'dev-notes',
            onDrop: ({source, targetId}) => {
                const note = source && notes.store.get(notes.getItemRecordId(source.itemId)),
                      book = books.store.get(books.getItemRecordId(targetId))?.id;

                if (note && book) {
                    me.setRecords(notes, notes.store.items.map(r => r === note ? {id: r.id, text: r.text, book} : r));
                    me.log(`moved ${note.text} to ${book}`)
                }
            }
        }).catch(log);

        ['sortA', 'sortB'].forEach(ref => enableDragDrop(me.getReference(ref), {
            drag    : '.neo-list-item',
            drop    : '.neo-list-item',
            group   : 'dev-sort',
            position: 'between',
            onDrop  : event => me.onSort(me.getReference(ref), event)
        }).catch(log));

        enableDragDrop(me.getReference('chips'), {
            drag      : '.neo-list-item',
            drop      : '.neo-list-item',
            position  : 'between',
            horizontal: true,
            onDrop    : event => me.onSort(me.getReference('chips'), event)
        }).catch(log)
    }

    /**
     * @param {Neo.list.Base} list
     * @param {Object[]} records
     */
    setRecords(list, records) {
        // neo records keep their fields in getters: copy them by name
        list.store.data = records.map(({id, text, book}) => ({id, text, book}))
    }

    /**
     * Sortable list (GOUI Sortable sort event): moves the dragged item within its list or
     * from the other list of the group
     * @param {Neo.list.Base} list the list dropped on
     * @param {Object} event goDrop of WS/DragDrop
     */
    onSort(list, {source, targetId, position}) {
        let me     = this,
            from   = source && Neo.getComponent(source.rootId),
            record = from?.store?.get(from.getItemRecordId(source.itemId)),
            target = targetId === list.id ? null : list.store.get(list.getItemRecordId(targetId));

        if (!record) {
            return
        }

        const items = [...list.store.items];

        if (from === list) {
            const fromIndex = items.indexOf(record),
                  toIndex   = target ? dropIndex(fromIndex, items.indexOf(target), position) : items.length - 1;

            if (toIndex < 0 || toIndex === fromIndex) {
                return
            }

            items.splice(toIndex, 0, ...items.splice(fromIndex, 1));
            me.setRecords(list, items);
            me.log(`sort ${record.text}: ${fromIndex} → ${toIndex}`);
            return
        }

        const toIndex = target ? items.indexOf(target) + (position === 'after' ? 1 : 0) : items.length;

        items.splice(toIndex, 0, record);
        me.setRecords(from, from.store.items.filter(r => r !== record));
        me.setRecords(list, items);
        me.log(`moved ${record.text} to index ${toIndex} of the other list`)
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
