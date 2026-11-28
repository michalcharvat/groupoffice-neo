// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: Panel}         = await import('../src/detail/Panel.mjs'),
      {default: Button}        = await import('../src/button/Button.mjs'),
      {default: client}        = await import('../src/jmap/Client.mjs'),
      {default: ConfirmDialog} = await import('../src/view/ConfirmDialog.mjs');

const proto = Panel.prototype;

/**
 * A stand-in for a detail panel: its references as plain objects, the Panel methods on it
 */
function fakePanel(config = {}) {
    const card = () => ({hidden: null, current: null, setEntity(entity, entityId, record) {
              this.current = entity && entityId ? {entity, entityId, record} : null
          }}),
          refs = {
              notFound        : {hidden: true},
              editButton      : {disabled: true},
              moreButton      : {disabled: true, deleteDisabled: null, setMenuItemDisabled(id, disabled) {this[id + 'Disabled'] = disabled}},
              addLinkButton   : card(),
              linkBrowseButton: {target: null, setEntity(entity, entityId) {this.target = entityId ? {entity, entityId} : null}},
              customFields    : card(),
              comments        : card(),
              links           : card()
          },
          panel = {
              entityName : 'Note',
              properties : null,
              cards      : ['customFields', 'comments', 'links'],
              hasLinks   : true,
              record     : null,
              requestedId: null,
              rendered   : [],
              fired      : [],
              refs,
              getReference: name => refs[name],
              fire        : (name, data) => panel.fired.push({name, data}),
              renderRecord: record => panel.rendered.push(record),
              ...config
          };

    ['load', 'reload', 'setRecord', 'showRecord', 'canEdit', 'canDelete', 'getTitle', 'getDownloadUrl',
        'createMoreMenu', 'rebuildMoreMenu', 'onEdit', 'onDelete', 'deleteRecord', 'onCopyLink'].forEach(name => panel[name] ??= proto[name]);
    return panel
}

describe('GO.detail.Panel', () => {
    const get = client.get,
          set = client.set,
          ask = ConfirmDialog.ask;

    afterEach(() => {
        client.get        = get;
        client.set        = set;
        ConfirmDialog.ask = ask;
    });

    it('enables edit and delete by permission level and points the cards to the record', () => {
        const panel = fakePanel(),
              {refs} = panel;

        panel.setRecord({id: 5, name: 'Read only', permissionLevel: 10});
        assert.equal(refs.editButton.disabled, true);
        assert.equal(refs.moreButton.disabled, false);
        assert.equal(refs.moreButton.deleteDisabled, true);
        assert.equal(refs.comments.hidden, false);
        assert.deepEqual(refs.comments.current, {entity: 'Note', entityId: '5', record: panel.record});
        assert.equal(refs.linkBrowseButton.target.entityId, '5');

        panel.setRecord({id: 5, name: 'Writable', permissionLevel: 50});
        assert.equal(refs.editButton.disabled, false);
        assert.equal(refs.moreButton.deleteDisabled, false);
        // same record: the card keeps its content, gets the new record
        assert.equal(refs.comments.current.record.name, 'Writable');

        panel.setRecord(null);
        assert.equal(refs.editButton.disabled, true);
        assert.equal(refs.moreButton.disabled, true);
        assert.equal(refs.comments.hidden, true);
        assert.equal(refs.comments.current, null);
        assert.equal(refs.customFields.current, null);
        assert.deepEqual(panel.rendered.map(r => r?.name ?? null), ['Read only', 'Writable', null]);
    });

    it('lets a subclass refuse edit', () => {
        const panel = fakePanel({canEdit: () => false});

        panel.setRecord({id: 1, permissionLevel: 50});
        assert.equal(panel.refs.editButton.disabled, true);
    });

    it('loads by id, shows "Not found" for a missing record, a later load wins', async () => {
        let resolvers = [];

        client.get = (entity, ids) => new Promise(resolve => resolvers.push(() => resolve(ids[0] === '404' ? [] : [{id: ids[0], name: 'N' + ids[0]}])));

        const panel = fakePanel(),
              first = panel.load(1),
              last  = panel.load('2');

        resolvers[1]();
        assert.equal((await last).name, 'N2');
        resolvers[0]();
        assert.equal(await first, null);
        assert.equal(panel.record.name, 'N2');
        assert.equal(panel.requestedId, '2');
        assert.equal(panel.refs.notFound.hidden, true);

        const missing = panel.load(404);

        // the old record is cleared while the other one loads
        assert.equal(panel.record, null);
        resolvers[2]();
        assert.equal(await missing, null);
        assert.equal(panel.refs.notFound.hidden, false);
    });

    it('setRecord() cancels a pending load and stops reloading by id', async () => {
        let resolve;

        client.get = () => new Promise(r => resolve = () => r([{id: '1', name: 'loaded'}]));

        const panel   = fakePanel(),
              pending = panel.load(1);

        panel.setRecord({id: '7', name: 'from host'});
        resolve();
        await pending;
        assert.equal(panel.record.name, 'from host');
        assert.equal(panel.requestedId, null);
    });

    it('offers Download PDF only when getDownloadUrl() is overridden', () => {
        const ids = panel => panel.createMoreMenu().map(item => item.id || 'sep');

        assert.deepEqual(ids(fakePanel()), ['print', 'sep', 'delete']);
        assert.deepEqual(ids(fakePanel({getDownloadUrl: () => 'x.pdf'})), ['print', 'download', 'sep', 'delete']);
    });

    it('offers Copy link only with copyLink and copies the URL of the record', async () => {
        const ids    = panel => panel.createMoreMenu().map(item => item.id || 'sep'),
              main   = Neo.Main,
              toast  = Neo.toast,
              writes = [],
              toasts = [];

        assert.deepEqual(ids(fakePanel({copyLink: true})), ['print', 'copyLink', 'sep', 'delete']);

        Neo.Main  = {importAddon: async () => true};
        Neo.toast = ({msg}) => toasts.push(msg);
        Neo.ns('GO.main.addon', true).ClipboardWriter = {writeText: async data => (writes.push(data), true)};

        try {
            const panel = fakePanel({copyLink: true, windowId: 'w1', getRoute: record => 'notes/note/' + record.id});

            await panel.onCopyLink();
            assert.equal(writes.length, 0, 'no record, nothing copied');

            panel.setRecord({id: 5, permissionLevel: 10});
            await panel.onCopyLink();
            assert.equal(writes.length, 1);
            assert.equal(writes[0].windowId, 'w1');
            assert.match(writes[0].text, /^https?:\/\/[^#?]+\?webclient=neo#notes\/note\/5$/);
            assert.deepEqual(toasts, ['Link copied to clipboard']);
            assert.equal(panel.refs.moreButton.copyLinkDisabled, false);

            const unroutable = fakePanel({copyLink: true, getRoute: () => null});

            unroutable.setRecord({id: 6, permissionLevel: 10});
            assert.equal(unroutable.refs.moreButton.copyLinkDisabled, true, 'no route, item disabled');
        } finally {
            Neo.Main  = main;
            Neo.toast = toast;
            delete Neo.ns('GO.main.addon').ClipboardWriter
        }
    });

    it('fires edit and delete for the host', () => {
        const panel = fakePanel();

        panel.onEdit();
        assert.equal(panel.fired.length, 0);

        panel.setRecord({id: 3, permissionLevel: 50});
        panel.onEdit();
        panel.onDelete();
        assert.deepEqual(panel.fired.map(e => e.name), ['edit', 'delete']);
        assert.equal(panel.fired[1].data.record.id, 3);
    });

    it('deleteRecord() confirms, destroys and empties the detail', async () => {
        const destroyed = [];
        let answer = false;

        ConfirmDialog.ask = async () => answer;
        client.set        = async (entity, {destroy}) => destroyed.push({entity, destroy});

        const panel = fakePanel();

        panel.setRecord({id: 9, name: 'Gone', permissionLevel: 50});
        assert.equal(await panel.deleteRecord(), false);
        assert.equal(panel.record.id, 9);

        answer = true;
        assert.equal(await panel.deleteRecord(), true);
        assert.deepEqual(destroyed, [{entity: 'Note', destroy: [9]}]);
        assert.equal(panel.record, null);
        assert.deepEqual(panel.fired.map(e => e.name), ['deleted']);
    });
});

describe('GO.detail.Panel push reload', () => {
    const get = client.get;

    afterEach(() => client.get = get);

    it('reloads a record loaded by id on a change of its entity, not after setRecord() or destroy()', async () => {
        let gets = 0;

        client.get = async (entity, ids) => {
            gets++;
            return [{id: ids[0], name: 'N' + ids[0], permissionLevel: 50}]
        };

        const panel = Neo.create(Panel, {appName: 'test', entityName: 'Note'}),
              push  = async entity => {
                  client.fire('stateChange', {changed: [entity]});
                  await new Promise(resolve => setTimeout(resolve, 0))
              };

        await panel.load(1);
        assert.equal(gets, 1);

        await push('Note');
        assert.equal(gets, 2);

        await push('Task');
        assert.equal(gets, 2);

        panel.setRecord({id: '2', name: 'from host'});
        await push('Note');
        assert.equal(gets, 2);
        assert.equal((await panel.reload()).name, 'from host');

        await panel.load(3);
        panel.destroy();
        await push('Note');
        assert.equal(gets, 3);
    });
});

describe('GO.detail.Panel ⋮ menu rebuilt on open', () => {
    /**
     * A stand-in for the ⋮ button: setting `menu` builds a hidden list right away
     */
    function fakeMore() {
        return {
            menuList: null, menuListReady: null, deleteDisabled: null,
            set menu(items) {
                this.menuList       = {hidden: true, items};
                this.menuListReady  = Promise.resolve();
                this.deleteDisabled = null
            },
            setMenuItemDisabled(id, disabled) {id === 'delete' && (this.deleteDisabled = disabled)}
        }
    }

    function deferred() {
        let resolve;
        const promise = new Promise(r => resolve = r);
        return {promise, resolve}
    }

    const tick = () => new Promise(resolve => setTimeout(resolve, 0));

    it('shows "Loading..." and then the items for the shown record', async () => {
        const answer = deferred(),
              asked  = [],
              panel  = fakePanel({loadMoreMenu: (record, items) => {asked.push({record, items}); return answer.promise}});

        panel.refs.moreButton = fakeMore();
        panel.setRecord({id: 1, permissionLevel: 10});

        const open = panel.rebuildMoreMenu(),
              more = panel.refs.moreButton;

        await tick();
        assert.deepEqual(more.menuList.items.map(i => i.id), ['loading']);
        assert.equal(more.menuList.hidden, false);
        assert.equal(asked[0].record.id, 1);
        assert.deepEqual(asked[0].items.map(i => i.id || 'sep'), ['print', 'sep', 'delete']);

        answer.resolve([...asked[0].items, {id: 'query', text: 'Query'}]);
        assert.equal(await open, true);
        assert.deepEqual(more.menuList.items.map(i => i.id || 'sep'), ['print', 'sep', 'delete', 'query']);
        assert.equal(more.deleteDisabled, true);
    });

    it('drops the answer for a record that is no longer shown', async () => {
        const answer = deferred(),
              panel  = fakePanel({loadMoreMenu: () => answer.promise});

        panel.refs.moreButton = fakeMore();
        panel.setRecord({id: 1});

        const open = panel.rebuildMoreMenu(),
              more = panel.refs.moreButton;

        await tick();
        panel.setRecord({id: 2});
        // another record closes the loading menu at once
        assert.equal(more.menuList.hidden, true);
        answer.resolve([{id: 'old'}]);
        assert.equal(await open, false);
        assert.deepEqual(more.menuList.items.map(i => i.id), ['loading']);
        assert.equal(more.menuList.hidden, true);
    });

    it('keeps the menu closed when it was closed while loading or the hook failed', async () => {
        const answer = deferred(),
              panel  = fakePanel({loadMoreMenu: () => answer.promise});

        panel.refs.moreButton = fakeMore();
        panel.setRecord({id: 1});

        const open = panel.rebuildMoreMenu();

        await tick();
        panel.refs.moreButton.menuList.hidden = true;
        answer.resolve([{id: 'late'}]);
        assert.equal(await open, false);
        assert.deepEqual(panel.refs.moreButton.menuList.items.map(i => i.id), ['loading']);

        assert.equal(await fakePanel({record: null}).rebuildMoreMenu(), false);
    });

    it('the button runs beforeShowMenu() only when its menu opens and stays closed on false', async () => {
        let calls = 0, toggled = 0, answer = false;

        const button = {
            menuList      : {hidden: true},
            beforeShowMenu: () => (calls++, answer),
            toggleMenu    : Button.prototype.toggleMenu
        };

        // super.toggleMenu() is neo's: count it instead
        const neoToggle = Object.getPrototypeOf(Button.prototype).toggleMenu;
        Object.getPrototypeOf(Button.prototype).toggleMenu = async () => toggled++;

        try {
            await button.toggleMenu();
            assert.deepEqual([calls, toggled], [1, 0]);

            answer = true;
            await button.toggleMenu();
            assert.deepEqual([calls, toggled], [2, 1]);

            button.menuList.hidden = false;
            await button.toggleMenu();
            assert.deepEqual([calls, toggled], [2, 2]);

            // a second click while the hook runs does not start it again
            let release;
            button.menuList.hidden = true;
            answer = new Promise(resolve => release = resolve);
            const first = button.toggleMenu();
            await button.toggleMenu();
            release(true);
            await first;
            assert.deepEqual([calls, toggled], [3, 3]);
        } finally {
            Object.getPrototypeOf(Button.prototype).toggleMenu = neoToggle
        }
    });

    it('closes an open rebuilt menu when another record shows', () => {
        const panel = fakePanel({loadMoreMenu: (record, items) => items});

        panel.refs.moreButton = fakeMore();
        panel.setRecord({id: 1});
        panel.refs.moreButton.menuList = {hidden: false};
        panel.setRecord({id: 1, name: 'reloaded'});
        assert.equal(panel.refs.moreButton.menuList.hidden, false);
        panel.setRecord({id: 2});
        assert.equal(panel.refs.moreButton.menuList.hidden, true);
    });

    it('existing detail panels keep a static menu', () => {
        const panel = Neo.create(Panel, {appName: 'test'});

        assert.equal(panel.getReference('moreButton').beforeShowMenu, null);
        panel.destroy();
    });
});
