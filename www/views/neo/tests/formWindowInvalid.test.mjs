// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: FormWindow} = await import('../src/view/FormWindow.mjs');

const proto = FormWindow.prototype;

describe('GO.view.FormWindow refused save', () => {
    it('says why, shows the card of the first invalid field and focuses it', async () => {
        let rendered;
        const cardContainer = {id: 'cc', items: [], promiseUpdate: () => new Promise(r => rendered = r)},
              tab1          = {id: 't1', parentId: 'cc'},
              tab2          = {id: 't2', parentId: 'cc'},
              wrapper       = {id: 'w', parentId: 't2'},
              focused       = [],
              field         = {id: 'f', parentId: 'w', getInputElId: () => 'f__input', focus: id => focused.push(id)},
              getComponent  = Neo.getComponent;

        cardContainer.items.push(tab1, tab2);

        const win = {
            error            : null,
            cards            : {activeIndex: 0, getCardContainer: () => cardContainer},
            form             : {findFirstInvalid: async () => field},
            showError        : text => win.error = text,
            onInvalid        : proto.onInvalid,
            focusFirstInvalid: proto.focusFirstInvalid
        };

        Neo.getComponent = id => ({t1: tab1, t2: tab2, w: wrapper, cc: cardContainer})[id];

        try {
            const done = win.onInvalid();

            await new Promise(r => setTimeout(r, 5));
            // a hidden card's field cannot take focus: nothing before the switched card is rendered
            assert.equal(win.cards.activeIndex, 1);
            assert.deepEqual(focused, []);

            rendered();
            await done;
        } finally {
            Neo.getComponent = getComponent
        }

        assert.equal(win.error, 'You have errors in your form. The invalid fields are marked.');
        assert.equal(win.cards.activeIndex, 1);
        assert.deepEqual(focused, ['f__input']);
    });
});
