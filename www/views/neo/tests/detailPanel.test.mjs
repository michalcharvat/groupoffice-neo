// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: Panel}         = await import('../src/detail/Panel.mjs'),
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
              moreButton      : {disabled: true, deleteDisabled: null, setMenuItemDisabled(id, disabled) {this.deleteDisabled = disabled}},
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
        'createMoreMenu', 'onEdit', 'onDelete', 'deleteRecord'].forEach(name => panel[name] ??= proto[name]);
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
