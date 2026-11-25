// Run from www/views/neo: ../../node_modules/.bin/mocha tests/
import assert from 'node:assert/strict';

const components = new Map();

globalThis.Neo ??= {};
Neo.getComponent = id => components.get(id) || null;
Neo.isString ??= value => typeof value === 'string';

const {isSubmitEnter, submitOnEnter} = await import('../src/form/submitOnEnter.mjs');

const form    = {id: 'form'},
      field   = {id: 'field'},
      picker  = {id: 'picker', keys: {keys: [{key: 'Enter', fn: 'onKeyDownEnter'}]}},
      chips   = {id: 'chips', ownsEnterKey: () => true},
      outside = {id: 'outside', keys: {keys: [{key: 'Enter', fn: 'onOpen'}]}};

[form, field, picker, chips, outside].forEach(component => components.set(component.id, component));

/**
 * keydown data of neo's main DomEvents: target and path (innermost first)
 */
const enter = (tagName, ids, extra = {}) => ({
    key   : 'Enter',
    target: {tagName, isContentEditable: false},
    path  : [{id: 'input-el'}, ...ids.map(id => ({id}))],
    ...extra
});

describe('submitOnEnter', () => {
    it('submits on Enter in a plain input of the form', () => {
        assert.equal(isSubmitEnter(enter('input', ['field', 'form', 'outside']), form), true);
    });

    it('does not submit from a textarea, rich text, a button or a select', () => {
        assert.equal(isSubmitEnter(enter('textarea', ['field', 'form']), form), false);
        assert.equal(isSubmitEnter(enter('div', ['field', 'form'], {target: {tagName: 'div', isContentEditable: true}}), form), false);
        assert.equal(isSubmitEnter(enter('button', ['form']), form), false);
        assert.equal(isSubmitEnter(enter('select', ['field', 'form']), form), false);
    });

    it('does not submit with a modifier (Ctrl+Enter may mean send)', () => {
        for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
            assert.equal(isSubmitEnter(enter('input', ['field', 'form'], {[modifier]: true}), form), false, modifier);
        }
    });

    it('does not submit the Enter that confirms an IME composition', () => {
        assert.equal(isSubmitEnter(enter('input', ['field', 'form'], {keyCode: 229}), form), false);
    });

    it('passes the event to ownsEnterKey()', () => {
        const color = {id: 'color', ownsEnterKey: ({target}) => target.cls.includes('go-colorfield-picker')};

        components.set('color', color);
        assert.equal(isSubmitEnter(enter('input', ['color', 'form'], {target: {tagName: 'input', cls: ['go-colorfield-picker']}}), form), false);
        assert.equal(isSubmitEnter(enter('input', ['color', 'form'], {target: {tagName: 'input', cls: ['go-field-input']}}), form), true);
    });

    it('leaves Enter to a component inside the form that uses it', () => {
        assert.equal(isSubmitEnter(enter('input', ['picker', 'form']), form), false);
        assert.equal(isSubmitEnter(enter('input', ['chips', 'form']), form), false);
    });

    it('ignores Enter bindings outside the form', () => {
        assert.equal(isSubmitEnter(enter('input', ['field', 'form', 'outside']), form), true);
    });

    it('calls the handler of the form or of a parent ("up.")', () => {
        const calls  = [],
              parent = {onLogin() { calls.push(['onLogin', this]) }},
              child  = {parent, submit() { calls.push(['submit', this]) }};

        components.set('child', child);
        submitOnEnter('submit')(enter('input', ['field', 'child']), child);
        submitOnEnter('up.onLogin')(enter('input', ['field', 'child']), child);
        submitOnEnter('submit')(enter('textarea', ['field', 'child']), child);

        assert.deepEqual(calls, [['submit', child], ['onLogin', parent]]);
    });
});
