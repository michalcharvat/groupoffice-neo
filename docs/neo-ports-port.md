# neo: amd/ports port, analysis and card split (2026-11-28)

The owner asked on 2026-11-28 to plan the next amd modules after crew, portcall, diary and dms ("rozpracuj si
klidne dalsi moduly"). This page covers amd/ports. amd/templates and amd/links have their own pages
(`docs/neo-templates-port.md`, `docs/neo-links-port.md`). The models are `docs/neo-crew-port.md` and
`docs/neo-dms-port.md`. Module code goes to the amd-mono branch `neo` (`~/Projects/groupoffice26-neo-amd`, see
`docs/neo-upstream-sync.md`). Core pieces go to `neo-ui` in this repository.

Sources read:

- `amd/ports/views/extjs3`: 23 files, about 1,950 lines (`MainPanel.js` 317, `PortDetail.js` 279, `UnlocodeGrid.js`
  277, `PortDialog.js` 217)
- `ports/Module.php` (`getDependencies()`: amd/leaflet), the filters in `ports/model/Port.php`, the controllers,
  `amd/leaflet/views/extjs3/MapPanel.js` (the map the detail uses)
- every amd module that uses ports (grep for `amd.ports.`, `amd\ports`)
- from GO.neo: `ModuleRegistry.mjs` (keys), `customfields/types.mjs`, `form/field/*` (no map, no CodeField yet on
  this base), `grid/Grid.mjs` (`entityActions`), `import/`, `export/`

Nothing was run in a browser. Points marked "unverified" are for the card to prove first.

## 1. Inventory by behaviour

| # | Area | Behaviour (ExtJS source) | GO.neo | Class |
|---|---|---|---|---|
| 1 | Registration | `go.Modules.register('amd','ports')`: entities `Port` (relations country, creator, modifier; filters `text`, `countryId` with `CountryCombo`, `serviceId` with `ServiceChips`), `PortCountry`, `PortService`, `PortCompanyService` (company → Contact, services), `PortUnlocode`; `customFieldTypes` (row 12); `systemSettingsPanels` (row 11). The main panel is added **only with `mayManage`** (`Module.js` 5-9); the entities, combos and the custom field type are there for every user with access (a read-only user picks ports in other modules) | `ModuleRegistry.register({package:'amd', name:'ports', capability, mainView, routes, systemSettings})`. Registry `available` hides **every** contribution of the module (`ModuleRegistry.mjs` `#accessible()`), so it cannot be the manage gate: the app alone needs the manage gate (P1 checks how: a second registration without `mainView`, or a small core key for an app-only check) | port |
| 2 | Layout | Responsive: west = port grid (tab) + side panel (country list north, filter panel center); center = port detail. Narrow: menu button shows the side panel, a forward arrow on the country list and a row click go to the grid, back arrow on the detail goes to `#ports` | `MainThreeColumnPanel` subclass: west = countries + filters, center = grid, east = detail | port |
| 3 | Country list | `CountryGrid`: check list over `PortCountry` (name, ISO name), select all, no headers. Selection sets the grid filter `countryId: [ids]` and the country for Add; Add is disabled without a country. Title bar: Add (country dialog). Row ⋮: Edit (`CountryDialog`: name), Delete (confirm). The store loads the countries first, then the ports | `list/CheckList.mjs` (or `Grid` with check selection) + row ⋮ via `entityActions` | port |
| 4 | Filters | `filteraddbutton`, `filtergrid`, `variablefilterpanel` over `Port`. Server filters (`Port.php`): `id`, `name`, `countryName`, `countryId`, `incomplete`, `incompleteAny`, `serviceid` (lower case; core lowercases filter names, `Filters.php` 60, 345, so the client's `serviceId` works) | `view/FilterPanel.mjs` + `filterTypes.mjs` | port |
| 5 | Port list | `PortGrid`: id (hidden), name (auto expand), UN/LOCODE, latitude, longitude, country, created / modified at and by. `tbsearch` `text`, `name`, `modified`, `created`. Add (primary, needs a selected country, prefills `countryId`). Batch edit only when `Port` has custom field sets. ⋮: Import CSV (lookup fields `id` / `unlocode`, field labels for name, countryId, unlocode, latitude, longitude, country, zoom), Export CSV of the current filter, Settings (manage, row 11). Double click / Enter opens the dialog; selection routes to the classic hash `#port/<id>` (`MainPanel.js` 274; neo: `#ports/port/<id>`, and an old `#port/<id>` bookmark must still open it). Custom field columns from the `Port` field sets; created at and both user columns hidden by default, modified at shown; grid state saved | `Grid` + `JmapStore` + `ListToolbar` (search, ⋮ export, multi select), `BatchEditButton`, `importFile()` with the mapping options, `exportEntities()` | port |
| 6 | Port dialog | `PortDialog` (`titleField: name`): "Update from" `UnlocodeCombo` (paged, text "name (CC) locode"); picking one fills name, UN/LOCODE, latitude, longitude and looks up the country by the first two letters (`PortCountry/query` text filter, match on `isoName`), then the time zones. `sourceId` is never submitted (`beforesubmit` deletes it). Name, country (sets the time zones), **time zone**: options are the selected country's `timezones`; a picked country replaces a zone that is not its own with its only zone or clears it; on load only the options change, so the form stays clean. UN/LOCODE (`CC LLL`), latitude, longitude (required), zoom 1-20 (default 8). Alternative names: `formgroup` `aliases` (`{id, name}`) | `FormWindow`; `JmapComboBox` over `PortUnlocode` with an item renderer; `SelectField`/`LocalCombo` whose options are set at run time; `ArrayField` for `aliases`; a `submit` hook drops `sourceId`. Also: custom field fieldsets (and their own tabs) of `Port`; after saving a new port classic redirects to its detail (inherited), the company service dialog does not | port |
| 7 | Company services | Tab "Company Services" in the port dialog: `CompanyServiceGrid` over `PortCompanyService` filtered by `portId` (company name, services one per line sorted by name), Add (prefills `portId`), row ⋮ Edit / Delete. `CompanyServiceDialog`: company & contact (`ContactCombo`, organisations and persons, no "+"), services (`ServiceChips`), comment. **Classic bug**: in a new port the grid's Add sends `portId: undefined` (it is set only on load) | Grid in a `FormWindow` card (crew voyage records pattern: `ownsEnterKey()`), `JmapComboBox` over `Contact`, `AutocompleteChips` over `PortService`; Add disabled until the port is saved | port |
| 8 | Port detail | `PortDetail` (`go.detail.Panel`, relation country): Port section (ID, name, country, UN/LOCODE, GPS, time zone if set, alternative names joined), Services section (company link to `#<Contact route>`, services, comment with line breaks; hidden when empty), map (row 9), custom fields, links, comments, files, history. Toolbar: Add company service (`ic-location-city`, prefills `portId`), Edit (write), add-link button, ⋮ link browser, file browser (legacy files), Print, Delete (writeAndDelete) | core `detail/Panel` + `LinesCard` for the services, `CustomFields` / links / comments / files / history from the detail panel | port |
| 9 | Map | `go.modules.amd.leaflet.MapPanel` (`lightweight`, height 400): centred on the port at the panel's own zoom 13 (not the port's zoom field), one marker with title and "GPS: lat, lng", markers cleared on the next record, drawn when the map is ready. Lightweight still shows the OpenSeaMap seamark overlay. Tiles through the amd/leaflet proxy (`amd/leaflet/tile/{z}/{x}/{y}.png`) | **missing**: core `GO.map.Map` (card `20261128-023058`) | build (core) |
| 10 | Delete of a used port | A port still in use comes back in `notDestroyed`; its `description` is server-built, encoded HTML listing what uses it. Classic shows it in `GO.errorDialog`. A multi delete from the grid can **partly** succeed: free ports are destroyed, each blocked one has its own `notDestroyed` entry (`controller/Port.php` 83-98); classic reports per item | neo `client.set()` throws the first error and `data/destroyEntities.mjs` does not return the destroyed ids: P3 shows each blocked port's sanitized description and refreshes the destroyed ones; if that needs a core change in `destroyEntities`, ask for it | port (core change possible) |
| 11 | Settings | Same two tabs in the ⋮ Settings dialog (`SettingsDialog`, manage) and in System settings (`SystemSettingsPanel`): **Services** (`ServiceGrid`: search, Add, row ⋮ Edit / Delete; `ServiceDialog`: name) and **UN/LOCODE** (`UnlocodeGrid`: 19 data columns, nine function flags as checks, no cell editing, sort by name, search `text` / `name`, ⋮ Import CSV with lookup `locode`, Export CSV). Both this grid and the company services grid inherit Delete of the selected rows (key and toolbar) from `GridTrait` | core module settings dialog with lookup lists (D7, `20261128-020115`) for Services; a plain `Grid` card for UN/LOCODE; registry `systemSettings` opens the same panel | port |
| 12 | Custom field type | `customfield/Port.js`: a custom field holding a port id: form field `PortCombo`, detail value = link to the port (or "Not found or no access"), grid column = port name (prefetched), filter `PortCombo` (multiple, wildcards). **Classic bug**: `getDialog()` returns `new go.modules.amd.ports.customfield.PortDialog()`, a class that does not exist | **missing**: module custom field types in neo (card `20261128-023110`); the admin side has the `customFieldsAdmin` key | build (core) + port |
| 13 | Combos and chips | `PortCombo` (xtype `amdportsportcombo`), `PortComboReset`, `PortChips` (`portIds`), `CountryCombo` (`amdportscountrycombo`), `ServiceCombo`, `ServiceChips`, `UnlocodeCombo`: used by other modules (section 2) | `JmapComboBox` / `AutocompleteChips` factories exported from `ports/views/neo` as the module's public neo API | port |

Classic `MainPanel.onCountrySelectionChange` resets `this.addContryId` (typo), so after the user clears the country
selection, Add stays enabled with the last country. The neo port takes the country from the current selection.

## 2. Dependencies and users

`getDependencies()`: amd/leaflet (the map panel). No undeclared cross-module use in the views except
`community/addressbook` (`ContactCombo` in the company service dialog, the Contact route in the detail). It is more than
a view dependency: `install.sql` references `addressbook_contact` and the company service sort joins it
(`CompanyService.php` 92). The address book is installed by default and has a neo UI; the current user's Contact access
decides what the company names show. The detail's file browser item checks `legacy/files`.

Modules that use ports, and what they should open once ports is ported:

| Module | Uses | Today in neo | After the port |
|---|---|---|---|
| amd/portcall (planned, `docs/neo-portcall-port.md`) | `PortComboReset` (port call dialog), `PortChips` (overview settings), port links; its `Module.js` filter uses `go.modules.core.ports.PortCombo` (**wrong namespace in classic**: that filter cannot work) | plans `JmapComboBox` / `AutocompleteChips` over `Port` directly | import ports' combo / chips factories; port links go to `#ports/port/<id>` |
| amd/crew (ported) | voyage detail loads `Port` and links to it (`MemberVoyageDetail.js` 157, 540) | the link goes to classic (`classicApps.mjs`) | the link opens neo once card P3 is done (neo routes `#ports/...` itself) |
| amd/chartering, amd/yards | `PortCombo` in dialogs and filters, `CountryCombo` (yards); chartering's enquiry detail links to the port (`EnquiryDetail.js` 208); yards' country nav queries ports (`CountryNavGrid.js` 98) | not ported | import ports' factories, links to `#ports/port/<id>` |
| amd/diary (planned), amd/windfarms, amd/maps | diary's event detail loads the arrival port (`EventDetail.js` 384); windfarms' farm detail loads ports and links to them (`FarmDetail.js` 821, 835); maps loads a port marker layer with entity routes (`MainPanel.js` 19, 66, 159) | diary plans a classic link | the port links open neo after P3 |
| amd/tanks | declares amd/ports only (`Module.php` 35) | — | — |
| amd/fleet, amd/catalog | backend only (`Port::findById` in PDFs). fleet `use`s `Port` without declaring amd/ports: an unused import in `Module.php` and a lookup in `VesselOverviewPdf.php` that runs only for port call rows (portcall depends on ports). catalog guards with `class_exists(Port::class)` | — | — |

Shared library: Leaflet. Core must not load it from amd/leaflet (owner rule): card `20261128-023058` ships Leaflet
with `views/neo`.

## 3. Pieces for neo core

| Card | What | Other users |
|---|---|---|
| `20261128-023058-neo-ui-go-map-map-leaflet-addon-in-core` (new) | `GO.map.Map`: Leaflet main-thread addon in core, centre, zoom, markers with popups, ready promise, lightweight mode, a tile source a module can replace | fleet (map panel), amdmaps, iot, buoys, windfarms; plugins (draw, cluster, AIS symbols) later |
| `20261128-023110-neo-ui-custom-field-types-from-modules` (new) | registry key for module custom field types: form field, detail value, grid cell (entity names), filter amd/vessels (two types; catalog and suppliers declare an empty `customFieldTypes`) |
| D7 `20261128-020115` (exists) | module settings dialog with lookup lists | ports Services list (row 11) |

`20261128-015251-neo-ui-lookup-settings-dialog-from-amd-c` and D7 `20261128-020115-neo-ui-module-settings-dialog-with-looku`
look like the same work (both "from amd/crew"). The coordinator should merge them; this page plans on D7.

## 4. Cards

Project `~/Projects/groupoffice26-neo-amd`, base `neo`, worktree, all created with `--no-auto`. Each card's
browser check compares with `?webclient=classic` as a non-admin user with manage rights on ports and once as admin,
and checks that a user without manage does not get the app.

| # | Card | Size | Rows | After |
|---|---|---|---|---|
| P1 | `amd/ports: neo skeleton and port list` | M | 1-5 (without import / export / batch edit and without the `routes` entry), `views/neo/PORTING.md` | — |
| P1b | `amd/ports: neo pickers, import, export and batch edit` | S | 13, the rest of 5 | P1 |
| P2 | `amd/ports: neo port dialog` | M | 6, 7 | P1 |
| P3 | `amd/ports: neo port detail` | M | 8, 10, the registry `routes` entry (registered only when the detail exists: it takes the hash from classic) | P2 |
| P4 | `amd/ports: neo settings` | S | 11 | P1, D7 |
| P5 | `amd/ports: neo map in the port detail` | S | 9 | P3, `20261128-023058` |
| P6 | `amd/ports: neo Port custom field type` | S | 12 | P1, `20261128-023110` |

Board card ids are in section 7. A Codex review (gpt-6.2-astra) of this page split P1 and moved the `routes` entry to P3;
its findings are worked in here and as "Scope fix" notes on the cards.

## 5. Open points for the owner and the coordinator

- **Map tiles**: classic loads tiles through the amd/leaflet proxy. What should core neo use without amd/leaflet:
  OpenStreetMap directly, a configurable URL, or no map? Plan: core takes a tile source from config and a registry
  key, and amd/leaflet (a tiny `views/neo`) provides its proxy. Card `20261128-023058` asks before it starts; if the proxy stays, P5 adds a tiny amd/leaflet `views/neo` that
  provides it. The seamark overlay (row 9) goes through the same question.
- **Classic bugs** (26.0.x, not neo work; the owner decides whether to fix): the company service Add in a new port
  (row 7), `customfield.PortDialog` that does not exist (row 12), the stale country on Add (section 1), portcall's
  `go.modules.core.ports.PortCombo` filter (section 2).
- **Duplicate core cards** `20261128-015251` and `20261128-020115` (section 3).

## 6. Additions for go:neo-port

- **Mapping row:** `go.modules.amd.leaflet.MapPanel` → core `GO.map.Map` (card `20261128-023058`); plugins come with
  the modules that need them.
- **Mapping row:** `customFieldTypes` in `Module.js` → the registry key from card `20261128-023110`; until then the
  field shows read-only.
- **Inventory:** a classic combo whose options come from another field at run time (ports' time zones from the
  country) → `SelectField` / `LocalCombo` with options set in a `change` handler after `formReady`; setting the
  options on load must not change the value (the form stays clean).
- **Inventory:** a grid of child records in a dialog tab whose parent id is set only on load (ports company services)
  cannot add rows to a new record: disable Add until the first save instead of copying the bug.

## 7. Board cards

Created 2026-11-28, all `--no-auto`.

- MAP `20261128-023058-neo-ui-go-map-map-leaflet-addon-in-core`
- CF `20261128-023110-neo-ui-custom-field-types-from-modules`
- P1 `20261128-023420-amd-ports-neo-skeleton-and-port-list`
- P1b `20261128-024338-amd-ports-neo-pickers-import-export-and`
- P2 `20261128-023420-amd-ports-neo-port-dialog`
- P3 `20261128-023420-amd-ports-neo-port-detail`
- P4 `20261128-023421-amd-ports-neo-settings`
- P5 `20261128-023421-amd-ports-neo-map-in-the-port-detail`
- P6 `20261128-023422-amd-ports-neo-port-custom-field-type`
