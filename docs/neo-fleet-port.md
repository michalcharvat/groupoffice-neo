# neo: amd/fleet and amd/flags port, analysis and card split (2026-11-28)

The owner asked on 2026-11-28 to plan further amd modules after crew, portcall, diary and dms ("rozpracuj si
klidne dalsi moduly, pak ti dam odpovedi na to co nebudes vedet"). This page holds the analysis of amd/fleet and
amd/flags. The work itself is in the board cards of section 7. The models are `docs/neo-crew-port.md` and
`docs/neo-dms-port.md`. Module code goes to the amd-mono branch `neo` (`~/Projects/groupoffice26-neo-amd`, see
`docs/neo-upstream-sync.md`). Core neo pieces go to `neo-ui` in this repository.

fleet is the base of 14 amd modules (`getDependencies()` of tasks, esbjobs, crew, certificates, pms, iot,
formbuilder, ihm, stabilityvalidator, diary, portcall, amdmaps, tanks, resthours). So its combos, chips and
helpers come first (card 2), before its screens: the other ports can use them while the fleet UI is still classic.

Sources read:

- `amd/fleet/views/extjs3`: 60 files, about 6,700 lines (`VesselDialog.js` 654, `VesselOverviewPanel.js` 527,
  `VesselDetail.js` 524, `Module.js` 411, `MapPanel.js` 303, `VesselCrewGrid.js` 300, `MainPanel.js` 282,
  `SettingsDialog.js` 276, `VesselGrid.js` 276)
- `amd/flags/views/extjs3`: 5 files, 300 lines; `flags/model/Flag.php` (permissions)
- `fleet/Module.php` (`getDependencies()`), `fleet/CLAUDE.md`, `fleet/controller/Vessel.php` (`overview`,
  `deactivateNonOnBoardCrew`, `visibilityModules`), `fleet/controller/VesselMap.php`, `fleet/model/DocumentTemplate.php`
- `amd/leaflet/views/extjs3/MapPanel.js` (the map fleet's `MapPanel` extends)
- the uses of fleet and flags classes in the other amd modules' `views/extjs3` (section 2)
- from GO.neo: `ModuleRegistry.mjs` (`onFormWindow`, `userSettings`, `systemSettings`, `routes`),
  `form/formExtensions.mjs`, `form/field/*` (`AutocompleteChips`, `ChipsField`, `ColorField`, `ImageField`,
  `BlobField`, `ArrayField`), `Format.mjs` (`isLightColor`), `usersettings/LookAndFeelPanel.mjs` (`timeZones()`),
  `emailtemplate/EmailTemplateGrid.mjs`, `systemsettings/EntityListPanel.mjs`, `docs/neo-core-components.md`
  (ListToolbar, entity actions, detail Panel, form extensions, FormWindow cards)
- the neo ports that exist: amd/crew (`view/fields.mjs`, `CrewMain.mjs`, `MemberDetail.mjs`), amd/formbuilder
  (`CrewOnBoardCombo.mjs`, `fieldTypes.mjs`); the diary, portcall and dms analyses
- the audit (`docs/neo-external-modules-audit.md`): fleet row, "Map" in "Missing in neo", decision D-B

A Codex review (gpt-6.2-astra) checked this page against those sources. Its findings are worked in, apart from one:
it asked for Apply in core `FormWindow`, which neo-ui already has (`applyButton`). Nothing was run in a browser. Each point marked "unverified" is something a card has to prove first.

## 1. Inventory by behaviour

### amd/flags

| # | Area | Behaviour (ExtJS source) | GO.neo | Class |
|---|---|---|---|---|
| F1 | Registration | `go.Modules.register('amd','flags')`: entity `AmdFlagsFlag` (filter `text`), one `systemSettingsPanels` entry. No main panel | `ModuleRegistry.register({package:'amd', name:'flags', capability, systemSettings})`, no `mainView` | port |
| F2 | Flag list | `SystemSettingsPanel` holds `FlagGrid`: MID, country name, country code, register; search with `text`, `mid`, `countryName`, `countryCode`, `register`; Add (module manage); row ⋮ Edit, Delete (module manage, confirm); double click edits. About 250 rows, no paging in the grid | System settings card: `Grid` with `entityActions` + `ListToolbar` (`searchFilters`), or `EntityListPanel` if it gets a search (the lookup dialog card L adds one) | port |
| F3 | Flag dialog | `FlagDialog`: MID, Country Name, Country Code, Register, all required. Permission: module users read, module managers create, edit and delete (`Flag::getPermissionLevel()`, `canCreate()`) | `FormWindow` over `AmdFlagsFlag` | port |
| F4 | Flag combo | `FlagCombo`: label `countryName (register), MID: mid` (a store `convert`, so the label also shows for a saved id when a vessel opens), sort by country name, 50 per page. Used by fleet (vessel dialog, the `flagId` filter) and amd/vessels | `flagCombo()` factory in `flags/views/neo/fields.mjs`. `JmapComboBox` shows one `displayField` and keeps only model fields on its records (`JmapComboBox.mjs` 106-112, 187-213), so a label from three properties needs core card J (crew works around it in its own `CrewChangeCombo.mjs`) | port + core J |

### amd/fleet

| # | Area | Behaviour (ExtJS source) | GO.neo | Class |
|---|---|---|---|---|
| 1 | Registration | 14 entities (`Module.js`): Company, VesselRank, Vessel (16 filters: text, name, imo, mmsi, callSign, flagId, flag, vesselTypeId, yearBuilt, dwt, gt, nt, loa, breadth, vesselTradingAreaId, enginePower, maxCrew), VesselCrew, 5 lookups, VesselLocation, ReportTag (`companyId`), VesselArea (`vesselId`), DocumentTemplate (`crews`), OverviewTemplate. `userSettingsPanels`, no system settings. `initModule` prefetches the visibility modules (row 21) | `ModuleRegistry.register({package:'amd', name:'fleet', capability, mainView, routes, userSettings})`; the filter definitions go to the `FilterPanel` config | port |
| 2 | Routes | Entity hashes `#amdfleetvessel/<id>` (`Entity.getRouterPath`), handled by `ModulePanel.route()`, which shows the record in the panel's detail view of that entity. Only `VesselDetail` is in the panel: `#amdfleetcompany/<id>` opens the module and shows nothing. `CompanyDetail.js` exists but nothing creates it | Registry `routes` for `AmdFleetVessel` and `AmdFleetCompany`; the shell resolves `#amdfleetvessel/5` case-insensitively (dms finding). Company: section 5 | port |
| 3 | Layout | `MainPanel`: west = responsive panel with the side panel (company combo north, vessel list center, filter tabs south) and the **map** in its center; the vessel detail fills the rest. Narrow mode: menu button shows the side panel, forward buttons show the map, back returns from the detail | `MainThreeColumnPanel` subclass: west = company combo + vessel list + filters, center = map (row 7), east = detail; `activatePanel()` for narrow mode | port |
| 4 | Company context | `CompanyComboReset`: the last pick is saved (`Ext.state` `amd-fleet-selected-company`), else `go.User.fleetSettings.companyId`, each only when the user can still read that company. Clearing empties the vessel list; a pick filters the list and the map (`company: {companyId}`) | `companyCombo()` (card 2), `State` for the last pick, `startCompany()` helper (card 2) | port |
| 5 | Vessel list | `VesselListGrid` (`go.NavGrid`): name; filter `isActive: true`, sort name, search; Add (module manage) opens the vessel dialog; row ⋮ Edit, Delete (the whole menu only on records with **manage** permission, Delete only for admins; `VesselListGrid.js` 62). Two separate things: the **check boxes** (one, several, select / clear all) filter the map store (`filterName: 'vesselId'`, `NavGrid.js` 65, 176), and navigating (click, arrow keys) routes to the vessel; only a click, not the arrow keys, switches narrow mode to the next panel (`MainPanel.js` 135) | `Grid` + `ListToolbar` + `entityActions`: both `mayEdit` and `mayDelete` overridden (core's default Edit needs only write, `Grid.mjs` about 1335), check box column (`multiSelect`) | port |
| 6 | Filters | `filtergrid` + `variablefilterpanel` for `AmdFleetVessel`, bound to the **map** store, not the vessel list | core `FilterPanel` (`filterTypes.mjs`). Which store it filters: section 5 | port |
| 7 | Map | `fleet.MapPanel` extends amd/leaflet's `MapPanel` with its defaults on (`leaflet/views/extjs3/MapPanel.js` 1-24): OSM tiles through `amd/leaflet/tile/{z}/{x}/{y}.png`, OpenSeaMap seamarks through `amd/leaflet/seamark`, a layer control, mouse position, a measure control, weather overlays (RainViewer radar and satellite with time playback, openportguide precipitation, wind, temperature) and a draw control whose rectangle exports that part of the map as `map-export.png`. Markers come from `amd/fleet/VesselMap/get` (filters `isActive`, company, the list's check boxes, the filter panel; an empty list without amd/vessels, which owns the AIS positions). The marker tooltip is the plain one (title and GPS, `tooltipTpl`); the richer `vesselTooltipTpl` is defined but not bound. A click routes to the vessel. Refresh button, mask while loading, redraw on show. Past track and Follow vessel are commented out (not behaviour) | **Missing:** a map component. Core cards M1 (base map) and M2 (weather, time playback, draw export), audit decision D-B | build (core M1, M2) + port |
| 8 | Settings entry | Map toolbar "Settings" (module manage) opens `SettingsDialog` (row 15) | toolbar button in the main view | port |
| 9 | Vessel detail | `VesselDetail` (go.detail.Panel; relations company, type, trading area, flag): Vessel card (ID, company, name, IMO, MMSI, call sign, flag "country (register)", type, year built, DWT, GT, NT, LOA m, breadth m, abbr, engine power kW, trading area, max crew; title "Vessel: name"); Last position card from `amd/vessels/AisLastPosition/get` by MMSI when amd/vessels is installed (nav status, SOG, COG, heading, time; vessels' translations); Overview (row 10); Manager / Crewing Manager / Bridge address cards (hidden when empty; a click opens the composer with the address and a link to the vessel); Visibility in modules (row 21); custom fields, links, comments, files, history. Toolbar: Edit (manage), Add link; ⋮ link browser, files, Download overview (`amd/fleet/overview/<id>`, PDF), Delete (admins) | core `detail/Panel` + `LinesCard`s, `Mail.showComposer()`, `download.mjs` | port |
| 10 | Vessel overview | `VesselOverviewPanel` loads `amd/fleet/Vessel/overview` (read checked on the vessel): PMS Summary (OK / due / overdue / total and report statuses with the colours of `AmdPmsJobStatus`; pms only); Crew Summary (crew on board: member links, rank; a save tool opens row 11; crew only); Crew Certificates (`AmdCrewMemberCertificate` with `memberId` of the crew on board and `skipOld`, grouped by member in crew-summary order, expiry colour from crew's `getThresholdDateColor`; crew only); Port Calls (links); Crew Changes (port, latest onsigner arrival, earliest flight home, on- and offsigners with links; portcall and crew); Counters Summary (pms). Each card only when its module is available; each remembers its collapsed state, as do the detail's other cards (`stateId`) | `LinesCard`s or `Card`s with HTML (`escapeHtml`), links through the registry routes (classic until the module is ported) | port |
| 11 | Crew list export | `CrewListExportDialog`: format (IMO Form 5 only), start and end date (both today at first, kept in order, required), download `amd/fleet/CrewList/<id>/&format=…&startDate=…&endDate=…` (XLSX) | `Dialog` + `SelectField` + `DateField`s + `download.mjs` | port |
| 12 | Vessel dialog, general | `VesselDialog` (`AmdFleetVessel`): Active, Company (required), Name (required), Timezone (combo of `go.TimeZones`), IMO, Flag (`FlagCombo`), MMSI (a change looks up the flag by the first 3 digits, `AmdFlagsFlag` filter `mid`, and sets `flagId`), Call Sign, Asset Type (required), Year Built, DWT, GT, NT, LOA, Breadth, Abbr, Engine Power, Trading Area, Max Crew. Crew accounts: `crewGroupIds` chips over `Group` (`hideUsers`, `excludeAdmins`; the server refuses admins and personal groups). Visibility in modules: one checkbox per entry of row 21. Apply and Save; the first Apply of a new vessel enables the child tabs (row 14) for the new id | `FormWindow` with `applyButton: true` (core, card `20261128-015251-neo-ui-formwindow-apply-button`, on neo-ui), `JmapComboBox`, `flagCombo()`, `SelectField` over core `timeZones()` plus the stored value when the browser's list lacks it (classic `go.TimeZones` has e.g. `Etc/UTC`), `AutocompleteChips` over `Group` | port |
| 13 | Vessel dialog, tabs | Overview Report (enabled, e-mail template combo of the amd/fleet templates, recipients, parts: `overviewSettings.titlePage`, `portCallsPage`, `crewPage`, `pmsSummaryPage`, `reportsPage`, `runningHoursPage`, `tasksPage`, `certificatesPage`); AIS Position (A, B, C, D and a drawing); Project (start date); IHM when amd/ihm is available (prepared by name, company, address, position, date, initials; designated persons as rows of name, position, initials, start, end); E-mail Addresses (Manager, Bridge, Birthday Reminder, Crewing Manager: `EmailAddressesField` = a FormGroup of name + address); Permissions (`SharePanel`). The `vesselDialogTabEvents` bus fires `extend` so amd/tanks and amd/resthours add their own tabs | `addCard()`, `ArrayField` rows, `addSharePanel()`. The bus → `onFormWindow` (`win.entityName === 'AmdFleetVessel'`), already in core: tanks and resthours register it when they are ported | port |
| 14 | Vessel dialog, child lists | Tabs disabled until the vessel is saved: Crew (`VesselCrewGrid`: name, available, created / modified; Add, Edit, Delete; "Deactivate off-board" calls `AmdFleetVessel/deactivateNonOnBoardCrew` and reports the count; the vessel's `crewOnJobReports` checkbox sits in this tab's toolbar); MSM (`VesselRankGrid`: name, active, hide from crew planning; Delete only for admins); Location (name, latitude, longitude); Areas (name, details, sort order; amd/ihm only); Log: Activity / SubActivity / Code (amd/diary's grids, diary manage only). Dialogs: `VesselCrewDialog` (vessel, member = crew `MemberCombo`, name, ranks = `VesselRankChips` of the vessel, available). A crew row may be a person who is no crew member: typing a name and saving keeps `memberId` null; picking a member sets the name and preselects the vessel's ranks that match the member's rank (`VesselCrewDialog.js` 15, 69, 95). `VesselRankDialog` (vessel, rank = crew `RankCombo`, name (a rank pick fills it and the name is stored), certificate types = crew `MemberCertificateTypeChips`, forms = formbuilder `FormChips` of the vessel's company, groups (no users, no admins), active, hide from crew planning). "Deactivate off-board" asks first; the server ticks and unticks availability both ways and fills ranks (`Vessel.php` 183-194), then the list reloads. `VesselLocationDialog`, `VesselAreaDialog` | `win.setCardDisabled(card, !win.form.currentId)`; `Grid` + `ListToolbar` per tab; `FormWindow`s; the crew and formbuilder fields as `JmapComboBox` / `AutocompleteChips` over their entities, guarded by `isAvailable()`. The diary tabs come from diary through `onFormWindow` (card 12) | port |
| 15 | Settings dialog | `SettingsDialog` (go.Window, tabs): **Company** (id, name, created / modified at and by; search with `text`, `created`, `modified`; Enter or double click edits with write; Add (module write); ⋮ Delete, Import CSV, Export CSV, and a "Settings" item that opens the same dialog again; batch edit; double click edits with write); **Vessels** (`VesselGrid`: every vessel column plus one checkbox column per visibility module; Show disabled toggle (`isActive: 'all'`); search; Add (module manage); ⋮ Delete, Import, Export; batch edit; double click edits with write); five lookup lists (Vessel Handling Gear, Engine Type, Pumping System, Trading Area, Asset Type: name only, search, Add, row Edit / Delete); E-mail Templates (`go.emailtemplate.GridPanel`, module amd/fleet); Document Templates (name, extension, crewing; Active only toggle; search; row Edit, Delete with confirm; dialog: template file (an upload fills an empty name from the file name), name, sort order, active, crews); Overview Templates (the same without crews). The Vessels tab's search has `created` / `modified` too and Enter edits | the core lookup settings dialog (card L) with the five lookups and extra tabs; `ListToolbar` (`moreItems` with import, `batchEdit`), `importFile.mjs`, `exportEntities.mjs`, `EmailTemplateGrid` (`templateModule`), `BlobField` for the template file | port (core L) |
| 16 | Company dialog | `CompanyDialog`: name, logo (`go.form.ImageField`, `logoBlobId`), crew accounts (account prefix, e-mail domain, a note that only admins may change them); Report Tags tab (`ReportTagGrid`: name, colour; dialog name + colour, `companyId`); Email Templates tab (`EmailTemplateGrid` with key `company-<id>`); Permissions (`SharePanel`). Both tabs disabled until saved | `FormWindow`, `ImageField`, `ColorField`, `EmailTemplateGrid` (`key`, `setKey()`) | port |
| 17 | Company detail | `CompanyDetail` (name; custom fields, links, comments, files, history; Edit (write), Print, link browser, Delete (writeAndDelete)) is written but never shown (row 2) | core `detail/Panel` if the owner wants the company route to show it (section 5) | open |
| 18 | Combos and chips | `CompanyCombo(Reset)`, `CompanyChips`, `VesselCombo` (option `modulesVisibility`, 50 per page), `VesselChips`, `VesselRankCombo` (active), `VesselRankChips`, `VesselCrewCombo`, `VesselLocationCombo` / `Chips`, `VesselAreaCombo`, the five lookup combos, `OverviewTemplateCombo` (active), `DocumentTemplateChips` (active, by sort order), `EmailTemplateCombo(Reset)` (amd/fleet templates), `ReportTagChips` (coloured chips; filtered by the company; the list offers "create" for any non-empty text, also when some tags match, and creates the tag for the company; `setCompanyId()` changes both the suggestions and the company of a new tag, `ReportTagChips.js` 113-150) | factories in `fleet/views/neo/fields.mjs` (card 2). Coloured chips and create-from-text: core card K | port + core K |
| 19 | Helpers for other modules | `resolveStartVessel(stateKey, combo)` (pms, resthours): the saved vessel, else `fleetSettings.vesselId`, only when readable, dropped when the user picks first; `util.getFontColorBasedOnBackground` (diary tag colours); `visibilityModules` / `visibilityEvents`; `vesselDialogTabEvents` (tanks, resthours) | `startVessel()` / `startCompany()` in card 2; core `Format.isLightColor()` replaces the colour util; `visibilityModules()` in card 2; the tab bus → core `onFormWindow` | port |
| 20 | User settings | `UserSettingsPanel` (My account → Fleet): default company (`fleetSettings.companyId`) and default vessel (`fleetSettings.vesselId`, the combo filtered by the picked company; picking another company clears the vessel) | registry `userSettings` card (`docs/neo-core-components.md` "neo user settings") | port |
| 21 | Visibility modules | `AmdFleetVessel/visibilityModules` returns `[{module, column, label}]` of the installed modules that added a `visibleIn*` column; fleet builds the Vessels list columns (row 15), the dialog checkboxes (row 12) and the detail card (row 9) from it | `visibilityModules()` in card 2: one request per login, cached, reset on `logout` / `userChanged` | port |

Not behaviour: `ViewGrid.js` (a static list of views, unused), the commented-out marker menu (past track, follow) in
`MapPanel.js`, the "Settings" item inside the Company tab's ⋮ (it opens the dialog that holds it).

## 2. Dependencies

`fleet/Module.php` `getDependencies()`: amd/flags and amd/leaflet (fleet's `MapPanel.js` extends amd/leaflet's).
flags has none.

What fleet's views use from other modules:

| Module | What fleet's views use | Declared, guarded | In neo |
|---|---|---|---|
| amd/flags | `FlagCombo`, `AmdFlagsFlag` (MMSI → flag lookup) | declared | card 1 |
| amd/leaflet | `MapPanel` (tiles, markers) | declared | core map cards M1, M2; fleet passes amd/leaflet's tile proxy URLs (section 5) |
| amd/crew | `MemberCombo` (crew dialog), `RankCombo`, `MemberCertificateTypeChips` (rank dialog), `helpers.getThresholdDateColor`, `AmdCrewMember(Certificate)` links and store | **not declared**; the overview checks `isAvailable`, the crew and rank dialogs do **not** (classic breaks them without crew) | crew neo exists. Fleet neo uses `JmapComboBox` over the entities behind `isAvailable('amd','crew')`, not crew's classes (fleet must work without crew) |
| amd/formbuilder | `FormChips` in the rank dialog | not declared, not guarded | `AutocompleteChips` over the form entity behind `isAvailable` |
| amd/pms | `FileButtonField` (document and overview template dialogs), `AmdPmsJobStatus` (overview) | not declared; the template dialogs are not guarded (without pms, Add / Edit of a template fails; the lists still open) | core `BlobField` replaces `FileButtonField`; the job statuses behind `isAvailable` |
| amd/diary | `ActivityGrid`, `SubActivityGrid`, `CodeGrid` in the vessel dialog | not declared, guarded (diary manage) | inverted: diary adds the tabs through `onFormWindow` (card 12) |
| amd/ihm | Areas tab and IHM tab of the vessel dialog | not declared, guarded | fleet keeps them (fleet's own entity and columns) behind `isAvailable('amd','ihm')` |
| amd/vessels | `AisLastPosition/get` (detail), the AIS table behind `VesselMap/get` | not declared, guarded (client and server) | fleet keeps the guard |
| amd/portcall | `AmdPortCall`, `AmdPortCallCrewChange` links in the overview | not declared, guarded | links through the registry routes |
| amd/tanks, amd/resthours | add vessel dialog tabs through `vesselDialogTabEvents` | they depend on fleet | `onFormWindow`, when they are ported (no card here) |
| core | `go.emailtemplate.GridPanel`, `go.form.ImageField`, `colorfield`, `go.form.BatchEditDialog`, `go.util.importFile` / `exportToFile`, `go.TimeZones`, `go.showComposer` | — | all exist in neo core (`EmailTemplateGrid`, `ImageField`, `ColorField`, `BatchEditButton`, `importFile.mjs`, `exportEntities.mjs`, `LookAndFeelPanel.timeZones()`, `Mail.showComposer()`) |

Who uses fleet and flags (`views/extjs3` of the other amd modules):

| fleet / flags piece | Used by | What the neo port of the user should do |
|---|---|---|
| `VesselCombo` (`modulesVisibility`) | amdmaps, catalog, crew, esbjobs, pms, tanks, tasks | import `vesselCombo({module})` from `fleet/views/neo/fields.mjs` (card 2) |
| `CompanyCombo(Reset)`, `CompanyChips` | crew, pms, formbuilder, portcall, tanks | `companyCombo()` / `companyChips()` from fleet |
| `VesselRankCombo` | crew | `vesselRankCombo()` from fleet |
| `VesselChips` | portcall | `vesselChips()` from fleet |
| `DocumentTemplateChips` | crew, portcall | `documentTemplateChips()` from fleet |
| `OverviewTemplateCombo` (by its xtype, `OverviewTemplateCombo.js` 21) | portcall (`OverviewSettingsDialog.js` 142) | `overviewTemplateCombo()` from fleet |
| `ReportTagChips` | diary, pms | `reportTagChips({companyId})` from fleet (colours and create after core card K) |
| `VesselLocationCombo` / `Chips` | diary | from fleet |
| `VesselAreaCombo` | ihm | from fleet |
| `util.getFontColorBasedOnBackground` | diary | core `Format.isLightColor()` |
| `resolveStartVessel` | pms, resthours | `startVessel()` from fleet |
| `vesselDialogTabEvents` | tanks, resthours | `onFormWindow` |
| `FlagCombo` | vessels | `flagCombo()` from flags |
| `VesselFilter` (a filter type) | stabilityvalidator | nothing: fleet defines no `VesselFilter` (a classic bug in stabilityvalidator's `Module.js` 87); its port uses a combo filter type |
| entity links to `AmdFleetVessel`, `AmdFleetCompany` | crew neo (`MemberDetail`, `MemberVoyageDetail`, `entityLink()`), and every module's detail | nothing: they go through the registry routes, so they open fleet neo once card 3 registers them (classic until then) |

What the ported and planned modules do today instead:

- **crew** (ported) keeps fleet's combos in its own `views/neo/view/fields.mjs` (`companyCombo`, `companyChips`,
  `vesselCombo` with `modulesVisibility: crew`, `vesselRankCombo`), with a comment that they move to fleet. Its
  company preselect (`CrewMain.mjs` about line 634) is a copy of fleet's rule. Its document picker queries
  `AmdFleetDocumentTemplate` directly. Its links to vessels and companies open classic.
- **formbuilder** (ported) has `CrewOnBoardCombo` over `AmdFleetVesselCrew` and renders `AmdFleetVesselCrew`
  names; it stays (formbuilder's own field type).
- **portcall** (planned, `docs/neo-portcall-port.md`) imports crew's `companyCombo()` / `vesselCombo()` and builds
  `VesselChips`, `DocumentTemplateChips`, `OverviewTemplateCombo` itself.
- **diary** (planned, `docs/neo-diary-port.md`) builds `ReportTagChips` (with colours and inline create),
  `VesselLocationChips` and the tag colour itself, and left open whether its grids go into fleet's vessel dialog
  (its row 22).
- **dms** does not use fleet's views.

Card 2 moves the fleet factories into `fleet/views/neo/fields.mjs` and switches crew to them (crew re-exports
the old names for one step, so the running diary and portcall cards don't break). It must not change what crew
users see: crew's `vesselCombo` defaults to crew-visible vessels while fleet's plain combo has no visibility
filter, and crew's company preselect falls back to *all companies* and ignores `fleetSettings.companyId`
(`CrewMain.mjs` 553-585), while fleet's falls back to that default. So the factories keep each caller's default
as an option (`vesselCombo({module: 'crew'})`), and `startCompany()` takes the fallback as a parameter. Notes on the diary and portcall
cards tell them to import from fleet. Because fleet is a declared dependency of all 14 modules, importing fleet's
`views/neo` files from them is safe; fleet itself must not import from crew, pms, diary or formbuilder.

**Data rule for every card.** The upstream schema of fleet, flags and the modules they touch stays as it is.
Business edits go only through the existing JMAP API, the same calls the classic client makes. Nothing found
needs a `neo_*` table: the last picked company is per-user UI state (`State`), the defaults are the existing
`fleetSettings` user property.

## 3. Pieces for neo core

| Card | What | Other users |
|---|---|---|
| M1 (new) | `GO.map.Map`, base: a Leaflet map as a main-thread addon in core (Leaflet, marker cluster, mouse position and measure plugins vendored or from npm in core, **not** loaded from amd/leaflet; core must run without amd modules). Configs: base layers and overlays (`[{name, url, attribution, overlay, maxZoom}]`, a layer control; no default that leaks to a third party without the owner's decision, section 5), center, zoom, `mousePosition`, `measure`; markers (`[{id, lat, lng, title, tooltipHtml, color}]`, tooltips escaped by the caller), `markerClick` event, `fitBounds()`, `setView()`, redraw on show and resize, mask while loading, light and dark theme | fleet (card 11), amdmaps, buoys, iot, maps, ports, submarinecable, vessels, windfarms, yards (audit "Map", decision D-B) |
| M2 (new) | `GO.map.Map` options of amd/leaflet that fleet's map has on: weather overlays with time playback (time dimension plugin, RainViewer radar and satellite, openportguide tiles), and the draw control whose rectangle exports that part of the map as a PNG (`map-export.png`). The other plugins (AIS track symbols, GRIB, GPS jamming, FreieTonne) come with their first users | fleet, amdmaps, iot |
| K (new) | `AutocompleteChips` / `ChipsField`: a colour per chip (`chipRenderer` may return `{text, color}`; text colour from `Format.isLightColor()`), and create-from-text (`createNew: async text => id`, classic `allowNew`: the list offers "create '…'" for any non-empty text, also when some entries match; picking it creates the entity with extra values the host may change at any time, e.g. the company, and adds its chip) | fleet `ReportTagChips` (diary, pms), comment labels, any tag chips |
| J (new) | `JmapComboBox`: a display text built from several properties (`displayRenderer: entity => text`, with the extra `properties` fetched), used both in the list and for a preset id (`JmapComboBox.mjs` 187-213 shows `displayField` only; crew's `CrewChangeCombo.mjs` works around it in its own class). Size S | flags (`countryName (register), MID: mid`), crew crew-change combo, portcall port call combo, dms folder combo (`parent / name`) |
| L (exists) | the lookup settings dialog in core, `20261128-015251-neo-ui-lookup-settings-dialog-from-amd-c` (crew, portcall, dms) | fleet's Settings dialog is its fourth user: five name-only lookups plus extra tabs (Companies, Vessels, E-mail templates, Document templates, Overview templates). A note on the card says so |

Considered and left out of core: the vessel visibility columns (fleet data), the overview summary cards (fleet's
own `Vessel/overview`), `startVessel()` (fleet's `fleetSettings` rule; other modules import it from fleet).

## 4. Cards

Every card stays at M size or below. A card's browser check compares its screens with `?webclient=classic`, as a
non-admin user with fleet (read on one company, manage on another) and once as admin.

**Core** (project groupoffice26-neo, base `neo-ui`): M1, M2 (after M1), K and J from section 3; a note on the
existing card L. Apply in `FormWindow` exists already (`applyButton`, merged on neo-ui).

**Routes:** a registered route wins over the classic fallback (`link/linkTypes.mjs` `resolveRoute()`), so crew's
and the search's links to vessels and companies switch to neo the moment fleet registers them. The skeleton
therefore registers no entity route: card 6 adds `AmdFleetVessel` with the working detail, card 8 adds
`AmdFleetCompany` with its destination. Until then the links open classic, as now.

**amd** (project `~/Projects/groupoffice26-neo-amd`, base `neo`). Dialogs come before the screens that open them:

| # | Card | Size | Rows | After |
|---|---|---|---|---|
| 1 | `amd/flags: neo port` | S | F1-F4: registration, System settings card with search, flag dialog, `flags/views/neo/fields.mjs` `flagCombo()`, `views/neo/PORTING.md` | J |
| 2 | `amd/fleet: neo fields and helpers` | M | 18, 19, 21: `fleet/views/neo/fields.mjs` with every factory of row 18 (the coloured chips and create-from-text of `reportTagChips` come in card 8), `startCompany()` / `startVessel()` (readable check, the user's own pick wins, the fallback a parameter), `visibilityModules()` (cached, reset on logout); crew switches to them with its current defaults unchanged (re-exports its old names once); tests for the helpers; `fleet/views/neo/PORTING.md` from section 1 | 1 |
| 3 | `amd/fleet: neo skeleton` | M | 1, 3-6, 8, 20: registration (`userSettings`; no entity routes yet, see above), main view (west company combo + vessel list with check boxes + filter panel, center placeholder until card 11, east detail placeholder), narrow mode, vessel list ⋮ (only with manage, Delete for admins; Add / Edit wired once card 4 lands), Settings button (wired with card 9), user settings card | 2 |
| 4 | `amd/fleet: neo vessel dialog` | M | 12, 13: general fields, MMSI → flag, time zone, crew groups, visibility checkboxes, Overview Report, AIS, Project, IHM (ihm only), e-mail address rows, permissions, Apply; wires Add / Edit in the list; check that an `onFormWindow` tab of another module shows (a test) | 3 |
| 5 | `amd/fleet: neo vessel crew assignments` | M | 14 (Crew tab): the crew list, its dialog (free-text name without a member, member pick fills the name and preselects matching ranks), Deactivate off-board with confirm and reload, the `crewOnJobReports` checkbox; disabled until saved, enabled by the first Apply; crew fields behind `isAvailable` | 4 |
| 5b | `amd/fleet: neo vessel ranks, locations and areas` | M | 14 (MSM, Location, Areas tabs): lists and dialogs; rank pick fills the stored name, certificate types and forms behind `isAvailable` (crew, formbuilder), groups without users and admins, Delete of ranks for admins; Areas only with ihm | 4 |
| 6 | `amd/fleet: neo vessel detail` | M | 2 (vessel route), 9: registers the `AmdFleetVessel` route, cards with remembered collapse state, Last position (vessels only), address cards with the composer, visibility card, custom fields, links, comments, files, history, Edit, Download overview, Delete (admins) | 4 |
| 7 | `amd/fleet: neo vessel overview` | M | 10, 11: the overview cards behind their modules, crew certificates grouped by member, links through the registry, the crew list export dialog | 6 |
| 8 | `amd/fleet: neo company dialog and report tags` | M | 2 (company route), 16, 17 (the company detail, unless the owner decides otherwise, section 5), 18 (`reportTagChips` with colours and create for the company): registers the `AmdFleetCompany` route, company dialog with logo, crew accounts, report tags list and dialog, company e-mail templates (key `company-<id>`), permissions | 3, K |
| 9 | `amd/fleet: neo settings dialog` | M | 15 without the templates: the core lookup dialog with the five lookups, Companies (search with created / modified, Enter / double click edit, Add, ⋮ Delete / Import / Export, batch edit) and Vessels (all columns, visibility columns, Show disabled, Add, ⋮, batch edit); wires the Settings button | 4, 8, L |
| 10 | `amd/fleet: neo settings templates` | S | 15 (templates): E-mail templates (core grid), Document templates, Overview templates (search, Edit, Delete, `BlobField`, name from the file name, Active only) | 9 |
| 11 | `amd/fleet: neo map` | M | 7: map in the center with amd/leaflet's tiles and seamarks, weather, measure, mouse position, draw export (by config), markers from `VesselMap/get` with the company, check box and filter panel filters, the plain tooltip, click routes to the vessel, Refresh, mask | 3, M1, M2 |
| 12 | `amd/diary: neo vessel dialog tabs` | S | 14 (diary part): diary registers `onFormWindow` for `AmdFleetVessel` and adds its Activity, SubActivity and Code lists (from its settings lists card), diary manage only, disabled until saved | 4, `20261128-014947-amd-diary-neo-settings-lists-and-dialogs` |

amd/tanks and amd/resthours add their vessel dialog tabs when they are ported (`onFormWindow`); no card here.

## 5. Open points for the owner and the coordinator

- **Company route** (rows 2, 17): classic `#amdfleetcompany/<id>` opens fleet and shows nothing; `CompanyDetail`
  exists but is unused. Card 8 plans: the company route shows `CompanyDetail` in the east panel (name, logo,
  custom fields, links, comments, files, history, Edit, Delete). Alternative: the route opens the company
  dialog. Owner decides; card 8 does the detail unless told otherwise.
- **What the filter panel filters** (row 6): classic applies the saved filters to the map only, not to the vessel
  list. Card 3 keeps that (the filters wait for the map of card 11). If the owner wants them to filter the list
  too, card 3 binds them to both.
- **Map tiles** (row 7, core card M1): classic loads tiles through amd/leaflet's proxy (`amd/leaflet/tile`,
  `amd/leaflet/seamark`). Core M1 takes tile layers as config and has no amd URL in it; fleet passes amd/leaflet's
  URLs (fleet depends on amd/leaflet). Open: does core get a default tile layer for modules without amd/leaflet
  (direct OSM sends the user's IP to openstreetmap.org), or no default?
- **Leaflet library copy** (core card M1): amd/leaflet vendors Leaflet and its plugins in `views/extjs3/lib`.
  Core needs its own copy (npm `leaflet` and `leaflet.markercluster` in `www`, or a vendored one); classic keeps
  amd/leaflet's.
- **Classic bugs found, not neo work** (26.0.x, for the owner to schedule): fleet's crew and rank dialogs use crew
  and formbuilder classes without checking the modules, the template dialogs use pms's `FileButtonField`
  (fleet declares neither); stabilityvalidator's filter type `go.modules.amd.fleet.VesselFilter` does not exist;
  the Company tab's ⋮ "Settings" opens the dialog it is in.
- **Backend, 26.0.x**: `Vessel/overview`, `Vessel/visibilityModules`, `Vessel/deactivateNonOnBoardCrew` and
  `VesselMap/get` have no `@apiPermission` (and the readers no `@apiReadOnly`); `overview` and
  `deactivateNonOnBoardCrew` check the vessel's permission themselves. A 26.0.x card should add the tags
  (`tests/go/core/jmap/ControllerPermissionTest.php`).
- **Tag text colour**: core `Format.isLightColor()` (brightness above 125) and classic's luminance rule differ for
  mid tones: on `#808080` classic writes white, core picks dark text. Card 8 uses core's rule unless the owner
  wants classic's exact colours.
- **Report tags for diary and pms**: their tag fields reach classic parity only after core K and card 8; until
  then they use plain `reportTagChips()` from card 2 (no colours, no create).
- **amd/pms** is analysed in parallel (`20261128-022001-amd-pms-neo-port-analysis-and-card-split`): pms uses
  `CompanyCombo`, `VesselCombo`, `ReportTagChips` and `resolveStartVessel`; its cards should import them from
  fleet's card 2 (a board note on that task says so).

## 6. Additions for go:neo-port

These go into the skill (`~/Projects/go-skills/skills/neo-port/SKILL.md`). This task doesn't edit the skill.

- **Inventory:** for a base module (fleet), list every other module that uses its combos and helpers and plan the
  field factories as the first card, before its screens; the users import them while its UI is still classic.
- **Inventory:** check which other modules a dialog uses without `isAvailable` and without declaring them (fleet's
  crew, formbuilder and pms fields). The neo port uses `JmapComboBox` over the entity behind `isAvailable`, not the
  other module's class.
- **Inventory:** a module that embeds another module's grids in its own dialog (diary's grids in fleet's vessel
  dialog) is inverted in neo: the embedded module adds its tab through `onFormWindow`, so the host does not depend
  on it.
- **Mapping row:** a tab bus like `vesselDialogTabEvents` (`fireEvent('extend', dialog)`) → core `onFormWindow`
  (`win.entityName === …`, `win.addCard()`).
- **Mapping row:** `go.TimeZones` combo → `SelectField` over `timeZones()` from `src/usersettings/LookAndFeelPanel.mjs`.
- **Mapping row:** a "readable text colour on a background" helper → `Format.isLightColor(hex)`.
- **Mapping row:** `go.emailtemplate.GridPanel` with `module` and `setKey()` → `EmailTemplateGrid`
  (`templateModule`, `key`, `setKey()`).
- **Mapping row:** amd/leaflet `MapPanel` → core `GO.map.Map` (cards M1, M2) with the tile URLs passed by the
  module. Inventory the inherited defaults (`drawControl`, `measureControl`, `enableWeatherLayers`,
  `enableTimeDimension`, `enableMousePosition`): a subclass that sets nothing has them all on.
- **Inventory:** a module registering an entity route takes over every link to that entity from classic
  (`resolveRoute()`); register a route only in the card whose screen can show it.
- **Mapping row:** a `go.NavGrid` has two inputs: its check boxes filter another store, its navigation opens a
  record; port both.

## 7. Board cards

Created 2026-11-28, all `--no-auto`. Core: by their letter; amd: by their number in section 4.

- J `20261128-024140-neo-ui-jmapcombobox-display-text-from-se`
- K `20261128-024140-neo-ui-coloured-chips-and-create-from-te`
- M1 `20261128-024141-neo-ui-go-map-map-leaflet-addon-base`
- M2 `20261128-024154-neo-ui-go-map-map-weather-time-playback`
- L (existing, note added) `20261128-015251-neo-ui-lookup-settings-dialog-from-amd-c`
- 1 `20261128-024216-amd-flags-neo-port`
- 2 `20261128-024217-amd-fleet-neo-fields-and-helpers`
- 3 `20261128-024217-amd-fleet-neo-skeleton`
- 4 `20261128-024238-amd-fleet-neo-vessel-dialog`
- 5 `20261128-024238-amd-fleet-neo-vessel-crew-assignments`
- 5b `20261128-024239-amd-fleet-neo-vessel-ranks-locations-and`
- 6 `20261128-024239-amd-fleet-neo-vessel-detail`
- 7 `20261128-024304-amd-fleet-neo-vessel-overview`
- 8 `20261128-024305-amd-fleet-neo-company-dialog-and-report`
- 9 `20261128-024306-amd-fleet-neo-settings-dialog`
- 10 `20261128-024307-amd-fleet-neo-settings-templates`
- 11 `20261128-024307-amd-fleet-neo-map`
- 12 `20261128-024308-amd-diary-neo-vessel-dialog-tabs`

Notes about importing fleet's factories went to the diary skeleton, diary event dialog, diary settings lists,
portcall skeleton and pms analysis cards.
