# neo: amd/templates port, analysis and card split (2026-11-28)

Part of the owner's request of 2026-11-28 to plan the next amd modules (see `docs/neo-ports-port.md` for the
context, `docs/neo-crew-port.md` and `docs/neo-dms-port.md` for the model). Module code goes to the amd-mono branch
`neo`; core pieces to `neo-ui`.

Sources read: `amd/templates/views/extjs3` (6 files, about 700 lines: `TemplateGrid.js` 332, `TemplateDialog.js`
179, `TemplateBlocksField.js` 131), `templates/Module.php` (`getDependencies()`: sf/codemirror, sf/mpdf; right
`mayManage`), every amd module that uses templates, the CodeField card branch
(`task/20261128-014608-neo-ui-go-form-field-codefield-codemirro`, `form/field/CodeField.mjs`). Nothing was run in a
browser.

amd/templates has **no main panel**. It is a backend library (PDF rendering with mPDF, docx / xlsx processors) plus
a template editor that another module embeds in its own dialog, scoped by `{module, key}`.

## 1. Inventory by behaviour

| # | Area | Behaviour (ExtJS source) | GO.neo | Class |
|---|---|---|---|---|
| 1 | Registration | `go.Modules.register('amd','templates')`: entity `AmdTemplatesTemplate` (relations creator, modifier; filters `text`, `createdAt`, `modifiedAt`). No main panel, no routes, no settings | `ModuleRegistry.register({package:'amd', name:'templates', capability})` without `mainView`; the module exports its classes for the hosts | port |
| 2 | Template list | `TemplateGrid` (embedded, `module` + `key` configs, `setKey()` changes the `module` filter `{module, key}`; loads on render unless disabled): name, language, created / modified at and by; sort name desc; `tbsearch` `text`; Add (primary: dialog with `{module, key}` and the host's `templateDefaults`); double click opens the dialog (also for a reader); row ⋮ Edit, Delete (confirm), Export JSON. Add, Import, Edit and Delete need `mayManage`; Export does not (`TemplateGrid.js` 34-41, 160, 200-226). The catalog host computes the key `book-default-<id>`, calls `setKey()` and reloads, and enables the tab after the first save of a new book (`BookDialog.js` 108-126) | `Grid` + `JmapStore` with a base filter, `entityActions` (open, delete) + a module menu item; a container with `ListToolbar`. Default `entityActions` open blocks a reader (`Grid.mjs` 1337): keep a read-only open | port |
| 3 | Export JSON | Reads the template, strips system fields (`id`, `moduleId`, `key`, `createdBy/At`, `modifiedBy/At`, `permissionLevel`, `logoBlobId`; per block `id`, `templateId`), downloads `<name>.json` (or `template.json`) built in the browser. The `logo` object stays in the JSON | Build the JSON in the App worker; the core download addon takes only a URL and sets an empty file name (`main/addon/Download.mjs` 24): the card needs a named download of generated content (extend the addon or a main-thread call) | port (core change possible) |
| 4 | Import JSON | File chooser `.json`, parse (error "Invalid template file"), set `module` / `key` from the grid, strip the system fields (import does **not** strip `logoBlobId`, export did; the `logo` object of an exported file may point to a blob of another installation: the card asks the owner), `AmdTemplatesTemplate/set` with `create: {import: data}`, reload | core `UploadButton` (File objects reach the App worker; read with `file.text()`), the same `set` call | port |
| 5 | Template dialog | `TemplateDialog` (`titleField: name`, no redirect, Apply + Save buttons): name, font (`dejavusans` default, 7 options), font size (10), logo (`FileButtonField`, `accept: image/*`), add watermark, watermark text, watermark alpha (0.1, 2 decimals), creator, author, print header + header HTML, print footer + footer HTML (CodeMirror, `html`, shown when the box is checked). `creator` / `author` are free-text PDF metadata, not the created-by user | `FormWindow` with `applyButton` (done, `1440a9bfa`), `SelectField`, neo `NumberField` (`maxValue` defaults to 100: set it), **`BlobField`** for `logo` (an object: `Template::setLogo()` reads `['id']`; `ImageField` gives a scalar id), `CodeField` with `mode: 'html'` | port |
| 6 | Content blocks | Tab "Content blocks": `TemplateBlocksField` = `formgroup` **sortable** `blocks`: per row `id` (hidden), x, y, width, height (integers), align (`L`), type (`html`), content (CodeMirror, required, height 400). The editor's language follows the type field, also for each loaded row. Empty width = full page width, empty height = automatic (`TemplateBlock.php` 41, 47): keep nulls. Apply right after typing in a block must save the text (CodeField sends it debounced; FormWindow's `flush()` stops at the enclosing ArrayField on neo-ui: check it). The block order has no stored column (`Template.php` 115, `install.sql` 47): check whether a moved block keeps its place after reopening; a durable order would be backend work | `ArrayField` with sortable rows (D3, `20261128-020110`), `ContainerField` rows, `CodeField` whose reactive `mode` follows the type field | port |
| 7 | Template combo | `TemplateCombo` (xtype `amdtemplatestemplatecombo`, `templateId`, sorted by name, required, forced selection, paged at 50, not scoped by module) | `JmapComboBox` factory exported from `templates/views/neo` | port |

Classic: the header HTML field starts hidden, the footer HTML field does not, so a new template shows the footer
editor although "Print footer" is off. The neo dialog shows each editor only while its box is checked.

## 2. Dependencies and users

`getDependencies()`: sf/codemirror (the editor) and sf/mpdf (rendering, backend). In neo the editor is core
`GO.form.field.CodeField` (card `20261128-014608`, merged on neo-ui after this page's base): it loads CodeMirror from
`views/neo/node_modules/codemirror` (`CodeField.mjs` 291, `package.json` 9), so templates' neo views need neither
sf/codemirror nor sf/mpdf; the PHP dependencies stay for classic and the renderer. Sortable `ArrayField` rows are
on neo-ui too.

Users:

| Module | Uses | After the port |
|---|---|---|
| amd/catalog (not ported) | `TemplateGrid` in `BookDialog` (tab "PDF Templates", `module: {package: 'amd', name: 'catalog'}`); `DeliveryNoteDetail` lists the book's templates in its PDF menu (`AmdTemplatesTemplate/query`, refreshed on changes) | the catalog book dialog imports templates' neo grid; the PDF menu queries the entity itself |
| amd/crew, portcall, diary, certificates, esbjobs, stabilityvalidator, chartering, windfarms, catalog | backend: the renderers (`Renderer`, `TemplateRenderer`), the `Template` model, or only the docx / xlsx processors on **other** template entities (crew and portcall process fleet's `DocumentTemplate`, which fleet edits in its own UI). All declare amd/templates except chartering, which treats it as optional (`Module.php` 99) | — |
| amd/ihm | declares amd/templates (`Module.php` 42) | — |

No module in the amd checkout other than catalog embeds the grid in classic, so the neo templates UI has one consumer
for now. Where the other modules' `AmdTemplatesTemplate` rows are edited (seeders, the JSON import, an embed this
page missed) is for T1 to confirm on the dev data.

## 3. Pieces for neo core

None new, apart from a named download of generated content (row 3; small, in T3 or a core note). It needs CodeField
(`20261128-014608`), sortable ArrayField rows (D3, `20261128-020110`) and the FormWindow Apply button (done).

## 4. Cards

| # | Card | Size | Rows | After |
|---|---|---|---|---|
| T1 | `amd/templates: neo template list, dialog and blocks` (now: list, permissions, combo) | S | 1, 2, 7, `views/neo/PORTING.md` | `20261128-014608`, `20261128-020110` |
| T2 | `amd/templates: neo template dialog and content blocks` | M | 5, 6 | T1 |
| T3 | `amd/templates: neo template JSON import and export` | S | 3, 4 | T1 |

The browser check needs a host: until catalog is ported, the cards show the grid in a Dev demo or a test page that
switches between two keys (a newly saved "book" and an existing one, as catalog's `setKey()`), and compare with classic
catalog's "PDF Templates" tab. T1 was created as one card for 1-7; a review split it (board notes on T1).

## 5. Open points for the owner and the coordinator

- **No host in neo yet**: T1 builds an embedded grid that nothing in neo opens until catalog is ported. Should T1
  wait for the catalog port, or go ahead so catalog can import it? Plan: go ahead (small, and it proves CodeField and
  sortable rows in a real form).

- **Logo in an imported JSON** (row 4): drop `logo` on import, or keep it when the blob exists?

## 6. Additions for go:neo-port

- **Inventory:** a module without a main panel that other modules embed (templates' `TemplateGrid` with
  `{module, key}`) ports as exported neo classes, registered without `mainView`; its browser check needs a host or a
  demo.
- **Mapping row:** `sfcodemirroreditor` with `setLanguage()` from another field → `CodeField` with its reactive `mode`.

## 7. Board cards

Created 2026-11-28, all `--no-auto`.

- T1 `20261128-023449-amd-templates-neo-template-list-dialog-a` (title from before the split: the list only)
- T2 `20261128-024339-amd-templates-neo-template-dialog-and-co`
- T3 `20261128-024339-amd-templates-neo-template-json-import-a`
