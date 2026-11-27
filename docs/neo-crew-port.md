# neo: amd/crew port, analysis and card split (2026-11-27)

The owner decided on 2026-11-27 to port crew in full (path A). Crew is the first external module on neo, and its
Crew Planning is the first user of `GO.scheduler.Scheduler`, a wrapper over neo 14's `Neo.scheduler.Container`.
This page holds the analysis. The work itself is in the board cards listed under "Cards". Module code goes to the
amd-mono branch `neo` (`~/Projects/groupoffice26-neo-amd`, see `docs/neo-upstream-sync.md`). Core neo pieces go to
`neo-ui` in this repository.

Sources read:

- `amd/crew/views/extjs3`: 80 files, 13,042 lines; `Module.js` alone has 874 lines of entity and filter definitions
- `getDependencies()` in `crew/Module.php`
- `amd/formbuilder/views/extjs3/DialogOverride.js` and `amd/libs/views/extjs3/PdfViewPanel.js`
- from neo 14.0.0: `src/scheduler/*`, `src/timeline/*`, `src/data/TreeStore.mjs`, `src/grid/*`, the
  `examples/scheduler/*` and `examples/grid/tree` examples
- from GO.neo: `ModuleRegistry.mjs`, `classicApps.mjs`, `view/FormWindow.mjs`

A Codex review (gpt-6.2-astra) checked this page against those sources. Its findings are worked in. Nothing was run
in a browser. Each point marked "unverified" is something a card has to prove first.

## 1. Inventory by behaviour

| # | Area | Behaviour (ExtJS source) | GO.neo | Class |
|---|---|---|---|---|
| 1 | Registration | `go.Modules.register('amd','crew')`, 18 entities with relations and filters, `systemSettingsPanels` (`Module.js`) | `ModuleRegistry.register({package:'amd', name:'crew', capability, mainView, routes, systemSettings, portlets})` | port |
| 2 | Routes | `#crew` and the entity hashes from `go.Entities.get(<entity>).getRouterPath(id)`. `#crewplanning/<date>` is a separate **top-level** hash: `Module.js` 10-37 registers it with `go.Router.add` and waits for the timeline to render. Bookmarks to these hashes exist | `mainView.route(path)` plus registry `routes` for the 4 entities with a detail. `#crewplanning/…` needs its own handler, because neo sends an unknown first segment to extensions or to the classic fallback (`apps/go/view/MainView.mjs`, `link/linkTypes.mjs`) | port; build the compat route |
| 3 | Layout | 5 center tabs: Crew Planning, Members, Certificates, Contracts, Voyages. West shows the nav list and filters of the active tab. East is one detail tab panel with 4 details. Narrow mode (`MainPanel.js`) | `MainThreeColumnPanel` subclass; the center is a tab container; west and east switch per tab | port |
| 4 | Company context | A west company combo (`CompanyComboReset`), saved per user. It filters members, voyages, contracts, both member nav lists and the planning vessels. `applyCompanyPermissionGate` enables Add only with create permission on the company and hides Contracts without read permission (`MainPanel.js` 280-372) | `JmapComboBox` over `AmdFleetCompany` plus module code; the saved choice goes to `State` | port |
| 5 | Module rights | The Contracts tab exists only with module `write` or the right `mayManageContracts` (`helpers.js` `canManageContracts`). The Add, Delete and Settings buttons follow `write`, `writeAndDelete` and `manage`. Double click or Enter on a member needs write permission on that record (`MainPanel.js` 761, 774) | `Acl` and the module rights of the registry | port |
| 6 | Members list | `MemberGrid` with a west `MemberStatusFilterGrid` (status check list). Filter panel (`filteraddbutton`, `filtergrid`, `variablefilterpanel`) with about 25 member filters. Toolbar search, batch edit, import, export, delete, Settings | `Grid` + `JmapStore`, `CheckList`, `FilterPanel` + `filterTypes`, `SearchButton`, `BatchEditButton`, `importFile`, `exportEntities` | port |
| 7 | Member dialog | **Panels:** Member, About (`MemberAboutField`), Certificates / Contracts (with rights) / Voyages as child grids. **Fieldsets:** Sizes, Notifications, NOK (`MemberAddressesField`). Ranks chips, photo, custom fields. Picking an address book contact (`community.addressbook.ContactCombo`) fills the name. A manager can link a user account and set `keepAccountEnabled` (`MemberDialog.js` 20-324) | `FormWindow` with `addCard()`, `ArrayField`, `AutocompleteChips`, custom fields; the child grids come from rows 10, 12 and 13 | port |
| 8 | Member detail | Sections: Member, About, NOK, Sizes. Child grids for certificates, contracts and voyages, each with Add. "Add certificate from file" starts an OCR job (`AmdCrewOcrJob/prepareOcr`, then polls `AmdCrewOcrJob/get`) and then opens the verification dialog. "Add contact" creates a prefilled contact and links it back. Download CV, Print. A pms job report grid (`go.modules.amd.pms.JobReportCrewDetailPanel`) when pms is on. Custom fields, links, comments, files, history (`MemberDetail.js`, 998 lines) | A module container with `detail/Card`s, `DetailFieldsets`, `LinkCards`, `CommentsPanel`, `FilesPanel`, `HistoryPanel` | port |
| 9 | Document generation | `MemberDocumentPickerDialog`: generates documents in bulk for the current member filter and selection. It offers only active crew templates (fleet `DocumentTemplateChips`) and downloads a ZIP. Also `PrintoutMemberDialog` | `Dialog` + `AutocompleteChips` over the template entity, `download.mjs` | port |
| 10 | Certificates | `MemberCertificateGrid` (filters, batch edit, export, delete). Dialog with type and category chips and `DialogFilePanel`. Detail with Renew, Download, Print and Back to member. Edit and Renew open the verification dialog when a file is present (`MemberCertificateDetail.js` 153, 181) | As rows 6-8 | port |
| 11 | Certificate verification | `MemberCertificateVerificationDialog`: a preview of a PDF (libs `PdfViewPanel`) or an image, with zoom. Opens a file from the files panel. OCR re-analysis, errors through `libs.jobErrorText` (329 lines) | No PDF viewer in neo | build (amd/libs) |
| 12 | Contracts | `MemberContractGrid` with a west `MemberNavGrid` and filters. Dialog (343 lines: agreement type, duration types, currencies, tax flags, `DialogFilePanel`), detail, `MemberContractSelectorDialog`, `VoyageContractGrid` | As rows 6-8 | port |
| 13 | Voyages | `MemberVoyageGrid` with a west `MemberNavGrid` and filters, including `todayOnBoard`. **Dialog** (540 lines): company, vessel and vessel rank combos, with an override of the rank filter. Crew change combos (portcall) with "show older" and sign-off choices limited by sign-on. A Contracts tab (`VoyageContractGrid`, `contractIds`; also needs read permission on the company). **Detail** (558 lines): Crew Change, Crew Change Log, Remarks, a port link (`Port` entity), contracts, Download PDF, "Send to team member" (`AmdCrewMemberVoyage/prepareEmail` + `GO.email.showComposer`), a diary link, files. **Relive** starts a relief voyage with the same company, vessel and rank; its start crew change is the outgoing voyage's end crew change | As rows 6-8, `Mail.showComposer()` | port |
| 14 | Voyage records (Travels) | Edited in the voyage **dialog** after the first save (`MemberVoyageRecordGrid` + dialog). "Analyze" turns pasted flight text into type, dates and remarks (AI Router). The detail lists the records. Record types have a colour | `Grid` + `FormWindow` | port |
| 15 | Voyage form and Checks | Formbuilder's `go.form.Dialog` override renders `entity.formBuilder.formStructure` into the voyage dialog; the forms come from `vesselRank.formIds`. Group rules. Crew's `FormBuilderCertificateCheckField`: Checks picks the best certificate per type, ticks valid certificates on a new selection, and marks missing or expired ones. Formbuilder's `FormDetailPanel` in the voyage detail | Core hook `onFormWindow` (card C, `docs/neo-core-components.md`); formbuilder runtime missing | build (core hook + amd/formbuilder) |
| 16 | Crew Planning | `TimelinePanel.js` on vis-timeline (section 3) | `Neo.scheduler.Container` | build (`GO.scheduler.Scheduler`) |
| 17 | Lookups (Settings dialog) | `SettingsDialog` has 11 tabs, each a lookup grid with a dialog: certificate type, certificate category, project, rank, relation, voyage record type, currency, duration type, member status, marital status, agreement type. Rank also carries needed certificates, companies and formbuilder `FormChips` (`RankDialog.js`) | `systemsettings/EntityListPanel` per lookup (unverified), or one module dialog with tabs | port (verify EntityListPanel) |
| 18 | System settings | `SystemSettingsPanel`: the AI Router account and a model selector that depends on it, the document OCR prompt, the flight analysis prompt, crew accounts, voyage record type defaults | `systemSettings` registry key + `systemsettings/fields.mjs` | port |
| 19 | Portlets | Birthday (today to 7 days ahead) and Certificate (expiring; old and renewed ones excluded), each with a per-user company settings dialog. A click opens the member or the certificate (`Portlets.js`, `BirthdayPortlet.js` 110-122, `CertificatePortlet.js` 101-109) | `portlets` registry key (unverified) | port |
| 20 | Files in dialogs | `DialogFilePanel` in the certificate and contract dialogs, disabled until the entity has an id. Drag and drop upload (`GO.files.DnDFileUpload`), open the folder in the files browser | `Uploader` / `UploadPanel` / `dragDrop` (unverified), and the files neo UI at `#files/folder/<id>` | port |
| 21 | Custom combos | `CountryCombo`, `MemberCombo`, `RankCombo` / `RankChips`, `ProjectCombo` / `ProjectChips`, `VesselCombo(Reset)`, `CompanyComboReset`, about 12 lookup combos | `JmapComboBox` / `AutocompleteChips` configs | port |
| 22 | Tours | `tourId: 'amd-crew-planning'` (sf/tours) | neo has no tours | gap (owner) |

## 2. Dependencies: what crew needs in neo

`getDependencies()` lists amd/libs, fleet, ports, pdfparser, templates and formbuilder, plus sf/airouter,
legacy/files and sf/jobqueue. The views also use amd/portcall, amd/pms, amd/diary, community/addressbook and the
legacy email module without declaring them.

| Module | What crew's views use | In neo | Must be ported first? |
|---|---|---|---|
| amd/fleet | `CompanyCombo`, `CompanyChips`, `VesselCombo`, `VesselRankCombo`, `DocumentTemplateChips`; stores `AmdFleetCompany`, `AmdFleetVessel`, `AmdFleetVesselRank` | JMAP entities work without a fleet neo UI: `JmapComboBox` / `AutocompleteChips` with `entityName` | No. Crew defines these combos in its own `views/neo`. They move to fleet's `views/neo` when fleet is ported |
| amd/ports | The voyage detail loads the `Port` entity and links to it (`MemberVoyageDetail.js` 157, 540). Crew's `CountryCombo` is its own `AmdCrewCountry` | JMAP entity. Ports has no neo UI yet, so the link goes to the classic client (`classicApps.mjs` sends hashes neo can't route to classic) | No |
| amd/pdfparser, amd/templates | Backend only: text from PDFs for OCR, PDF generation | — | No |
| amd/libs | `PdfViewPanel` (certificate verification) and `jobErrorText` (OCR job errors). `FormDialogErrorOverride` and `TreeStateTrait` are internal to ExtJS | No PDF viewer in neo | Only for row 11: a PDF viewer card in amd/libs, where pdf.js is vendored (`views/extjs3/lib/pdfjs`). The other crew cards don't wait |
| amd/formbuilder | The dialog override (row 15), `FormDetailPanel`, `FormChips` in `RankDialog`, and the field type registry for `CertificateCheck` | Nothing | The rank `FormChips` is a plain `AutocompleteChips` over `AmdFormBuilderForm`, so that part doesn't wait. The voyage form (row 15) needs a core `FormWindow` hook and the formbuilder runtime. That runtime is shared: `FormTrait` is used by crew, diary, dms, pms and tasks |
| amd/portcall (undeclared) | Crew change combos in the voyage dialog (`portcall.CrewChangeComboReset`); the planning loads `AmdPortCall` and `AmdPortCallCrewChange` | JMAP entities | No: the combos go over the entities. Finding: `TimelinePanel.js` loads both stores without `isAvailable('amd','portcall')`. The neo port guards them |
| amd/pms (undeclared, guarded) | The member detail embeds `pms.JobReportCrewDetailPanel` (job reports filtered by member) and links to each report | JMAP entity | No. Crew renders a `Grid` over the pms entity while pms is available; the report link goes to classic until pms is ported |
| amd/diary (undeclared, guarded) | The voyage detail has a diary link | — | No |
| community/addressbook | `ContactCombo` in the member dialog; creating a contact from the member detail | The address book has a neo UI (`JmapComboBox` over `Contact`; its contact dialog) | No |
| legacy/files, email | `GO.files.openFolder`, drag and drop upload, `GO.email.showComposer` | The files neo UI and `Mail.showComposer()` | No (both exist) |

**Data rule for every card.** The upstream schema of crew, fleet, formbuilder and portcall stays as it is. Business
edits go only through the existing JMAP API, the same calls the classic client makes. Cards don't rewrite data
directly. New persistence that only neo needs goes to `neo_*` tables (`docs/neo-workspace.md`, neo_* section; a module's own
in `views/neo/install/updates.php`, `docs/neo-core-components.md` "neo tables of modules").
Nothing found so far needs one: the saved company choice and the planning zoom and range are per-user UI state
(`State`).

## 3. Crew Planning on Neo.scheduler

### What the vis-timeline view does today (`TimelinePanel.js`)

- **Groups, on 3 collapsible levels** (vis `nestedGroups`): company → vessel → vessel rank.
  - Vessels come from `AmdFleetVessel` with the filter `modulesVisibility: {module: 'crew'}`, plus the company
    filter of the main panel.
  - Ranks are the vessel's `ranks` without `hideFromCrewPlanning`, ordered by `sortOrder`.
  - Companies and vessels are ordered by name.
- **Items, all read-only** (`editable: false`):
  - **Voyage records** (`AmdCrewMemberVoyageRecord`, not voyages): ranges on the rank row
    `asset_<vesselId>_rank_<rankId>`.
    - Content: the member's avatar or initials and name, as HTML.
    - CSS class per record type (`amd-membervoyage-<typeId>`).
    - The member and voyage are fetched per record (chains of `go.Db.store().single()`).
  - **Port calls** (`AmdPortCall`, from arrival to departure): **background** bands on the vessel row, copied to
    every rank row of that vessel. Company rows have none.
  - **Crew changes** (`AmdPortCallCrewChange`): two 30-minute background lines, one for the latest arrival of the
    on-signers and one for the departure of the off-signers. They are drawn on the vessel row and its rank rows.
- **Interaction**:
  - Selecting an item routes to the voyage detail.
  - Clicking an empty spot on a rank row opens a new `MemberVoyageDialog`. Company, vessel, rank and start time
    are filled in; the vessel is read-only.
  - Toolbar: Today, Refresh, Add.
  - Ctrl+wheel zooms (`zoomMin` 5 days). Horizontal scrolling has no bounds.
  - `#crewplanning/<date>` moves the window to that date.
- **Loading**: all four stores load in full, without a time window.

### What Neo.scheduler.Container 14.0.0 offers

- **Resources and events.** `Neo.scheduler.Container` extends `Neo.grid.Container`:
  - Resources are grid rows (`store`) and events are in `eventStore` (`Neo.timeline.store.Events`).
  - `resourceIdField` maps an event to a row, and `resourceColumns` are the locked columns.
  - Rendering is virtualised in both directions.
- **Interaction flags.** `barDraggable`, `editable` (the EventEditor opens on double click and Enter) and
  `resizableBars`.
  - **Trap:** these flags don't make the scheduler read-only. Plain ArrowLeft and ArrowRight on a focused bar call
    `moveEvent()` without checking `editable` or `barDraggable` (`Container.mjs` `onBarKeyDown`, about lines
    1227-1273). The wrapper has to block that, and a test has to prove it.
- **Tools.**
  - `barRenderer(descriptor, context)` and `barCls`.
  - `zoomTo(presetOrConfig)` takes a preset (hour / day / week) or a config object.
  - `TimeAxis` supports calendar-month ticks with a step, so 1-, 3- and 12-month scales can already be expressed.
    Only named presets and header formatters are missing.
  - `scrollToDate(date)`, `TimeAxis.xToDate()`, `dateToX()`, `snap()`, non-working days.
- **Nested, collapsible resources: a sound path, but no scheduler example uses it.**
  - `Neo.data.TreeStore` keeps the full tree and projects only the expanded nodes into its flat `items`.
  - The inherited grid detects a TreeStore and handles toggling a node (`grid/Container.mjs` about lines 775 and
    1561, `grid/column/Tree.mjs`).
  - The scheduler keeps the resource column descriptors, and the timeline column finds a row's bars by that row's
    resource id (`timeline/Column.mjs` about line 996).
  - **Verified** by scheduler card A (2026-11-27, `#dev/core/Scheduler`, three levels): after a collapse or
    expand the bars stay on their rows and a click on a moved bar hits its own record.
- **Missing pieces:**
  - **Background ranges per row.** Only the global non-working-time bands exist. `Column` renders
    `nonWorkingNodes` next to each row's bars, which is where per-row backgrounds fit in.
  - **A slot click.** The grid's `cellClick` names a row and a field. The wrapper has to tell a bar, a background
    and the empty track apart, and turn the pointer position on the track into a date.
  - **An unbounded or growing time axis.** `TimeAxis` has a fixed `start` and `end`.
- **`barRenderer` needs an adapter.** When the native `barRenderer` returns an object, that object replaces the
  whole bar VDOM node, so its geometry and event identity are lost. The wrapper has to merge `{html, cls}` into the
  default node.
- **Event lookup is not virtualised.**
  - For each rendered row, the column asks for events across the whole axis.
  - The default lookup scans the whole store and reads the literal fields `resourceId`, `startDate` and `endDate`
    (`timeline/store/Events.mjs` about lines 80-103).
  - So crew's records (`startTime` / `endTime`, resource = vessel + rank) have to be normalised into an Events
    store. A long full load makes every row render slower. This decides the load strategy of the planning card.
    The record count on live is unknown; the owner has to run a read-only count.

### Decision: extend (tree), not flatten

The three collapsible levels stay, as users have them today, through a TreeStore as the resource store.
Flattening is the fallback if the spike shows the TreeStore doesn't combine with the scheduler. Flattened, there
would be one row per rank, with "company / vessel" in a locked column. The card then reports this and asks the
owner before it flattens anything. Company and vessel rows are not bookable: a slot click there does nothing, as
today. Vessel rows show the vessel's background bands, and company rows show none.

### GO.scheduler.Scheduler (core, `www/views/neo/src/scheduler/Scheduler.mjs`)

A thin wrapper over `Neo.scheduler.Container`. Like `GO.board.Board` from the tasks kanban card, it is generic and
knows nothing about crew; later users are diary and business modules. It adds what `GO.grid.Grid` adds to a grid:

- JMAP store binding, with the normalisation into an Events store
- theme, density and dark mode
- translations, and the user's locale and time zone (`DateUtil`)
- permissions for interaction

Below is the proposed API. Card A writes the final API to `docs/neo-core-components.md` before it starts coding,
as the board card does.

```js
{
    module          : Scheduler,
    resources       : [{id, parentId, name, bookable, sortOrder, ...}],   // tree by parentId
    resourceColumns : [{dataField: 'name', text: t('Vessel'), type: 'tree'}],
    events          : JmapStore | [],                 // normalised to {id, resourceId, startDate, endDate, record}
    eventFields     : {startDate: 'startTime', endDate: 'endTime', resourceId: r => ...},
    backgrounds     : [{resourceId, startDate, endDate, cls, inherit: true}], // inherit: paint the descendants too
    readOnly        : true,                           // no drag, resize, EventEditor or keyboard moves
    eventRenderer   : record => ({html, cls}),        // built as eventRenderer: barRenderer is neo's own config
    zoom            : 'month',                        // presets hour, day, week + month, quarter, year
    range           : {start, end},                   // grows near an edge (rangeChange)
    listeners       : {
        eventClick : ({record}) => {},
        slotClick  : ({resource, date}) => {},        // empty track of a bookable row only
        rangeChange: ({start, end}) => {}             // the module can load the visible window
    }
}
```

The methods are `scrollToDate(date)`, `zoomTo(preset)` and `reload()`. Drag and resize with a
`toPatch(record, changes)`, like the board's drop → patch function, are left out because crew is read-only. They
come with the first user that edits on the scheduler.

## 4. Cards

Every card stays at M size or below. A card's browser check compares its screens with `?webclient=classic`.

**Core** (project groupoffice26-neo, base `neo-ui`):

| Card | Size | Scope | After |
|---|---|---|---|
| A. `neo-ui: GO.scheduler.Scheduler, tree resources and read-only` | M | Spike TreeStore + scheduler (collapse, bar alignment, hit testing). JMAP binding with normalisation. `readOnly`, including the keyboard guard and its test. `barRenderer` adapter, `eventClick`, theme and locale. API in `docs/neo-core-components.md` | the tasks kanban card (same wrapper conventions) |
| B. `neo-ui: GO.scheduler.Scheduler, backgrounds, slot click, zoom, range` | M | Per-row `backgrounds` with `inherit`, `slotClick` (bar / background / track, x → date), presets month / quarter / year with header formatters, growing range + `rangeChange`, `scrollToDate` | A |
| C. `neo-ui: FormWindow hook for module form runtimes` | S | A named extension point that lets another module add fields to a `FormWindow`, load them and send them on save (no `Ext.override` in neo). First consumer: card 16 | — |

**amd** (project `~/Projects/groupoffice26-neo-amd`, base `neo`). Dialogs come before the screens that embed them,
so the order has no cycles:

| # | Card | Size | Rows | After |
|---|---|---|---|---|
| 1 | `amd/crew: neo skeleton` | M | 1-5, 21: registration, main view with 5 tabs (each empty), west per tab, company context and permission gate, routes including the `#crewplanning/<date>` compat handler, narrow mode, the crew combos, `views/neo/PORTING.md` from section 1 | — |
| 2 | `amd/crew: neo lookups` | M | 17 without rank: 10 lookup lists | 1 |
| 3 | `amd/crew: neo rank lookup and system settings` | M | 17 (rank: needed certificates, companies, `FormChips`), 18 | 2 |
| 4 | `amd/crew: neo members list` | M | 6, 5 (double click guard) | 1 |
| 5 | `amd/crew: neo certificates` | M | 10, 20: list, dialog with `DialogFilePanel`, detail with Renew; Edit / Renew without verification until card 14 | 1 |
| 6 | `amd/crew: neo contracts` | M | 12, including `VoyageContractGrid` and `MemberContractSelectorDialog` | 5 (`DialogFilePanel`) |
| 7 | `amd/crew: neo voyage dialog and list` | M | 13 dialog part (combos, rank override, crew change rules, Contracts tab), voyages list | 6 |
| 8 | `amd/crew: neo voyage records` | M | 14: records grid and dialog in the voyage dialog, Analyze | 7 |
| 9 | `amd/crew: neo voyage detail` | M | 13 detail part: sections, crew change log, port link, Relive, Send to team member, PDF, diary link, files | 8 |
| 10 | `amd/crew: neo member dialog` | M | 7 | 5, 6, 7 |
| 11 | `amd/crew: neo member detail` | M | 8 (the OCR flow opens the verification once card 14 exists; until then it opens the certificate dialog) | 10 |
| 12 | `amd/crew: neo member document generation` | S | 9 | 4 |
| 13 | `amd/libs: neo PDF viewer` | M | pdf.js main-thread addon, a panel with zoom and a page list, image preview | — |
| 14 | `amd/crew: neo certificate verification` | M | 11; wired into the certificate detail (Edit / Renew) and the OCR flow of the member detail | 11, 13 |
| 15 | `amd/crew: neo Crew Planning` | M | 16 on `GO.scheduler.Scheduler`, load strategy from section 3 | B, 9 |
| 16 | `amd/formbuilder: neo form runtime` | M | renders `formBuilder.formStructure` through hook C with the simple field types, group rules, read-only detail card, a field type registry; a save test for clearing a previously ticked answer (classic removes the loaded answer object for this, `DialogOverride.js` 170-193) | C |
| 17 | `amd/formbuilder: neo signature and EditorJS fields` | M | signature pad, EditorJS | 16 |
| 18 | `amd/formbuilder: neo remaining field types` | M | checklist, file / image, entity / contact / crew on board, chips, select score / condition | 16 |
| 19 | `amd/crew: neo voyage form and checks` | M | 15: the runtime in the voyage dialog and detail, the `CertificateCheck` field type | 9, 16 (17 and 18 for full parity) |
| 20 | `amd/crew: neo portlets` | S | 19 | 5, 11 |

Board card ids (created 2026-11-27; the amd cards are `--no-auto` until the open point in section 5 is settled): A `20261127-112026-neo-ui-go-scheduler-scheduler-tree-resou`, B `20261127-112117-neo-ui-go-scheduler-scheduler-background`, C `20261127-112117-neo-ui-formwindow-hook-for-module-form-r`, 1 `20261127-112118-amd-crew-neo-skeleton`, 2 `20261127-112118-amd-crew-neo-lookups`, 3 `20261127-112118-amd-crew-neo-rank-lookup-and-system-sett`, 4 `20261127-112119-amd-crew-neo-members-list`, 5 `20261127-112119-amd-crew-neo-certificates`, 6 `20261127-112119-amd-crew-neo-contracts`, 7 `20261127-112119-amd-crew-neo-voyage-dialog-and-list`, 8 `20261127-112120-amd-crew-neo-voyage-records`, 9 `20261127-112120-amd-crew-neo-voyage-detail`, 10 `20261127-112120-amd-crew-neo-member-dialog`, 11 `20261127-112121-amd-crew-neo-member-detail`, 12 `20261127-112121-amd-crew-neo-member-document-generation`, 13 `20261127-112121-amd-libs-neo-pdf-viewer`, 14 `20261127-112121-amd-crew-neo-certificate-verification`, 15 `20261127-112122-amd-crew-neo-crew-planning`, 16 `20261127-112122-amd-formbuilder-neo-form-runtime`, 17 `20261127-112122-amd-formbuilder-neo-signature-and-editor`, 18 `20261127-112122-amd-formbuilder-neo-remaining-field-type`, 19 `20261127-112122-amd-crew-neo-voyage-form-and-checks`, 20 `20261127-112123-amd-crew-neo-portlets`.

Until card 19 is done, a voyage opened in neo has no form section. `FormWindow` sends only modified properties
(`getModified()`, `form/DataSourceForm.mjs` about lines 256-277), so saving a voyage in neo leaves its
`formBuilder` data alone. Cards 7 and 9 confirm this in the browser.

## 5. Open points for the owner and the coordinator

- **Where the amd cards run.** The amd cards use the project `~/Projects/groupoffice26-neo-amd` with base `neo`,
  so their worktrees branch from amd `neo`. Three things don't fit that yet:
  - The neo container mounts `~/Projects/groupoffice26-neo-amd` itself, not a card's worktree. For its browser
    check, a card needs a container that mounts its amd worktree at `go/modules/amd`, plus a `www` from neo-ui.
  - `~/.claude/scripts/neo-card-cleanup.sh` handles only groupoffice26-neo worktrees.
  - The coordinator memory says to take only groupoffice26-neo cards. It has to take these amd cards as well.
- **Tours** (row 22): neo has no sf/tours runtime. The crew planning tour stays classic-only unless decided
  otherwise.
- **Planning load window**: for the strategy of card 15, the owner has to run a read-only count of
  `AmdCrewMemberVoyageRecord` rows on live.

## 6. Additions for go:neo-port

These go into the skill (`~/Projects/go-skills/skills/neo-port/SKILL.md`). This task doesn't edit the skill,
because it works only in its own worktree.

- **Inventory:** list the **undeclared** cross-module uses next to `getDependencies()`; crew uses portcall, pms,
  diary, ports, the address book and email. Grep the views for `go.modules.<pkg>.<other>.`,
  `go.Db.store('<OtherEntity>')`, `go.Entities.get('<Other>')` and `GO.<module>.`.
- **Inventory:** list a dialog's panels and fieldsets separately, and note which dialog owns which file panel. A
  child grid embedded in a dialog sets the card order: the dialog that owns the grid comes first.
- **Inventory:** list routes that `go.Router.add` registers at the top level (`#crewplanning/<date>`). In neo they
  need a compat handler, because an unknown first segment goes to the classic fallback.
- **Mapping row:** a combo or chips of another module (`go.modules.amd.fleet.CompanyCombo`) → `JmapComboBox` /
  `AutocompleteChips` over the entity, inside the porting module. The other module needs no neo UI first. Move the
  combo when that module is ported. A link into a module without a neo UI goes to classic (`classicApps.mjs`).
- **Mapping row:** an embedded ExtJS panel of another module (`pms.JobReportCrewDetailPanel`) → a `Grid` over that
  module's entity in the porting module, shown while the module is available.
- **Mapping row:** `vis.Timeline` with `nestedGroups` → `GO.scheduler.Scheduler` with tree resources. vis items
  with `type: 'background'` → `backgrounds`. A vis `click` on an empty group → `slotClick`.
- **Mapping row:** formbuilder's `go.form.Dialog` override (the `FormTrait` entities of crew, diary, dms, pms and
  tasks) → the `FormWindow` hook (card C) + the formbuilder neo runtime (card 16). Until then it is a gap.
- **Mapping row:** amd/libs `PdfViewPanel` → the amd/libs neo PDF viewer (card 13).
- **Trap:** an ExtJS view that loads another module's entities without `isAvailable()` (crew's
  `TimelinePanel.js` with portcall). Guard it in the port: the classic client hides the failure behind a load mask.
- **Trap:** `Neo.scheduler.Container` with `editable: false, barDraggable: false, resizableBars: false` still moves
  a focused bar with ArrowLeft / ArrowRight. Use `GO.scheduler.Scheduler` `readOnly`.
- **Data only neo needs** (a flag, a per-user view setting): a `neo_<package>_<module>_*` table in the module's
  `views/neo/install/updates.php` and a property hung with `Schema::addProperty()` from a `class_exists`-guarded
  listener (`docs/neo-core-components.md` "neo tables of modules"), never a column on the module's upstream table.
- **Where the code goes:** amd card worktrees branch from amd `neo`. Their browser check needs a container that
  mounts the card's worktree (open point above).
