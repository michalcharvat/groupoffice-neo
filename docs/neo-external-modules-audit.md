# neo: audit of the external modules (amd, sf, business, nuw), 2026-11-25

What it takes to give the modules outside this repository a neo UI, and in which order. This is
a decision document: nothing here is built yet (owner's answers and the current focus: end of section 3). It covers the four packages in
`~/Projects/groupoffice26/www/go/modules/` (separate repositories, read only for this audit):
`amd` (amd-mono, commit `d44029809`), `sf` (sf-mono, `ee842e7d9`), `business` (Intermesh,
`ee9bf4ac`) and `nuw` (`b9f9c67`). Pro modules in `www/modules` (projects2, billing, tickets,
timeregistration2, ...) are out of scope, but several external modules depend on them (section 4).

Related: `docs/neo-switch.md` (D3 classic launchers, neo-only build and its parity gate),
`docs/neo-core-components.md` (what GO.neo has), `docs/neo-small-modules.md` (registry hooks).

## Summary

| Package | Owner | Module folders (with `Module.php`) | With a classic UI | Kind of UI | Own JS/TS files · non-blank LOC | `Ext.override` calls | Server API | PHP encoded in releases |
|---|---|---|---|---|---|---|---|---|
| amd | us (amd-mono) | 46 (42) | 40 | ExtJS only | 1,439 · 239,600 | 15 | JMAP only (312 controllers), 0 legacy | when the amd/sync replica packages are built with the SourceGuardian encoder on (`amd/sync/service/ModulePackageService.php`); the source here is plain |
| sf | us (sf-mono) | 61 (60) | 53 | ExtJS only | 520 · 91,500 | 11 | JMAP only (141), 0 legacy | not in sf's own build (the old `sf/builder.php` encodes only openvpn); sf/jobqueue and sf/rtm are in the amd/sync replica base archive and encoded with it when the encoder is on |
| business | Intermesh | 28 (26) | 25 | 12 ExtJS, 10 GOUI, 3 both | 261 · 34,200 (17,500 JS + 16,700 TS) | 14 | JMAP only (46 controller classes, 2 of them abstract base classes of business/license), 0 legacy | yes, mostly: `build/build.sh` `encode_pro_and_business()` encodes the PHP with SourceGuardian (not ionCube), but leaves `*/vendor/*` out and copies language and install files, each `Module.php` and two finance interfaces back as plain text |
| nuw | us | 19 (18) | 18 | 17 ExtJS, 1 GOUI | 64 · 4,500 | 8 | JMAP only (9), 0 legacy | no |

Encoding only touches PHP; the views (JS/TS) are never encoded, so it doesn't change the UI work.
It matters for who can port business: the views can be written against the JMAP API without
the PHP source, but the module lives in Intermesh's repository (question Q1).

Findings:

1. **No legacy controllers of their own.** Every module's controllers are JMAP (`EntityController`
   or custom `Controller`). The ExtJS code mostly calls legacy endpoints for the legacy files and
   e-mail modules (`GO.files.*`, `GO.email.showComposer`, `index.php?r=files/...`), which neo already
   replaces (`FilesPanel`, `openFile` hook, `src/Mail.mjs`). Exceptions to settle per module before
   its card: nuw/eventnotificator (legacy `calendar/calendar/store`), sf/coretemplates
   (`modules/module/store`), sf/rtm (standalone `auth.php` with the session CSRF token),
   business/forms (public participant page on classic files, finding 6). Server-side work is
   small otherwise. Some PHP still uses `GO\Base` (sf/aiassistant 163 references, amd/dms 127, amd/invoices
   81), but behind JMAP.
2. **amd is the bulk**: about two thirds of the code and 8 of the 9 XL modules. Its modules form a dependency
   chain (fleet, libs, leaflet, templates, formbuilder, ports, dms) that has to go first.
3. **The neo core lacks three groups of things the external modules need**: charts (11 modules
   use CanvasJS, 4 business modules use Chart.js), maps (Leaflet with plugins in 10 amd modules,
   own map in sf/poi), and **extension points into other modules' UI**: 48 `Ext.override` calls in
   33 modules patch the address book, e-mail client, calendar, core dialogs or the legacy pro
   modules. neo has no runtime patching (`docs/neo-core-components.md`, "Left to build" 9), so
   each needs a named hook.
4. **Eleven nuw modules build on the pro modules projects2 or timeregistration2** (overrides of
   their panels, their stores, or queries on `pr2_projects` / `pr2_hours`: cftemplate,
   projectsdsgvo, timeentryexport, timetracking, linkmailtoproject, mail2project, projectcreator,
   contactsexport, emailprojectfilter, projectleads, nusperlingdashboard). The pro modules have no
   neo UI and live in Intermesh's pro repository. A neo screen can keep using a retained pro
   backend, but the overrides of pro panels can't be ported until those panels are, and moving the
   customer to projects3 / registration needs a data and API mapping. business finance, projects3
   and support only add an optional migration button to billing / projects2 / tickets when those
   are installed; their own UIs don't depend on them.
5. **Quick wins exist**: 56 modules are S (settings cards, one grid and dialog, a login step);
   most use only GO.neo pieces that exist today.
6. **A public page on classic files**: business/forms' participant page (`pageForm()` →
   `views/goui/script/form.php`) requires the classic Paper `pageHeader.php` and the GOUI
   `dist/Participant.js`. The strip script removes both once the module has `views/neo`, so it
   passes the gate and breaks existing participant links. Other modules' `page*()` endpoints need
   the same check before their port.
7. **The neo runtime is development-only for now** (D7) and module addons are imported by a
   relative path that works only in that build (`docs/neo-core-components.md`, "Third-party DOM
   libraries"). Every library-backed component below (chart, map, code editor, EditorJS, PDF)
   is a module addon, so the production-build card has to support module addons.

Rough size: about 200 cards in total (scale below), of which ~20 for shared components and
library modules, ~95 for amd, ~45 for sf, ~28 for business, ~10 for nuw: the size of the full external port, for reference (see the owner's answers at the
end of section 3).

## 1. Inventory per module

How the numbers were taken (re-run the same way before planning a batch): every folder of
the four packages, own code only: `views/extjs3/**/*.js`, `views/goui/**/*.ts`, a non-empty
`scripts.txt` in the module root; vendored folders (`lib`, `libs`, `vendor`, `codebase`,
`codemirror`, `node_modules`, `dist`, examples) and `*.min.js` / `*.umd.js` left out; `.claude`
worktrees skipped. LOC = non-blank lines. "Screens" counts files by name (`*Grid*`/`*Table*`,
`*Dialog*`/`*Window*`, `*Detail*`, `*Settings*`, `*Portlet*`) and "main" means the module
registers a main panel; a count is a size indicator, not a list of distinct screens (catalog has
front and back office copies). "Server" = JMAP controllers / `page*()` endpoints in `Module.php` /
CLI controllers. No module has a legacy `GO\Base` controller, so that column is left out. No
module has `views/neo` except sf/workspaces.

Effort, per module, for the neo UI only (server unchanged), assuming the shared components of
section 2 exist:

| Size | Meaning | Rough cost |
|---|---|---|
| S | settings card(s), a login step, one grid + dialog, or a hook into another module | a few in one card |
| M | a standard main view (grid, detail, dialog, a few lookup lists), 800–3,000 LOC | 1 card |
| L | 3,000–10,000 LOC, or a custom component (editor grid, chart dashboard, map, real time) | 2–3 cards |
| XL | over 10,000 LOC or a designer / editor of its own (formbuilder) | 4–8 cards |
| — | no UI (server, library, leftover folder) | none |

The estimate was raised where the LOC understates the work (overrides of other modules, a
custom editor) and lowered for code that becomes a shared component.

### amd

| Module | Classic UI | Files · LOC | Screens | Libraries | Ext.override of | Server (JMAP ctrl / page / cli) | Effort | Notes |
|---|---|---|---|---|---|---|---|---|
| amd | ExtJS | 3 · 116 | 1 portlet |  | GO.MainLayout, GO.summary.MainPanel | 0 / 0 / 0 | S | tab close menu on the main layout, portlet picker of the start page: neo MainView / sf/workspaces and summary already cover most of it |
| amdcatalog | — | — | — |  |  | no Module.php | — | only `icon.png` (leftover folder) |
| amdmaps | ExtJS | 19 · 3,603 | main, 1 grid, 6 dlg, 2 settings, 2 portlet | Leaflet |  | 6 / 0 / 2 | L | map module: location tree, item layers, GPS jamming layer (h3), vessel history export, 2 portlets. Needs the Map component |
| amdtasks | — | — | — |  |  | no Module.php | — | only `icon.png` (leftover folder) |
| amos | — | — | — |  |  | no Module.php | — | import script, no UI |
| buoys | ExtJS | 22 · 2,329 | main, 4 grid, 5 dlg, 1 detail, 2 settings, 3 portlet | CanvasJS |  | 5 / 0 / 0 | M | buoy sensors: chart panels and a map; M once Chart and Map exist |
| catalog | ExtJS | 227 · 43,153 | main, 54 grid, 64 dlg, 17 detail, 12 settings |  | go.NavGrid | 43 / 0 / 0 | XL | front office (shop, cart) and back office (requisitions, purchase orders, delivery notes, offers, stock); `RequisitionSupplierOverviewDialog` alone ~6,000 lines; custom field type |
| certificates | ExtJS | 33 · 4,862 | main, 10 grid, 9 dlg, 3 detail, 1 settings |  |  | 8 / 0 / 0 | L | certificate register with expiry-date editor grid, views, lookup grids, files panel |
| chartering | ExtJS | 37 · 4,738 | main, 11 grid, 11 dlg, 3 detail, 1 settings |  |  | 9 / 0 / 0 | L | enquiries, charters, charter invoices, lookup grids, DMS detail card |
| crew | ExtJS | 81 · 11,929 | main, 20 grid, 23 dlg, 4 detail, 3 settings, 4 portlet |  |  | 18 / 0 / 3 | XL | members, contracts, voyages and records, certificates with verification (PDF viewer), birthday / certificate portlets, vis-timeline |
| diary | ExtJS | 45 · 6,070 | main, 8 grid, 12 dlg, 2 detail, 6 settings, 3 portlet |  |  | 6 / 0 / 0 | L | event log with timeline (vis-timeline, luxon), IoT panel, activity / code lookups, vessel settings |
| dms | ExtJS | 72 · 10,395 | main, 11 grid, 24 dlg, 2 detail, 3 settings, 3 portlet | CodeMirror, EditorJS | go.form.Chips | 10 / 0 / 3 | XL | document management: folder tree, document types tree, versions, envelopes, risk assessments, step-by-step docs, EditorJS and Markdown content, viewers for PDF / Office (mammoth) / XLSX / images; overrides `go.form.Chips` |
| dokuwiki | — | — | — |  |  | no Module.php | — | only `icon.png`; the community dokuwiki module has neo |
| emspilot | ExtJS | 7 · 866 | main, 2 grid, 1 detail, 1 settings |  |  | 2 / 0 / 0 | S | report grid + detail, settings |
| equipment | ExtJS | 18 · 2,098 | main, 4 grid, 4 dlg, 1 detail, 3 settings |  |  | 3 / 0 / 0 | M | item grid with group tree, manufacturers |
| esbjobs | ExtJS | 51 · 6,239 | main, 12 grid, 12 dlg, 6 detail, 2 settings |  |  | 12 / 0 / 0 | L | projects, jobs, reports, towing tasks with status lookups; uses an ExtJS `FormGroup` |
| flags | ExtJS | 5 · 267 | 1 grid, 1 dlg, 1 settings |  |  | 1 / 0 / 0 | S | flag lookup grid in System settings |
| fleet | ExtJS | 60 · 6,680 | main, 16 grid, 16 dlg, 2 detail, 2 settings |  |  | 15 / 0 / 0 | L | vessel master data and ~15 lookup grid/dialog pairs, map panel; dependency of most amd modules |
| formbuilder | ExtJS | 68 · 7,000 | main, 1 grid, 7 dlg, 3 detail, 1 settings | EditorJS, Signature | go.form.Chips, go.form.ChipsView, go.form.Dialog, go.form.FileButtonField, go.form.FormGroup | 5 / 0 / 0 | XL | form designer with ~35 field types (signature pad, EditorJS, checklists, conditions / score rules), folder tree; overrides `go.form.Dialog`, `Chips`, `FormGroup`, `FileButtonField`. Its renderer is used inside crew, diary, dms, pms and tasks |
| ihm | ExtJS | 16 · 1,601 | main, 2 grid, 4 dlg, 1 detail, 1 settings |  |  | 4 / 0 / 0 | M | hazardous materials inventory |
| invoices | ExtJS | 122 · 35,297 | main, 28 grid, 42 dlg, 7 detail, 5 settings, 5 portlet | CanvasJS, pdf.js |  | 34 / 0 / 8 | XL | invoice intake with AI fields, incoming documents, duplicates, credit allocations, transfer lists, FinTS bank connection, cost codes, overview builder (`OverviewStructureField` ~2,000 lines), CanvasJS charts, PDF viewer, 5 portlets |
| iot | ExtJS | 30 · 8,056 | main, 6 grid, 6 dlg, 1 settings | CanvasJS, CodeMirror, Leaflet |  | 6 / 0 / 0 | L | device overviews with output widgets (chart, gauge, map, grid, single value), alert rules, CodeMirror |
| leaflet | ExtJS | 3 · 788 | — | Leaflet |  | 0 / 0 / 0 | M | **shared**: Leaflet with plugins (draw, marker cluster, AIS track symbols, time dimension) and the `MapPanel` the other amd modules use; becomes the neo Map addon |
| libs | ExtJS | 6 · 2,336 | 2 dlg | pdf.js | go.form.Dialog | 0 / 0 / 0 | M | **shared**: `TreeStateTrait`, `PdfViewPanel` (pdf.js), `PdfPageExportDialog`, `JobErrorText`, form error override; vendored pdf.js, tesseract, vis-timeline, xlsx, mammoth, luxon |
| links | ExtJS | 12 · 1,280 | main, 2 grid, 3 dlg, 2 detail, 1 settings |  |  | 4 / 0 / 0 | M | link register with categories and history |
| maps | ExtJS | 5 · 652 | main, 1 grid, 1 settings |  |  | 0 / 0 / 0 | S | map sources in System settings + map panel; after the Map component |
| news | ExtJS | 8 · 706 | main, 2 grid, 2 dlg, 1 detail |  |  | 2 / 0 / 0 | S | news grid, dialog, detail |
| pdfparser | — | — | — |  |  | 0 / 0 / 0 | — | server only |
| pms | ExtJS | 125 · 21,339 | main, 22 grid, 37 dlg, 9 detail, 5 settings, 6 portlet | Signature | go.filter.VariableFilterPanel | 20 / 0 / 0 | XL | planned maintenance: component tree, jobs, job reports (signature), counters, checklists, postponements, history printouts, 6 portlets; overrides `go.filter.VariableFilterPanel`; uses formbuilder, dms, diary |
| portcall | ExtJS | 44 · 5,735 | main, 9 grid, 11 dlg, 3 detail, 6 settings, 4 portlet |  |  | 8 / 0 / 0 | L | port calls, crew changes, document sets, dynamic menus, portlets |
| ports | ExtJS | 22 · 1,894 | main, 5 grid, 5 dlg, 1 detail, 2 settings |  |  | 5 / 0 / 0 | M | ports with map, services, UN/LOCODE import, custom field type |
| printers | ExtJS | 9 · 1,235 | main, 2 grid, 3 dlg, 1 detail, 1 settings |  |  | 2 / 0 / 0 | M | printers, discovery, print jobs, print-file dialog |
| resthours | ExtJS | 22 · 5,482 | main, 2 grid, 10 dlg, 2 detail, 2 settings |  |  | 8 / 0 / 2 | L | rest hours sheets with a custom 24-hour editor grid (`RestHoursEditDialog` ~2,200 lines), signing, rule sets, holiday calendars, a tab in the vessel dialog |
| simplehtmldom | — | — | — |  |  | 0 / 0 / 0 | — | library, no UI |
| stabilityvalidator | ExtJS | 26 · 5,745 | main, 7 grid, 8 dlg, 1 detail, 2 settings | CanvasJS |  | 7 / 0 / 0 | L | loading conditions with CanvasJS stability curves, tank / load definitions |
| submarinecable | ExtJS | 5 · 643 | main, 1 grid, 1 detail | Leaflet |  | 1 / 0 / 0 | S | cable grid + map; after the Map component |
| suppliers | ExtJS | 17 · 2,184 | main, 3 grid, 4 dlg, 1 detail |  |  | 2 / 0 / 0 | M | suppliers, books, cost-code matrix, merge dialog, custom field type |
| sync | ExtJS | 15 · 2,880 | main, 5 grid, 5 dlg, 1 detail, 2 settings |  |  | 6 / 0 / 3 | M | admin: replicas, module packages, sync log |
| tanks | ExtJS | 39 · 10,124 | main, 7 grid, 11 dlg, 3 detail, 1 settings | CanvasJS |  | 7 / 0 / 0 | XL | tank sounding board, totals and transfers, calibration interpolation, CanvasJS level charts, tab in the vessel dialog |
| tasks | ExtJS | 27 · 4,589 | main, 2 grid, 6 dlg, 1 detail, 3 settings, 3 portlet |  | GO.MainLayout | 5 / 0 / 0 | L | amd task lists (own entity, not community/tasks; classic panel id `amdtasks` hides the other Tasks entry), messages, printouts, portlets; overrides `GO.MainLayout`. neo `ModuleRegistry` keys modules by `name`, and community tasks already registers `tasks`: needs a distinct registration / route |
| templates | ExtJS | 5 · 658 | main, 1 grid, 1 dlg | CodeMirror |  | 1 / 0 / 0 | S | document templates with a CodeMirror editor; after the code editor component |
| vessels | ExtJS | 88 · 8,353 | main, 27 grid, 26 dlg, 5 detail, 1 settings |  | Ext.form.TextField, Ext.ux.form.SuperBoxSelect | 32 / 0 / 0 | XL | vessel register (~90 files): designs, equipment, cranes, rooms, tanks, contacts, locations, permission groups, map; overrides `Ext.form.TextField` and `SuperBoxSelect` |
| voip | ExtJS | 7 · 506 | 1 grid, 2 dlg, 2 settings |  |  | 1 / 0 / 0 | S | phones, user settings, call suggestions |
| windfarms | ExtJS | 19 · 5,439 | main, 6 grid, 1 dlg, 4 detail | CanvasJS |  | 9 / 0 / 0 | L | farms, platforms, events, supply chain, CanvasJS chart presets, maps |
| winmail | ExtJS | 2 · 65 | — |  | GO.email.MessagePanel | 1 / 0 / 0 | S | winmail.dat attachments in the e-mail message panel: needs a hook in the neo e-mail module |
| yards | ExtJS | 17 · 1,686 | main, 4 grid, 4 dlg, 1 detail, 2 settings |  |  | 4 / 0 / 0 | M | yards with map, dock / communication types |

### sf

| Module | Classic UI | Files · LOC | Screens | Libraries | Ext.override of | Server (JMAP ctrl / page / cli) | Effort | Notes |
|---|---|---|---|---|---|---|---|---|
| aiassistant | ExtJS | 13 · 3,952 | main, 1 grid, 1 dlg, 2 settings | CanvasJS | Ext.form.TextField | 4 / 0 / 1 | L | chat view, floating panel, voice input, dictation in every text field of every module (overrides `Ext.form.TextField`: needs a shared field hook in neo or a smaller scope), shared conversations, CanvasJS in answers |
| aiemail | ExtJS | 6 · 587 | 1 dlg, 2 settings |  | GO.email.EmailClient | 1 / 0 / 0 | M | AI reply in the e-mail client (overrides `GO.email.EmailClient`): needs neo e-mail hooks |
| airouter | ExtJS | 8 · 362 | 1 grid, 1 dlg, 1 settings |  |  | 2 / 0 / 0 | S | LLM accounts in System settings |
| announcements | ExtJS | 12 · 1,042 | main, 3 grid, 3 dlg, 1 detail |  |  | 3 / 0 / 0 | M | announcements, shops, types |
| ares | ExtJS | 8 · 977 | main, 1 grid, 2 dlg, 3 detail |  | addressbook.ContactDetail | 2 / 0 / 1 | M | Czech company register: records + a card in the contact detail (overrides addressbook `ContactDetail`) |
| asterisk | ExtJS | 12 · 1,267 | main, 2 grid, 2 dlg, 1 detail, 2 settings |  |  | 3 / 0 / 0 | M | extensions, call records, user settings |
| attendance | ExtJS | 9 · 838 | main, 2 grid, 2 dlg, 1 detail, 1 settings |  |  | 5 / 0 / 0 | S | attendance records and users |
| bakalari | ExtJS | 12 · 812 | main, 1 grid, 3 dlg, 1 detail | pdf.js |  | 3 / 0 / 0 | M | school system client: items, timetable, attachments (pdf.js) |
| bitwarden | ExtJS | 9 · 926 | 3 grid, 3 dlg, 1 settings |  |  | 3 / 0 / 0 | M | admin grids (collections, groups, members) in System settings |
| blobeditor | ExtJS | 1 · 59 | — |  |  | 1 / 0 / 0 | S | opens temporary files in OnlyOffice and gives callers sync / close; a service for other modules, not a screen |
| cacheflow | ExtJS | 12 · 1,019 | main, 3 grid, 3 dlg, 1 detail |  |  | 3 / 0 / 0 | M | orders with phases and states |
| canvasjs | — | — | — |  |  | 0 / 0 / 0 | S | **shared**: injects `canvasjs.min.js` via `Module.php`; becomes the Chart addon loader |
| chat | ExtJS | 10 · 3,928 | main, 2 dlg, 1 detail, 1 settings |  |  | 2 / 0 / 0 | L | channels, threads, composer, attachments; real time over sf/rtm |
| cnbrates | ExtJS | 1 · 4 | — |  |  | 0 / 0 / 1 | — | exchange rates, no real UI |
| codemirror | ExtJS | 2 · 153 | — | CodeMirror |  | 0 / 0 / 0 | S | **shared**: CodeMirror 5 (vendored); neo ships a `MonacoEditor` wrapper as an alternative |
| coretemplates | ExtJS | 3 · 128 | 1 dlg, 1 settings |  | go.emailtemplate.TemplateDialog | 0 / 0 / 0 | S | overrides the core e-mail template dialog: neo `emailtemplate` needs a hook; calls the legacy `modules/module/store` route |
| czechdatabox | ExtJS | 12 · 2,751 | main, 2 grid, 3 dlg, 1 detail |  |  | 4 / 0 / 0 | M | data box accounts tree, messages, new-box wizard |
| dmarcreport | ExtJS | 8 · 1,665 | main, 2 grid, 1 dlg, 1 detail, 1 settings |  |  | 3 / 0 / 1 | M | DMARC dashboard, domains, reports, upload |
| docusign | — | — | — |  |  | 1 / 0 / 0 | — | server only |
| drivelog | ExtJS | 25 · 6,675 | main, 6 grid, 10 dlg, 3 detail, 1 settings | CanvasJS |  | 8 / 0 / 0 | L | vehicles, trips, fuelings, tax summary, CanvasJS stats, logbook export |
| dummy | ExtJS | 3 · 3,775 | main |  |  | 0 / 0 / 0 | — | demo of a DHTMLX diagram editor; propose not to port |
| editorjs | ExtJS | 6 · 763 | — | EditorJS |  | 1 / 0 / 0 | M | **shared**: EditorJS + ~20 plugins and `EditorField`; used by dms, formbuilder, pms, tasks |
| epo | ExtJS | 13 · 1,410 | main, 2 grid, 3 dlg, 1 detail |  |  | 2 / 0 / 0 | M | documents with name parser, custom field type |
| fontawesome | ExtJS | 1 · 30 | — |  |  | 0 / 0 / 0 | S | **shared**: icon font injected via `Module.php`; neo uses Material Symbols, so icons are mapped instead |
| gantt | — | — | — |  |  | 0 / 0 / 0 | — | server only |
| generator | ExtJS | 10 · 725 | main, 3 grid |  |  | 2 / 0 / 0 | S | developer wizard that generates ExtJS code; port only if it generates neo views |
| instances | ExtJS | 17 · 2,261 | main, 3 grid, 6 dlg, 1 detail, 1 settings | xterm |  | 5 / 1 / 1 | M | customer instances, maintenance, xterm terminal window |
| integrator | — | — | — |  |  | 0 / 0 / 0 | — | no UI |
| investing | ExtJS | 11 · 1,161 | main, 5 grid, 1 dlg |  |  | 7 / 0 / 1 | M | portfolio dashboard with charts, holdings, dividends |
| invoices | ExtJS | 96 · 27,984 | main, 20 grid, 25 dlg, 6 detail, 1 settings | CanvasJS | addressbook.ContactDialog | 24 / 0 / 1 | XL | Czech invoicing: sales / purchases, recurring, bank, VAT, audit, optimiser, CanvasJS dashboard; overrides addressbook `ContactDialog`; `Module.js` alone ~1,650 lines |
| jobqueue | ExtJS | 9 · 367 | 2 grid, 2 dlg, 1 settings |  |  | 2 / 0 / 1 | S | queue admin and stats (its main panel registration is commented out) |
| licenses | ExtJS | 5 · 440 | main, 1 grid, 1 dlg, 1 detail |  |  | 1 / 0 / 0 | S | license grid + detail |
| maildownloader | ExtJS | 1 · 55 | — |  | GO.email.MailboxContextMenu | 1 / 0 / 0 | S | mailbox context menu item: needs a neo e-mail hook |
| mailqueue | ExtJS | 5 · 663 | main, 1 grid, 1 detail, 1 settings |  |  | 1 / 0 / 0 | S | message queue grid + detail |
| mcp | ExtJS | 6 · 1,361 | 1 grid, 1 detail, 2 settings |  |  | 2 / 4 / 1 | M | call log, settings |
| mediaplayer | ExtJS | 4 · 659 | 1 dlg, 1 settings |  |  | 1 / 0 / 0 | S | player window: a neo `fileHandlers` entry |
| meilisearch | ExtJS | 2 · 38 | 1 settings |  |  | 0 / 0 / 0 | S | System settings only |
| messenger | ExtJS | 5 · 469 | 1 dlg, 2 settings |  |  | 2 / 0 / 0 | S | settings, link dialog |
| mpdf | — | — | — |  |  | 0 / 0 / 0 | — | library, no UI |
| n8n | ExtJS | 4 · 262 | 1 grid, 1 dlg, 1 settings |  |  | 2 / 0 / 0 | S | webhooks in System settings |
| ntfy | ExtJS | 8 · 867 | 1 grid, 3 dlg, 2 settings |  |  | 2 / 0 / 0 | S | topics, users, send dialog, user settings |
| openvpn | ExtJS | 6 · 959 | main, 1 grid, 2 dlg, 1 settings | CodeMirror |  | 2 / 0 / 0 | M | certificates with CodeMirror config view |
| openweather | ExtJS | 3 · 209 | 1 grid, 1 settings |  | GO.grid.MonthGrid | 1 / 0 / 1 | S | weather in the calendar month view (overrides `GO.grid.MonthGrid`): needs a neo calendar hook |
| pohoda | ExtJS | 7 · 1,700 | main, 1 grid, 1 dlg, 1 detail, 1 settings |  |  | 2 / 0 / 1 | M | accounting documents, time navigation, OCR (tesseract) |
| poi | ExtJS | 9 · 851 | main, 1 grid, 2 dlg, 1 detail, 1 settings |  |  | 2 / 0 / 0 | M | points of interest on **Google Maps** (map, markers, polylines, geocoder) with a vendored MarkerClusterer (left out of the LOC); moving to the Leaflet addon needs a geocoding decision |
| presenter | ExtJS | 18 · 2,123 | main, 3 grid, 3 dlg | CanvasJS, CodeMirror |  | 2 / 0 / 0 | L | dashboard / presentation builder: block editor (chart, KPI, table, calendar, agenda), AI prompt, CodeMirror |
| qdrant | ExtJS | 2 · 210 | 1 settings |  |  | 1 / 0 / 0 | S | System settings only |
| recruitment | ExtJS | 11 · 1,458 | main, 3 grid, 2 dlg, 2 detail |  |  | 7 / 0 / 0 | M | positions, candidates, agenda |
| rtm | ExtJS | 2 · 227 | 1 settings |  |  | 0 / 0 / 0 | S | **shared**: real-time messaging (Pusher protocol, authenticates through the standalone `sf/rtm/auth.php` with the session CSRF token) used by chat, webrtc, aiassistant, links, sync; in neo it runs in the App worker or an addon |
| sftp | ExtJS | 9 · 1,144 | main, 3 grid, 2 dlg, 1 detail, 1 settings |  |  | 3 / 0 / 0 | M | accounts, folders, subfolders |
| sftpclient | ExtJS | 3 · 333 | 1 dlg, 1 settings |  |  | 1 / 0 / 0 | S | connection dialog, settings |
| signalk | — | — | — |  |  | no Module.php | — | no `Module.php`, server experiment |
| smartemailing | ExtJS | 11 · 1,660 | main, 4 grid, 4 dlg, 1 settings |  |  | 5 / 0 / 0 | M | sync queue, list / field mappings |
| sqlmanager | ExtJS | 30 · 4,331 | main, 9 grid, 4 dlg, 1 detail, 6 settings | CanvasJS | Ext.form.BasicForm, Ext.form.TextField | 3 / 0 / 0 | L | SQL views with CanvasJS series / axes, renderers, connections; overrides `Ext.form.BasicForm` and `TextField` |
| svggraph | — | — | — |  |  | 0 / 0 / 0 | — | server-side SVG graphs, no UI |
| tours | ExtJS | 13 · 2,596 | main, 2 grid, 1 dlg, 1 detail | Shepherd | Ext.Component | 1 / 0 / 0 | L | Shepherd tours with an element picker; selectors are ExtJS DOM, so the recorder and every stored tour need neo selectors; overrides `Ext.Component` |
| wakatime | ExtJS | 10 · 1,271 | main, 1 grid, 1 dlg, 2 settings |  |  | 4 / 0 / 0 | M | dashboards, heartbeats, charts |
| webrtc | ExtJS | 5 · 830 | 2 dlg, 1 settings | WebRTC |  | 1 / 0 / 0 | M | calls: media APIs need a main-thread addon |
| wireguard | ExtJS | 7 · 825 | main, 1 grid, 3 dlg, 1 settings | CodeMirror, QR |  | 2 / 0 / 0 | M | peers, QR code, CodeMirror |
| workspaces | **neo** | — | — |  |  | 1 / 0 / 0 | done | neo only (the dock, `docs/neo-workspace.md`) |
| yubicoauthenticator | ExtJS | 5 · 385 | 1 dlg, 2 settings |  | go.usersettings.AccountSettingsPanel | 0 / 0 / 0 | S | login step + My account card, like the neo otp module (`loginPanels`) |

### business

| Module | Classic UI | Files · LOC | Screens | Libraries | Ext.override of | Server (JMAP ctrl / page / cli) | Effort | Notes |
|---|---|---|---|---|---|---|---|---|
| approval | GOUI | 4 · 616 | main, 1 grid, 1 dlg |  |  | 1 / 0 / 0 | M | approval of time registrations |
| automation | ExtJS | 6 · 688 | main, 1 grid, 1 dlg, 1 detail |  |  | 1 / 0 / 0 | S | automation rules grid, dialog, detail |
| business | ExtJS + GOUI | 23 · 1,457 | main, 7 grid, 3 dlg, 1 settings |  | go.users.SystemSettingsUserGrid | 5 / 0 / 0 | M | businesses, employees, agreements, activities, VAT rates; overrides the System settings user grid |
| calendartimetracking | GOUI | 2 · 218 | 1 dlg |  |  | 0 / 0 / 0 | S | time entry dialog from a calendar event: needs a neo calendar hook |
| catalog | ExtJS + GOUI | 20 · 2,418 | main, 4 grid, 5 dlg, 3 detail | Chart.js |  | 2 / 0 / 0 | M | articles, category tree, monthly sales chart (Chart.js); classic UI is half ExtJS, half GOUI |
| contracts | ExtJS | 10 · 1,443 | main, 2 grid, 3 dlg, 1 detail |  |  | 2 / 0 / 0 | M | contracts, books, report |
| fileconverter | ExtJS | 2 · 89 | 1 settings |  |  | 0 / 0 / 0 | S | System settings only |
| finance | ExtJS + GOUI | 47 · 7,127 | main, 9 grid, 11 dlg, 5 detail, 1 settings |  | GO.billing.MainPanel, business.BusinessDialog, addressbook.ContactDetail, addressbook.ContactDialog | 6 / 4 / 1 | L | finance documents, payments, debtor profiles, sales report; overrides `BusinessDialog`, addressbook `ContactDialog` / `ContactDetail`, and adds a migration button to `GO.billing.MainPanel` only when billing is present (optional). Already the example in `--allow-without-neo` |
| forms | GOUI | 20 · 1,773 | main, 2 grid, 8 dlg, 3 detail, 1 settings |  |  | 4 / 1 / 0 | M | form builder with field windows, participants, send; **plus the public participant page** (`pageForm()` → `views/goui/script/form.php`, which requires the classic Paper `pageHeader.php` and `views/goui/dist/Participant.js`): it breaks in a stripped build once `views/neo` exists, so it needs a neo / `Page` version |
| kanban | GOUI | 12 · 1,761 | main, 3 grid, 4 dlg |  |  | 2 / 0 / 0 | L | boards, columns, cards with drag and drop, backlog |
| license | — | — | — |  |  | no Module.php | — | server only (license check) |
| mcp | GOUI | 4 · 458 | 1 dlg |  |  | 1 / 2 / 0 | S | API keys for MCP |
| mollie | ExtJS | 2 · 34 | 1 settings |  |  | 0 / 4 / 0 | S | System settings only |
| msteams | GOUI | 2 · 97 | 1 settings |  |  | 0 / 1 / 0 | S | settings + online meeting (neo `onlineMeeting` like jitsimeet); injects a script via `Module.php` |
| multisafepay | ExtJS | 2 · 39 | 1 settings |  |  | 0 / 4 / 0 | S | System settings only |
| newsletters | ExtJS | 12 · 1,193 | main, 2 grid, 4 dlg, 1 settings |  | addressbook.ContactDialog | 3 / 1 / 0 | M | composer, address lists, sent items, select-dialog panel, addressbook `ContactDialog` override |
| onlyoffice | ExtJS | 5 · 2,360 | 1 dlg, 1 settings |  |  | 2 / 0 / 0 | M | file handler and editor window, save-as; its ExtJS `FileBrowser` / files context menu are replaced by neo `fileHandlers` |
| paypal | ExtJS | 2 · 45 | 1 settings |  |  | 0 / 5 / 0 | S | System settings only |
| privacy | ExtJS | 3 · 249 | main, 1 settings |  | addressbook.AddressBookTree, addressbook.ContactDetail, addressbook.ContactDialog, addressbook.MainPanel | 0 / 0 / 0 | M | small, but four addressbook overrides (`MainPanel`, `AddressBookTree`, `ContactDialog`, `ContactDetail`) |
| projects3 | GOUI | 27 · 3,909 | main, 3 grid, 7 dlg, 4 detail | Chart.js | GO.projects2.MainPanel | 3 / 0 / 1 | L | projects, finance, resources, expenses, time; Chart.js; adds a migration button to `GO.projects2.MainPanel` only when projects2 is present (optional) |
| registration | GOUI | 14 · 2,614 | main, 3 grid, 3 dlg |  |  | 1 / 0 / 0 | L | time registration with day / week / month / column views and a timer button |
| reports | GOUI | 14 · 2,683 | main, 1 grid, 5 dlg |  |  | 2 / 0 / 0 | L | report builder with fixed and variable filters, inline custom field edit |
| studio | ExtJS | 11 · 1,396 | main, 1 grid, 1 dlg |  |  | 1 / 0 / 1 | M | module wizard that generates ExtJS / GOUI code; port only together with neo templates |
| support | ExtJS | 7 · 598 | main, 2 dlg, 2 settings |  | GO.tickets.MainPanel, tasks.TasklistDialog | 3 / 0 / 1 | M | adds a migration button to `GO.tickets.MainPanel` when tickets is present (optional) and overrides the tasks `TasklistDialog`; migration window |
| supportclient | GOUI | 8 · 874 | main, 2 grid, 1 dlg |  |  | 3 / 0 / 0 | M | support client: task lists, tasks, comments |
| swissqr | — | — | — |  |  | 1 / 0 / 0 | — | server only |
| vies | ExtJS | 2 · 66 | 1 dlg |  | addressbook.ContactDialog | 1 / 0 / 0 | S | VAT check in the addressbook `ContactDialog` |
| wopi | — | — | — |  |  | no Module.php | — | `wopi.php` only; the community wopi module has neo |

### nuw

| Module | Classic UI | Files · LOC | Screens | Libraries | Ext.override of | Server (JMAP ctrl / page / cli) | Effort | Notes |
|---|---|---|---|---|---|---|---|---|
| assigneecf | ExtJS | 3 · 122 | 1 dlg |  |  | 1 / 0 / 0 | S | custom field type (`customFieldsAdmin` + `types.mjs`) |
| billingpdf | — | — | — |  |  | no Module.php | — | server only (billing PDF) |
| cftemplate | ExtJS | 4 · 160 | 1 dlg |  | GO.projects2.ProjectPanel | 0 / 0 / 0 | S | custom field type + `GO.projects2.ProjectPanel` override: blocked by projects2 |
| contactsexport | ExtJS | 1 · 74 | — |  | addressbook.MainPanel | 1 / 0 / 0 | S | export button in the addressbook main panel; the spreadsheet reads projects2 types (`converter/Spreadsheet.php`) |
| emailprojectfilter | ExtJS | 1 · 31 | — |  | GO.email.EmailComposer | 1 / 0 / 0 | S | e-mail composer override: needs a neo composer hook; queries `pr2_projects` |
| eventnotificator | ExtJS | 3 · 123 | 1 settings |  |  | 0 / 0 / 0 | S | System settings only; its calendar picker calls the legacy `calendar/calendar/store` route |
| externalcalendarimport | ExtJS | 4 · 291 | main, 1 grid, 1 dlg, 1 settings |  |  | 1 / 0 / 0 | S | My account card with external calendars |
| externaluploader | ExtJS | 7 · 683 | main, 1 grid, 1 dlg, 1 detail, 1 settings |  |  | 1 / 0 / 0 | M | upload items grid, dialog, detail, settings |
| force2fa | ExtJS | 1 · 50 | — |  |  | 0 / 0 / 0 | S | one file; neo otp enforcement (`onMainView`) may already cover it |
| linkmailtoproject | ExtJS | 3 · 198 | 1 settings |  |  | 0 / 0 / 0 | S | System settings only; links mail to projects2 |
| mail2project | ExtJS | 3 · 181 | 1 settings |  |  | 0 / 0 / 0 | S | System settings only; projects2 |
| nusperlingdashboard | ExtJS | 9 · 952 | main, 2 grid, 1 settings, 2 portlet |  |  | 1 / 0 / 0 | M | dashboard with portlets, drop zone, scroll-loading grids; queries `pr2_projects` and `pr2_hours` |
| projectcreator | ExtJS | 4 · 327 | main, 1 grid, 1 settings |  |  | 1 / 0 / 0 | S | project grid + settings; projects2 |
| projectleads | ExtJS | 8 · 556 | main, 6 grid |  |  | 1 / 0 / 0 | S | lead grids by year / month / week; opens the projects2 panel |
| projects3filters | ExtJS | 1 · 51 | — |  |  | 0 / 0 / 0 | S | registers customer, contact, status and completion conditions in the projects3 client filter editor; without it those filters can't be edited |
| projectsdsgvo | GOUI | 4 · 262 | 1 dlg |  | GO.projects2.ProjectPanel | 1 / 2 / 0 | S | consent dialog + `GO.projects2.ProjectPanel` override: blocked by projects2 |
| restrictemailsearch | ExtJS | 2 · 68 | 1 settings |  | addressbook.SystemSettingsPanel | 0 / 0 / 0 | S | overrides the addressbook System settings panel |
| timeentryexport | ExtJS | 2 · 65 | 1 grid, 1 dlg |  | GO.timeregistration2.ColumnView | 0 / 0 / 0 | S | export from `GO.timeregistration2.ColumnView`: blocked by timeregistration2 |
| timetracking | ExtJS | 4 · 355 | 1 dlg |  | GO.timeregistration2.MainPanel, GO.timeregistration2.TimerButton | 0 / 0 / 0 | S | timer button, agenda view; overrides `GO.timeregistration2`: blocked by timeregistration2 |

## 2. Shared patterns and neo components

### What GO.neo already covers

| Pattern in the external modules | Where | GO.neo today |
|---|---|---|
| Main panel: west filters / tree, center grid, east detail | nearly every module with "main" | `MainThreeColumnPanel`, `GO.grid.Grid`, `detail/Card`, `FilterPanel`, `GO.tree.Tree` |
| Entity dialog (`go.form.Dialog`), custom fields, links, files in the detail | all | `FormWindow` (`hasLinks`, custom fields), `LinkCards`, `FilesPanel`, `CommentsPanel`, `HistoryPanel` |
| Lookup lists (Status / Type / Category / Unit / Rank grid + dialog pairs; amd "SettingsDialog" with `SettingsGridTrait`) | ~40 lookup grids in amd and sf | `src/systemsettings/EntityListPanel.mjs` for one entity per card; see "missing" for several lists in one module dialog |
| System settings and My account panels | 82 modules | `systemSettings` / `userSettings` registry keys, `systemsettings/fields.mjs` |
| Start page portlets | amd (amd, amdmaps, buoys, crew, diary, dms, invoices, pms, portcall, tasks), nuw/nusperlingdashboard | `portlets` registry key (`modules/summary/views/neo`) |
| Link "new item" and detail cards for links | 40 modules register entities with links | `linkWindows`, `linkDetailCards` |
| Login step / second factor | sf/yubicoauthenticator, nuw/force2fa | `loginPanels`, `onMainView` (as otp) |
| Online meeting in the event dialog | business/msteams | `onlineMeeting` configs (as jitsimeet) |
| File handlers (open a file type with the module) | business/onlyoffice, sf/mediaplayer | `fileHandlers` / `openFile` |
| Legacy files and e-mail calls (`GO.files.openFolder`, `GO.email.showComposer`) | ~25 modules | files module neo UI (`#files/folder/<id>`), `src/Mail.mjs` `showComposer()` |
| Export, import, batch edit, multi-select | many grids | `exportEntities`, `src/import/`, `BatchEditDialog`, `MultiSelectToolbar` |
| Upload with progress, drag and drop of files | dms (`DnDFileUpload`), invoices, crew | `Uploader`, `UploadPanel`, `enableDragDrop()` |
| Inline cell editing (`EditorGridPanel`: certificate expiry dates, invoice items, tanks, rest hours) | ~10 modules | neo ships `grid/plugin/CellEditing.mjs`; not wired into `GO.grid.Grid` yet (see missing) |
| Grouped column headers (resthours, tanks `ColumnHeaderGroup`) | 2 | neo grid `headerGroup` columns (neo 14); untried in GO.neo |
| Third-party DOM library in a main-thread addon | — | pattern exists (community/syncfusion, `docs/neo-core-components.md`) |

### Missing in neo (to build before or with the first module that needs it)

| Component | Needed by | Proposal | Size |
|---|---|---|---|
| **Extension points into other modules** (replacement for `Ext.override`) | address book `ContactDialog` / `ContactDetail` / `MainPanel` / tree / System settings: sf/ares, sf/invoices, business vies, newsletters, finance, privacy, nuw contactsexport, restrictemailsearch. E-mail client, composer, message panel, mailbox menu: amd/winmail, sf/aiemail, maildownloader, nuw emailprojectfilter. Calendar month view and event dialog: sf/openweather, business/calendartimetracking. Core e-mail template dialog: sf/coretemplates. Users grid: business/business. Main layout: amd/amd, amd/tasks | named hooks in `ModuleRegistry`, like `onCreateUserDialog`: `onContactDialog`, `contactDetailCards`, `addressBookToolbarItems`, `emailMessageActions`, `composerExtensions`, `calendarDayDecorators`, `emailTemplateDialog`, … Each hook is added in the host module's neo UI when the first consumer is ported. The ExtJS-internal overrides (`Ext.form.TextField`, `BasicForm`, `Ext.Component`, `go.form.Chips`, `SuperBoxSelect`, `go.form.Dialog`, `go.filter.VariableFilterPanel`) are not ported; the behaviour moves into the module's own classes | M for the mechanism, S per hook |
| **Custom field types from modules** at run time | amd catalog, ports, suppliers, vessels; sf/epo; nuw assigneecf, cftemplate | `customfields/types.mjs` has a fixed `TYPES` map; add `registerType(name, {formField, detailHtml, cellHtml, …})`, loaded with the module like `customFieldsAdmin` | S |
| **Chart** | CanvasJS: amd buoys, invoices, iot, stabilityvalidator, tanks, windfarms; sf aiassistant, drivelog, invoices, presenter, sqlmanager. Chart.js: business catalog, projects3 (and contracts, finance in ExtJS). Other charts: sf investing, wakatime | one `GO.chart.Chart` component over a main-thread addon; library is decision D-A. Line / column / area / pie / doughnut, time axes, multiple y axes, zoom, export as image, light / dark theme | M |
| **Map** | Leaflet: amd amdmaps, buoys, fleet, iot, ports, submarinecable, vessels, windfarms, yards (via amd/leaflet). Google Maps: sf/poi (with a geocoder) | port `amd/leaflet` `MapPanel` to a Leaflet addon (plugins: draw, marker cluster, AIS track symbols, time dimension, day / night layer). neo's own `OpenStreetMaps` wrapper uses OpenLayers and doesn't carry these plugins, so it is not a fit (D-B) | M–L |
| Code editor | sf/codemirror users: amd diary, iot, templates; sf openvpn, presenter, wireguard | CodeMirror 5 addon (what the modules have) or neo's `MonacoEditor` wrapper (D-C) | S–M |
| EditorJS block editor | sf/editorjs users: amd dms, formbuilder, pms, tasks | `EditorField` as an addon with the existing plugins | M |
| PDF viewer in a panel | amd/libs `PdfViewPanel`: crew, dms, invoices; sf/bakalari | pdf.js addon rendering into the panel (`pdfjs.getDocument()`, as `PdfViewPanel` does); community/pdfeditor only opens the standalone `viewer.html` in a window, so it doesn't provide an in-panel loader | M |
| Timeline | vis-timeline: amd crew, diary | addon over vis-timeline | S |
| Signature pad | amd formbuilder, pms | small addon (canvas) | S |
| Real-time channel (sf/rtm, Pusher protocol) | sf chat, webrtc, aiassistant; amd links, sync | client in the App worker or an addon; neo already has SSE push for JMAP state | S–M |
| Module settings dialog with several lookup lists | amd `SettingsDialog` + `SettingsGridTrait` in ~15 modules | `EntityListPanel` cards inside one `GO.view.Dialog` with a card menu; the same panel in System settings | S |
| Editable grid | see cell editing above | wire neo `CellEditing` into `GO.grid.Grid` with GO fields and JMAP save | M |
| Tree state (expanded nodes kept across reloads) | amd/libs `TreeStateTrait` (component tree, folder trees) | option on `GO.tree.Tree` | S |
| Wizard (card steps with back / next) | sf czechdatabox, generator; business studio | small `GO.view.WizardDialog` | S |
| EntityTypeTable | no external module uses it | not needed for this port | — |

Third-party libraries the modules vendor and that have to load in neo as addons: Leaflet and
plugins (amd/leaflet), CanvasJS (sf/canvasjs, injected by `Module.php` into the classic page;
neo doesn't render `App::EVENT_HEAD` scripts), CodeMirror (sf/codemirror), EditorJS (sf/editorjs),
pdf.js, vis-timeline, tesseract, xlsx, mammoth, luxon (amd/libs), Shepherd (sf/tours), xterm
(sf/instances), h3 (amd/amdmaps), signature_pad (amd/formbuilder), Font Awesome (sf/fontawesome:
neo uses Material Symbols, so modules map their icons instead of loading the font).

Modules whose classic UI depends on ExtJS internals so much that the port is a rewrite, not a
translation: amd/formbuilder (overrides the form base classes), sf/tours (stored tours select
ExtJS DOM; every tour needs new selectors, decision D-E), sf/aiassistant (dictation in every text
field: moving it into the module's own classes would lose dictation in other modules' fields, so
neo needs a shared field hook or the scope shrinks), sf/sqlmanager. amd/tasks also needs a
registration decision: neo `ModuleRegistry` keys modules by `name` and community tasks already
registers `tasks`; the classic amd panel uses the id `amdtasks` and hides the community Tasks
entry.

## 3. Usage: which modules the installations use

Not knowable from this checkout, and live systems were not accessed. What would tell it, per
installation (all read-only):

| Source | Tells | How |
|---|---|---|
| `core_module` | installed and enabled modules with version | query 1 below |
| `core_permission` | which groups may use a module. 0 groups does not prove disuse: administrators have rights anyway, and background work (cron, e.g. nuw/mail2project's IMAP import) runs without anyone opening a panel | query 1 |
| `core_entity` + the module tables / `core_search` | how much data a module holds | query 2 |
| `history_log_entry` | recent activity per entity type (only where the history module logs it) | query 3 |
| `core_auth_token` / user `lastLogin` | whether the installation is used at all | — |
| `config.php` `allowed_modules` (written by community/multi_instance) | modules allowed on hosted instances | the instance config file, or the multi_instance instance dialog; sf/instances keeps its own module list ("Modules" dialog) |
| amd/sync replica heartbeat | installed module versions per replica (vessel); the package manifests in `data/sync-packages/*` only say what an archive contains | amd/sync admin (`SyncService` heartbeat) |
| request telemetry | per-module use; a plain access log can't tell it (hash routes never reach the server, JMAP batches method calls in POSTs to `api/jmap.php`), so only where method-level logging is already collected | outside GO |

```sql
-- 1. Installed external modules, enabled flag and how many groups have access
SELECT m.package, m.name, m.enabled, m.version,
       (SELECT COUNT(*) FROM core_permission p WHERE p.moduleId = m.id) AS groups_with_access
FROM core_module m
WHERE m.package IN ('amd', 'sf', 'business', 'nuw')
   OR (m.package IS NULL AND m.name IN ('projects2', 'timeregistration2', 'billing', 'tickets', 'files', 'email'))  -- legacy modules have package NULL
ORDER BY m.package, m.name;

-- 2. Number of search-indexed items per entity type of these modules
SELECT m.package, m.name AS module, e.name AS entity, COUNT(s.id) AS items
FROM core_entity e
JOIN core_module m ON m.id = e.moduleId
LEFT JOIN core_search s ON s.entityTypeId = e.id
WHERE m.package IN ('amd', 'sf', 'business', 'nuw')
GROUP BY m.package, m.name, e.name
ORDER BY items DESC;

-- 3. Changes per entity type in the last 90 days (history module installed)
SELECT m.package, m.name AS module, e.name AS entity, COUNT(*) AS changes_90d
FROM history_log_entry h
JOIN core_entity e ON e.id = h.entityTypeId
JOIN core_module m ON m.id = e.moduleId
WHERE h.createdAt > NOW() - INTERVAL 90 DAY
  AND m.package IN ('amd', 'sf', 'business', 'nuw')
GROUP BY m.package, m.name, e.name
ORDER BY changes_90d DESC;
```

Questions for the owner:

- **Q1** business is Intermesh's repository and 13 of its modules already have a GOUI client
  (10 GOUI only, 3 mixed with ExtJS).
  Do we write their neo UIs (in our fork or as patches to Intermesh), or does Intermesh, or do
  business modules stay classic-only (launchers, D3) for now?
- **Q2** Which installations should be neo-only first? A list of instances with their
  package set (AMD master, AMD replicas / vessels, smartflows' own instances, the nuw customer,
  hosted customers) decides the order in section 4.
- **Q3** nuw: projects2 and timeregistration2 (pro modules, Intermesh) carry eleven nuw modules.
  Is moving that customer to business projects3 / registration an option, or do the pro
  modules need neo UIs (out of this audit's scope)?
- **Q4** Which modules are no longer used and can be left out (not ported, uninstalled):
  candidates sf/dummy, sf/generator, business/studio (both generate ExtJS code), amd folders
  without `Module.php` (amdcatalog, amdtasks, dokuwiki, amos).
- **Q5** For amd replicas on vessels: do they run the same web UI as the master, and can a
  replica be neo-only while the master still has classic (D3 launchers on the master only)?
- **Q6** Is the CanvasJS licence valid for a new integration, or should the chart component use
  a free library (D-A)?

### Owner's answers (2026-11-25)

- **Focus now: the open-source (community) version.** External modules are not ported for now,
  except the ones the owner names one by one; the phases in section 4 are a reference, not a plan.
- **Q1** business: we will port it ourselves, later (not now).
- **Q2** not applicable: no installation-wide switch to neo-only is planned.
- **Q3, Q4** unanswered.
- **Q5** amd replicas on vessels stay on the classic GroupOffice client; neo is not planned for them.
- **Q6** the CanvasJS licence covers any number of projects. The library choice (D-A) stays open.

## 4. Proposed porting order

Today neo is the default and a module without `views/neo` that has a classic **main panel** opens
in the classic client from the apps menu (D3, `Neo.php` lists only main panels the user may open).
Settings cards, login steps and extensions of other modules (e.g. sf/maildownloader's mailbox menu
item) have no launcher: users reach them only by switching to the classic client. So the port
mostly doesn't block using neo, but those pieces are missing there until ported.

What it blocks is the **neo-only build** (`build/build.sh --test --webclient=neo`,
`scripts/strip-classic.sh`). The gate checks every module folder in the **assembled package**, not
the modules an installation has enabled: a module shipped but unused still fails it unless named
in `--allow-without-neo` (then its classic files stay and nobody can open them). build.sh adds the
pro and business modules before the gate, and `--webclient=neo` still requires `--test` (publishing
a neo-only release is an open decision, `docs/neo-switch.md`). A milestone "installation X is
neo-only" therefore means: a package manifest for X (which packages and modules it ships), its
allow-list, and a publishable neo-only release. The order follows installations, dependencies and
shared components first.

### Decisions to make first

| | Decision | Recommendation |
|---|---|---|
| D-A | Chart library | Chart.js (MIT, already used by business GOUI) behind `GO.chart.Chart`; CanvasJS only if Q6 says the licence covers it and the CanvasJS-specific features (stock charts, zoom on large series in iot / tanks) are needed |
| D-B | Map library | Leaflet addon built from amd/leaflet (the plugins are the value), not neo's OpenLayers wrapper |
| D-C | Code editor | CodeMirror 5 addon: same behaviour and modes as today, much smaller than Monaco; Monaco only if a module needs IDE features |
| D-D | Extension points | named registry hooks added by the host module (section 2), no generic patching |
| D-E | sf/tours | stored tours are not migrated; tours are re-recorded against neo selectors (`data-ref` / stable ids) after the modules they cover are ported |
| D-F | Effort per card | batch S modules 4–8 per card; one card per M; split L / XL by screens (main view, settings, dialogs) |

### Phases

| Phase | Content | Why now | Size |
|---|---|---|---|
| 0. Core components | extension-point mechanism (and the first hooks: address book contact dialog / detail, e-mail message actions), custom field type registry, module addon support in the production build (D7 card), `GO.chart.Chart`, Leaflet map addon, module settings dialog with lookup lists, `CellEditing` in `GO.grid.Grid`, tree state | everything after depends on them; each is tested in the Dev module (`#dev`) | ~15 cards |
| 1. Quick wins | most of the 56 S modules (those that need nothing from phase 0 beyond the hooks): settings-only (sf airouter, meilisearch, n8n, qdrant, ntfy, …; business fileconverter, msteams, mcp; nuw eventnotificator, externalcalendarimport, restrictemailsearch, force2fa), login steps (sf/yubicoauthenticator), small hooks (sf coretemplates, maildownloader, openweather; business vies; nuw assigneecf). Not here: payment providers (need finance, phase 5), nuw modules on projects2 (phase 6) | shrinks the gate list fast; proves each new hook with a small consumer | ~8 batch cards |
| 2. Shared library modules | sf canvasjs (the CanvasJS loader, only if D-A keeps CanvasJS), codemirror, editorjs, rtm, fontawesome (icon mapping), jobqueue; amd libs (PDF viewer, timeline), leaflet (the module's own main view and settings; the Map addon itself is phase 0) | dependencies of 4–11 modules each (table below) | ~6 cards |
| 3. AMD chain | in dependency order: flags → fleet → vessels → ports → templates → suppliers → buoys → amdmaps → formbuilder → crew → portcall → diary → dms → links → pms; then the rest, each after what its `getDependencies()` lists (e.g. equipment after links and libs): certificates, chartering, emspilot, equipment, esbjobs, ihm, iot, maps, news, printers, resthours, stabilityvalidator, submarinecable, sync, tanks, tasks (registration decision, section 2), voip, windfarms, winmail, yards; invoices and catalog last (largest, most self-contained) | AMD's modules depend only on amd, sf and community modules (plus legacy files, done), so an AMD installation can become neo-only without anyone else's work | ~95 cards |
| 4. sf applications | invoices, drivelog, chat + webrtc, aiassistant (+ aiemail, messenger, mcp), presenter + sqlmanager, czechdatabox, instances, ares, poi (Google Maps → Leaflet, geocoding), tours (D-E) and the other M modules | smartflows' own installations; aiassistant is used across installations | ~45 cards |
| 5. business | ported by us, later (Q1), in dependency order: business → projects3 → registration → approval (and calendartimetracking); finance → contracts, payment providers (mollie, multisafepay, paypal); support → supportclient; forms (with its public participant page, finding 6), kanban, reports, catalog, newsletters, onlyoffice, privacy, automation, studio. The GOUI ones translate faster than ExtJS ones. How operators start the billing / projects2 / tickets migrations without the classic panels is a separate decision | Intermesh's repository | ~28 cards |
| 6. nuw | after Q3: the eleven projects2 / timeregistration2 dependants once those have neo UIs or the customer moved; the rest (externaluploader, assigneecf, force2fa, …) can go with phase 1 | blocked outside our repositories | ~10 cards |

Modules most others depend on (count of modules that list them in `getDependencies()`):

| Dependency | Dependants |
|---|---|
| community/addressbook (has neo) | 16 |
| amd/fleet | 14: amdmaps, certificates, crew, diary, esbjobs, formbuilder, ihm, iot, pms, portcall, resthours, stabilityvalidator, tanks, tasks |
| amd/libs | 11 |
| sf/jobqueue, sf/canvasjs | 10 each |
| amd/leaflet, amd/templates | 9 each |
| legacy/files (has neo), business/business | 7 each |
| sf/airouter, amd/ports, sf/codemirror | 6 each |
| amd/formbuilder, sf/rtm, business/finance | 5 each |
| sf/editorjs, sf/fontawesome, sf/mpdf (no UI), amd/pdfparser (no UI), community/tasks (has neo) | 4 each |

Which installation could become neo-only after which phase (hypothetical: Q2 is not applicable, nothing is planned):

| Package set shipped (gate runs on the package, see above) | Needs | neo-only after |
|---|---|---|
| Only community modules + sf infrastructure (airouter, jobqueue, …) | phases 0–2 | phase 2 |
| AMD master (replicas stay classic, Q5) | phases 0–3 and the sf modules AMD installs (aiassistant, mcp, …) | phase 3 + those sf modules |
| smartflows' own instances | phases 0–2, 4 | phase 4 |
| Installations with business modules | phase 5 | ported by us, later (Q1) |
| nuw | phases 1, 6, Q3 and the pro modules | depends on projects2 / timeregistration2 |
