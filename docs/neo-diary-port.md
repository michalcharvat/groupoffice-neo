# neo: amd/diary port, analysis and card split (2026-11-28)

The owner decided on 2026-11-28 to port amd/portcall and then amd/diary to neo, after amd/crew. This page is the
analysis for diary, built the same way as `docs/neo-crew-port.md`. The work is in the board cards listed under
"Cards". Module code goes to the amd-mono branch `neo` (`~/Projects/groupoffice26-neo-amd`). Core neo pieces go
to `neo-ui` in this repository.

Sources read:

- `amd/diary/views/extjs3`: 46 files, 6,705 lines (`EventDialog.js` 849, `MainPanel.js` 551, `EventDetail.js` 459)
- `diary/Module.php` (`getDependencies()`, the download routes), `diary/CLAUDE.md` and its `docs/`
- the uses of diary in other amd modules (fleet, pms, portcall, crew, formbuilder)
- from GO.neo: `form/field/DateTimeField.mjs`, `DateUtil.mjs`, `Format.mjs`, `systemsettings/EntityListPanel.mjs`,
  `ModuleRegistry.mjs`, the `GO.scheduler.Scheduler` section of `docs/neo-core-components.md`
- the ported amd/crew (`crew/views/neo`) and amd/formbuilder (`formbuilder/views/neo`, `formRuntime.mjs`)

Nothing was run in a browser. A point marked "unverified" is something a card has to prove first.

## 1. Inventory by behaviour

| # | Area | Behaviour (ExtJS source) | GO.neo | Class |
|---|---|---|---|---|
| 1 | Registration | `go.Modules.register('amd','diary')`, 6 entities with relations and filters (`Module.js`): Event with about 15 filters (vessel, activity, sub-activity, dates, duration, tags, locations, remarks, closed, main), one `systemSettingsPanels` entry | `ModuleRegistry.register({package:'amd', name:'diary', capability, mainView, routes, systemSettings, portlets})`; `routes` for `AmdDiaryEvent`, so crew's voyage detail and portcall's crew change Log column (`resolveRoute()`) link into neo | port |
| 2 | Layout | Responsive `ModulePanel`: west = an inner west of Assets list + filters and a center with the events; east = the event detail. Narrow mode buttons (menu, forward, back) (`MainPanel.js`) | `MainThreeColumnPanel` subclass: west Assets + `FilterPanel`, center the events tabs, east the detail | port |
| 3 | Assets | `AssetGrid` (go.NavGrid over `AmdFleetVessel`, filter `modulesVisibility: {module: 'diary'}`, single select, own search). The selection filters the events (`vesselId`), is saved per user in `User.amdDiarySettings.lastAssetIds` and restored on start, keeping only vessels still readable and `visibleInDiary`; with none it selects the first row. A row click shows the events in narrow mode | `Grid` (or `list/TextList`) over the vessel entity + `SearchButton`; the saved ids through `User/set` `amdDiarySettings` (existing upstream property and API, the same call classic makes) | port |
| 4 | Filters | `filtergrid` + `variablefilterpanel` + `filteraddbutton` for `AmdDiaryEvent` | `view/FilterPanel.mjs` + `filterTypes` (combo filter types: vessel, activity, sub-activity, tag chips, location) | port |
| 5 | Date range | Two date fields in the toolbar (default today), Previous / Next (one day), Today, All (clears both). They set the `interval` filter (`startDate` 00:00, `endDate` 23:59:59) and reload; the Overview tab reads the same range | Module toolbar items in the center (`GO.grid.ListToolbar` + `DateField`s) | port |
| 6 | Events list | `EventGrid` (limit 1000, sort `modifiedAt` desc, remote sort): vessel, start and end in the **vessel's time zone**, activity, sub-activity, duration, Main check, locations, tags with colours, created / modified at and by. `autoExpandColumn: 'vessel'`, column state | `Grid` + `JmapStore` + Model; date columns through the time-zone formatter (core card T) | port |
| 7 | Totals | Under the grid: with a date range, "Main: x h y m" (green when exactly 24 h, red otherwise) and "Other: …", each event clamped to the range, a running event counts to now, a `noDuration` event counts nothing. Without a range, the row count. Classic bugs not to copy: "All" leaves an `interval` filter with two null bounds, so the row count never shows (`MainPanel.js` 530-549, `EventGrid.js` 247-251); the Overview computes its totals with other arithmetic than the grid (`TimelinePanel.js` 113-132). neo: one tested totals function for both tabs, the row count for "All" | Module component under the grid, recomputed on `load` | port |
| 8 | List actions | Search (`text`, `remarks`, `modified`, `created`), Add (only when the user has create permission on a selected vessel; the dialog gets that vessel), Download Report (Daily Report PDF of the selected vessel: `amd/diary/dailyReport/<vesselId>&startDate=<ISO 00:00>&endDate=<ISO 23:59:59>`; error without a range, because the server falls back to today), more menu: Export (`EventExportDialog`), Settings (module manage). Delete with module manage. Batch edit only when custom field sets exist. Double click / Enter opens the dialog only with write permission on the row (also a closed log; the detail's Edit is disabled for it); a click navigates to the detail | `GO.grid.Grid` `entityActions`, `ListToolbar`, `BatchEditButton`, `download.mjs` (`amd/diary/dailyReport/<vesselId>`) | port |
| 9 | Export | `EventExportDialog`: format (xlsx, csv, html, json) and a date-time range with month back/forward, or the current grid filter. A range export sends `{filter: {interval: {startDate, endDate}, vesselId: <selected vessel>}, limit: 0, position: 0}`, "currently on screen" the grid's filters (`EventExportDialog.js` 157-202); `go.util.exportToFile('AmdDiaryEvent', …)` (server converter `SpreadsheetEvent`) | `Dialog` + `export/exportEntities.mjs` | port |
| 10 | Event detail | `EventDetail` (go.detail.Panel, relations vessel, activity, subActivity, vesselCrews, portCall, tags, locations): Event card with asset, Past Track links (to `#amdmaps/pastTrack/<mmsi>/<from>/<to>` and the download `amd/amdmaps/pastTrack/<mmsi>&startDate&endDate`, both in Unix seconds of UTC, only with amdmaps available and an MMSI), activity, sub-activity, crew members, port call link (`arrivalPort` name resolved from `Port`, nested relation), start / end in the vessel's zone, tags with colours, locations with GPS tooltip, remarks (stored HTML), measured data. Then formbuilder `FormDetailPanel`, the IoT chart and table (row 15), links, files, core history | Core `detail/Panel.mjs` subclass with `LinesCard`s, `sanitizeHtml()` for remarks, formbuilder `FormDetailCard`, `LinkCards`, `FilesPanel`, `HistoryPanel` | port |
| 11 | Event history | Own `AmdDiaryEventHistory` list (not core history): per change the creator, time and a JSON diff `{property: [new, old]}` rendered as "* **Field** changed to: value"; ids of vessel and tags resolved to names, dates in the vessel's zone, remarks shown as text only, older rows as plain text (`EventDetail.js` `renderChangeLog`, an XSS fix of 2026-11-25) | Module `Card` over the entity, values escaped | port |
| 12 | Detail toolbar | Edit (write permission and not `isClosed`), add linked item, link browser, Print, Delete (module manage, confirm) | Core detail toolbar + `entityActions` | port |
| 13 | Event dialog, base | Asset → Activity → SubActivity cascade (vessel filters the activity, sub-activity, location, port call and crew stores; a new activity clears the sub-activity and port call; a sub-activity sets its activity when empty); the (sub)activity's default tags are added; location chips (fleet `VesselLocationChips`); Remarks Template combo inserts the template into the HTML remarks; HTML remarks; Closed (the server then refuses any later save except by an admin, `Event.php` 606-619; formbuilder required answers apply); start and end date-time **in the vessel's time zone** with Now / Clear; end ≥ start; a warning above 24 h; Tags (fleet `ReportTagChips`, filtered by the vessel's company); Closed. Buttons Apply (save, stay open), Save, Save & Create (opens a new dialog with the same vessel, start = the old end, end = + 1 h). After a save with a port call the `AmdPortCall` store is refreshed | `FormWindow` with `JmapComboBox` / `AutocompleteChips` over the diary and fleet entities, `HtmlField`, `DateTimeField` with `timeZone` (core card T) | port |
| 14 | Dialog configuration | The merged `configuration` JSON of activity + sub-activity (`updateFields()`): `requiresPortCall` shows a required port call combo (`AmdPortCall`, filters `vesselId` and `withoutEventId`; picking one fills start and end); `displayMeasuredData` shows the measured data rows (`MeasuredDataField`, a FormGroup of name / number value); `fields` seeds those rows for a new log; the sub-activity's own properties (not configuration keys) `isMain` makes the end required and `noDuration` (not main) clears and disables the end; on a key in both configurations the activity wins (`Ext.applyIf` order, `EventDialog.js` 373-375); `fields` also seeds an existing log whose measured data is empty; `isCrewChange` / `requiresCrewMember` (row 16); `iot` shows a read-only IoT summary (row 15). Formbuilder forms: activity `formIds` then sub-activity `formIds` rendered in the dialog. Classic needed a `setvalue` listener so loaded logs show their fields | Module logic run once on `formReady` (FormWindow loads or creates the record before it fires, so a change-only listener leaves a loaded log's fields hidden) and then on the combos' `change` (go:neo-port trap: a combo pick fires `change`); `ArrayField` for measured data; formbuilder `formRuntimeOf(win).loadForms(ids)` | port |
| 15 | IoT | With amd/iot available: in the dialog a read-only summary (device name, fields with units, chart / table flags); in the detail a CanvasJS chart (`go.modules.amd.iot.EventChartRenderer`) and a table of the readings of `AmdIotData/getBucketed` for the log's time span, from the log's saved `iotConfiguration` snapshot; chart and table follow their own flags, both hidden without dates, fields, device or readings (`EventIotPanel.js` 73-140) | Chart: core `GO.chart.Chart` (card 20261127-004053, not built). Table: `Grid` | build (after the chart card) |
| 16 | Crew change | A sign-on / sign-off sub-activity (`isCrewChange`, `crewChangeType`) shows the Crew Change combo (`AmdDiaryEvent/queryCrewChanges` around the start date, nearest preselected on a new log), then `AmdDiaryEvent/crewChangeSigners` proposes the signers in `VesselCrewChips` (`AmdFleetVesselCrew`); a refresh of the same Crew Change keeps the user's exclusions. With a Crew Change chosen, the chips offer only its signers (`filterCrewCombo`). A saved linked log is locked (`AmdDiaryEvent/crewChangeLink`, also right after Apply of a new log): vessel, activity, sub-activity, members, crew change and start disabled. Required rules follow the server (`docs/crew-change.md` of diary). `requiresCrewMember` offers the vessel's crew | Module code; `AutocompleteChips` with a store filter the dialog sets; the lock as read-only fields (go:neo-port trap `fixField()`) | port |
| 17 | Overview | `TimelinePanel` on vis-timeline: two rows, Main and Other (by `subActivity.isMain`); items read-only, range or point (no end); content = activity + sub-activity name, or the remarks; window = the date range; Ctrl+wheel zoom (min 30 h); selecting an item routes to the detail; the same Main / Other totals under it. Same store as the list | `GO.scheduler.Scheduler` (section 3) | port |
| 18 | Settings (system) | `SystemSettingsPanel` with 4 tabs: Activity, SubActivity, Code, (Remarks) Template, each a grid with search, Add, Copy (settings of another vessel), row menu Edit / Delete; SubActivity also "Copy…" (`AmdDiarySubActivity/copy` to another vessel / activity) and "Hide in Activity Summary". Dialogs: Code (vessel, name, summary order), Activity (vessel, name, code, tags, excluded from report, formbuilder `FormChips`, `configuration` in a CodeMirror editor with an inline key reference `ConfigurationHelp.js` and copy buttons), SubActivity (as Activity but with an Activity combo instead of Code, + main, no duration (mutually exclusive with main), hide in summary). The Copy button of each list (`CopySettingsHelper.js`) is already on the System settings lists (`ActivityGrid.js` 31-39), Remarks Template (vessel, name, HTML content) | `systemSettings` registry key; one `EntityListPanel` subclass per entity (crew's `LookupListPanel` is the model); the configuration field needs core card C | port (C is build) |
| 19 | Settings (module) | More menu → Settings (module manage): a vessel list (`SettingsVesselGrid`); a row opens `VesselSettingsDialog` with the 4 lists of row 18 scoped to that vessel (no vessel column), Copy to another vessel (`VesselSelectorDialog` with From preselected as the current vessel and To; source and target must differ; `<Entity>/copyTo {sourceVesselId, targetVesselId}`, a result dialog with created / skipped / missing parent, `CopySettingsHelper.js`) and "Print settings (PDF)" (`amd/diary/vesselSettings/<id>`) | `Dialog` + the panels of row 18 with a fixed vessel filter | port |
| 20 | Portlet | Start page "Latest logs" (`EventPortlet`, 20 newest, server filter `portletSelection`), gear → `EventPortletSettingsDialog` (User `amdDiaryPortletVesselIds`, `…ActivityIds`, `…SubActivityIds`, the pickers narrow each other); a row opens the log | `portlets` registry key (first user: crew portlets card 20261127-112123, unverified until then) | port |
| 21 | Combos | `VesselCombo(Reset)` (vessels visible in diary, with `timezone`), `ActivityCombo(Reset)`, `SubActivityCombo(Reset)`, `CodeCombo`, `RemarksTemplateCombo`, `CrewChangeCombo`, `VesselCrewChips`; fleet `ReportTagChips` (company filter, colours), `VesselLocationChips` | `JmapComboBox` / `AutocompleteChips` configs in diary's `views/neo` | port |
| 22 | Embedded in other modules | fleet `VesselDialog` embeds diary's Activity, Code and SubActivity grids; pms `JobReportDialog` uses `FilterableEventGrid` + `EventSelectorDialog` (pick logs for a job report, remove locally) and `JobReportDetail` uses `EventDetailPanel` (logs of a record, download of measured data `amd/diary/MeasuredData/<entity>`) | Not needed by diary's own screens | later (with fleet / pms) |
| 23 | Tours | `tourId`s `amd-diary-views`, `-filters`, `-detail`, `-actions`, `-range`, `-asset-grid` (sf/tours) | neo has no tours | gap (owner) |

## 2. Dependencies: what diary needs in neo

`getDependencies()` lists amd/libs, fleet, portcall, formbuilder, templates, sf/codemirror and legacy/files. The
views also use amd/iot and amdmaps (both guarded by `isAvailable`) and the core history, links and files.

| Module | What diary's views use | In neo | Must be ported first? |
|---|---|---|---|
| amd/fleet | Stores `AmdFleetVessel` (with `timezone`, `mmsi`, `companyId`, `visibleInDiary`), `AmdFleetVesselCrew`, `AmdFleetVesselLocation`, `AmdFleetReportTag`; fleet's `ReportTagChips`, `VesselLocationChips`, `VesselLocationCombo` and `util.getFontColorBasedOnBackground` (tag colours); `ReportTagChips` also creates a new tag inline for the vessel's company (`ReportTagChips.js` 142-149) | JMAP entities, no fleet neo UI | No. Diary defines the combos in its own `views/neo` (as crew did), including the inline tag create; the tag text colour is `Format.isLightColor()`. They move to fleet when fleet is ported |
| amd/portcall | `PortCallCombo` in the dialog, the port call link in the detail (`#portcall/…`), `Port` for the arrival port name; the Crew Change methods are diary's own (`AmdDiaryEvent/queryCrewChanges`, `crewChangeSigners`, `crewChangeLink`) | Ported next (`docs/neo-portcall-port.md`, analysis running in parallel) | No. The combo goes over the `AmdPortCall` entity inside diary; the link resolves through the registry `routes` of portcall and goes to classic until portcall registers them (`classicApps.mjs`). Order: diary cards 3 and 4 after portcall's skeleton card, so the link opens neo when both exist. The other way round: portcall's detail and dialog link to the "Managed by Log" event (`PortCallDetail.js` 219, `PortCallDialog.js` 279), its crew change Log column needs diary and crew (`CrewChangeDetail.js` 343-361), and its classic `VesselCombo.js` extends diary's: these resolve through diary's `routes` (card 1) |
| amd/formbuilder | Activity / sub-activity `formIds` rendered in the event dialog (`loadFormBuilderFormById`, DialogOverride), `FormDetailPanel`, `FormChips` in the admin dialogs | Ported: `AmdDiaryEvent` is in `FORM_ENTITIES`, `formRuntimeOf(win).loadForms(ids)`, `FormDetailCard` | No |
| sf/codemirror | `sfcodemirroreditor` for the `configuration` JSON of Activity and SubActivity | Nothing | Core card C (`GO.form.field.CodeField`, shared library, coordinator rule 2026-11-28); also used by amd/templates and amd/iot |
| amd/libs | Loads vis-timeline for the classic Overview (`libs/views/extjs3/Module.js` 47-52) | Not needed: the Overview moves to `GO.scheduler.Scheduler` | No |
| amd/templates | Backend only: the vessel settings PDF (`VesselSettingsPdf.php`); the Daily Report has its own renderer | — | No |
| amd/iot (guarded) | `AmdIotDevice` for the dialog summary, `AmdIotData/getBucketed` + `EventChartRenderer` (CanvasJS) in the detail | No iot neo UI; no chart in neo | The table and summary don't wait; the chart waits for core `GO.chart.Chart` (20261127-004053) |
| amdmaps (guarded) | Past Track link `#amdmaps/pastTrack/<mmsi>/<from>/<to>` and download `amd/amdmaps/pastTrack/<mmsi>` | No amdmaps neo UI | No: the hash goes to classic, the download is a plain URL |
| amd/crew | None in the views. Crew listens on the server (`EVENT_CREW_CHANGE`); crew's neo voyage detail and sign-log column link to `AmdDiaryEvent` through `resolveRoute()` | Ported | No. Diary's `routes` (card 1) make those links open the neo detail |
| legacy/files, core | `addFiles`, `addLinks`, `addHistory`, `go.util.downloadFile` | `FilesPanel`, `LinkCards`, `HistoryPanel`, `download.mjs` | No |

**Data rule for every card.** Diary's, fleet's and portcall's upstream tables stay as they are. Edits go only
through the existing JMAP API, the same calls the classic client makes (including `User/set` of
`amdDiarySettings.lastAssetIds` and `amdDiaryPortlet*Ids`, upstream user properties classic already writes).
Nothing found needs a `neo_*` table. If a card finds neo-only data (a view setting classic doesn't have), it goes
to a `neo_amd_diary_*` table in diary's `views/neo/install/updates.php` (`docs/neo-core-components.md`, "neo
tables of modules").

**Time zones.** Diary shows and edits a log's start and end in its vessel's time zone (`vessel.timezone`), not the
user's: grid start / end columns, detail, the dates inside the history diff, the dialog fields, the totals.
Created / modified at, the history entry's own time and the port call arrival use the user's zone, as now. neo's `DateTimeField` and `Format` know only the user's
zone. amd/portcall has its own timezone `DateTimeField.js` as well, so this is core card T, not a diary helper.

## 3. Overview on GO.scheduler.Scheduler

vis-timeline has two users: crew (already on `GO.scheduler.Scheduler`) and diary. With this card it has none left
in neo.

| vis-timeline (`TimelinePanel.js`) | GO.scheduler.Scheduler |
|---|---|
| Groups `main` and `other` | `resources: [{id: 'main', name: t('Main')}, {id: 'other', name: t('Other')}]`, flat, `bookable: false` (no slot click; classic has none) |
| Items from the event store, `group` by `subActivity.isMain` | `events`: the list's `JmapStore` (rebuilt on load), `eventFields: {startDate: 'startDate', endDate: r => …, resourceId: r => r.subActivity?.isMain ? 'main' : 'other'}` |
| `type: 'point'` for a log without end (sign on / off; in classic every item is a range, because `new Date(null)` is truthy, `TimelinePanel.js` 100-108: a point is the intended fix, a running log without end is a bar up to now) | The scheduler leaves out an event without end or ending before it starts and has no point type. Proposal: `endDate` = start + 1 minute with `cls: 'go-diary-point'` (a narrow marker; bars are at least a few px). **Unverified**: if it is not visible or not clickable, the card asks for a core `point` option instead of a module hack |
| `className` main / sub | `eventRenderer: r => ({html: escapeHtml(label), cls})`, label = activity + sub-activity, else the remarks as text |
| `editable: false` | `readOnly: true` |
| `select` → route to the detail | `eventClick` → `#diary/…` of the record |
| Window = the date range; Ctrl+wheel zoom, `zoomMin` 30 h | `timeAxis {start, end}` = the range in the **vessel's zone** (one day = 00:00–24:00), `zoom: 'hour'` for one day, `'day'` up to a month, `'week'` beyond; range "All": the min / max of the loaded logs. No `growRange` (the list's range is the window, as in classic) |
| Totals under the timeline | The same totals component as the list (row 7) |

Dates: `Scheduler.normalizeEvents()` converts start and end with `toUserTime()` and drops an event without an
end (`Scheduler.mjs` 140-153). Diary's day is the vessel's: for one selected vessel the axis and bars have to be
in the vessel's zone, or a day's logs don't line up with 00:00–24:00. So core card T also gives
`GO.scheduler.Scheduler` a `timeZone` config (the same conversion as the field), and card 6 waits for it.

## 4. Cards

Every card stays at M size or below. A card's browser check compares its screens with `?webclient=classic`, as a
non-admin user with the module and once as admin.

**Core** (project groupoffice26-neo, base `neo-ui`):

| Card | Size | Scope | After |
|---|---|---|---|
| T. `neo-ui: DateTimeField and date formatting in a given time zone` (20261128-014554) | S | `DateTimeField` `timeZone`, `formatDateTime(value, timeZone)`, `GO.scheduler.Scheduler` `timeZone`; also for amd/portcall | — |
| C. `neo-ui: GO.form.field.CodeField (CodeMirror addon)` (20261128-014608) | M | CodeMirror from sf/codemirror as a main-thread addon, JSON validation; also for templates and iot | — |
| `neo-ui: GO.chart.Chart (CanvasJS addon)` (20261127-004053, existing) | — | needed by card 12 only | — |

**amd** (project `~/Projects/groupoffice26-neo-amd`, base `neo`):

| # | Card | Size | Rows | After |
|---|---|---|---|---|
| 1 | `amd/diary: neo skeleton` | M | 1-4, 21, 23: registration and `routes`, main view (west Assets + filters, center tabs Events / Overview empty, east detail placeholder), Assets with saved selection, `FilterPanel`, narrow mode, the diary combos, `views/neo/PORTING.md` from section 1 | — |
| 2 | `amd/diary: neo events list` | M | 5-9: date range toolbar, grid with vessel-zone dates, totals, search, delete, batch edit, Download Report, Export dialog; Add and Settings stay off until cards 4 and 9 | 1, T |
| 3 | `amd/diary: neo event detail` | M | 10-12: Event card, history card, FormDetailCard, links, files, toolbar; port call and Past Track links to classic until their modules are on neo | 1, T, portcall skeleton |
| 4 | `amd/diary: neo event dialog` | M | 13, 14: cascade, tags, locations, remarks template, vessel-zone dates, configuration rules, port call combo, measured data, formbuilder forms, Apply / Save & Create; turns on Add, double click / Enter and Edit | 2, T, portcall skeleton |
| 5 | `amd/diary: neo event dialog crew change` | M | 16 + the IoT summary of 15: Crew Change combo, signer chips, lock of a linked log | 4 |
| 6 | `amd/diary: neo overview on GO.scheduler.Scheduler` | S | 17, section 3 (point logs, vessel zone) | 2, T |
| 7 | `amd/diary: neo settings lists` | M | 18 lists: the 4 `EntityListPanel`s (manage guard on edit / delete), Code and Remarks Template dialogs, Copy to another vessel with result dialog, System settings tab | 1 |
| 8 | `amd/diary: neo activity and sub-activity dialogs` | M | 18 dialogs: configuration on CodeField with key reference, form picker, SubActivity Copy… and Hide | 7, C |
| 9 | `amd/diary: neo vessel settings dialog` | S | 19: vessel list, per-vessel dialog with the lists of card 7, Print settings PDF; turns on Settings of the list | 7, 8 |
| 10 | `amd/diary: neo portlet` | S | 20 (portlets work in neo: email, summary) | 3 |
| 11 | `amd/diary: neo IoT table in the event detail` | S | 15 (detail table) | 3 |
| 12 | `amd/diary: neo IoT chart in the event detail` | S | 15 (detail chart) | 11, chart card 20261127-004053 |

Row 22 (diary pieces embedded in fleet and pms) is not a card here: the fleet and pms ports reuse card 7's
panels and build their own log picker. Until card 4 is done, Add, double click and Edit stay off; cards 2 and 3 add no stub dialog.

Board card ids: see section 6.

## 5. Open points for the owner and the coordinator

- **Tours** (row 23): neo has no sf/tours runtime; diary's tours stay classic-only unless decided otherwise.
- **Point logs on the scheduler** (section 3): if a 1-minute bar is not usable, a core `point` option is needed.
- **Classic bugs** (rows 7, 17): "All" shows no row count and the Overview has no points; the port fixes both.
- **Portcall ordering**: cards 3 and 4 wait for portcall's skeleton card (it registers the `AmdPortCall` routes).
  The portcall analysis runs in parallel; the coordinator sets the `after` once its card ids exist.
- **pms and fleet** (row 22): their ports need a diary log picker and the per-vessel lists; decide there whether
  the picker becomes a core `EntitySelectDialog` use or a diary export.

## 6. Card ids

Created 2026-11-28, all `--no-auto` (the coordinator starts them and adds the portcall `after` to cards 3 and 4).
Some ids carry the card's first title; the titles on the board are current:
T `20261128-014554-neo-ui-datetimefield-and-date-formatting`, C `20261128-014608-neo-ui-go-form-field-codefield-codemirro`,
1 `20261128-014902-amd-diary-neo-skeleton`, 2 `20261128-014946-amd-diary-neo-events-list`,
3 `20261128-014946-amd-diary-neo-event-detail`, 4 `20261128-014946-amd-diary-neo-event-dialog`,
5 `20261128-014904-amd-diary-neo-event-dialog-crew-change`, 6 `20261128-014904-amd-diary-neo-overview-on-go-scheduler-s`,
7 `20261128-014947-amd-diary-neo-settings-lists-and-dialogs`, 8 `20261128-015448-amd-diary-neo-activity-and-sub-activity`,
9 `20261128-014905-amd-diary-neo-vessel-settings-dialog`, 10 `20261128-014947-amd-diary-neo-portlet`,
11 `20261128-014947-amd-diary-neo-iot-chart-and-table-in-the`, 12 `20261128-015449-amd-diary-neo-iot-chart-in-the-event-det`.

A Codex review (gpt-6.2-astra) checked this page against the sources; its findings are worked in (time zone
scope, Overview points and totals, request parameters, dialog rules, copy direction, card order and size).

## 7. Additions for go:neo-port

These go into the skill (`~/Projects/go-skills/skills/neo-port/SKILL.md`); this task does not edit it.

- **Inventory:** list the time zone a module shows dates in. Diary uses the vessel's zone everywhere (grid,
  detail, history, dialog, totals); a port that formats with the user's zone shows different times than classic.
  Mapping row: a module `DateTimeField` with `setTimezone()` (diary, portcall) → core `DateTimeField` `timeZone`
  (card T).
- **Inventory:** list a module's pieces that other modules embed (diary's grids in fleet's vessel dialog, the event
  picker and log panel in pms). They are not part of the module's own port; the embedding module's port decides.
- **Mapping row:** `sfcodemirroreditor` → `GO.form.field.CodeField` (core card C).
- **Mapping row:** vis-timeline with flat groups and `type: 'point'` items → `GO.scheduler.Scheduler` with flat
  resources; a point needs a minimum-length bar or a core point option (section 3).
- **Mapping row:** a configuration-driven ExtJS dialog (`updateFields()` on `setvalue` + `select`) → one module
  method run once on `formReady` (the record is loaded before it fires) and then on the combos' `change`; it
  must not reset values on the load's own `change`.
- **Coordinator rule (2026-11-28):** a library that several modules share (amd/libs, sf/*: PDF viewer, CodeMirror,
  CanvasJS) becomes a core neo-ui card, not a module port.
