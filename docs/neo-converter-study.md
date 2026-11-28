# neo: ExtJS-to-neo converter study (2026-11-28)

The owner asked whether classic components could be carried over to neo by rules (ext button {...} → neo button
{...}) instead of porting every component by hand. The aim was to stop drift in icons, sizes and padding, and to
avoid porting every new classic feature again by hand. This study is a prototype converter and its numbers
against two modules that were already ported by hand: amd/ports and amd/links, on the amd branch `neo`. No module
was changed for real.

## Answer in short

- **The converter takes the declarative part well and nothing else.** For dialogs, combos and chips, 77-82 % of
  the configs it writes are what the hand port has (identical, or the same value in another notation). It leaves
  only 22 % of the classic dialog lines as TODO.
- **For a whole module it is a skeleton generator, not a porter.** It reproduces 45 % of the config entries the
  measure recognises in the ports and links hand ports. 62 % of the classic lines stay TODO. Roughly half of the
  classic lines are imperative code: server calls, listeners, initComponent logic, store handling, renderers and
  handlers. No rule table converts that.
- **Its best use is a later classic change.** `delta.mjs` converts the classic file before and after a change and
  lists the change config by config ("+ field label {…}", "~ field note height 100 → 160"). A text merge into the
  hand port does not work, because the notations differ. The config list does.
- **Recommendation:** about 1.5 weeks to harden the rules, add skeletons for the next base classes and wire it
  into the port workflow. Use it to generate skeletons for new port cards and `delta.mjs` for `Port-to: neo`
  follow-ups. Keep porting behaviour by hand. Details are under "Recommendation" below.

## What was built

`scripts/neo-converter/` (node, `acorn` from `www/views/neo/node_modules`, no new dependency):

| File | Does |
|---|---|
| `rules.mjs` | The rule table: xtype / `go.*` class → neo module and import, config key renames, keys dropped on purpose, base class → handler, TODO kinds |
| `convert.mjs` | `node scripts/neo-converter/convert.mjs <module dir> [--out <dir>] [--package amd]`. Parses each classic file (scripts.txt order), converts it by the rules and writes `view/<Name>.mjs` (`Module.js` → `Index.mjs`). Anything without a rule becomes a `// TODO(neo-converter) [kind] reason` block with the original code |
| `measure.mjs` | `node scripts/neo-converter/measure.mjs ~/Projects/groupoffice26-neo-amd [--json]`. Converts ports and links and compares every config entry with the hand port (mapping from each module's PORTING.md) |
| `delta.mjs` | `node scripts/neo-converter/delta.mjs <module dir> <classic file> [rev]`. What a classic change means for the neo file, config by config |
| `convert.test.mjs` | `node --test scripts/neo-converter/` (8 tests: dialog, TODO, grid, detail, measure, delta, robustness) |

Rules it has:

- **Base classes**
  - `go.form.Dialog` → `FormWindow`: `createFormItems()`; `properties` comes from the form's field names;
    `wrapperStyle` from `width`/`height`; `className` and `cls` follow the house naming.
  - `go.grid.GridPanel` → `Grid` subclass: `go.data.Store` becomes a `JmapStore` (entity, properties, sorters);
    `viewConfig.emptyText` becomes `emptyText` and `emptyIcon`.
  - `go.detail.Panel` → `GO.detail.Panel`:
    - XTemplate rows become `LinesCard` lines in `renderRecord()`. A row with `{field}`, `{a}, {b}` or a
      simple `{[values.x …]}` converts; a `<tpl if>` row or one that calls `Ext`/`this` stays TODO.
    - `addLinks()` / `addHistory()` / … become `cards`.
    - Toolbar buttons that core already builds (Edit, links, Print, Delete) are dropped, and Delete becomes
      `onDelete() {this.deleteRecord()}`.
  - `go.form.ComboBox(Reset)` / `go.form.Chips` → an exported factory, e.g.
    `export const portCombo = config => ({module: JmapComboBox, entity, …, ...config})`.
  - `go.Modules.register` → `ModuleRegistry.register({package, name, title, capability, mainView})`.
- **Form items**
  - `textfield`, `textarea`, `numberfield`, `hidden`, `xcheckbox`, `datefield` become neo fields with the house
    style: `labelPosition: 'inline'`, `flex: 'none'`.
  - A `fieldset` with a title becomes the core `fieldset()`. One without a title is flattened into its parent.
  - A local `combo` over an `ArrayStore` becomes a `SelectField` with options.
  - `formgroup` becomes an `ArrayField` of `ContainerField` rows with a remove button, followed by an Add button.
  - `new go.modules.community.addressbook.ContactCombo` → `JmapComboBox` over Contact.
  - The module's own combo classes and xtypes are found by scanning the module and become calls of their factory.
- **Keys**
  - Renamed: `fieldLabel` → `labelText`, `hiddenName` → `name`, `boxLabel` → `valueLabel`,
    `emptyText` → `placeholderText`, `itemId` → `reference`.
  - Translated: `allowBlank: false` → `required: true`; `allowDecimals: false` → `stepSize: 1`;
    `allowNegative: false` → `minValue: 0`.
  - `t('X', 'module', 'package')` → `t('X')` with the module's translator, and `dp(n)` → `n`.
  - `iconCls: 'ic-*'` → `icon` through the classic glyph map: 953 `ic-*` classes from the Paper theme's built CSS,
    plus the module's `themes/*/style.css` (neither module has one).
  - Dropped: `anchor`, `stateId`, `redirectOnSave`, `maximizable`, `stateful` and the combo plumbing
    (`triggerAction`, `mode`, `forceSelection` …).
- **Columns**
  - `header` → `text`, translated even when it is a plain string; `dataIndex` → `dataField`; `align` →
    `cellAlign`.
  - `checkcolumn` gets a check renderer. `datecolumn` gets a date-time renderer, aligned right.
  - A column `renderer` stays TODO.

## How it was measured

Each classic file is converted and compared with the neo files its PORTING.md row names. A *config entry* is one
key of a converted field, column, store, class config, detail line, factory or registration. Configs are paired by
identity:

- `field:<name>` and `col:<dataField>`
- `store:<entity>`
- `grid:<stateId>`
- `class:<className>`
- `line:<label>`
- `factory:<export>` and `factory-use:<factory>`

Before comparing, the hand port's own helpers are resolved: `...inline`, `inline({…})`, `combo(…)` and exported
constants such as `PORT_PROPERTIES`. Each entry then gets one verdict:

| Verdict | Means |
|---|---|
| same | The same code (whitespace aside) |
| notation | The same value written another way: quotes, a shared helper, `tCore` vs `t`, `port.` vs `record.` (whitespace inside a string literal is not told apart either) |
| different | Both have the key, with another value |
| extra | Only the converter wrote the key |
| missing | Only the hand port has the key, in a config both have |
| unmatched | A converted config with no counterpart in the hand port (another structure) |
| TODO | A classic line the converter left in a TODO block |

### Per file

| Module | Classic file | Kind | Classic lines | TODO lines | Same | Notation | Different | Extra | Missing | Unmatched |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| ports | Module.js | register | 55 | 52 | 5 | 0 | 0 | 0 | 5 | 0 |
| ports | SystemSettingsPanel.js | no rule | 29 | 27 | 0 | 0 | 0 | 0 | 0 | 0 |
| ports | SettingsDialog.js | no rule | 26 | 24 | 0 | 0 | 0 | 0 | 0 | 0 |
| ports | UnlocodeGrid.js | grid | 268 | 109 | 16 | 0 | 18 | 1 | 3 | 30 |
| ports | UnlocodeCombo.js | combo | 32 | 6 | 2 | 3 | 1 | 1 | 2 | 0 |
| ports | ServiceCombo.js | combo | 18 | 0 | 3 | 3 | 0 | 1 | 1 | 0 |
| ports | ServiceChips.js | chips | 13 | 0 | 3 | 3 | 0 | 1 | 0 | 0 |
| ports | ServiceDialog.js | dialog | 25 | 0 | 6 | 0 | 0 | 0 | 0 | 7 |
| ports | ServiceGrid.js | grid | 114 | 89 | 0 | 0 | 0 | 0 | 0 | 11 |
| ports | CompanyServiceDialog.js | dialog | 38 | 0 | 22 | 0 | 3 | 4 | 1 | 0 |
| ports | CompanyServiceGrid.js | grid | 134 | 96 | 6 | 0 | 3 | 3 | 15 | 3 |
| ports | CountryCombo.js | combo | 19 | 0 | 3 | 3 | 0 | 1 | 1 | 0 |
| ports | CountryDialog.js | dialog | 25 | 0 | 11 | 0 | 2 | 0 | 0 | 0 |
| ports | CountryGrid.js | grid | 111 | 80 | 0 | 0 | 0 | 0 | 0 | 14 |
| ports | PortCombo.js | combo | 18 | 0 | 3 | 3 | 0 | 1 | 1 | 0 |
| ports | PortComboReset.js | combo | 18 | 0 | 0 | 0 | 0 | 0 | 0 | 7 |
| ports | PortChips.js | chips | 12 | 0 | 2 | 3 | 0 | 1 | 1 | 0 |
| ports | PortDialog.js | dialog | 204 | 85 | 40 | 14 | 5 | 6 | 13 | 0 |
| ports | PortDetail.js | detail | 241 | 137 | 3 | 2 | 3 | 1 | 1 | 0 |
| ports | PortGrid.js | grid | 115 | 12 | 28 | 3 | 5 | 1 | 14 | 12 |
| ports | MainPanel.js | no rule | 286 | 284 | 0 | 0 | 0 | 0 | 0 | 0 |
| links | CategoryDialog.js | dialog | 51 | 1 | 20 | 6 | 1 | 1 | 1 | 0 |
| links | CategoryGrid.js | no rule | 43 | 41 | 0 | 0 | 0 | 0 | 0 | 0 |
| links | HistoryDetailPanel.js | grid | 87 | 78 | 0 | 0 | 0 | 0 | 0 | 3 |
| links | LinkDetail.js | detail | 108 | 19 | 4 | 3 | 0 | 0 | 2 | 0 |
| links | LinkDialog.js | dialog | 51 | 0 | 25 | 6 | 2 | 1 | 1 | 0 |
| links | LinkGrid.js | grid | 72 | 2 | 22 | 0 | 6 | 1 | 13 | 0 |
| links | LinkCombo.js | combo | 27 | 5 | 8 | 0 | 0 | 0 | 2 | 0 |
| links | LinkComboReset.js | combo | 27 | 5 | 0 | 7 | 1 | 0 | 2 | 0 |
| links | SystemSettingsPanel.js | no rule | 25 | 23 | 0 | 0 | 0 | 0 | 0 | 0 |
| links | MainPanel.js | no rule | 421 | 416 | 0 | 0 | 0 | 0 | 0 | 0 |
| links | Module.js | register | 245 | 241 | 5 | 0 | 0 | 0 | 5 | 0 |
| **Total** | 32 files | | **2958** | **1832** | **237** | **59** | **50** | **25** | **84** | **87** |

Not measured: `customfield/Port.js` (not ported yet, PORTING.md row 12) and links `GenerateDialog.js` (not in
PORTING.md). "No rule" is a base class without a handler: `go.modules.ModulePanel`, `go.NavGrid`,
`go.systemsettings.Panel` and `go.Window`. These files become one TODO block per member.

### By kind of classic class

| Kind | Files | Classic lines | TODO | Written entries same / notation | Hand-port entries missing |
|---|---:|---:|---:|---:|---:|
| dialog | 6 | 394 | 86 (22 %) | 150 of 182 (82 %) | 16 |
| combo + chips | 9 | 184 | 16 (9 %) | 49 of 64 (77 %) | 10 |
| detail | 2 | 349 | 156 (45 %) | 12 of 16 (75 %) | 3 |
| grid | 7 | 901 | 466 (52 %) | 75 of 186 (40 %) | 45 |
| register (Module.js) | 2 | 300 | 293 (98 %) | 10 of 10 | 10 |
| no rule (main panel, nav grid, settings) | 6 | 830 | 815 (98 %) | – | – |

Robustness: the converter ran over every classic file of all 95 amd and sf modules on the neo branches (2504
files). The output parses (acorn, ES module) for every file it converted. 79 files could not be read at all,
and all of them are vendored libraries (leaflet, pdfjs, tesseract, codemirror sources that are ES modules); they
get a single `[error]` TODO.

### Totals

- **Classic lines:** 1126 of 2958 (38 %) were converted or dropped by a rule, and 1832 (62 %) are in TODO blocks.
- **Entries the converter wrote:** 458. Of these, 296 (65 %) are the same as in the hand port or the same in
  another notation.
  - Of the 371 entries that met a counterpart in the hand port, 80 % are the same or the same in notation.
  - 87 entries are in configs that the hand port built in another structure. Examples: the ports Services list
    became core `LookupListPanel` definitions, `PortComboReset` became `portCombo()` with `clearable`, and the
    Company column became a renderer.
- **The whole hand port**, every config entry the measure recognises in every neo file, including what classic
  never had: 45 % of the entries came out of the converter the same or in another notation. A hand config is
  credited to one classic file only.
  - ports: 190 of 426 entries (19 files, 2242 lines)
  - links: 106 of 230 entries (13 files, 1545 lines)
  - The denominator counts only configs with a recognisable identity: fields, columns, stores, class configs,
    detail lines, factories and registrations. Configs such as core lookup definitions (`settingsLookups.mjs`:
    `entity`, `dialogTitle`, `{text, field}` columns) are not counted, so 45 % is an upper bound for "share of
    the hand port".
- **Size:** the hand ports have 3787 non-blank lines against 2958 classic lines. They add rule modules
  (`*Rules.mjs`) with tests, phone layouts, push watching and permission gates that classic did not have.

### What the "different" entries are

The hand port made a deliberate choice that a rule cannot know:

- **Sizes:** dialog `wrapperStyle` (e.g. CountryDialog 40vh instead of 600 px) and column widths (UN/LOCODE 75 →
  90, ID 40 → 60). neo's font and padding are larger, so the hand ports widened columns.
- **Readable texts instead of classic's raw keys:** UnlocodeGrid headers `t('subDiv')` → `t('Subdivision')`. Of
  that file's 18 differences, 11 are these and 7 are widths.
- **Required:** classic combos have `allowBlank: false`. The hand ports make the shared factories optional and set
  `required` per dialog. The converter writes `required: true` into the factory.
- **Classic bugs fixed in the port:** CountryDialog gets `isoName` (classic cannot create a country), and
  PortDialog has no `sourceId` (classic deleted it before submit).
- **Notation that is really logic:** GPS `gpsText(port)` instead of `` `${record.latitude}, ${record.longitude}` ``,
  and `String(port.id)` instead of `record.id || '-'`.

"Missing" entries are mostly behaviour keys that classic did not have:

- `reference` on fields that logic reads
- `pageSize`, `scrollLoad`, `model`, `serverSortProperties` and `hideable: false` on grids
- `entityActions` and `navigateOnRowClick` on lists

## Browser check

Card container :8031 (`neo-card-container.sh`, worktree www with the main checkout's node_modules and themes
built), headless Playwright as `admin`, 2026-11-28. Three converted files were copied into a temporary dev page
(`#dev/core/ConverterCheck`, removed again, not committed): links `CategoryDialog`, ports `PortDialog` and the
converted `CountryCombo`/`UnlocodeCombo` factories it imports. Their class names were given a `GO.converted.`
prefix: `Neo.setupClass()` returns an already registered class of the same `className`, and the hand port's class
was loaded, so a first run showed the hand port's dialog.

- **Converted CategoryDialog:** opens and loads category 1 ("Shared", AMD-, 8). Its title follows `titleField`
  ("Category: Shared"), and the fieldset "Code Settings", the number field with spin buttons, Save and Cancel are
  there. The Permissions tab is missing: classic `addPanel(new go.permissions.SharePanel())` is a TODO, and the
  core `FormWindow.addSharePanel()` is an empty extension point. links writes its own.
- **Converted PortDialog (new):** (a run before the Codex review fixes: an explicit `allowBlank: true` now becomes
  `required: false`, and the converter now writes `fields.mjs` with the module's factories) opens with Update from, Name, Country, UN/LOCODE (placeholder `CC LLL`),
  Latitude, Longitude, Zoom and Alternative names with an Add button (the `formgroup` rule). Differences from the
  hand port:
  - Time zone is missing (a TODO: the raw `Ext.form.ComboBox` with runtime options).
  - Zoom shows no 8: `value` on a field of a new FormWindow is not the way, `values` is.
  - Update from is marked Required: the classic combo has `allowBlank: false`, and the dialog removed `sourceId`
    by code.
- Console: no errors from the converted files.

## What stays manual

The TODO lines by kind. A line can count in two blocks, for example a listener that makes a server call.

| Kind | Classic lines | Examples |
|---|---:|---|
| server call (GO.request, go.Jmap, go.Db) | 508 | links code route (`AmdLinksLink/query` → `Link/query` → goto), generate jobs polling, UN/LOCODE → country lookup in PortDialog's `select` |
| listeners / events | 430 | `select` / `beforeselect` of combos, `rowclick` / `selectionchange` wiring of MainPanel, `beforesubmit` |
| no rule (declarative, but no rule yet) | 339 | `tbar` with `tbsearch` / `tbtitle` / buttons, `sm`/`selModel`, `go.NavGrid` lists, `go.systemsettings.Panel` tabs, `relations`, combo `tpl`, `minChars` |
| initComponent / method logic | 215 | `onLoad`, `loadTimezones`, `initModule`, custom methods |
| store handling | 198 | `store.setFilter`, `store.load()`, relation fields (`creator`, `modifier`), raw `Ext.data.ArrayStore` |
| renderer | 72 | column renderers (country name, services one per line, principal names) |
| handler | 45 | button handlers: Add with the checked category, import / export |
| template (XTemplate) | 25 | `<tpl if>` rows, rows that call `this.getExternalUrl()` or `Ext.util.Format.nl2br` |

Most of the 1832 TODO lines are imperative code: it runs, wires events or talks to the server. A rough count
gives about 1450-1500 lines. The kinds overlap, and a block is counted under the first pattern it matches, so a
whole method with one server call counts as a server call, including any declarative config inside it. These need
the neo idioms written by hand:

- `formReady` / `onConstructed` instead of `onLoad` / `initComponent`
- `JmapStore` filters instead of `setFilter`
- `client.jmap()` instead of `go.Db`
- core `entityActions` / `ListToolbar` instead of hand-made row menus
- rule modules with tests for logic worth testing

The TODO block keeps the original next to the place it belongs, which is a good prompt for porting it by hand or
with an LLM. Lines of the same code still differ between the two clients. The other 341 lines are declarative,
and more rules would take them (see the effort estimate). The figures in this table are block spans; the
1832 total counts each non-blank classic line once.

## A later classic change

The flow that works:

1. Run `node scripts/neo-converter/delta.mjs <module dir> <classic file> <rev before the change>` on the changed
   classic file. It converts both versions and lists the difference config by config.
2. Carry the listed items into the neo file, in the hand port's notation, and keep its hand-written parts.

Example (simulated: links `LinkDialog.js` gets a `label` text field and a taller note):

```
~ class:GO.links.view.LinkDialog properties: ['id', 'code', 'target', 'isActive', 'trackHistory', 'note'] → ['id', 'code', 'target', 'label', 'isActive', 'trackHistory', 'note']
+ field:label {module: TextField, name: 'label', labelText: t('Label'), labelPosition: 'inline', flex: 'none'}
~ field:note height: 100 → 160
```

What does not work: a text 3-way merge (`git merge-file` with converter(old) as base, converter(new) as theirs
and the hand port as ours) conflicts on the whole `createFormItems()` and on the class config. The hand port
writes the same configs in another notation (`...inline`, other key order, `properties` of its own), so no
context lines match. The config-level delta does not depend on notation.

A change in imperative code (a listener, a server call) shows as the TODO block going (`-`) and coming back with
the new original code (`+`). That tells you where to look, not what to write. Two uses of the same factory in one
file are told apart by their order (`factory-use:portCombo#2`), so a reordering shows as changes.

This fits the existing `Port-to: neo` trailer of `go:port`: for a classic commit waiting for a neo port, the
delta of each changed classic file is the to-do list.

## Effort estimate for rules covering the rest

Scale across all amd and sf modules on the neo branches: 1828 classic classes (`Ext.extend`). The prototype
handles the base class of 1104 of them (60 %): `go.grid.GridPanel` 335, `go.form.Dialog` 333, `go.form.ComboBox`
224, `go.detail.Panel` 106, `go.form.ComboBoxReset` 61 and `go.form.Chips` 45. The next tier is 497 classes
(27 %): `go.Window` 162, `Ext.Panel` 119, `go.modules.ModulePanel` 81, `go.systemsettings.Panel` 54,
`go.form.FormGroup` 50 and `go.NavGrid` 31. `Ext.Panel` subclasses are anything from a tab to a canvas and get
no skeleton below, so the skeleton step covers 378 of the 497.

| Step | Days | Gives |
|---|---:|---|
| Harden the six handled bases: grid `tbar` (`tbsearch` → `ListToolbar`, Add / ⋮ buttons), `sm` → `multiSelect`, Reset combos → `clearable`, a registry of other modules' factories (portcall's dialogs use `portCombo()` of ports), more template idioms (`nl2br` → `{html}`), relation columns as a TODO renderer stub | 3-4 | The 341 declarative "no rule" lines of this sample, most of them |
| Skeletons for the next tier: `go.Window` → `GO.view.Dialog`, `ModulePanel` → `MainThreeColumnPanel` with west / center / east slots, `go.systemsettings.Panel` → `systemSettings` registration + panel, `go.NavGrid` → `NavCheckList`, standalone `FormGroup` | 3-4 | Main panels and settings get a structure instead of one TODO per member; their wiring stays manual |
| Integration: `delta.mjs` in the `go:port` `Port-to: neo` flow, skeleton generation step in `go:neo-port` | 1 | The workflow uses it |
| **Total** | **7-9** | A guess, not a measurement: maybe 55-60 % of a hand port's recognisable config entries generated (45 % now), if the 339 "no rule" lines convert at the dialog rate; the imperative half stays manual |

Beyond that, each rule pays off only once its xtype or class shows up in enough modules. Every module brings
classes of its own (31 `formbuilder.fields.Base`, 12 `vessels.DefinitionsGrid`, invoices' `CodebookGrid`), and
those get a factory scan, not a rule.

## Recommendation

1. **Don't replace hand porting with conversion.** The converter writes neither the behaviour (about half of the
   classic code) nor what the hand ports add (rule modules with tests, phone layout, push, permission gates).
   Those are most of the work and most of the value of a port card.
2. **Use it as the first step of each new port card:** generate the skeleton (dialogs, combos, columns, simple
   detail lines) with the TODOs, then port by hand from there. This takes the typing out of the declarative part
   and keeps icons (one glyph map), labels and the inline-field style the same across modules. That is the drift
   the owner named. Sizes are the exception: the hand ports widened them on purpose.
3. **Use `delta.mjs` for every classic change that has to reach neo.** This is where the converter beats hand
   porting: the change is listed config by config, without reading the classic diff by hand.
4. If 1 and 3 are wanted, spend the 7-9 days above. Do the integration step first, because it is cheap and
   gives the delta flow now.

## Limits of this study

- The numbers were taken on 2026-11-28 against the amd `neo` branch of that day; the hand ports keep changing, so
  a rerun of `measure.mjs` gives slightly other numbers.
- The sample is two modules (32 classic files, 2958 lines). Both are mostly declarative. A module with heavier
  logic (crew, invoices) will have a higher TODO share.
- The measure pairs configs by name. A hand port that splits a classic file differently (the Services list became
  core lookup definitions) counts as "unmatched", even where the result is the same in the browser.
- The browser check opened two converted dialogs as a dev page. It did not save, because the dev database is
  shared.
- The TODO kinds come from regular expressions over the original code. A block counts under the first kind it
  matches.
