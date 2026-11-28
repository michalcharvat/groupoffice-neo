// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: Observable}   = await import('../node_modules/neo.mjs/src/core/Observable.mjs'),
      {default: JmapComboBox} = await import('../src/form/field/JmapComboBox.mjs'),
      {default: client}       = await import('../src/jmap/Client.mjs');

// stands in for a FormWindow: records its config, the test fires save / close
class FakeDialog extends Observable {
    static config = {className: 'Test.JmapComboCreateDialog', appName: null, windowId: null, values: null}
    form = {currentId: null}
}

Neo.setupClass(FakeDialog);

describe('JmapComboBox createDialog', () => {
    const get = client.get;
    let opened;

    beforeEach(() => {
        client.get = async (entity, ids) => ids.map(id => ({id, name: 'Created ' + id}));
        opened = null
    });
    afterEach(() => { client.get = get });

    const combo = config => Neo.create(JmapComboBox, {appName: 'test', name: 'crewChangeId', entity: 'AmdPortCallCrewChange', ...config}),
          dialog = async () => ({default: class extends FakeDialog {
              construct(config) { super.construct(config); opened = this }
          }}),
          hidden = field => field.getTrigger('create').hidden;

    it('has no "+" without a createDialog', () => {
        assert.equal(combo().getTrigger('create'), null);
    });

    it('hides the "+" without create permission and when read-only', () => {
        const field = combo({createDialog: dialog, mayCreate: false});

        assert.equal(hidden(field), true);
        field.mayCreate = true;
        assert.equal(hidden(field), false);
        field.readOnly = true;
        assert.equal(hidden(field), true);
        field.readOnly = false;
        assert.equal(hidden(field), false);
    });

    it('does not open the dialog without create permission', async () => {
        const field = combo({createDialog: dialog, mayCreate: false});

        assert.equal(await field.openCreateDialog(), null);
        assert.equal(opened, null);
    });

    it('opens the dialog with createValues and selects the saved entity', async () => {
        const field = combo({createDialog: dialog, createValues: f => ({vesselId: 3, name: f.name})}),
              win   = await field.openCreateDialog();

        assert.equal(win, opened);
        assert.deepEqual(win.values, {vesselId: 3, name: 'crewChangeId'});

        win.form.currentId = 7;
        win.fire('save', {data: {}, isNew: true});

        assert.equal(field.getSubmitValue(), 7);
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(field.value.name, 'Created 7', 'the text comes from Entity/get');

        // the loaded list misses the new entity: the next open queries again
        let queried = false;
        field.store.isLoaded = true;
        field.store.setFilter = async () => { queried = true };
        await field.doFilter(null);
        assert.equal(queried, true);
    });

    it('does not open the dialog when the permission goes while the module loads', async () => {
        let resolve;
        const field = combo({createDialog: () => new Promise(r => resolve = r)}),
              open  = field.openCreateDialog();

        field.mayCreate = false;
        resolve(await dialog());

        assert.equal(await open, null);
        assert.equal(opened, null);
    });

    it('keeps the old value when the dialog closes unsaved', async () => {
        const field = combo({createDialog: dialog, value: 5}),
              win   = await field.openCreateDialog();

        win.fire('close');

        assert.equal(field.getSubmitValue(), 5);
    });
});
