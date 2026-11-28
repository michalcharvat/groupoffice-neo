# neo: amd/pms port, analysis and card split (2026-11-28)

On 2026-11-28 the owner asked for the next amd modules after crew, portcall, diary and dms ("rozpracuj si klidne
dalsi moduly, pak ti dam odpovedi na to co nebudes vedet"). This page holds the analysis of amd/pms. The work
itself is in the board cards in section 4. The models are `docs/neo-crew-port.md` and `docs/neo-dms-port.md`.
Module code goes to the amd-mono branch `neo` (`~/Projects/groupoffice26-neo-amd`, see `docs/neo-upstream-sync.md`);
core neo pieces go to `neo-ui` in this repository. The owner rules apply: generic list, detail, dialog and tree logic
goes to neo core, the module keeps only its own logic, and shared libraries live in core (core runs without amd/sf).

Sources read:

- `amd/pms/views/extjs3`: 128 files, 23,902 lines (`JobDialog.js` 1,705, `JobReportDialog.js` 1,337, `JobPanel.js`
  1,221, `ComponentTree.js` 1,167, `JobDetail.js` 1,142, `Module.js` 778, `JobReportDetail.js` 621). Every file
  was read in full by four read-only research agents, one per area; their findings were checked against
  `controller/Job.php`, `controller/JobReport.php`, `controller/Component.php`, `model/Job.php`, `model/Component.php`,
  `model/Counter.php`, `model/JobReport.php`, `model/Part.php`, `Module.php`.
- `pms/docs/frontend.md`, `jobs.md`, `group-reports.md`, `component-tree.md`, `pdf-rendering.md`
- the diary pieces pms embeds (`FilterableEventGrid`, `EventSelectorDialog`, `EventDetailPanel`), formbuilder's
  `DialogOverride.js`, amd/libs `TreeStateTrait.js`, fleet's `resolveStartVessel`
- GO.neo: `tree/Tree.mjs`, `grid/Grid.mjs` (`groupBy`), `view/filterTypes.mjs`, `pdf/PdfViewer.mjs` (`pages`),
  `form/BatchEditDialog.mjs`, `form/field/AttachmentsField.mjs`, `view/EntitySelectDialog.mjs`; the neo ports of
  amd/crew (`MemberJobReportCard.mjs`), amd/formbuilder (`SignaturePad.mjs`, `SignatureField.mjs`,
  `ChecklistField.mjs`, `FORM_ENTITIES` with `AmdPmsJobReport`) and amd/libs (`jobErrorText.mjs`)

A Codex review (gpt-6.2-astra) checked this page against the sources; all 13 findings are worked in (reachable part
detail, routes and editors switched on only when complete, group carry out, files panel, portlets, per-user state,
report toolbars, core dialog and checklist rules, signature assets, batch refusals, card sizes, two server qualifiers).
Nothing was run in a browser. Each point marked "unverified" is something a card has to prove first.

## 1. Inventory by behaviour

Line numbers are in `pms/views/extjs3/<file>`. "Dead" means the code exists but no user reaches it.

### Main view and routing

| # | Area | Behaviour (ExtJS source) | GO.neo | Class |
|---|---|---|---|---|
| 1 | Registration | `go.Modules.register('amd','pms')` with the entities, the `AmdPmsJob` filters (text, id, component, status Due / Overdue, category, groupId, counter, rank, name, code, duration, dates, interval values, counters, critical; `Module.js` 319-468) and the `AmdPmsJobReport` filters (with `crewId`, `VesselCrewCombo`), `linkDetailCards` "PMS: Job" (row 34), system settings, portlets; at start it preloads the component info field catalogue (`Module.js` 157-161) | `ModuleRegistry.register({package:'amd', name:'pms', capability, mainView, routes, linkDetailCards, systemSettings, portlets, onLogin})` | port |
| 2 | Routes | `#pms/jobs`, `#pms/reports`, `#pms/counters`, `#amdpmsjob/<id>`, `#amdpmsjob/<id>/reports` (`Module.js` 10-21) and the entity hashes of `AmdPmsComponent`, `AmdPmsJobReport`, `AmdPmsPart`. `MainPanel.route()` takes a `go.Entity`; for a component it writes the tree state first so the tree's restore does not overwrite the route's grid filter (`frontend.md` "Routing") | registry `routes` for the entities; `mainView.route(path)` parses the rest. The shell resolves `#amdpmsjob/5` case-insensitively (dms analysis row 2) | port |
| 3 | Layout | `MainPanel` card layout: `JobPanel` and `CounterPanel` (row 30). `JobPanel` west = side panel (vessel combo, "Counter Reports" button, "Show all" checkbox, component tree, filter panel of the active view) + center tabs Jobs / Reports; east = a header-less TabPanel with component, job (inner tabs: detail + Reports), part and report details (`JobPanel.js` 1-110, 364-547) | `MainThreeColumnPanel` subclass: west = vessel combo, tree, filters; center = Jobs / Reports tabs; east = one detail at a time | port |
| 4 | Vessel | `VesselCombo` over `AmdFleetVessel` (`modulesVisibility {module:'pms'}`), required. A pick saves `amd-pms-selected-vessel` (`Ext.state`), resets all filter panels, reloads the tree root and restores its state. The start vessel comes from `go.modules.amd.fleet.resolveStartVessel()`. Nothing loads without a vessel (`JobPanel.js` 133-174, 562-593). The same state key is read by CounterPanel, the dialogs and the filter combos | `JmapComboBox`; per-user state in `State`; `resolveStartVessel` from fleet neo (open point 5) | port |
| 5 | Show all | Checked: the job grid filters `{componentIn: null, vessel}` and gets READ (Add off), the report grid the same plus `jobId: null`. Unchecked: `componentIn` = the selected node, permission = the node's. State `amd-pms-show-all` (`JobPanel.js` 191-202, 595-619) | module logic | port |
| 6 | Narrow mode | A hamburger on the job grid shows the side panel; back arrows on the details show the west panel and go to `#pms`; a forward arrow on the filter panels shows the center (`JobPanel.js` 392-420, 707-716) | `MainThreeColumnPanel` `activatePanel()` | port |
| 7 | Dead code | The component grid, the part grid (with its filter panel and the part detail tab), `createViewGrid`, the history grid tab and the `JobViewField` are built or defined but never shown (`JobPanel.js` 70-72, 100-111, 127, 621-679, 820-905, 1021-1160; `HistoryGrid.js`; `JobViewField.js`). Parts are not linked to components (`model/Part.php` 201-205: the `component` filter body is commented out). The **part detail is still reachable**: the east panel holds it and the entity route opens it, with Edit to `PartDialog` (`JobPanel.js` 539, `MainPanel.js` 109-169) | not ported; `#amdpmspart/<id>` keeps opening classic (no neo route); parts: open point 1 | gap (owner) |

### Component tree

| # | Area | Behaviour | GO.neo | Class |
|---|---|---|---|---|
| 8 | Tree load | Lazy JMAP tree over `AmdPmsComponent`: root `{vesselRoot: id}` (limit 3000, by name), children `{parentId}`; a component without subcomponents is a leaf. Icon from the server (group / folder), `cls` = status colour from the server (`Component.php` 1315-1334). A stale root response (the combo fires select and change) is dropped by a sequence number (`ComponentTreeLoader.js`) | `GO.tree.Tree` `nodeProvider`; node icon and cls from the record | port |
| 9 | Selection | A custom multi-selection model (Ctrl/Cmd toggles, Shift adds), locked while dragging. A selection fires `navigate`: the component detail loads and every center grid gets `{componentIn: id}` and the node's permission level. `suppressNavigate` keeps background reloads from refiltering the grids (`ComponentTreeSelectionModel.js`, `ComponentTree.js` 132-162, `JobPanel.js` 250-287) | **Missing:** multi-selection in `GO.tree.Tree` | build (core P1) + port |
| 10 | Tree state | amd/libs `TreeStateTrait`: `{expandedPaths, selectedId}` per user under `amd-pms-component-tree` (debounced, flushed on destroy, migration of an old format), replayed after each root load; frozen while searching (`ComponentTree.js` 176-250, 409-488) | `GO.tree.Tree` keeps expanded nodes across `reload()`; the saved shape per user goes to `State`; `openPath(ids)` (D1) replays the selection | port (after D1) |
| 11 | Live updates | On `AmdPmsComponent` changes: in-place text / cls / icon, a branch reload when `subcomponents` or `parentId` changed (ancestors only), a collapsed parent only invalidated, other vessels ignored, scroll kept, no navigate. Workaround: stale parents are refetched into the cache (`TreeStateTrait.js` 871-1516) | `GO.tree.Tree` with the entity store's changes; unverified how much of the trait core already covers | port (unverified) |
| 12 | Tree search | `tbsearch` in the tree toolbar shows each hit **in its place**: `treeSearchHit` gives the hit ids (bold), `treeSearch` gives hits plus ancestors; the client nests them, a hit keeps its lazy loader, an orphan goes to the top; live changes re-run the search (300 ms); reset restores the saved shape and reveals what was selected (`ComponentTree.js` 252-407, `ComponentTreeLoader.js` 41-223, `frontend.md` "Component Tree Search") | **Missing:** search with hits in place in `GO.tree.Tree` (a provider returns a flat list of hits and ancestors, the tree nests and marks them) | build (core P1) + port |
| 13 | Reveal | A job or report row reveals its component: the parent chain via `AmdPmsComponent` get, expand, select without navigate (`ComponentTree.js` 490-556) | `openPath(ids)` (D1) | port |
| 14 | Row menu | ⋮ on each node: Edit (dialog, then an in-place update or a parent reload), Copy To / Move To (`ComponentParentSelectorDialog` with ACL options when the target is the top level; `AmdPmsComponent/copyTo`, `moveTo`), Delete (confirm, `notDestroyed`). Only with module manage (`ComponentTree.js` 687-851) | tree row menu (D1) + module handlers | port |
| 15 | Drag and drop | With module manage and the module setting `enableComponentTreeDnD`: several nodes at once (ghost with up to 5 names), not onto itself, its parent, its subtree or another vessel; confirm, then `moveTo {sourceComponentIds, targetVesselId, targetComponentId}` (`ComponentTree.js` 853-1167). The `beforenodedrop` handlers in `JobPanel` are unreachable (the tree's `processDrop` handles drops) | `GO.tree.Tree` `drop` + `dragDrop.mjs`; several nodes need P1's multi-selection | port (after P1) |
| 16 | Add | "+" in the tree toolbar opens the component dialog with `{vesselId, parentId}`, module manage (`JobPanel.js` 223-242) | toolbar button | port |

### Components

| # | Area | Behaviour | GO.neo | Class |
|---|---|---|---|---|
| 17 | Component dialog | `go.form.Dialog`, Apply + Save. Name, number, vessel (read-only on edit), type (component / group), parent (`ComponentCombo` by vessel), description, `linkId` (amd/links combo, only with links), `dmsFolderId` (dms `FolderCombo` with the path, only with dms), `statusDisabled`. Fieldsets "Custom Details" and "Component Unit" (code, cost code by the vessel's company, manufacturer, model, serial …, critical flags, Counter yes/no switching reference / preferred counter and checking interval), hidden for a group. Permissions tab: `aclOverwritten` with a SharePanel, `copyAclOnPromote` (top level only), `aclApplyToChildren` (`ComponentDialog.js`). Classic bug: `previouValue` typo, so the "unchanged" check never fires | `FormWindow` + `addSharePanel()`; `JmapComboBox`; the links combo from amd/links neo when it exists (the links analysis runs in parallel), the folder combo from dms neo card 1 | port |
| 18 | Component detail | "Component" (name, asset, type, parent link, description, a copy-link tool), "Details" (only filled fields), links, files, history. Toolbar: Edit (manage), add, link browser, files; ⋮ Print, Printout (row 37), History printout (row 38), Delete (manage). The printout items find `JobPanel` by `itemId` (`ComponentDetail.js`) | core `detail/Panel` + `LinesCard`s, `createMoreMenu()` | port |
| 19 | Component combos | `ComponentCombo` ("parent / name", paged), `ComponentTypeCombo`, `ComponentParentSelectorDialog` (vessel + component + ACL options), `CompanySelectorDialog` (fleet `CompanyCombo`, used by the checklist list), `VesselChips` (used by the rank dialog) | `JmapComboBox`, `AutocompleteChips`, `view/Dialog` | port |
| 20 | Component import / export | The component grid's ⋮ Import CSV / Export CSV (`ComponentGrid.js`). The grid itself is dead (row 7) | `importFile.mjs`, `exportEntities.mjs` from the tree ⋮ or the module menu | open point 1 |

### Jobs

| # | Area | Behaviour | GO.neo | Class |
|---|---|---|---|---|
| 21 | Job list | `JobGrid` over `AmdPmsJob`, grouped by `componentPath` (core one-level `GroupingView`; the path is walked on the client). Columns: status swatch (server `cls`), name with a group mark, category, group, component, due at, week, interval, due in (red when negative), running hours (counter jobs), postponed to, rank, audit columns. Classic bug: "Modified by" reads `createdBy` (`Module.js` 317). A chain icon marks the other jobs of the selected job's group. Search `text`, `name:`, `code:`; plain text also matches an amd/links EID, which drops the component filters (`Job::filter`, `jobs.md` "Search by EID"). Add (manage on the node, seeds `componentId`), "Counters" (row 31). ⋮ Delete (node manage), Printout, History printout, Export CSV, Settings (module manage). Double click / Enter opens the dialog with manage, else nothing (`JobGrid.js`, `JobPanel.js` 910-1017) | `GO.grid.Grid` `groupBy` + `groupRenderer`, `entityActions`, `GO.grid.ListToolbar`, `SearchButton`, `rowMenuColumn()` | port |
| 22 | Job filters | `filteraddbutton` + `filtergrid` + `variablefilterpanel`, one per view. Pms overrides `go.filter.VariableFilterPanel` globally (`VariableFilterPanelOverride.js`): a filter with `stateFilter {stateKey, filterParam}` scopes its combo by the selected vessel (component, group, counter, rank), and `resetFilters()` clears them on a vessel switch | `view/FilterPanel.mjs` + `filterTypes`; **Missing:** an `entity` filter type whose `jmapFilter` follows a value at run time (the vessel) | build (core P3) + port |
| 22b | Job batch edit | `JobBatchEditDialog`: vessels collected from the components; a checkbox per field (component, type, category, group only for one vessel, task list, rank, duration, checklist, form, file templates, DMS documents, ~25 flags, custom fields); with several vessels only "Remove from group"; `AmdPmsJob/set` per id, `notUpdated` de-duplicated, stays open on refusal | core `form/BatchEditDialog.mjs` takes custom fields only; pms needs its own fields behind the same checkboxes: core takes custom fields only and shows only the first refusal; classic sends one `/set` and shows every distinct refusal (`JobBatchEditDialog.js` 348-366): core card P4 | build (core P4) + port |
| 23 | Job dialog: general | Component (sets the vessel, the manual folder), name, PDF name format, report name and file name pattern, `logsAvailable` with its report switches and tags (fleet `ReportTagChips`), charts configuration, code, type (counter / date / interval / one-time / repair), category, group (per vessel), tasks (amd/tasks list + statuses, only with tasks), rank, regulation, duration, checklists, forms (formbuilder, unconditional), step by step, risk assessments (dms chips), DMS documents, file templates, many report flags, component info fields chips (`JobDialog.js` 162-659) | `FormWindow`; `JmapComboBox` / `AutocompleteChips`; fleet tag chips from fleet neo | port |
| 24 | Job dialog: intervals and status | Time interval (start / due, before due / interval / overdue with units, interval days filled from the dates), counter interval (start / due / counter / before / interval / overdue), visibility and `allowBlank` per type, defaults for a new job; automatic status change From / To (defaults from the module settings), `autoCloseReport`, several open reports, signature, perform date without time, POB, running hours, title page, appraisals (`JobDialog.js` 677-1315, 1588-1680) | `FormWindow` rules | port |
| 25 | Job dialog: scoping | The vessel (from state on open) scopes forms, checklists, categories, predefined notifications and tags by its company, and ranks, counters and groups by vessel (`JobDialog.js` 1319-1509) | `JmapComboBox` `jmapFilter` set at run time | port |
| 26 | Job dialog: texts and manual | Job Description and Template tabs: EditorJS on `description_json` / `template_json` (HTML fallback via `setValueFromHtml`); Manual tab (dms): `JobManualCombo` + pages, the component's DMS folder found by walking up the ancestors, a component change clears the manual. Editors are flushed before submit | EditorJS field in core (D4); the manual combo is a `JmapComboBox` over `AmdDmsDocument` in the folder | port (after D4) |
| 27 | Job dialog: notifications | `PredefinedNotificationChips` + `NotificationsField` (rows: active, type status / due / overdue, status only for type status, e-mail template, recipients, cc, bcc, attach files) | `ArrayField` of `ContainerField` rows | port |
| 28 | Job dialog: legacy postpone | For a saved job with `canBePostponed`: `JobPostponeDialog` (`AmdPmsJobPostpone`: postpone with value + unit or counter, reason) with the earlier postponements grid; the job dialog computes `postponedTo` itself. Classic bugs: the counter branch stores the time value (`postponeWithValue`) as `postponedToCounter`, and an increment instead of a target; the postponement grid first loads every readable postponement | open point 3 | gap until decided |
| 29 | Job detail | Title with status swatch; Job panel (component link, category, rank, code, task list, counter due computed on the client, time due); last 3 reports; tasks (amd/tasks); regulation; description (server HTML); DMS "Additional Information" (content documents rendered with their version) and "Documents"; checklists with questions; formbuilder `FormDetailPanel`; appraisals (with `showAppraisals`: reports with crew and attachments, crew links only with amd/crew); custom fields, links, files, history. A second report store is loaded and never shown (dead). Toolbar: Carry out (write; with a group of 2+ jobs a menu "Only this job" / "For group", `JobReport/groupCheck`, `JobGroupChooseDialog`), Manuals (row 41), Edit (manage), add, link browser; ⋮ Print, Print Job Card (row 39), Postpone (row 47), Copy (`AmdPmsJob/copyTo`, no error handler in classic), Delete (`JobDetail.js`) | core `detail/Panel` + `LinesCard`s; formbuilder `FormDetailCard`; tasks as a plain `Grid` while amd/tasks has no neo UI (as crew did for pms) | port |
| 30 | Job's reports tab | The job's inner Reports tab: `JobReportGrid` filtered by `jobId`, "Hide closed" toggle, search; the hash becomes `#amdpmsjob/<id>/reports`; the report detail's back button returns there (`JobPanel.js` 422-494, 512-536) | detail `createBody()` with a report grid card, or a tab in the east panel | port |

### Job reports

| # | Area | Behaviour | GO.neo | Class |
|---|---|---|---|---|
| 31 | Report list | `JobReportGrid` (center Reports tab, the job's tab, the counter panel): status in colour, user, perform date, asset and job path (walked on the client), remarks as text, counter value, audit columns; search; Add (with the job); ⋮ Export; row ⋮ Edit (not in an end status, status permission ≥ write), Delete (module manage, batch prompt row 35). Double click: the detail for a closed report or without write, else the dialog. Classic bugs: the asset stays empty when the job is not cached; `setPermissionLevel` looks for an `add` item that has no `itemId` | `GO.grid.Grid` `entityActions`, `ListToolbar`; names loaded after the page with `refreshRows()` (crew's `MemberJobReportCard` does the same) | port |
| 32 | Report detail | "Job Report: RID-n" (job link, user, perform date, status, counter value, remarks HTML), checklist answers, tasks (amd/tasks), formbuilder answers, status history, attachments, crew (signature yes / – when required; names link to `AmdCrewMember` with crew), custom fields, diary logs (`EventDetailPanel` with "Download measured data", row 45), files, links, history. Classic template bugs: unescaped `{name}`, `{question}`, a malformed `<tpl if>`, checklist headers never resolved, answers shown as raw codes (`JobReportDetail.js`, `ChecklistDetailPanel.js`) | core `detail/Panel` + `LinesCard`s with escaping; the port fixes the escaping and shows checklist names and answer labels | port |
| 33 | Report toolbar | Reopen (admin, end status: `JobReportReopenDialog`, `JobReport/reopenDefault` + `reopen`), Edit, add, link browser, files, Download PDF (row 40); ⋮ Print Job Report (row 40), "Approve OK" (`wfApprove {message:'OK'}`; skips `promptWithComment`), Delete. `canEdit` = write and not end status (admin forced, the status permission overrides again) | `createToolbarItems()`, `createMoreMenu()` | port |
| 34 | Link detail card | `JobLinkDetailPanel` registered as `linkDetailCards` "PMS: Job": the jobs linked to any entity, grouped two levels (vessel, component path) with `TwoLevelGroupingView` (pms's own view, no other user); double click opens `go.links.LinkDetailWindow` | registry `linkDetailCards`; one `groupBy` level with a "vessel / component path" header is enough (open point 6) | port |
| 35 | Report delete | Shared helper: without a batch a confirm and destroy; in a batch "All reports" (`JobReport/destroyBatch`, all or nothing) / "Only this one" / Cancel (`JobReportDetail.js` 552-621) | `ConfirmDialog.ask()` has two fixed buttons and returns a Boolean (`ConfirmDialog.mjs` 45-64): core card P8 | build (core P8) + port |
| 36 | Carry out dialog: general | "Carry Out Job" (Apply + Save, EditorJS fields flushed first): job path, perform date (time hidden for `performDateWithoutTime`), status with its name (start status for a new report), workflow buttons (row 47), `reportToReview` (only with `autoCloseReport`), formbuilder general fields (row 44), checklist answers (row 42), remarks on EditorJS (`remarks_json`; prefilled from `template_json` with read-only blocks or the HTML template; the legacy plain `remarks` converted on load), counter value (shown with a counter, required for counter jobs, prefilled for a new report performed today), "Create / Open Report Document" (row 46). Tabs: Job Description, Manual (row 41), Step By Step (the job's step HTML), Risk Assessment (row 43), Crew (row 42b), Files (row 46), Tasks (amd/tasks), Logs (row 45), Status History (`JobStatusHistoryGrid` by `reportId`). Everything is driven by the job combo's `setvalue` (`JobReportDialog.js` 268-518). Classic bug: the Files tab is used without checking legacy/files | `FormWindow` + `addCard()`; EditorJS field (D4); a card per tab | port (after D4) |
| 37 | Group reports | `setGroup()` after `groupCheck`: title "… For group {name} ({count} jobs)", `forGroupId` / `forJobIds` sent on create, an open batch note ("changes apply to all {count} jobs", `JobReport/query {batchId, hideClosed}`); `JobGroupChooseDialog` (blocked jobs greyed with their reason, the others pre-checked) (`group-reports.md`) | `FormWindow` config + a picker `view/Dialog` with a `Grid` (checkbox selection, rows that cannot be selected) | port |
| 42 | Checklists | For a new report the job's checklist questions become rows grouped per checklist (named by `AmdPmsChecklist`): No., question, comment (+ read-only suffix), OK? (ok / nok / na; comment required for nok or empty); saved as a flat `answers` array; the field copies `go.form.FormGroup` internals | formbuilder neo has a `ChecklistField` for form answers: check whether it fits pms's `answers` shape; else an `ArrayField` of fixed rows | port (unverified reuse) |
| 42b | Crew and signatures | `members` rows: member combo over `AmdFleetVesselCrew` (`{vesselId, isAvailable}`; free text allowed: the typed name is stored and `memberId` cleared), Sign (a `signature_pad` canvas window storing a PNG data URL and the vector JSON), signed flag; Sign hidden when the job does not require a signature (never enforced, `jobs.md`). The tab is hidden when the vessel has `crewOnJobReports === false` and no members exist | formbuilder neo has `addon/SignaturePad.mjs` + `SignatureField.mjs`: pms is the second user, so it moves to core (P2) | build (core P2) + port |
| 43 | Risk assessment tab | A grid grouped by risk assessment (22 columns, scores and computed risks, red ≥ 12, orange 5-11, green): a new report takes `job.riskAssessments[].riskItems`; a saved one reloads the **current** dms documents and maps the stored comments back; a double click edits the comment; with `allowAddRiskAssessments` a dms risk assessment combo + Add (`RiskAssessmentReportGrid.js`). Saved as `[{riskAssessmentId, riskAssessmentItemId, comment}]`. Classic ignores the `companyId` it is given (the combo is not scoped) | `GO.grid.Grid` `groupBy` + a comment `TextPrompt`, as a `ContainerField` value (crew `VoyageContractGrid` pattern, skill antipatterns) | port |
| 44 | Formbuilder forms | A new report calls `loadFormBuilderFormById(job.formIds)`, which comes from formbuilder's global `Ext.override(go.form.Dialog)`: the forms' groups become fieldsets or tabs; a saved report rebuilds from `formBuilder.formStructure/formData`. Required form fields block send, approve and close on the server | formbuilder neo runtime (`AmdPmsJobReport` is in `FORM_ENTITIES`; the FormWindow hook exists since crew). the runtime's `loadForms(formIds)` loads several forms in order (`formRuntime.mjs` 144-156) | port |
| 45 | Diary logs | Tab "Logs" (only with diary and `job.logsAvailable`): diary `FilterableEventGrid` over `AmdDiaryEvent` (limit 1000, by start date) with filters `jobReportIds {jobReportIds, isExcludedFromReport: true}`, `vesselId`, `tagIds` (new report), and the perform day as `interval` (new report) or none (saved); rows removed only locally. Add opens diary `EventSelectorDialog` (perform day, prev / next day, search, excluded ids, checkbox selection). Saved as `eventIds` (server diff in `JobReport::saveEventIds()`). The detail shows the logs with diary `EventDetailPanel` and downloads `amd/diary/MeasuredData/AmdPmsJobReport` | diary neo exports an events grid and a log picker (diary card DY1, section 4); the value is a `ContainerField` over the grid's ids | port (after DY1) |
| 46 | Files and report documents | Files tab: `DialogFilePanel` on the legacy files controllers (`files/folder/list`, `checkModelFolder`, `processUploadQueue` with overwrite, `DnDFileUpload`), upload hidden in an end status. "Create new Report Document": `files/folder/checkModelFolder`, then `amd/pms/JobReport/createFilesFromTemplate`, then the first file opens. Detail and dialog files panels hide Browse / Upload below write. `AttachmentsField` (blob list with upload and "Add from GroupOffice") is commented out in the dialog; the detail shows `reportAttachments` read-only | core `detail/FilesPanel.mjs`, but it stops on a name collision and uploads dropped files without asking the host (`FilesPanel.mjs` 76, 166, 210): core card P5 (overwrite choice, host permissions for browse / upload / drop; pms: job `writeAndDelete`, report the **status** permission, off in an end status). In a FormWindow card: unverified | build (core P5) + port |
| 47 | Workflow | Buttons = `status.buttons` ∩ {send, postpone, approve, updateNeeded}, only with status permission > read; postpone also needs `job.canBePostponed`; `promptWithComment` opens `WorkflowCommentDialog` (comment required; time / counter extension combos from the job's `timeExtension` / `counterExtension`). Calls `JobReport/wfSend`, `wfPostpone`, `wfApprove`, `wfDecline`; afterwards the job, report and component stores update. The job detail's Postpone creates a report in the start status first, then calls `wfPostpone`. Classic bugs (section 5): Send fires after a failed save; `notFound` and `{success:false}` are taken as success; a cancelled Send prompt leaves Send disabled; postpone without an extension leaves an orphan open report | `FormWindow` buttons + `view/Dialog`; the port checks every refusal (`notUpdated`, `notFound`, `success:false`) | port |
| 48 | Status history | `JobStatusHistoryGrid` (name, description, end status, perform date, counter value, comment, created). Classic search offers `description:`, `color:`, `comment:` that the server does not define (only `name`, `text`) | `GO.grid.Grid` with the server's filters only | port |
| 49 | Report printout | Detail "Download PDF" and `PrintoutJobReportDialog` (attach attachments; Open / Download): `JobReport/prepareDownload` answers `{blobId}` when a stored PDF exists (a closed report; then whatever the checkbox says), else `{jobId}` of a queued `OverviewJob` (row 40) | module dialog + `download.mjs` | port |

### Printouts and queued PDFs

| # | Area | Behaviour | GO.neo | Class |
|---|---|---|---|---|
| 37p | Overview printout | `PrintoutDialog`: job card per job, counters, attachments, notifications; "All" or "Currently on screen" (the grid's filters; from a component detail only `{componentIn:[id]}` and "Print") → `amd/pms/Job/prepareOverview {vesselId, params}` queues an `AmdPmsOverviewJob` (sf/jobqueue) | `view/Dialog`; the grid's current filter from the store | port |
| 38 | History printout | `HistoryPrintoutDialog`: job cards, job and report attachments, report date range; same call with `printoutType: 'history'` | `view/Dialog` with a `DateRangeField` | port |
| 39 | Job card | `PrintoutJobDialog` (attach attachments; Open inline / Download) → `download.php?blob=amd/pms/AmdPmsJob/<id>` (`Module::downloadAmdPmsJob`: module + read on the job) | `view/Dialog` + `download.mjs` | port |
| 40 | Queued PDF messages | At login and on every `AmdPmsOverviewJob` change: `{preparedFailed: true}`; ready → "ready to download" message, a click opens the blob and calls `AmdPmsOverviewJob/markDownloaded`; failed → `libs.jobErrorText`; closing a message destroys the row (`Module.js` 28-147) | `notificationCenter.add({id, handler, onDismiss})`, registry `onLogin`, amd/libs `jobErrorText.mjs` (as dms card 3) | port |

### Counters

| # | Area | Behaviour | GO.neo | Class |
|---|---|---|---|---|
| 30c | Counter panel | `#pms/counters`: west = Close (back to `#pms/<view>`), vessel combo, `CounterNavGrid` (checkbox list of counters with search; Edit / Delete with `mayManage` and record manage); center = report grid with `{withCounter: true, vessel, counter}`; east = report detail; narrow buttons (`CounterPanel.js`) | a second `MainThreeColumnPanel` view or a mode of the main view; `list/CheckList.mjs` | port |
| 31c | Counters dialog | From the job grid's "Counters": `CounterGrid` (name, vessel, actual value, unit, last value, average per week; row Edit with `mayIncreaseCounters` or `mayManage`, History, Delete with manage), Add with `mayManage`, "Update All" | `view/Dialog` + `Grid` `entityActions` | port |
| 32c | Counter dialog | Name, vessel, actual value (1 decimal, ≥ 0), unit (h / d / w / m), last value, average (display), record date (today on every load). Classic disables all but value and date for a non-admin (`go.User.isAdmin`) while the server lets `mayManage` edit everything (`model/Counter.php` 96-310: decrease only with manage, a daily change limit for non-admins, a `CounterLog` when `actualValue` changes, `Counter.php` 280-297) | `FormWindow`; the port locks by the right the server checks (`mayManage`), not by admin (section 5) | port |
| 33c | Update all | `CounterUpdateAllDialog`: an editable grid of the vessel's counters (current value, a click copies it, new value); a lower value is refused on the client; one `set` with every changed row, `notUpdated` listed (classic puts names and server text into an alert unescaped) | an `ArrayField` of rows (name, current, new `NumberField`) in a `view/Dialog`, no editable grid needed | port |
| 34c | Counter log | `CounterLogDialog` / `CounterLogGrid`: value, unit, date; Delete with module manage | `view/Dialog` + `Grid` | port |

### Other

| # | Area | Behaviour | GO.neo | Class |
|---|---|---|---|---|
| 41 | Manuals and DMS browser | Job detail "Manuals" (dms, shown when `componentDmsFolderId(componentId)` resolves; recomputed on component changes) and the carry out dialog's Manuals button open `DmsBrowserDialog.openForJob` (611 lines). The Manual tab embeds dms `DocumentDetail` (toolbar hidden) and shows only the manual's pages (`manualPageList`), "Manual unavailable" when the document is outside the component's folder | dms neo exports its detail (dms card 6) and folder tree (dms card 1); `GO.pdf.PdfViewer` `pages` shows a page list | port (after dms 1, 6) |
| 50 | Parts | `PartGrid`, `PartDialog` (company read-only for non-admins, name, numbers, IMPA, ISSA, category, cost code, expiry, flags, ROB / min / max), `PartDetail` (comments, files, history). The grid is unreachable, the detail only by its route (row 7). Classic bugs: `PartDialog` sends `companyId`, which the model lacks; the grid asks for `impaa` | open point 1 | gap (owner) |

### Settings, portlets and the rest

| # | Area | Behaviour | GO.neo | Class |
|---|---|---|---|---|
| 51 | Settings entry | "Settings" in the ⋮ of the job grid, report grid, counter panel (module manage) opens `SettingsDialog`: one tab, a list of `AmdFleetCompany` (search; Edit opens `CompanyDialog`; no add or delete) | core module settings dialog (D7) with a company list as its first level | port (after D7) |
| 52 | Company lookups | `CompanyDialog` "Company Settings: <name>", nine tabs, each filtered by `companyId` (an Add seeds it): Checklist, Manufacturer, Rank, Cost Code, Job Category, Job Groups, Part Category, Overview Reports, Notifications. Lists: search, Add, row Edit / Delete (Delete with module manage; the server gives MANAGE only with `mayManage`, so the always-shown Add / Edit fail for others). The company combo is read-only for non-admins in most dialogs. Global rows (`companyId` null) never show (the `IS NULL` branch is commented out) | D7 lookup lists scoped by a parent record (a note on D7, section 3); `EntityListPanel` per lookup | port (after D7) |
| 53 | Lookup dialogs | Checklist: name + sortable questions (active, text, suffix, predefined comment, bold) and row "Copy To …" another company (`AmdPmsChecklist/copyTo`). Rank: company + vessel chips (required) + name. Cost code: name, code, description. Job groups: vessel filter, jobs count, vessel combo + name; delete keeps the jobs (no client check; server: admin, or `mayManage` + vessel read). Overview Reports (`AmdPmsOverviewNotification`): name, company, vessel, active, e-mail template, recipients / cc / bcc, five report flags. Notifications (`AmdPmsPredefinedNotification`): name, company, active, type status / due / overdue (status only for type status), template, recipients, attach files. The others: company + name. Classic: the check columns of the last two lists can be clicked but are never saved; `previouValue` typos reset the rank's vessels on every select | `FormWindow`s; sortable `ArrayField` (D3); `JmapComboBox` `jmapFilter` by company; check columns read-only | port |
| 54 | System settings | System settings → PMS: the job status list (row 55), the e-mail templates of amd/pms (`go.emailtemplate.GridPanel`), default status From / To, `enableComponentTreeDnD`, `counterMaxChangePercentPerDay`, Maintenance "Rebuild tree" (`amd/pms/Component/rebuildTree`, all vessels, `mayManage`; no error handling in classic) | `systemSettings` registry key + core `SettingsPanel`; core `emailtemplate/` | port |
| 55 | Job statuses | `JobStatusGrid` (swatch, name, end status, move files; search) + `JobStatusDialog`: SharePanel, name, description, colour (palette), start / end status, move files, next on success / failure, workflow buttons (approve, updateNeeded, send, postpone), prompt with comment, allow auto close, notify by e-mail (`emailRecipients` and `emailTpl` of the model have no UI) | `EntityListPanel` + `FormWindow` + `addSharePanel()`, `ColorField`, `OptionsChips` | port |
| 56 | Due jobs portlet | "Due jobs" (several instances, each with its own settings): `AmdPmsJob` `portlet {vessel, dueWithin {value, unit, overdue}}`, 20 by due date; status swatch, name, component, asset (hidden when bound to a vessel), due at (red when past), due in; a click opens the job. Settings: vessel (empty = all), due within 0-3650 days / weeks, include overdue. Stored per user in the start page state | `portlets` registry key (summary neo), but its Add menu drops active types and it saves only `{id, col}` (`StartPage.mjs` 131, 185): several instances with settings need core card P6 | build (core P6) + port |
| 57 | Job reports portlet | "Newest job reports" (several instances): `AmdPmsJobReport` `portlet {vessel, jobId[], statusId[]}`, limit 1-100 (default 10); job, asset, status, user, perform date; a click opens the carry out dialog. Settings: vessel, limit, job and status multi-selects (unreadable ids shown as "…") | as row 56 | build (core P6) + port |
| 58 | Start state | `amd-pms-last-view` reopens jobs / reports / counters | `State` | port |
| 59 | Tours | `tourId`s on the views; sf/tours derives selectors from class names (`tours/views/extjs3/overrides/Component.js` 90) | neo has no tours | gap (owner), as dms and diary |

## 2. Dependencies

`getDependencies()`: amd/pdfparser, amd/fleet, amd/diary, amd/formbuilder, amd/dms, amd/links, amd/libs,
legacy/files, sf/editorjs.

| Module | What pms's views use | In neo | Must be ported first? |
|---|---|---|---|
| amd/fleet | `resolveStartVessel`, `VesselCombo` (pms's extends fleet's), `CompanyCombo`, `ReportTagChips` (unconditional), `AmdFleetVessel` (`crewOnJobReports`, company), `AmdFleetVesselCrew`; fleet uses pms's `FileButtonField` (`OverviewTemplateDialog.js`, `DocumentTemplateDialog.js`) | The fleet analysis runs in parallel | `resolveStartVessel` and the tag chips belong to fleet neo: pms cards 1 and 6 wait for the fleet cards that export them (open point 5). Combos over fleet entities are plain `JmapComboBox`es and don't wait. fleet's use of pms's `FileButtonField` is a classic override of core: the fleet port uses core `BlobField`, not pms |
| amd/diary | `FilterableEventGrid`, `EventSelectorDialog` (carry out dialog), `EventDetailPanel` + measured data download (report detail) | diary cards exist (skeleton running) | Yes for row 45: diary card DY1 (section 4) after diary's events list and event detail |
| amd/formbuilder | The `go.form.Dialog` override (forms in the carry out dialog), `FormChips`, `FormDetailPanel`, the `editorjsfield` xtype, signature pad | Runtime done, `FormDetailCard`, `EditorJsField` and `SignaturePad` in formbuilder neo | No for the runtime. EditorJS moves to core (D4, planned by dms); the signature pad moves to core (P2) |
| amd/dms | `FolderCombo` + `getFolderPath`, `DocumentChips`, `DocumentCombo` (risk assessments, manuals), `DocumentDetail` (manual tab), `AmdDmsDocument` / `AmdDmsDocumentVersion`, `DmsBrowserDialog` (pms's own, over dms classes) | dms cards planned | Yes for rows 17 (folder combo), 26, 41, 43: dms cards 1 and 6 export the combos and the detail |
| amd/links | The `linkId` combo in the component dialog; EID search is server side | The links analysis runs in parallel | Only for the `linkId` field of card 3; hidden until links neo exports its combo |
| amd/libs | `TreeStateTrait`, `jobErrorText` | `jobErrorText.mjs` exists; the tree state goes to core `GO.tree.Tree` (D1, P1) | No |
| sf/editorjs | Remarks, description, template | Through D4 | D4 |
| legacy/files | Files panels, `DialogFilePanel`, `checkModelFolder` | files neo, core `FilesPanel` | No |
| amd/tasks (undeclared; mostly guarded, the `taskList` relation and the detail task lists are not) | `TaskGrid` + `TaskDialog` in the carry out dialog, tasks in the job and report details, `TasklistComboReset` + `StatusChips` in the job dialog | No neo UI | No: plain `Grid`s / combos over `AmdTasksTask` / `AmdTasksTasklist` while amd/tasks is available; Add opens classic |
| amd/crew (undeclared) | `AmdCrewMember` links in the report detail and appraisals (guarded); `go.modules.amd.crew.MemberCombo` as the type of the report filter `memberId` (`Module.js` 544, **unguarded**) | crew neo done | No: the neo filter is an `entity` filter over `AmdCrewMember`, registered only while crew is available |
| sf/tours (undeclared) | `tourId`s | No neo runtime | gap, as dms and diary |

**Modules that use pms** (each module's own port decides how it opens pms; pms exports nothing they import):

- crew: the member detail's "PMS - Reports" (`JobReportCrewDetailPanel`, already ported as `MemberJobReportCard`).
- fleet: `VesselOverviewPanel` shows a PMS summary (OK / due / overdue counts, report status swatches); the
  template dialogs use pms's `FileButtonField` (a circular use: pms depends on fleet).
- dms: "Linked Jobs" (`DocumentLinkedJobsGrid`) opens the job route; the convert dialog updates `AmdPmsJob`.
- catalog (depends on pms): cost codes (`AmdPmsCostcode`) in requisitions and receivers; reads pms's `mayManage`.
- formbuilder: `CrewOnBoardCombo` walks job → component → vessel (neo too); tasks' status grid copies pms's
  manage check. Many modules borrow pms translations (`t(…, 'pms', 'amd')`), so the language file stays.

crew's member detail embeds pms's `JobReportCrewDetailPanel`; crew neo already has
`MemberJobReportCard`, which opens a report through `resolveRoute()`. `resolveRoute()` asks neo's routes first,
so once pms card 1 registers the `AmdPmsJobReport` route the card opens the neo report without a crew change.
dms's "Linked Jobs" grid (dms analysis row 17) opens jobs the same way. crew's rank dialog only borrows a pms
translation. fleet uses pms's `FileButtonField` (above).

**Data rule for every card.** The upstream schema of pms, fleet, diary, dms and formbuilder stays as it is.
Business edits go only through the existing JMAP API, the same calls the classic client makes. Cards don't rewrite
data directly. New persistence that only neo needs goes to `neo_*` tables; nothing found so far needs one: the
selected vessel, show all, the tree shape and the portlet settings are per-user UI state (`State`).

## 3. Pieces for neo core

Each is generic and has a user besides pms (owner rule 2026-11-27, coordinator rule 2026-11-28). Planned cards that
pms reuses as they are: D1 tree badges / row menu / `openPath` (`20261128-015920`), D3 sortable `ArrayField`
(`20261128-020110-…-sortable`), D4 EditorJS field (`20261128-020112`), D7 module settings dialog with lookup lists
(`20261128-020115`), the PDF viewer (done, `src/pdf`). Notes were added to D4 and D7 for what pms needs.

| Card | What | Other users |
|---|---|---|
| P1 | `GO.tree.Tree`: multi-selection (Ctrl/Cmd toggles, Shift adds, locked while dragging; drag of several nodes) and a search that shows **hits in place**: the provider returns hits plus ancestors as a flat list, the tree nests them, expands the ancestors, marks the hits, keeps a hit lazy, and restores the saved shape and selection on reset | pms component tree; dms folder tree, files and the address book tree could search the same way |
| P2 | `GO.form.field.SignatureField` + the `signature_pad` addon in core, moved from amd/formbuilder neo (`addon/SignaturePad.mjs`, `view/SignatureField.mjs`, with its mount token and capture `pointerdown` fixes); formbuilder imports it from core. The value stays the classic pair (PNG data URL + vector JSON) | formbuilder, pms crew signatures |
| P3 | `view/FilterPanel` / `filterTypes`: an `entity` filter whose `jmapFilter` follows a value at run time (pms's selected vessel; classic `stateFilter`), and a `reset()` of all filter values when that value changes; replaces pms's global `Ext.override` of `VariableFilterPanel` | pms (component, group, counter, rank, crew filters); every amd module with vessel-scoped lists (tanks, resthours, certificates) |
| P4 | `form/BatchEditDialog`: module fields next to the custom fields (each behind the same checkbox), and a hook to restrict fields from the selection (pms: the group only for one vessel); every distinct refusal shown, availability not only from custom fields | pms jobs; crew, dms and catalog batch edits |
| P5 | `detail/FilesPanel`: the overwrite choice on a name collision (D2's core `OverwriteDialog`) and host hooks for browse / upload, also on the drop path | pms job, report and carry out files; dms, crew |
| P6 | summary neo: several instances of one portlet type, each with its own settings and a settings dialog hook | pms due jobs and newest reports; other amd portlets |
| P7 | `State` per user: today it is localStorage `state-<id>` without the user (`State.mjs` 7-40), so another login on the same browser inherits a vessel, a tree selection or a last view; classic stores state per user on the server (open point 12) | every module with saved state |
| P8 | `ConfirmDialog` with several named choices that resolves the chosen one | pms batch report delete; dms, crew |

Considered and left in pms: the two-level grouping (one `groupBy` level with a "vessel / component path" header,
open point 6), the counter "update all" grid (an `ArrayField` of rows, no editable grid), the DMS browser (pms logic
over dms neo pieces), the workflow comment dialog.

**diary** (project `~/Projects/groupoffice26-neo-amd`, base `neo`): DY1 `amd/diary: neo event list and log picker
for other modules` (S): exports diary's events grid with the `jobReportIds` / `vesselId` / `tagIds` / `interval`
filters and local remove, a log picker dialog (day with prev / next, search, excluded ids, checkbox selection), and
the event log card of a record with the measured data download; after the diary events list and event detail
cards (diary analysis row 22 left this to the embedding module).

## 4. Cards

Every card stays at M size or below. A card's browser check compares its screens with `?webclient=classic`, as a
non-admin user with pms rights (one without `mayManage`, one with `mayIncreaseCounters`) and once as admin. Until
the dialog card of an entity is done, its Edit / double click opens classic (`classicApps.mjs`). Each card keeps
the classic bugs of section 5 out of neo and says which it met.

**Core** (project groupoffice26-neo, base `neo-ui`): P1 (after D1), P2, P3, P4, P5 (after D2), P6, P7, P8 from section 3.

**amd** (project `~/Projects/groupoffice26-neo-amd`, base `neo`):

| # | Card | Size | Rows | After |
|---|---|---|---|---|
| 1 | `amd/pms: neo skeleton` | M | 1-6, 8, 9 (single selection), 10, 13, 16, 19, 58: registration, the module routes (`#pms/…`; each entity route comes with the card that delivers its detail, because `resolveRoute()` prefers neo routes and crew / dms links would otherwise open an unfinished screen), main view (west vessel + tree + filters, center Jobs / Reports tabs, east detail, all minimal), vessel switch with state and the start vessel as classic (saved, then the user's default, else empty), show all, narrow mode, the pms combos, `views/neo/PORTING.md` from section 1 | D1; fleet's start vessel (open point 5) |
| 2 | `amd/pms: neo component tree actions` | M | 11, 12, 14, 15: live updates, search with hits in place, row menu (edit, copy to, move to, delete), drag and drop of several nodes | 1, 3, P1 |
| 3 | `amd/pms: neo component dialog and detail` | M | 17, 18 (Printout / History printout come with card 12), 19 (parent selector): dialog with permissions, detail, the `AmdPmsComponent` route; `linkId` while amd/links neo has no combo stays hidden, `dmsFolderId` uses dms neo's folder combo | 1, dms 1, links skeleton |
| 4 | `amd/pms: neo job list and filters` | M | 21, 22, 22b: columns, grouping by component path, group marks, search with EID, filters scoped by vessel, delete, export, batch edit | 1, P3, P4 |
| 5 | `amd/pms: neo job dialog` | M | 23, 24, 25, 27: general fields, intervals, automatic status, scoping by vessel and company, notifications; Add / Edit stay classic until card 6 | 1, fleet tag chips (open point 5) |
| 6 | `amd/pms: neo job dialog texts and manual` | M | 26 (+ 28 as the owner decides): Job Description and Template on EditorJS, Manual tab with the folder walk; switches Add / Edit / the `AmdPmsJob` `linkWindows` entry to neo | 5, D4, dms 1 |
| 7 | `amd/pms: neo job detail` | M | 29, 30: the `AmdPmsJob` route, sections, the job's Reports tab and hash, Copy, Delete, Print; Carry out opens classic until cards 9-11 (the group menu comes with card 9), Manuals with card 13 | 4, 5, 8, P5 |
| 8 | `amd/pms: neo job report list and detail` | M | 31, 32, 33 (toolbar): report grid with its toolbar per entry point (center, job tab, counter view), detail with escaped templates; the `AmdPmsJobReport` route, which crew's `MemberJobReportCard` and dms's linked jobs then open in neo | 1, 12, P5 |
| 8b | `amd/pms: neo job report actions` | M | 33 (actions), 35, 49: reopen, Approve OK (with the comment prompt), delete with the batch prompt, Download PDF and the report printout dialog | 8, 9, 12, P8 |
| 9 | `amd/pms: neo carry out dialog` | M | 36 (general, Job Description, Step By Step, Status History tabs), 37, 44, 47, 48: remarks on EditorJS, counter value, workflow buttons with every refusal checked, group reports, formbuilder forms, the group carry out from the job detail; the report editor stays classic until cards 10 and 11 (never submit a tab that was not loaded: an omitted `eventIds` keeps the links, `[]` removes them) | 8, D4 |
| 10 | `amd/pms: neo carry out checklists, crew and risk assessments` | M | 42, 42b, 43 | 9, P2 |
| 11 | `amd/pms: neo carry out manual, logs, tasks and files` | M | 36 (Manual, Logs, Tasks, Files tabs), 41 (manual tab), 45 (also the logs card of the report detail), 46; then switches the report editor (Add, Edit, double click, `linkWindows`) to neo | 9, 10, DY1, dms 6, P5 |
| 12 | `amd/pms: neo printouts and queued PDFs` | M | 37p, 38, 39, 40: overview and history printout from the job grid and component detail, job card, the queued PDF messages at login and on change | 1, amd/libs `jobErrorText` |
| 13 | `amd/pms: neo DMS browser and manuals` | M | 41: `DmsBrowserDialog` (folder rows, documents, ".." stop at the component folder, the manual marked, preview of its pages), Manuals in the job detail and the carry out dialog | 7, 11, dms 1, dms 6 |
| 14 | `amd/pms: neo counters` | M | 30c-34c: counter view `#pms/counters`, counters dialog, counter dialog (locked by `mayManage` as the server), update all, log | 8 |
| 15 | `amd/pms: neo company settings and lookups` | M | 51, 52, 53 (manufacturer, cost code, job category, part category): settings dialog, company list, the simple lookups | 1, D7 |
| 15b | `amd/pms: neo checklist, rank, group and notification lookups` | M | 53 (checklists with sortable questions and Copy To, ranks, job groups, overview reports, notifications) | 15, D3 |
| 16 | `amd/pms: neo system settings and job statuses` | M | 54, 55 | 1 |
| 17 | `amd/pms: neo portlets and link detail card` (now the portlets only) | S | 56, 57 | 4, 8, P6 |
| 17b | `amd/pms: neo PMS job card in linked entities` | S | 34 | 4 |

Not planned: parts and the component grid (open point 1), tours (row 59).

## 5. Open points for the owner and the coordinator

1. **Parts and the component grid are unreachable in classic** (rows 7, 20, 50): built but commented out of the
   tabs; parts are not linked to components; `PartDialog` sends a `companyId` the model lacks. The AI tools still use
   parts (`amd_pms_part_*`). Plan: no neo card; the component import / export goes to the tree ⋮ in card 2 if the
   owner wants it. Owner: port parts, or keep them out?
2. **Workflow bugs in classic** (row 47): Send runs after a failed save; `notFound` and `{success:false}` count as
   success (the dialog closes and nothing happened); a cancelled Send prompt leaves Send disabled; the job detail's
   Postpone without an extension leaves an orphan open report; Approve OK skips `promptWithComment`. neo checks
   every refusal and validates the extension before it creates the report. A classic fix would be a 26.0.x card:
   owner decides.
3. **Legacy postpone in the job dialog** (row 28) duplicates the workflow postpone and stores the time value as the
   counter target. Plan: not ported, the workflow postpone is the way; owner confirms.
4. **Counter dialog lock** (row 32c): classic locks all but the value for non-admins, the server lets `mayManage`
   edit everything. Plan: neo follows the server.
5. **fleet pieces**: `resolveStartVessel` and the report tag chips belong to fleet neo. The fleet analysis runs in
   parallel; the coordinator sets the `after` of pms cards 1 and 5 once its cards exist. The start vessel follows
   classic (saved, then the user's default, else none selected), no first-readable shortcut.
6. **Two-level grouping** (row 34): the link card shows one level "vessel / component path" instead of two
   collapsible levels.
7. **Unescaped values in classic templates** (rows 32, 42, 55, `CounterUpdateAllDialog`, `HistoryGrid`): checklist
   question, name and suffix, crew and status history names, counter names in alerts are put into HTML unescaped. A
   user who may edit a checklist or a crew name can inject HTML into other users' report detail. neo escapes them;
   a classic fix is a 26.0.x security card: owner decides.
8. **Undeclared dependencies**: the views need amd/crew (`MemberCombo` as a filter type, unguarded) and amd/tasks
   (relations and detail lists, partly unguarded), which `getDependencies()` does not list. neo guards both. A
   classic guard is a 26.0.x change.
9. **Click-only check columns** (row 53): Overview Reports and Notifications show check columns that change on click
   and are never saved. neo shows them read-only.
10. **Risk assessments in a saved report** (row 43) show the current dms document's items, not those of the day of
    the report. neo keeps that.
11. **Tours** (row 59): classic-only unless decided otherwise.
12. **Saved state is per browser in neo** (P7): `State` keys have no user, classic keeps them per user on the
    server. Owner: a per-user key in localStorage, or server-stored state as classic? This touches every module.

## 6. Additions for go:neo-port

These go into the skill (`~/Projects/go-skills/skills/neo-port/SKILL.md`). This task doesn't edit the skill.

- **Inventory:** check what the classic views build but never show (pms: component grid, part grid, history grid,
  `JobViewField`, a second report store in the job detail). Unreachable code is not behaviour; list it as dead.
- **Inventory:** a custom workflow request (`wfSend`, `wfApprove`) can answer `notFound` or `{success:false}`
  besides `notUpdated`: read the controller and check all three in neo; classic pms checks only `notUpdated`.
- **Inventory:** a global `Ext.override` of a core class in the module (pms's `VariableFilterPanel`) changes every
  module's filters in classic; in neo it becomes a core option (P3), not a module patch.
- **Mapping row:** `go.filter.VariableFilterPanel` with `stateFilter` (combos scoped by a saved value) → core
  `FilterPanel` run-time `jmapFilter` (P3).
- **Mapping row:** `Ext.ux.TwoLevelGroupingView` → one `Grid` `groupBy` level with a combined header.
- **Mapping row:** an `EditorGridPanel` used to type values into many records (pms's counter update all) → an
  `ArrayField` of rows in a dialog; no editable grid needed.
- **Mapping row:** a tree with a custom multi-selection model and "hits in place" search → `GO.tree.Tree` + P1.
- **Card split:** `resolveRoute()` prefers neo routes, so a module route registered before its detail works sends
  other modules' links (crew, dms) to an unfinished screen: each entity route goes live with its detail card, and
  Add / Edit / `linkWindows` switch to neo only when the whole editor is done (until then they open classic).

## 7. Board cards

Created 2026-11-28, all `--no-auto`. Core and diary: by their letter; amd/pms: by their number in section 4.

- P1 `20261128-023725-neo-ui-go-tree-tree-multi-selection-and`
- P2 `20261128-023725-neo-ui-go-form-field-signaturefield-in-c`
- P3 `20261128-023726-neo-ui-filterpanel-entity-filters-scoped`
- P4 `20261128-023726-neo-ui-batcheditdialog-with-module-field`
- DY1 `20261128-023726-amd-diary-neo-event-list-and-log-picker`
- 1 `20261128-023727-amd-pms-neo-skeleton`
- 2 `20261128-023727-amd-pms-neo-component-tree-actions`
- 3 `20261128-023727-amd-pms-neo-component-dialog-and-detail`
- 4 `20261128-023728-amd-pms-neo-job-list-and-filters`
- 5 `20261128-023729-amd-pms-neo-job-dialog`
- 6 `20261128-023730-amd-pms-neo-job-dialog-texts-and-manual`
- 7 `20261128-023733-amd-pms-neo-job-detail`
- 8 `20261128-023732-amd-pms-neo-job-report-list-and-detail`
- 9 `20261128-023734-amd-pms-neo-carry-out-dialog`
- 10 `20261128-023734-amd-pms-neo-carry-out-checklists-crew-an`
- 11 `20261128-023735-amd-pms-neo-carry-out-manual-logs-tasks`
- 12 `20261128-023731-amd-pms-neo-printouts-and-queued-pdfs`
- 13 `20261128-023735-amd-pms-neo-dms-browser-and-manuals`
- 14 `20261128-023736-amd-pms-neo-counters`
- 15 `20261128-023736-amd-pms-neo-company-settings-and-lookups`
- 16 `20261128-023737-amd-pms-neo-system-settings-and-job-stat`
- 17 `20261128-023738-amd-pms-neo-portlets-and-link-detail-car`

After the Codex review: P5 `20261128-024359-neo-ui-filespanel-overwrite-choice-and-h`,
P6 `20261128-024400-neo-ui-summary-start-page-with-several-i`, P7 `20261128-024401-neo-ui-per-user-component-state-not-shar`,
P8 `20261128-024402-neo-ui-confirmdialog-with-more-than-two`, 8b `20261128-024403-amd-pms-neo-job-report-actions`,
15b `20261128-024405-amd-pms-neo-checklist-rank-group-and-not`, 17b `20261128-024406-amd-pms-neo-pms-job-card-in-linked-entit`.
Cards created before the review carry its changes as notes; the extra `after`s of cards 7, 8, 11 and 17 (P5, P6,
card 10) are in a note for the coordinator (the board CLI cannot edit `after`).

Notes added to D4 (`20261128-020112`, pms is its third user) and D7 (`20261128-020115`, lookups scoped by a company;
it looks like a duplicate of `20261128-015251`).
