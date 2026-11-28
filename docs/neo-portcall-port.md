# neo: amd/portcall port, analysis and card split (2026-11-28)

The owner decided on 2026-11-28 to port amd/portcall after amd/crew, and amd/diary after it. This page holds the
analysis; the work is in the board cards under "Cards". The model is `docs/neo-crew-port.md`. Module code goes to
the amd-mono branch `neo` (`~/Projects/groupoffice26-neo-amd`); core neo pieces go to `neo-ui` in this repository.

Sources read:

- `amd/portcall/views/extjs3`: 44 files, 6,293 lines (biggest: `MainPanel.js` 724, `CrewChangeDetail.js` 665,
  `PortCallDialog.js` 519, `PortCallDetail.js` 385), `Module.js` (8 entities with filters and link windows),
  `portcall/docs/frontend.md`
- `getDependencies()` in `portcall/Module.php`
- the views of other amd modules that use portcall (catalog, crew, diary, fleet, tanks)
- amd/crew `views/neo` as it is on amd `neo` today (cards 1-10, 13, 15 done)
- GO.neo: `ModuleRegistry.mjs`, `view/FormWindow.mjs`, `form/field/JmapComboBox.mjs`, `form/field/DateTimeField.mjs`,
  `DateUtil.mjs`, `Format.mjs`, `grid/ListToolbar.mjs`, `detail/LinesCard.mjs`, `export/exportEntities.mjs`

A Codex review (gpt-6.2-astra) checked this page against the sources; its 10 findings are worked in. Nothing was run in a browser. Points marked "unverified" are for a card to prove first.

## 1. Inventory by behaviour

| # | Area | Behaviour (ExtJS source) | GO.neo | Class |
|---|---|---|---|---|
| 1 | Registration | `go.Modules.register('amd','portcall')`, 8 entities with relations and filters, link windows for `AmdPortCall` and `AmdPortCallCrewChange`; no settings panels (`Module.js`) | `ModuleRegistry.register({package:'amd', name:'portcall', capability:'go:amd:portcall', mainView, routes, linkWindows, portlets})` | port |
| 2 | Routes | `#portcall`, entity hashes from `getRouterPath()` (`#amdportcall/<id>`, `#amdportcallcrewchange/<id>`). `route()` switches the center tab to the entity's grid, selects the row after load and opens the detail (`MainPanel.js` 640-724). No top-level `go.Router.add` route | `mainView.route(path)` + registry `routes` for the 2 entities, as crew's `DETAIL_ENTITIES` | port |
| 3 | Layout | Responsive at 1000 px. West: company fieldset, a "with port calls" checkbox, the Assets nav grid, and a filter tab panel that follows the center tab. Center: 2 tabs, Port Calls and Crew Changes. East: one detail tab panel with both details, each with a Back button in narrow mode (`MainPanel.js` 1-210) | `MainThreeColumnPanel` subclass (crew `CrewMain.mjs` is the model): center tab container, west section per tab, east slot per entity | port |
| 4 | Company context | fleet `CompanyComboReset`, saved with `Ext.state` (`amd-portcall-selected-company`), default `go.User.fleetSettings.companyId`. Filters the asset grid (`company`) and both lists (`company` + `vesselModulesVisibility: portCall`) (`MainPanel.js` 186-221) | crew's `companyCombo()` (`crew/views/neo/view/fields.mjs`), saved in `State` | port |
| 5 | Assets nav | `AssetGrid` (`go.NavGrid` over `AmdFleetVessel`, `modulesVisibility: portCall`, check boxes, search). "With port calls" sets `withRecords` and is saved in `Ext.state`. The selection filters the active tab (`vesselId`) and is saved on the user (`User.amdPortCallSettings.lastAssetIds`); Add is enabled only when a selected vessel has create permission, and Add prefills the first such vessel (`checkCreateRecord`, with a request counter) | `CheckList` / `Grid` with selection over the entity, `User` save through JMAP | port |
| 6 | Port call list | `PortCallGrid`: 14 columns (vessel, status, port, arrival/departure status and date in the **vessel's time zone**, contact, ISPS level, created/modified). Search (`text`, `modified`, `created`), filter panel with 10 filters, Add, ⋮ Export xlsx / csv / html / json, Settings (module manage). Delete in the grid only for admins (`enableDelete: go.User.isAdmin`). Double click and Enter edit only with write on the row; row click opens the detail (`PortCallGrid.js`, `MainPanel.js` 300-512) | `Grid` with `entityActions`, `ListToolbar`, `FilterPanel` + `filterTypes`, `exportMenuItem(…, formats: ['xlsx','csv','html','json'])` | port |
| 7 | Port call dialog | Fields: asset (sets the time zone of both date fields), port (ports `PortComboReset`), status, arrival status, arrival date + **Now**, departure status, departure date + Now, contact, ISPS level, note. Agency panel: agency contact (`ContactComboReset`) whose pick fills "Contact Details" from the contact's name, first address, phone and e-mail; delivery address. **Managed by Log**: with `eventId` both dates are read-only and a "View Event" link opens the diary event. **Conflict check** (existing records only): a date change asks `AmdPortCallCrewChange/getConflictingCrewChanged` and lists the conflicting crew changes with "Continue" or "Reset values" (resets the whole form); save is blocked while the check runs and asks again unless the user went on (`PortCallDialog.js` 297-313, 420-519). Apply + Save. Tabs: Tasks (amd/tasks `TaskGrid` linked to the port call, Add opens `TaskDialog`; only with amd/tasks), Document Sets (row 10); both off until saved (`PortCallDialog.js`) | `FormWindow`, `JmapComboBox`, core time zone `DateTimeField`, `ConfirmDialog` | port + core pieces |
| 8 | Port call detail | Sections: Port (dates in vessel zone), Agency (hidden without agency and address), Crew Change (the port call's crew changes, links), Document Sets (row 10). Toolbar: Add Crewchange (prefilled from the port call; vessel and port call fixed), Add Document Set (write), Edit (write), ⋮ Print, Clone (a new dialog with 9 values), Delete (writeAndDelete). Links, files, history (`PortCallDetail.js`) | core `detail/Panel` + `detail/LinesCard`, `LinkCards`, `FilesPanel`, `HistoryPanel` | port |
| 9 | Crew change list | `CrewChangeGrid`: executed tick, vessel, port call label, port (loaded via the port call), 4 dates in vessel zone. Row colour (`getRowClass`): `hasConflict` first, else the change's interval on today / tomorrow / yesterday. Search, filter panel (7 filters), Add (module create), Export as row 6, Settings, Delete only for admins. Double click edits with write on the row; row click → detail (`CrewChangeGrid.js`, `MainPanel.js` 514-636) | as row 6 | port |
| 10 | Document sets | Create and edit differ: a new set shows the template chips and no document rows, its first save generates the documents on the server (`model/DocumentSet.php` 134-140); reopened, it hides the templates and shows sortable rows for renaming and replacing files (`DocumentSetDialog.js` 19-45, 112-120). `DocumentSetGrid` in the port call dialog (name, date, documents; ⋮ Edit / Delete). `DocumentSetDialog`: name, date, fleet `DocumentTemplateChips` (adds generated documents), a documents list of rows (name, file `filebuttonfield`, hidden template id, blob, extension, sort order). `DocumentSetPanel` in the detail: per document download and PDF, per set ZIP (`amd/portcall/AmdPortCallDocumentSet{Zip,DocPdf}/…` download URLs) | `Grid`, `FormWindow` with `ArrayField` of `ContainerField` rows + `BlobField`, `AutocompleteChips` over `AmdFleetDocumentTemplate`, `download.mjs` | port |
| 11 | Crew change dialog | Asset (crew `VesselCombo`; filters the port call combo; fixed after creation for non-admins), port call (`PortCallComboReset`; a pick copies its arrival/departure into the 4 dates unless Fix dates is ticked), Fix dates (disables the 4 dates), Executed, 4 dates in vessel zone with Now, information, onsigner / offsigner info, note. **Executed and not admin**: every field read-only, Save and Apply off (`CrewChangeDialog.js`) | `FormWindow`, `DateTimeField` with zone | port |
| 12 | Crew change detail | Section Crew Change (dates in vessel zone, port call, port). Toolbar: Edit, Links, Crew Planning (`#crewplanning/<latestArrivalOnsignerTime>`, only with crew), ⋮ Print Overview (`AmdPortCallCrewChange/<id>` download), Send Overview (`AmdPortCallCrewChange/prepareEmail` → composer with the generated attachments, the message linked to the crew change; the e-mail item of the Overview submenu does the same), **Overview** submenu loaded on open (`DynamicMenu`): one item per active `AmdPortCallOverviewSettings` matching the crew change (filter `crewChange`), each with PDF / Zip / Excel / E-mail by its output flags, Print, Delete. Edit and both Add signer buttons need write on the record, Delete `writeAndDelete`; all are off when the change is executed and the user is not admin. The submenu is reloaded for the current crew change on every open. Links, history, files button (`CrewChangeDetail.js` 1-150, 365-665) | core `detail/Panel` + core card O (⋮ rebuilt on open), the e-mail module's composer (the `showComposer` that legacy/email registers) with the prepared values, `blobs` and `links` to the crew change, not `Mail.showComposer()`'s desktop `mailto` fallback, which drops attachments, download URL | port + core |
| 13 | Signers | Onsigners and Offsigners tables from `AmdPortCallCrewChange/getSigners`: member (link to crew member), rank, voyage link; a **Log** column with the diary sign log when diary and crew are on (crew `findSignLog` / `signLogHtml`). Add Onsigner opens crew's `MemberVoyageDialog` with company, vessel and start crew change fixed. Add Offsigner opens `CrewChangeOffsignersDialog`: members on board (`getOnBoardMembers`; "no members on board" closes it) as name / rank rows, saved by `updateOffsigners`, then crew voyages refresh (`CrewChangeDetail.js` 150-345, `CrewChangeOffsignersDialog.js`, `CrewChangeMemberField.js`) | `LinesCard.setHtml()` tables, crew `MemberVoyageDialog`, `Dialog` + `ArrayField` | port |
| 14 | Lookups (Settings dialog) | `SettingsDialog` with 5 tabs: Arrival Status, Departure Status, Status, ISPS Security Level (name only) and Overview (`SettingsDialog.js`) | crew's lookup settings dialog, moved to core (card L) | port |
| 15 | Overview settings | `OverviewSettingsDialog`: name, active, fleet `VesselChips`, ports `PortChips`, output flags (pdf, zip, excel, e-mail) and onsigners / offsigners, PDF and archive certificate types (crew `MemberCertificateTypeChips`), Excel: fleet `OverviewTemplateCombo`, split signers, personal detail chips (a fixed option list), E-mail: to, cc, bcc, body (`OverviewSettingsDialog.js`, `OverviewSettingsPersonalDetailChips.js`) | `FormWindow`, `AutocompleteChips` over `AmdFleetVessel` / `Port` / `AmdCrewMemberCertificateType`, `JmapComboBox` over `AmdFleetOverviewTemplate`, `OptionsChips` | port |
| 16 | Portlets | Next port calls, Next crew changes (only with legacy summary), both portCall-visible vessels, ascending date, 20 rows; port calls `upcoming` + `hideExecuted`, crew changes `showLatest` + `isExecuted: false`; each with a gear that picks vessels (saving reapplies the selection and reloads; the gear's vessel picker lists `AmdFleetVessel` with `modulesVisibility: portCall`, an empty selection means all of those) into a User scalar (`amdPortCallPortletVesselIds`, `amdPortCallCrewChangePortletVesselIds`); row click opens the entity (`Portlets.js`, `*Portlet.js`, `PortletSettingsDialog.js`, `portcall/docs/frontend.md`) | `portlets` registry key (start page in `modules/summary/views/neo`), `EntitySelectDialog.ask()` for the vessels | port |
| 17 | Link windows | `linkWindow` of both entities opens the dialog; `linkDetail` opens the detail | `linkWindows` registry key; `linkDetail` has no key (check `link/LinkDetail.mjs`) | port |
| 18 | Custom combos | `VesselCombo` (vessels with portCall visibility), `PortCallCombo(Reset)` (label "Port: Arrival … - Departure …" in vessel zone), `CrewChangeCombo(Reset)` (with "+" that opens `CrewChangeDialog`), status / arrival / departure / security / overview combos, `ContactComboReset` | `JmapComboBox` configs; the "+" needs core card P | port + core |
| 19 | Vessel time zone | `helpers.js` `formatDateTime(value, vesselTimeZone)` and `DateTimeField.js` (`setTimezone()`): every date of a port call or crew change is shown and edited in the vessel's zone | core card 20261128-014554 (diary's analysis; shared) | core |
| 20 | Tours | 8 scenarios in `portcall/docs/scenarios` (sf/tours) | neo has no tours | gap (owner, as crew row 22) |

## 2. Dependencies

`getDependencies()` lists amd/fleet, amd/ports, amd/crew and amd/templates. The views also use amd/diary, amd/tasks,
community/addressbook, legacy/files, legacy/email and legacy/summary without declaring them.

| Module | What portcall's views use | In neo | Must be ported first? |
|---|---|---|---|
| amd/fleet | `CompanyComboReset`, `VesselChips`, `DocumentTemplateChips`, `OverviewTemplateCombo`; entities `AmdFleetCompany`, `AmdFleetVessel` (with `timezone`), `AmdFleetDocumentTemplate`, `AmdFleetOverviewTemplate`; `go.User.fleetSettings.companyId` | No fleet neo UI. crew's `view/fields.mjs` already has `companyCombo()` / `vesselCombo()` | No. portcall imports crew's field factories (crew is a declared dependency; crew's `vesselCombo()` filters crew-visible vessels; the port call dialog and the assets nav override it to active, portCall-visible ones, while the crew change dialog keeps crew's filter as classic does) and adds the chips/combos it needs as `AutocompleteChips` / `JmapComboBox` over the fleet entities. They move to fleet's `views/neo` when fleet is ported |
| amd/ports | `PortComboReset`, `PortChips`, entity `Port`; the port links | No ports neo UI; links go to classic | No: `JmapComboBox` / `AutocompleteChips` over `Port` |
| amd/crew | `VesselCombo`, `MemberCertificateTypeChips`, `MemberVoyageDialog` (Add Onsigner), `findSignLog` / `signLogHtml`, member and voyage hashes | Ported (cards 1-10, 13, 15 done): `MemberVoyageDialog.mjs`, `fields.mjs`, `certificateTypeChips`, `crewRules.mjs` `signLogEventId()`, `#crew/<entity>/<id>` routes | No. Card 10 checks that crew's `MemberVoyageDialog` takes preset values with fixed fields (crew's `fixField()`), and may need crew to export its diary sign-log lookup (today a local function in `MemberVoyageDetail.mjs`) |
| amd/templates | Backend only (document and overview generation) | — | No |
| amd/diary (undeclared, partly unguarded) | portcall's own `VesselCombo.js` 46 calls `go.modules.amd.diary.VesselCombo.superclass.initComponent` (a classic bug: the port call dialog breaks without diary; don't copy it); "View Event" link of a port call managed by Log (`AmdDiaryEvent` hash), the signers' Log column | Being analysed in parallel (`docs/neo-diary-port.md`) | No: the hash goes to classic until diary has neo routes; the Log column is guarded by `isAvailable` |
| amd/tasks (undeclared, guarded) | `TaskGrid` and `TaskDialog` in the port call dialog's Tasks tab | No neo UI | No. The neo tab shows a `Grid` over the amd/tasks entity filtered by `linkedEntity`, rows open the classic task; Add is a gap until amd/tasks is ported (open point) |
| community/addressbook | `ContactComboReset` (agency), `Contact` read for the contact details | neo UI exists | No |
| legacy/email, files, summary | `GO.email.showComposer`, detail file browser button, start page | `Mail.showComposer()`, files neo UI, `modules/summary/views/neo` | No |

**Other modules that use portcall** (their neo screens should open portcall's neo views once they exist):

| Module | Use | In neo |
|---|---|---|
| amd/crew | Voyage dialog: start / end crew change combos (`CrewChangeComboReset` with "+" → `CrewChangeDialog`). Voyage detail: links to the crew change and the port. Crew Planning: port call and crew change bands (background, no click). Crew change detail's "Crew Planning" button targets `#crewplanning/<date>` | crew `view/CrewChangeCombo.mjs` has no "+" ("portcall has no neo UI"); `MemberVoyageDetail.mjs` `entityLink()` resolves through the registry `routes`, so the links switch to portcall neo by themselves once card 1 registers them. `#crewplanning/<date>` is already handled by crew's `Extension.mjs`. Card 12 adds the "+" and checks the links |
| amd/diary | `EventDialog` `PortCallCombo`, `EventDetail` port call link, its own crew change picker (vessel / date / direction) and signer lookup over `AmdPortCallCrewChange` (`diary/views/extjs3/CrewChangeCombo.js`, `diary/controller/Event.php` 308-311) | diary analysis: it uses portcall's combo factory and routes after card 1 |
| amd/catalog | `PortCallComboReset` and the port call's `agencyContactDetails` / `deliveryAddress` in requisition / quotation / purchase order dialogs | catalog not ported: later it imports portcall's port call combo |
| amd/fleet | `VesselOverviewPanel` links to port calls and crew changes | fleet not ported |
| amd/tanks | none (comments only) | — |

**Data rule.** The upstream schema of portcall, fleet, crew and ports stays as it is; edits go only through the
existing JMAP API, the same calls the classic client makes. Nothing found needs a `neo_*` table: the saved
company and the "with port calls" flag are per-user UI state (`State`); the asset selection is already a User
property (`amdPortCallSettings.lastAssetIds`) that classic writes too.

## 3. Generic pieces that belong in neo core

Owner rule (2026-11-27, 2026-11-28): generic list / detail / dialog logic and shared libraries go to neo core.

| Piece | Today | Core card |
|---|---|---|
| Date field and formatting in a given time zone (rows 7, 11, 19) | portcall `DateTimeField.js` + `helpers.js`, diary has the same | existing 20261128-014554 (from the diary analysis); portcall's extra needs added there as a board note |
| Apply (save without closing) in `FormWindow` (rows 7, 11) | crew's module `view/applyButton.mjs`; classic `go.form.Dialog` has it everywhere | **A**: `neo-ui: FormWindow Apply button` |
| Module settings dialog with lookup lists (rows 14, 15) | crew's module `SettingsDialog.mjs` + `LookupListPanel.mjs` + `LookupDialog.mjs` (380 lines, nothing crew-specific but its definitions); the audit lists it as missing in neo | **L**: `neo-ui: lookup settings dialog (from amd/crew)` |
| `JmapComboBox` "+" that creates the entity in its dialog and selects it (row 18; classic `go.form.ComboBoxReset` `createDialog`) | done (`createDialog`, `createValues`, `mayCreate`; `docs/neo-core-components.md`) | **P**: `neo-ui: JmapComboBox create button` |
| ⋮ menu whose items load when it opens (row 12, `DynamicMenu`) | `detail/Panel.mjs` `onConstructed()` calls `createMoreMenu()` once | **O**: `neo-ui: detail Panel ⋮ menu rebuilt on open` (an async hook before the menu shows; portcall keeps the query and the output actions) |

## 4. Cards

Every card stays at M or below; each card's browser check compares with `?webclient=classic`, as a non-admin
user with portcall (write on one fleet company) and once as admin.

**Core** (project groupoffice26-neo, base `neo-ui`):

| Card | Size | Scope | After |
|---|---|---|---|
| T. (exists) 20261128-014554 `neo-ui: DateTimeField and date formatting in a given time zone` | M | from the diary analysis; portcall note added | — |
| A. `neo-ui: FormWindow Apply button` | S | `FormWindow` `applyButton` config: Apply saves without closing, a second click while saving does nothing, `save` fires; the dialog stays on the saved id (new → existing). crew's `applyButton.mjs` callers switch to it in card 12 | — |
| L. `neo-ui: lookup settings dialog (from amd/crew)` | M | Move crew's `SettingsDialog` / `LookupListPanel` / `LookupDialog` into core (`systemsettings/`), driven by lookup definitions as crew's `lookups.mjs`; crew keeps only its definitions and Rank panel. Tests; crew screens unchanged in the browser | — |
| P. `neo-ui: JmapComboBox create button` | S | Optional "+" trigger (`createDialog: () => import(…)` + values): opens the FormWindow, selects the saved entity, a closed dialog leaves the value; hidden when the user may not create | — |
| O. `neo-ui: detail Panel ⋮ menu rebuilt on open` | S | An async hook (e.g. `beforeMoreMenu()`) that rebuilds the ⋮ items for the current record each time it opens, with a loading state; a late answer for an older record is dropped | — |

**amd** (project `~/Projects/groupoffice26-neo-amd`, base `neo`). Dialogs come before the screens that embed them:

| # | Card | Size | Rows | After |
|---|---|---|---|---|
| 1 | `amd/portcall: neo skeleton` | M | 1-5, 18 (combos without the crew change combo's "+", which card 12 adds for crew; portcall's own forms don't use that combo), 19 (formatter use): registration, routes, main view with 2 empty tabs, west company combo + "with port calls" + assets nav (selection saved to `lastAssetIds`, create gate), filter slots, narrow, combos, `views/neo/PORTING.md` from section 1 | T |
| 2 | `amd/portcall: neo settings and overview settings` | M | 14, 15 | L, 1 |
| 3 | `amd/portcall: neo crew change dialog` | M | 11 (Fix dates rule, executed lock, vessel → port call) | A, T, 1 |
| 4 | `amd/portcall: neo port call dialog` | M | 7 without the Document Sets tab: fields, Now, agency fill, Managed by Log, conflict check with Reset values, Apply, Tasks tab | A, T, 1 |
| 5 | `amd/portcall: neo document sets` | M | 10: the dialog tab, `DocumentSetDialog` (create → save → reopen), the detail panel and downloads | 4 |
| 6 | `amd/portcall: neo port call list` | M | 6 | 2, 4 |
| 7 | `amd/portcall: neo crew change list` | S | 9 | 2, 3 |
| 8 | `amd/portcall: neo port call detail` | M | 8 | 3, 5 |
| 9 | `amd/portcall: neo crew change detail` | M | 12 (without the signer tables) | O, 3 |
| 10 | `amd/portcall: neo crew change signers` | M | 13: tables, Log column, Add Onsigner (crew `MemberVoyageDialog`), Offsigners dialog | 9 |
| 11 | `amd/portcall: neo portlets and link windows` | S | 16, 17 | 8, 9 |
| 12 | `amd/crew: neo uses portcall views` | S | crew voyage dialog crew change combos get "+" (card P + portcall `CrewChangeDialog`); voyage detail links open portcall's neo crew change detail; crew switches to core Apply (A) | P, 3, 9 |

Card 12 is on the crew module; it may also take crew's switch to core card L, if card L doesn't do it itself.

Board card ids: section 7.

## 5. Open points for the owner and the coordinator

- **Tasks tab** (row 7): without an amd/tasks neo UI the tab lists the linked tasks and opens them in classic; Add
  is a gap. Alternative: hide the tab in neo until amd/tasks is ported.
- **Tours** (row 20): stay classic-only, as for crew.
- **Diary "View Event"** (row 7): goes to the classic diary until the diary port registers its routes.

## 6. Additions for go:neo-port

These go into the skill (`~/Projects/go-skills/skills/neo-port/SKILL.md`); this task works only in its worktree.

- **Inventory:** list the modules that use the porting module, not only those it uses (portcall is used by crew,
  diary, catalog, fleet). Each gets a row "what their neo screens should open"; links built through the registry
  `routes` (crew `entityLink()`) switch by themselves once the routes are registered.
- **Inventory:** a module's helper that a second module would copy (crew `applyButton`, `SettingsDialog` /
  `LookupListPanel`) is a core card the moment the second port needs it; plan it in the second port's analysis.
- **Mapping row:** amd `DateTimeField` with `setTimezone()` + `helpers.formatDateTime(value, vesselTimeZone)` →
  core `DateTimeField` `timeZone` + `formatDateTime(value, timeZone)` (card 20261128-014554).
- **Mapping row:** `go.form.ComboBoxReset` with `createDialog` (the "+" in a combo) → `JmapComboBox` create button
  (core card P).
- **Mapping row:** `DynamicMenu` (menu items from a store loaded on show) → core detail ⋮ rebuilt on open (card O);
  `createMoreMenu()` alone runs once per panel.
- **Inventory:** per action, write down its own permission (write, writeAndDelete, admin-only grid delete,
  executed lock): a read-only user and a writer see different toolbars on the same record.
- **Trap:** a classic mail action that passes blobs and `links` to `GO.email.showComposer` needs the neo composer
  path with attachments; `Mail.showComposer()` may pick desktop `mailto`, which drops both.
- **Mapping row:** a fleet combo or chips needed by a second amd module before fleet is ported → import crew's
  `view/fields.mjs` factory (crew is a dependency) instead of copying it.

## 7. Board cards

Created 2026-11-28, all `--no-auto` (the coordinator starts them); `--after` follows the tables in section 4.

Core: T `20261128-014554-neo-ui-datetimefield-and-date-formatting` (from the diary analysis, portcall note added),
A `20261128-015251-neo-ui-formwindow-apply-button`, L `20261128-015251-neo-ui-lookup-settings-dialog-from-amd-c`,
O `20261128-015252-neo-ui-detail-panel-menu-rebuilt-on-open`, P `20261128-015252-neo-ui-jmapcombobox-create-button`.

amd: 1 `20261128-015352-amd-portcall-neo-skeleton`, 2 `20261128-015352-amd-portcall-neo-settings-and-overview-s`,
3 `20261128-015353-amd-portcall-neo-crew-change-dialog`, 4 `20261128-015353-amd-portcall-neo-port-call-dialog`,
5 `20261128-015353-amd-portcall-neo-document-sets`, 6 `20261128-015353-amd-portcall-neo-port-call-list`,
7 `20261128-015353-amd-portcall-neo-crew-change-list`, 8 `20261128-015354-amd-portcall-neo-port-call-detail`,
9 `20261128-015354-amd-portcall-neo-crew-change-detail`, 10 `20261128-015354-amd-portcall-neo-crew-change-signers`,
11 `20261128-015355-amd-portcall-neo-portlets-and-link-windo`, 12 `20261128-015355-amd-crew-neo-uses-portcall-views`.
