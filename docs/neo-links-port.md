# neo: amd/links port, analysis and card split (2026-11-28)

Part of the owner's request of 2026-11-28 to plan the next amd modules (see `docs/neo-ports-port.md` for the
context, `docs/neo-crew-port.md` and `docs/neo-dms-port.md` for the model). Module code goes to the amd-mono branch
`neo`; core pieces to `neo-ui`.

amd/links is **not** GO's entity links. It manages short codes ("EID") that point to a target URL: printed as QR
stickers (sticker PDF), resolved by the public redirector `go/modules/amd/links/?eid=<code>` (`links/index.php`),
optionally with an access history. A Link can itself be linked to an entity (pms components, equipment items), and
`#amdlinkslink/<code>` opens that entity.

Sources read: `amd/links/views/extjs3` (13 files, about 1,400 lines: `MainPanel.js` 457, `Module.js` 258,
`GenerateDialog.js` 138, `LinkDetail.js` 127), `links/Module.php` (`getDependencies()`: sf/jobqueue, sf/rtm; right
`mayChangeCategories`), the controllers (`GenerateJob::generate / renderExisting / renderFiltered`,
`Link::destroyFiltered`), every amd module that uses links. From GO.neo: `ModuleRegistry.mjs`,
`alerts/NotificationCenter.mjs`, `systemsettings/fields.mjs`, `form/field/ImageField.mjs`, `jmap/Client.mjs`
(`baseUrl`), crew's `Extension.mjs` (top-level hash compat). Nothing was run in a browser.

## 1. Inventory by behaviour

| # | Area | Behaviour (ExtJS source) | GO.neo | Class |
|---|---|---|---|---|
| 1 | Registration | `go.Modules.register('amd','links')`: entities `AmdLinksCategory`, `AmdLinksLink` (filters `text`, `target`, `code`, `note`, `isActive` yes/no, `trackHistory` yes/no; a `linkWindow` (Link dialog) and a `linkDetail` (Link detail)), `AmdLinksHistory` (relation link), `AmdLinksGenerateJob`. `systemSettingsPanels` (row 11). Relations `modifier` use `fk: createdBy` (**classic bug**, without a visible effect today: the grid loads `modifier` but has no "Modified by" column) | `ModuleRegistry.register({package:'amd', name:'links', capability, mainView, routes: {AmdLinksLink: …}, linkWindows, systemSettings, onLogin})` | port |
| 2 | Code route | `go.Router.add(/^amdlinkslink\/([^0-9].*)$/)`: an id whose **first character** is not a digit is a code (`1ABC` is not): `AmdLinksLink/query {code}` → `Link/query {entity: AmdLinksLink, entityId}` → open the first linked entity; with no linked entity open the Link itself. Numeric ids are the normal entity route | The shell resolves `amdlinkslink` as an entity name (case-insensitive) and calls the links route with the id; the module's `route()` uses the same first-character test and opens the linked entity through the registry `routes` (classic hash when its module has no neo UI). Pattern for a top-level compat hash if needed: crew `Extension.mjs` | port (neo passes one non-empty id segment to its case-insensitive resolver, `MainView.mjs` 965, `linkTypes.mjs` 63; the card tests a numeric id, a letter-led code, a digit-led mixed value and the fallback to the Link) |
| 3 | Layout | Responsive: west = link grid + side panel (category list, filter panel); center = link detail. Narrow: menu button, forward arrow on the category list and a row click go to the grid, back arrow on the detail | `MainThreeColumnPanel` subclass: west = categories + filters, center = grid, east = detail | port |
| 4 | Category list | `CategoryGrid` (`go.NavGrid`, check selection, "show more", `tbsearch`): selection sets the grid filter `categoryId`. Add category only with `mayChangeCategories`. Row menu: Edit needs manage on the category; Delete needs `mayChangeCategories` **and** manage. `CategoryDialog`: name, EID prefix, code length 3-8, permissions (`SharePanel`) | `list/CheckList.mjs` with search and a row ⋮ (or `Grid` + `entityActions` with per-row rules); `FormWindow` + `addSharePanel()`, neo `NumberField` min 3 / max 8 | port |
| 5 | Filters | `filteraddbutton`, `filtergrid`, `variablefilterpanel` over `AmdLinksLink` | `FilterPanel` + `filterTypes` | port |
| 6 | Link list | `LinkGrid`: id (hidden), EID, target (auto expand), Active and Track History as `checkcolumn` (classic `GO.grid.CheckColumn` toggles the record value on click and nothing saves it: `go.data.Store` `autoSave` is false and `LinkGrid` has no change handler, so a click changes only the shown row. neo shows read-only checks; saving on click would be a new feature that needs write permission), sort EID desc. `tbsearch` `text`, `code`, `target`, `note`, `modifiedAt`, `createdAt`. Add (primary) is enabled when a selected category gives **create** permission and prefills `categoryId` through `formValues`. Double click / Enter edit only with write permission; selection routes to the link. Inherited from `GridTrait`: Delete of the selected rows (confirm, toolbar and Delete key); grid state saved, total shown | `Grid` + `JmapStore` + `ListToolbar`, `entityActions` (open needs write) | port |
| 7 | Link dialog | `LinkDialog` (not modal, maximizable): code, target (required), active, track history, note | `FormWindow`; code and target required; the category dialog needs name, prefix and an integer length 3-8 and does not redirect | port |
| 8 | Link detail | `LinkDetail`: EID, external link `origin + pathname + 'go/modules/amd/links/?eid=' + code` (encoded), target (a link only for `http(s)://`, else text), active, track history, note (escaped, line breaks); Track History grid (row 9); links, history. Toolbar: Edit, add-link button, link browser, ⋮ Print (title `data.name`, which a Link does not have: the print keeps the page title; neo uses the EID), Delete. Classic `linkDetail()` also gives a preview inside the link browser; neo's link browser has no preview (`LinkBrowser.mjs` 13): a gap for every module (dms open point) | core `detail/Panel` + `LinesCard`; the external URL as an **absolute** URL (origin + the install path; `client.baseUrl` is relative) with `eid` set as a query parameter (classic HTML-escapes it instead: an EID with `&` breaks) | port |
| 9 | Access history | `HistoryDetailPanel`: `AmdLinksHistory` filtered by `linkId`, newest first: remote IP, created at, user agent (auto expand), platform and browser hidden; shown only when `trackHistory` is on; empty text "Link has no tracking history". Classic clears the rows before it returns on a reload of the same link, so a refresh can show an empty history: neo keeps or reloads them | a `Grid` card in the detail that `renderRecord()` shows / hides itself (go:neo-port: module cards are not in the panel's `cards` list) | port |
| 10 | Sticker PDFs and jobs | `GenerateDialog`: category (first one preselected), pages 1-500 → `AmdLinksGenerateJob/generate`. Multi select: Download PDF of the selected links (`renderExisting`). ⋮ Download PDF of all filtered links after a confirm (`renderFiltered` with the store's filter). Each start shows a notification "Generation added to queue". At login and on every `AmdLinksGenerateJob` change: query `preparedFailed: true`, which returns the user's pending, creating and rendering jobs too (only failed ones have a ten-minute cut-off, `GenerateJob.php` 78-92); one notification per job id, replaced on the next change: in progress → "Generation added to queue"; failed → the error text; ready → click downloads the blob and destroys the job; closing a ready or failed one destroys the job. Classic passes `removeAfter: 5 min`, but its notifier never runs that timer. A status icon in the notification bar | `Dialog`; `MultiSelectToolbar`; `ConfirmDialog.ask()`; `notificationCenter.add({id, handler, onDismiss})` (same id replaces); `onLogin` guarded by the capability; the entity's `client.watch()` / `stateChange` (neo stores have no `changes` event); `download()` | port |
| 11 | Import / export / delete filtered | ⋮ Import (CSV, XLSX, no mapping options), Export (xlsx, csv) of the current filter, **Delete all (filtered)**: visible only when a selected category gives writeAndDelete, confirm with the grid's total, `AmdLinksLink/destroyFiltered` with the current filter (deletes only rows the user may delete, `Link.php` 38-54, so the number can be lower than the confirm said), reload. Import passes empty overrides and still opens the default column mapping | `importFile()`, `exportEntities()`, `ConfirmDialog.ask()` | port |
| 12 | System settings | "Sticker PDF" logo (`go.form.ImageField`, `logoBlobId`) | registry `systemSettings` + `systemsettings/fields.mjs`, core `ImageField` | port |
| 13 | Link combo | `LinkCombo` (xtype `amdlinkslinkcombo`, `linkId`, display code, only links with **write** permission, sort code); `LinkComboReset` | `JmapComboBox` factory with a base filter, exported from `links/views/neo` | port |

## 2. Dependencies and users

`getDependencies()`: sf/jobqueue (the generate worker) and sf/rtm (the worker calls
`\go\modules\sf\rtm\Module::sendEntityChange()` so job status changes reach the client). In classic the
notifications follow `AmdLinksGenerateJob` `changes`. In neo the job changes must arrive without an rtm client: neo
stores follow `client.watch()` / `stateChange` through the session's `eventSourceUrl`; without it the client does not
poll (`Client.mjs` 497-514). The card checks that the core push brings `AmdLinksGenerateJob` changes; if not, it
names an explicit refresh or waits for the real-time client (D8, `20261128-020117`). The sticker renderer also needs
sf/mpdf's autoloader (`StickerPdfRenderer.php` 10), not declared: a prerequisite of L3's end-to-end check. No undeclared use in the views.

Users:

| Module | Uses | After the port |
|---|---|---|
| amd/equipment (not ported) | filter type `go.modules.amd.links.LinkCombo` (`Module.js` 77); `amdlinkslinkcomboreset` (optional `linkId`) in `ItemDialog.js` 27; backend `Item` and its spreadsheet converter | import links' clearable picker; clearing a link must survive the save |
| amd/pms (its analysis runs in parallel) | `amdlinkslinkcomboreset` in `ComponentDialog.js` 148 (a hidden field when links is not available); backend: `Component` sorts by and links to a `Link` (declares amd/links) | import the clearable picker; `#amdlinkslink/<id>` and the code route open neo |
| amd/sync | backend reference declarations for `GenerateJob` | — |

## 3. Pieces for neo core

None new. It uses `NotificationCenter`, `importFile()` / `exportEntities()`, `ImageField`, the core detail panel,
and, only if the core push does not cover job changes, D8 (`20261128-020117`).

## 4. Cards

Project `~/Projects/groupoffice26-neo-amd`, base `neo`, worktree, `--no-auto`. Browser checks compare with
`?webclient=classic` as a non-admin user with a category they may create in (and one without
`mayChangeCategories`), and once as admin.

| # | Card | Size | Rows | After |
|---|---|---|---|---|
| L1 | `amd/links: neo skeleton, categories and link list` | M | 1, 3-7 (registration without `routes`), `views/neo/PORTING.md` | — |
| L1b | `amd/links: neo link pickers` | S | 13: `LinkCombo` and the clearable `LinkComboReset` (write filter) for equipment and pms | L1 |
| L2 | `amd/links: neo link detail and access history` | M | 2, 8, 9, the registry `routes` and the `linkWindows` entry | L1 |
| L3 | `amd/links: neo sticker PDFs and job notifications` | M | 10 | L1 |
| L4 | `amd/links: neo import, export, delete filtered and settings` | S | 11, 12 | L1 |

## 5. Open points for the owner and the coordinator

- **Job notifications without rtm** (section 2): acceptable if they appear only after the next refresh until D8 is
  done?
- **External URL** (row 8): classic builds it from the browser's `location.pathname`. neo builds it from
  `client.baseUrl`; the card checks both give the same URL on an install in a subfolder.
- **Classic bugs** (26.0.x, the owner decides): the `modifier` relation uses `createdBy` (row 1); Print uses
  `data.name` (row 8); the EID is HTML-escaped in the public URL instead of URL-encoded (row 8); the history grid can
  come back empty on a reload of the same link (row 9); `removeAfter` on the job notifications does nothing (row 10).
- **Link browser preview** (row 8): a core question, as in the dms open points.

## 6. Additions for go:neo-port

- **Inventory:** a `go.Router.add()` regex on an entity name with a non-numeric id (links' `#amdlinkslink/<code>`)
  is a second meaning of the entity route: handle it in the module's `route()`.
- **Inventory:** classic `checkcolumn` toggles the record in the grid only; `go.data.Store` does not save it
  (`autoSave` false) unless the grid saves on `change`. Port it read-only unless the classic grid saves.
- **Inventory:** list what a grid inherits from `GridTrait` (Delete of selected rows by key and toolbar, saved state,
  total) and from `go.form.Dialog` (redirect after a new record): it is behaviour although no module file shows it.
- **Inventory:** a classic `removeAfter` or similar option is behaviour only if the classic code honours it.

## 7. Board cards

Created 2026-11-28, all `--no-auto`.

- L1 `20261128-023449-amd-links-neo-skeleton-categories-and-li`
- L1b `20261128-024340-amd-links-neo-link-pickers`
- L2 `20261128-023450-amd-links-neo-link-detail-and-access-his`
- L3 `20261128-023450-amd-links-neo-sticker-pdfs-and-job-notif`
- L4 `20261128-023450-amd-links-neo-import-export-delete-filte`
