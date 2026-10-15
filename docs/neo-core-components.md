# Core UI components: GO vs neo.mjs (2026-10-15)

What the neo webclient (`www/views/neo`) has to provide before more modules than
Notes can move. Reference is GOUI (`views/goui/goui/script` = base library,
`views/goui/groupoffice-core/script` = GO core), plus ExtJS-only core parts
(`go/core/views/extjs3`).

Status: **neo** = neo.mjs 13.2 ships it, usable as is (maybe GO styling);
**GO.neo** = we have a GO class in `views/neo/src`; **missing** = to build.

## Base library (GOUI `goui`)

| GOUI | neo.mjs | Status |
|---|---|---|
| Button, SearchButton | button/Base, Split, Menu | GO.neo (`GO.button.Button`, `SearchButton`) |
| Menu, AbstractMenu | menu/List, button menu | GO.neo (`GO.menu.List`) |
| ColorMenu | – | missing (small) |
| Window | dialog/Base | GO.neo (`GO.view.Dialog`: mask fixes, popout) |
| Panel, CardContainer, CardMenu | container/Panel, layout card, tab/Container | neo |
| Splitter | component/Splitter | GO.neo (`GO.component.Splitter`, state) |
| Toolbar, OverlayToolbarButton | toolbar/Base | neo (overlay: missing) |
| Paginator | toolbar/Paging | neo (Notes uses infinite scroll) |
| List, ListPicker | list/Base | GO.neo (`TextList`, `CheckList`) |
| Table, TableColumns, RowSelect | grid/Container (buffered) | GO.neo (`GO.grid.Grid`, `selectRow`) |
| SelectAllCheckboxField, MultiSelectToolbar | – | GO.neo (`GO.grid.Grid` `multiSelect`, `RowSelectionModel` with `selectAll()`, `MultiSelectToolbar`; Notes deletes several notes) |
| Tree, TreeStore, TreeColumn | tree/List, tree/Accordion (basic) | GO.neo (`GO.tree.Tree`: lazy `nodeProvider`, checkboxes; no drag and drop, no extra columns) |
| DescriptionList | – | GO.neo (`GO.component.DescriptionList`) |
| Avatar | – | partial (`Format.avatarHtml`, HTML only) |
| ToolTip | tooltip/Base | neo |
| Sortable, DraggableComponent | draggable/DragZone, DropZone | neo (not wired: drag rows to notebooks, sort lists) |
| MaterialIcon | – | GO.neo (`go-icon` CSS) |
| CollapseButton | – | GO.neo (`GO.detail.Card`) |
| Notifier | component/Toast | GO.neo (`Notify.mjs`) |
| Router | util/HashHistory | GO.neo (`MainView`, module `route()`) |
| State | state/Provider | GO.neo (`State.mjs`, GOUI state keys) |
| **Translate (`t()`)** | – | **missing: the neo UI is English-only, no GO language files** |
| Format, DateTime | util/Date (basic) | partial (`Format.mjs`: user date formats) |

### Form fields

| GOUI | neo.mjs | Status |
|---|---|---|
| Text, Textarea, Number, Password, Hidden, Display | form/field/* | neo |
| Checkbox, Radio, Color, Range, Time, Date | form/field/* | neo (`GO.component.CheckBox`) |
| ComboBox, Select | form/field/ComboBox | neo; **missing JMAP-backed remote combo** (query as you type) |
| Fieldset, Form | form/Fieldset, form/Container | neo |
| **DataSourceForm** (load/save an entity) | – | **missing: generic entity form** (NoteDialog does it by hand) |
| DateField, DateTimeField, DateRangeField, DurationField | form/field/Date (native input + picker) | GO.neo (`GO.form.field.*`; DateRangeField: custom range/from/until in a dialog instead of picker submenus) |
| **HtmlField** (rich text) | – | **missing, large**: editor must live on the main thread (addon + worker bridge); notes use a textarea |
| ChipsField, AutocompleteChips, AutocompleteField | form/field/Chip (basic) | ChipsField: GO.neo (`GO.form.field.ChipsField`, async textInputToValue/chipRenderer); autocomplete list: missing |
| ArrayField, ContainerField, MapField, ListField | – | ArrayField, ContainerField: GO.neo (`src/form/nestedFields.mjs`); MapField, ListField: missing |
| CheckboxGroup | – | missing (small) |
| DatePicker / MonthPicker / WeekPicker | component/DateSelector | neo (month/week: missing) |

## GO core (GOUI `groupoffice-core`)

| GOUI | Status |
|---|---|
| JMAP client, Entities, Modules | GO.neo (`jmap/Client`, `JmapStore`, `ModuleRegistry`) |
| auth/Login | GO.neo; **missing 2FA, lost password, register** |
| MainThreeColumnPanel, TableTitle | GO.neo |
| DetailPanel | GO.neo (`detail/Card` + panels) |
| Comments, Files (legacy files), History | GO.neo (`CommentsPanel`, `FilesPanel`, `HistoryPanel` + `HistoryDetailDialog`) |
| FilterPanel (saved EntityFilters) | GO.neo (`FilterPanel`, `FilterDialog`) |
| Global search | GO.neo (`GlobalSearch`) |
| **FormWindow** (entity dialog: load, save, validation, links, custom fields) | **missing** — base for every module's edit dialog |
| **PrincipalCombo, GroupCombo** | **missing** (user/group pickers) |
| **links/** (LinkBrowser, CreateLinkButton/Field, LinkDetail, SelectSearch) | **missing** — links panel in every detail |
| **customfields/** (FormFieldset, DetailFieldset, Types, TreeSelectField) | **missing** — every entity with custom fields |
| **permissions/SharePanel** (ACL) | **missing** — sharing notebooks, address books, … |
| RecurrenceField, RecurrencePicker | GO.neo (`GO.form.field.RecurrenceField`: presets menu + "Customize" dialog) |
| RecipientPicker, HtmlFieldMentionPlugin | missing (mail, comments mentions) |
| EntityTypeTable | missing |
| chart | missing (neo has no chart component; would need a library) |

## ExtJS-only core (not in GOUI yet)

Import/export, batch edit, e-mail and PDF templates, system settings and module
settings, user/group administration, upload with progress (`Uploader`),
alerts/notifications (`Alert.js`), session activity watcher. All missing in neo;
needed only when the corresponding screens move.

## What to add first

1. **Translate** — every string goes through GO's language files.
2. **FormWindow + DataSourceForm** — generic entity dialog (load/save/validation/dirty).
3. **Remote combo, PrincipalCombo/GroupCombo** — needed by almost every form.
4. **Links** and **custom fields** (form + detail) — present in nearly every module.
5. **SharePanel** — needed as soon as containers (note books, address books) are edited.
6. **HtmlField** — rich text (notes, comments, mail); largest single item.
7. ~~DateTime/DateRange/Duration fields, Chips, ArrayField, Tree, DescriptionList, multi-select toolbar, RecurrenceField~~ (2026-10-16, demos in the Dev module); left: autocomplete chips, MapField, tree drag and drop.
