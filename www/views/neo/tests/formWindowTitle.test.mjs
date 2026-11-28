// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: FormWindow} = await import('../src/view/FormWindow.mjs');

/** A stand-in FormWindow: title, titleField and a form with one "name" field */
function fakeWindow(currentId, name, titleField = 'name', title = 'Activity') {
    const field = {value: name};

    return {
        field,
        title,
        titleField,
        plainTitle: null,
        form      : {currentId, getField: async n => n === 'name' ? field : null},
        updateTitle: FormWindow.prototype.updateTitle
    }
}

describe('GO.view.FormWindow titleField', () => {
    it('is off by default', () => {
        assert.equal(FormWindow.config.titleField, null);
    });

    it('adds the value of a saved entity and follows changes', async () => {
        const win = fakeWindow('5', 'Anchor <b>');

        await win.updateTitle();
        assert.equal(win.title, 'Activity: Anchor <b>');

        win.field.value = 'Drift';
        await win.updateTitle();
        assert.equal(win.title, 'Activity: Drift');

        win.field.value = '';
        await win.updateTitle();
        assert.equal(win.title, 'Activity');
    });

    it('keeps the plain title of a new entity', async () => {
        const win = fakeWindow(null, 'Anchor');

        await win.updateTitle();
        win.field.value = 'Typed';
        await win.updateTitle();
        assert.equal(win.title, 'Activity');
    });

    it('shows only the value without a title, without piling up', async () => {
        const win = fakeWindow('5', 'Anchor', 'name', null);

        await win.updateTitle();
        win.field.value = 'Drift';
        await win.updateTitle();
        assert.equal(win.title, 'Drift');
    });

    it('leaves the title alone without titleField', async () => {
        const win = fakeWindow('5', 'Anchor', null);

        await win.updateTitle();
        assert.equal(win.title, 'Activity');
        assert.equal(win.plainTitle, null);
    });
});
