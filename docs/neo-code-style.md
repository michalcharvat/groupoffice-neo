# neo web client: code style and JSDoc

The neo client (`www/views/neo`) follows the JSDoc convention of neo.mjs itself
(`node_modules/neo.mjs/AGENTS.md` §pre_commit_gates, "Anchor & Echo";
`learn/agentos/AGENTS_ATLAS.md` 15.6). Reference files: `node_modules/neo.mjs/src/button/Base.mjs`,
`src/button/Split.mjs`.

**Scope:** every class and method you add or change. Don't rewrite untouched files just to add tags.

## Class

```js
/**
 * @summary One sentence: what the class is.
 *
 * Intent, usage example, extension points, events (free prose, as in src/view/FormWindow.mjs).
 * @class GO.view.FormWindow
 * @extends GO.view.Dialog
 */
class FormWindow extends Dialog {
```

`@class` is the `className` from `static config`; `@extends` is the parent's `className`.

**Anchor & Echo:** name the domain terms in the class docblock (the anchor) and reuse the same
words in config and method docs (the echo), so a search for a term finds the whole feature.
Point to related symbols or examples with `@see`.

## Configs

A new class documents `className` and `ntype` as `@protected` members (as `src/button/Split.mjs`).
Every other config you introduce gets a block; configs you only override (`cls`, `layout`, `items`) don't:

```js
/**
 * Legend above the checkboxes
 * @member {String} label_=''
 * @reactive
 */
label_: '',
```

- `{Type} name=default`, with the trailing `_` for reactive configs, plus `@reactive`.
  A config declared as a descriptor (`[isDescriptor]: true`) leaves out `=default`.
- `@protected` for configs that are internal to the class (`className`, `ntype`, references set in the constructor).

## Methods

```js
/**
 * @summary Opens the entity in a new tab, or focuses the tab when it is open already.
 * @param {Number}  id
 * @param {Boolean} [focus=true]
 * @returns {Promise<Boolean>} false when the user may not read the entity
 * @protected
 */
```

- `@summary` on every method, `afterSet*` / `beforeSet*` hooks included (one line is enough);
  hooks take `@param value` / `@param oldValue`, and `beforeSet*` also `@returns`.
- `@param` / `@returns` with types; optional parameters in `[name=default]`.
- `@protected` for methods not meant to be called from outside the class.

## Comments

- Explain intent, an invariant or a boundary: *why*, not *what*.
- No ticket or card numbers, line numbers (`Foo.mjs:120`) or history ("was X before the fix") in source comments: those belong in the commit message or in `docs/`.
- Point to a symbol (`Dialog#onEscape()`), not a file position.
