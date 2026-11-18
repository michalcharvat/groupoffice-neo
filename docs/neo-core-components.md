# Core UI components: GO vs neo.mjs (updated 2026-11-18)

What the neo webclient (`www/views/neo`) has to provide to replace the GOUI/ExtJS
webclient. The live per-component status is the Dev module (`src/dev/menu.mjs`, `status`). Reference is GOUI (`views/goui/goui/script` = base library,
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
| Translate (`t()`) | – | GO.neo (`Translate.mjs`, `translator(package, module)`, GO language files) |
| Format, DateTime | util/Date (basic) | partial (`Format.mjs`: user date formats) |

### Form fields

| GOUI | neo.mjs | Status |
|---|---|---|
| Text, Textarea, Number, Password, Hidden, Display | form/field/* | neo |
| Checkbox, Radio, Color, Range, Time, Date | form/field/* | neo (`GO.component.CheckBox`) |
| ComboBox, Select | form/field/ComboBox | GO.neo (`JmapComboBox` remote, `LocalCombo`, `SelectField`) |
| Fieldset, Form | form/Fieldset, form/Container | neo |
| DataSourceForm (load/save an entity) | – | GO.neo (`GO.form.DataSourceForm`) |
| DateField, DateTimeField, DateRangeField, DurationField | form/field/Date (native input + picker) | GO.neo (`GO.form.field.*`; DateRangeField: custom range/from/until in a dialog instead of picker submenus) |
| HtmlField (rich text) | – | GO.neo (`HtmlField`, main-thread addon); **missing: mentions plugin** |
| MarkdownField | – | GO.neo (`MarkdownField`: textarea + main-thread addon `MarkdownEditor`, toolbar, preview, image paste / drop / upload; `src/Markdown.mjs` renders with `marked` + `Format.sanitizeHtml()`; no EasyMDE/CodeMirror) |
| ChipsField, AutocompleteChips, AutocompleteField | form/field/Chip (basic) | ChipsField: GO.neo (`GO.form.field.ChipsField`, async textInputToValue/chipRenderer); AutocompleteChips: GO.neo (`GO.form.field.AutocompleteChips`, entity ids, ▾ menu; tasks categories); AutocompleteField: missing |
| ArrayField, ContainerField, MapField, ListField | – | ArrayField, ContainerField: GO.neo (`src/form/nestedFields.mjs`); MapField, ListField: missing |
| CheckboxGroup | – | missing (small) |
| DatePicker / MonthPicker / WeekPicker | component/DateSelector | neo (month/week: missing) |

## GO core (GOUI `groupoffice-core`)

| GOUI | Status |
|---|---|
| JMAP client, Entities, Modules | GO.neo (`jmap/Client`, `JmapStore`, `ModuleRegistry`) |
| Upload (`client.upload()`, ExtJS `go.Uploader`) | GO.neo (`jmap/Uploader.mjs`: XHR with progress, queue of `maxConcurrentUpload`, `maxSizeUpload` check, abort; `component/UploadPanel.mjs` shows the uploads of a window bottom right; used by `UploadButton` `autoUpload`, `BlobField`, `AttachmentsField`, `ImageField`, `MarkdownField`, `FilesPanel`, imports; demo `#dev/core/Upload`) |
| auth/Login | GO.neo (`apps/go/view/LoginView.mjs`: forgot credentials, 2FA via `loginPanels`) |
| MainThreeColumnPanel, TableTitle | GO.neo |
| DetailPanel | GO.neo (`detail/Card` + panels) |
| Comments, Files (legacy files), History | GO.neo (`CommentsPanel`, `FilesPanel`, `HistoryPanel` + `HistoryDetailDialog`) |
| FilterPanel (saved EntityFilters) | GO.neo (`FilterPanel`, `FilterDialog`) |
| Global search | GO.neo (`GlobalSearch`) |
| FormWindow (entity dialog: load, save, validation, links, custom fields) | GO.neo (`view/FormWindow.mjs`) |
| PrincipalCombo, GroupCombo | GO.neo (`form/field/PrincipalCombo`, `GroupCombo`, `PrincipalList`) |
| links/ (LinkBrowser, CreateLinkButton/Field, LinkDetail, SelectSearch) | GO.neo (`src/link/`: browse/add links on saved entities; `CreateLinkButton`/`CreateLinkField` collect links for a new entity, FormWindow `hasLinks` creates them after the first save, `addLinkOnSave()`) |
| customfields/ (FormFieldset, DetailFieldset, Types, admin) | GO.neo (`src/customfields/`) |
| permissions/SharePanel (ACL) | GO.neo (`permissions/SharePanel.mjs`) |
| RecurrenceField, RecurrencePicker | GO.neo (`GO.form.field.RecurrenceField`: presets menu + "Customize" dialog) |
| Image (blob images, zoom) | GO.neo (`view/ImageWindow.mjs`: `enableImageZoom()` + addon `WS/ImageZoom`, `ImageWindow.show()`; images load by URL with the session cookie, no `getBlobURL()` needed) |
| RecipientPicker, HtmlFieldMentionPlugin | missing (mail, comments mentions) |
| EntityTypeTable | missing |
| chart | missing in GO (neo ships `component/wrapper/AmChart` + `main/addon/AmCharts`, not wired) |

## ExtJS-only core (not in GOUI yet)

Done in neo: import (`src/import/`), system and module settings, user/group
administration, e-mail and PDF templates, blob upload with progress (`Uploader`, `UploadPanel`, `UploadButton`, `BlobField`).

## Left to build (2026-11-19)

1. ~~**Notes Markdown + image zoom**~~ — done: `MarkdownField`, `src/Markdown.mjs`, `ImageWindow`.
2. **Grid export + batch edit** — a reusable export (only `UsersPanel.exportUsers()` exists today) and editing several selected records.
   ~~**Create link while creating**~~ — done: `CreateLinkButton` in FormWindow (notes, tasks, contacts, calendar events).
3. ~~**Upload with progress**~~ — done: `jmap/Uploader.mjs` + `UploadPanel` (progress, abort, size limit).
4. **HtmlField mentions** and **RecipientPicker** — comments mentions, mail.
5. **Drag and drop** — tree nodes, rows to containers, sortable lists.
6. Small fields: AutocompleteField, MapField, ListField, CheckboxGroup, ColorMenu, Month/WeekPicker.
7. Chart, EntityTypeTable, alerts/notifications, session activity watcher.
