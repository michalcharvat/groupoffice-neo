// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';
import {setup} from '../node_modules/neo.mjs/test/playwright/setup.mjs';
import '../node_modules/neo.mjs/src/Neo.mjs';
import '../node_modules/neo.mjs/src/core/_export.mjs';

setup({appConfig: {name: 'test'}});

const {default: AutocompleteChips} = await import('../src/form/field/AutocompleteChips.mjs'),
      {default: ChipsField}        = await import('../src/form/field/ChipsField.mjs'),
      {default: MenuList}          = await import('../src/menu/List.mjs'),
      {default: DataSourceForm}    = await import('../src/form/DataSourceForm.mjs'),
      {default: FormWindow}        = await import('../src/view/FormWindow.mjs');

describe('AutocompleteChips.showMenu()', () => {
    const showAt = MenuList.showAt;
    let shown;

    beforeEach(() => { MenuList.showAt = config => (shown = config) });
    afterEach(() => { MenuList.showAt = showAt; shown = null });

    function fakeChips(config = {}) {
        return {
            ...config,
            queryGeneration: 0,
            inputText      : '',
            displayField   : 'name',
            chipTexts      : new Map(),
            value          : [],
            query          : async () => [{id: 1, name: 'Intermesh'}, {id: 2, name: 'Smartflows'}],
            closeMenu() {},
            valueKey       : AutocompleteChips.prototype.valueKey,
            recordToValue  : AutocompleteChips.prototype.recordToValue
        }
    }

    it('opens the menu without recordDetails', async () => {
        await AutocompleteChips.prototype.showMenu.call(fakeChips());

        assert.deepEqual(shown.items.map(i => [i.text, i.detail]), [['Intermesh', null], ['Smartflows', null]]);
    });

    it('shows the details recordDetails gives, and the menu when it fails', async () => {
        await AutocompleteChips.prototype.showMenu.call(fakeChips({recordDetails: async () => ['Customers']}));
        assert.deepEqual(shown.items.map(i => i.detail), ['Customers', null]);

        const error = console.error;
        console.error = () => {};
        shown = null;
        try {
            await AutocompleteChips.prototype.showMenu.call(fakeChips({recordDetails: () => { throw new Error('no') }}));
        } finally {
            console.error = error
        }
        assert.deepEqual(shown.items.map(i => i.detail), [null, null]);
    });
});

describe('DataSourceForm.isSameValue()', () => {
    const same = DataSourceForm.isSameValue;

    it('takes stored rows as unchanged: keys without a field, ids as strings', () => {
        const stored  = [{id: 7, memberId: 3, countryId: 1, street: 'Main', latitude: null}],
              current = [{id: 7, countryId: '1', street: 'Main'}];

        assert.equal(same(current, stored), true);
    });

    it('sees a changed, cleared, added or removed row', () => {
        const stored = [{id: 7, countryId: 1, street: 'Main'}];

        assert.equal(same([{id: 7, countryId: '2', street: 'Main'}], stored), false);
        assert.equal(same([{id: 7, countryId: null, street: 'Main'}], stored), false);
        assert.equal(same([{id: 7, countryId: 1, street: 'Main'}, {street: ''}], stored), false);
        assert.equal(same([], stored), false);
    });

    it('keeps comparing maps both ways, a null entry is not set', () => {
        assert.equal(same({1: 10, 2: null}, {1: 10}), true);
        assert.equal(same({1: 10}, {1: 10, 2: 30}), false);
        assert.equal(same({1: 10, 2: 30}, {1: 10}), false);
        assert.equal(same({1: '10'}, {1: 10}), true);
        assert.equal(same({newKey: ''}, {oldKey: 'value'}), false);
        assert.equal(same([{primary: 1}], [{primary: 1, backup: 2}]), true, 'a row: only its own keys');
    });

    it('keeps scalars and empties', () => {
        assert.equal(same('65', 65), true);
        assert.equal(same('', null), true);
        assert.equal(same(true, false), false);
        assert.equal(same(['1', '2'], [1, 2]), true);
        assert.equal(same([1, 2], [2, 1]), false);
        assert.equal(same([, 'B'], ['A', 'B']), false, 'a hole is a cleared value');
    });
});

describe('FormWindow.setCardDisabled() / setCardHidden()', () => {
    function fakeWindow() {
        const items = [{id: 'general'}, {id: 'voyages'}],
              tabs  = items.map(() => ({disabled: false, hidden: false})),
              cards = {activeIndex: 1, getCardContainer: () => ({items}), getTabAtIndex: i => tabs[i]};

        return {
            cards, tabs, items,
            getReference : ref => items.find(i => i.id === ref) || null,
            updateCardTab: FormWindow.prototype.updateCardTab
        }
    }

    it('turns the tab of a card off and on, the first card takes over', () => {
        const win = fakeWindow();

        FormWindow.prototype.setCardDisabled.call(win, win.items[1], true);
        assert.equal(win.tabs[1].disabled, true);
        assert.equal(win.cards.activeIndex, 0);

        FormWindow.prototype.setCardDisabled.call(win, 'voyages', false);
        assert.equal(win.tabs[1].disabled, false);
    });

    it('hides and shows a tab by reference, an unknown card does nothing', () => {
        const win = fakeWindow();

        FormWindow.prototype.setCardHidden.call(win, 'voyages', true);
        assert.equal(win.tabs[1].hidden, true);
        assert.equal(win.cards.activeIndex, 0);

        FormWindow.prototype.setCardHidden.call(win, 'voyages', false);
        FormWindow.prototype.setCardHidden.call(win, 'nope', true);
        assert.deepEqual(win.tabs.map(t => t.hidden), [false, false]);
    });

    it('the next available card takes over from a hidden first card', () => {
        const win = fakeWindow();

        win.cards.activeIndex = 0;
        FormWindow.prototype.setCardHidden.call(win, 'general', true);
        assert.equal(win.cards.activeIndex, 1);

        FormWindow.prototype.setCardDisabled.call(win, 'voyages', true);
        assert.equal(win.cards.activeIndex, 1, 'no other card is available');
    });
});
