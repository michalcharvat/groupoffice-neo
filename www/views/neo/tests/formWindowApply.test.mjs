// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: FormWindow} = await import('../src/view/FormWindow.mjs');

const proto = FormWindow.prototype;

/**
 * A stand-in for a FormWindow with an Apply button: its buttons and form as plain objects,
 * the FormWindow save methods on it. form.submit() creates once, then updates.
 */
function fakeWindow() {
    const refs = {saveButton: {disabled: false}, applyButton: {disabled: false}},
          win  = {
              formReady       : true,
              closeOnSave     : true,
              applying        : false,
              hasLinks        : false,
              afterSavePromise: null,
              closed          : 0,
              fired           : [],
              calls           : [],
              getReference    : name => refs[name],
              showError       : () => {},
              flushFields     : async () => {},
              hasPendingLinks : () => false,
              createPendingLinks: async () => true,
              updateLinkButtons : () => {},
              fire            : (name, data) => win.fired.push({name, data}),
              close           : () => win.closed++,
              refs
          };

    win.form = {
        currentId: null,
        async submit() {
            const isNew = !win.form.currentId;

            win.calls.push(isNew ? 'create' : 'update ' + win.form.currentId);
            await new Promise(r => setTimeout(r, 5));
            win.form.currentId = '7';
            win.onFormSave({data: {id: '7'}, isNew});
            return {id: '7'}
        }
    };

    ['submit', 'apply', 'setSaveDisabled', 'onFormSave', 'afterSave'].forEach(name => win[name] = proto[name]);
    return win
}

describe('GO.view.FormWindow Apply', () => {
    it('is off by default', () => {
        assert.equal(FormWindow.config.applyButton, false);
    });

    it('saves without closing, fires save, then Save closes', async () => {
        const win = fakeWindow();

        assert.deepEqual(await win.apply(), {id: '7'});
        assert.equal(win.closed, 0);
        assert.equal(win.closeOnSave, true);
        assert.deepEqual(win.fired.map(e => e.name), ['save']);
        assert.equal(win.fired[0].data.isNew, true);

        await win.submit();
        assert.equal(win.closed, 1);
    });

    it('updates the created entity on the next save', async () => {
        const win = fakeWindow();

        await win.apply();
        await win.apply();
        assert.deepEqual(win.calls, ['create', 'update 7']);
        assert.equal(win.fired[1].data.isNew, false);
    });

    it('ignores a second click while saving and disables both buttons meanwhile', async () => {
        const win   = fakeWindow(),
              first = win.apply();

        assert.equal(win.refs.saveButton.disabled, true);
        assert.equal(win.refs.applyButton.disabled, true);
        assert.equal(await win.apply(), false);
        assert.equal(await win.submit(), false);

        await first;
        assert.deepEqual(win.calls, ['create']);
        assert.equal(win.closed, 0);
        assert.equal(win.refs.saveButton.disabled, false);
        assert.equal(win.refs.applyButton.disabled, false);
    });

    it('leaves closeOnSave alone when called during a Save', async () => {
        const win  = fakeWindow(),
              save = win.submit();

        assert.equal(await win.apply(), false);
        assert.equal(win.closeOnSave, true);
        await save;
        assert.equal(win.closed, 1);
    });
});
