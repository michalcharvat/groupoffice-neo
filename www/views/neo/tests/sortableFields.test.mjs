// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: ArrayField}        = await import('../src/form/field/ArrayField.mjs'),
      {default: AutocompleteChips} = await import('../src/form/field/AutocompleteChips.mjs'),
      {default: ChipsField}        = await import('../src/form/field/ChipsField.mjs'),
      {default: ContainerField}    = await import('../src/form/field/ContainerField.mjs'),
      {default: TextField}         = await import('../node_modules/neo.mjs/src/form/field/Text.mjs'),
      {default: ModuleRegistry}    = await import('../src/ModuleRegistry.mjs');

describe('ArrayField sortable', () => {
    // no main thread here: the drag and drop addon "loads" at once
    before(() => { Neo.Main ??= {}; Neo.Main.importAddon ??= async () => {} });

    function create(config = {}) {
        return Neo.create(ArrayField, {
            appName   : 'test',
            name      : 'steps',
            buildField: () => ({module: ContainerField, items: [ArrayField.dragHandle(), {module: TextField, name: 'name'}]}),
            ...config
        })
    }

    const names = field => field.getSubmitValue().map(v => v.name);

    it('moves a dropped row before or after another and turns dirty', () => {
        const field = create({sortable: true});

        field.reset([{name: 'a'}, {name: 'b'}, {name: 'c'}]);
        assert.equal(field.isDirty, false);

        const [a, b, c] = field.getRows();

        assert.ok(a.vdom.cls.includes('go-arrayfield-row'));

        field.onRowDrop(a.id, c.id, 'after');
        assert.deepEqual(names(field), ['b', 'c', 'a']);
        assert.equal(field.isDirty, true);

        field.onRowDrop(a.vdom.id, b.id, 'before');
        assert.deepEqual(names(field), ['a', 'b', 'c']);
        assert.equal(field.isDirty, false, 'back in the original order');
    });

    it('fires change on a move, ignores drops that do not move or come from elsewhere', () => {
        const field = create({sortable: true});
        let changes = 0;

        field.reset([{name: 'a'}, {name: 'b'}]);
        field.on('change', () => changes++);

        const [a, b] = field.getRows();

        field.onRowDrop(a.id, b.id, 'before');
        field.onRowDrop('other-row', b.id, 'after');
        field.onRowDrop(a.id, 'other-row', 'after');
        assert.deepEqual(names(field), ['a', 'b']);
        assert.equal(changes, 0);

        field.onRowDrop(b.id, a.id, 'before');
        assert.deepEqual(names(field), ['b', 'a']);
        assert.equal(changes, 1);
    });

    it('with other items between the rows, a drop that keeps the row order changes nothing', () => {
        const field = create({sortable: true});
        let changes = 0;

        field.reset([{name: 'a'}, {name: 'b'}]);
        const [a, b] = field.getRows(),
              note   = field.insert(1, {ntype: 'component', text: 'note'});

        field.on('change', () => changes++);

        field.onRowDrop(a.id, b.id, 'before');
        assert.equal(field.items[1], note);
        assert.equal(changes, 0);

        field.onRowDrop(a.id, b.id, 'after');
        assert.deepEqual(names(field), ['b', 'a']);
        assert.deepEqual(field.items.map(i => i === note ? 'note' : i === a ? 'a' : 'b'), ['note', 'b', 'a']);
        assert.equal(changes, 1);
    });

    it('a sortable ArrayField in a row sorts its own rows, the outer value follows', () => {
        const field = create({
            sortable  : true,
            buildField: () => ({module: ContainerField, items: [{module: TextField, name: 'title'}, {
                module    : ArrayField,
                name      : 'docs',
                sortable  : true,
                buildField: () => ({module: ContainerField, items: [{module: TextField, name: 'name'}]})
            }]})
        });

        field.reset([{title: 'x', docs: [{name: '1'}, {name: '2'}]}, {title: 'y', docs: []}]);

        const inner    = field.getRows()[0].getChildFields().find(f => f instanceof ArrayField),
              [d1, d2] = inner.getRows();

        // the outer field doesn't know the inner rows
        field.onRowDrop(d1.id, d2.id, 'after');
        assert.deepEqual(field.getSubmitValue()[0].docs.map(d => d.name), ['1', '2']);

        inner.onRowDrop(d1.id, d2.id, 'after');
        assert.deepEqual(field.getSubmitValue()[0].docs.map(d => d.name), ['2', '1']);
        assert.equal(field.isDirty, true);
    });

    it('rows of a plain ArrayField get no drag class', () => {
        const field = create();

        field.reset([{name: 'a'}]);
        assert.ok(!field.getRows()[0].vdom.cls?.includes('go-arrayfield-row'));
    });
});

describe('ChipsField clickable', () => {
    const getAvailable = ModuleRegistry.getAvailable,
          setRoute     = Neo.Main?.setRoute;
    let routes;

    beforeEach(() => {
        routes = [];
        ModuleRegistry.getAvailable = () => [{name: 'notes', routes: {Note: id => 'note/' + id}}];
        Neo.Main ??= {};
        Neo.Main.setRoute = data => routes.push(data.value)
    });

    afterEach(() => {
        ModuleRegistry.getAvailable = getAvailable;
        Neo.Main.setRoute           = setRoute
    });

    function chips(config) {
        return Neo.create(AutocompleteChips, {appName: 'test', name: 'noteIds', entity: 'Note', value: [5, 6], ...config})
    }

    const chip   = index => ({cls: ['go-chip', 'go-chip-link'], data: {index: String(index)}}),
          remove = {cls: ['go-chip-remove']};

    it('a chip opens its entity, the remove button still removes', () => {
        const field = chips({clickable: true});

        assert.equal(field.chipRoute(6), 'notes/note/6');

        field.onBoxClick({path: [{cls: ['go-chip-text']}, chip(1)]});
        assert.deepEqual(routes, ['notes/note/6']);

        field.onBoxClick({path: [remove, chip(0)]});
        assert.deepEqual(field.value, [6]);
        assert.equal(routes.length, 1);
    });

    it('opens nothing without clickable, an entity no module shows, or a plain ChipsField', () => {
        assert.equal(chips().chipRoute(5), null);
        assert.equal(chips({clickable: true, entity: 'Unknown'}).chipRoute(5), null);
        assert.equal(Neo.create(ChipsField, {appName: 'test', name: 'tags', clickable: true}).chipRoute('red'), null);
        assert.equal(chips({clickable: true}).chipEntity({id: 5}), null, 'an object value brings its own chipEntity');
    });
});
