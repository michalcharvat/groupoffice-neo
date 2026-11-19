# Core UI components: GO vs neo.mjs (updated 2026-11-19)

What the neo webclient (`www/views/neo`) has to provide to replace the GOUI/ExtJS
webclient. The live per-component status is the Dev module (`src/dev/menu.mjs`, `status`). Reference is GOUI (`views/goui/goui/script` = base library,
`views/goui/groupoffice-core/script` = GO core), plus ExtJS-only core parts
(`go/core/views/extjs3`).

Status: **neo** = neo.mjs 13.4 ships it, usable as is (maybe GO styling);
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
| Table, TableColumns, RowSelect | grid/Container (buffered) | GO.neo (`GO.grid.Grid`, `selectRow`; row height in px from the measured density: dp(40) one-line = 35px Paper / 29px Compact, `rowLines: 2` (avatar or two lines: users, address book, duplicates, RecipientPicker) dp(56) = 48px / 40px; follows `Preferences.applyTheme()` live); keys: `enterKey` / `deleteKey` (Delete, Ctrl/Cmd+Backspace) events with `{records}` outside inputs; `switchState(stateId)` swaps the column state, e.g. addressbook organizations view; `customFieldsEntity: 'Note'` adds a column per custom field (`customfields/gridColumns.mjs`: renderer per type from `types.mjs` `cellHtml()`, names of user/group/contact fields loaded per page, GOUI state key = databaseName, server sort on `customFields.<databaseName>`, "Hidden in grid" = hidden; the model needs a `customFields` field, neo drops undeclared keys) |
| SelectAllCheckboxField, MultiSelectToolbar | – | GO.neo (`GO.grid.Grid` `multiSelect`, `RowSelectionModel` with `selectAll()`, `MultiSelectToolbar`; Notes deletes several notes) |
| Tree, TreeStore, TreeColumn | tree/List, tree/Accordion (basic) | GO.neo (`GO.tree.Tree`: lazy `nodeProvider`, checkboxes; no drag and drop, no extra columns) |
| DescriptionList | – | GO.neo (`GO.component.DescriptionList`) |
| Avatar | – | partial (`Format.avatarHtml`, HTML only) |
| ToolTip | tooltip/Base | neo |
| Sortable, DraggableComponent | draggable/DragZone, DropZone | neo (not wired: drag rows to notebooks, sort lists) |
| MaterialIcon | – | GO.neo (`go-icon` CSS) |
| CollapseButton | – | GO.neo (`GO.detail.Card`) |
| Notifier | component/Toast | GO.neo (`Notify.mjs`: toasts; `alerts/NotificationCenter.mjs` + `NotificationPanel.mjs`: the bell's notification area with core alerts over SSE, legacy reminders, snooze/dismiss, desktop notifications and sound via addon `WS/Notifications`; `alerts/ActivityWatcher.mjs`: logout on inactivity) |
| Router | util/HashHistory | GO.neo (`MainView`, module `route()`) |
| State | state/Provider | GO.neo (`State.mjs`, GOUI state keys) |
| Translate (`t()`) | – | GO.neo (`Translate.mjs`, `translator(package, module)`, GO language files) |
| Format, DateTime | util/Date (basic) | partial (`Format.mjs`: user date formats; `decodeEntities()` for values of legacy stores) |

### Form fields

| GOUI | neo.mjs | Status |
|---|---|---|
| Text, Textarea, Number, Password, Hidden, Display | form/field/* | neo |
| Checkbox, Radio, Color, Range, Time, Date | form/field/* | neo (`GO.component.CheckBox`) |
| ComboBox, Select | form/field/ComboBox | GO.neo (`JmapComboBox` remote, `LocalCombo`, `SelectField`) |
| Fieldset, Form | form/Fieldset, form/Container | neo |
| DataSourceForm (load/save an entity) | – | GO.neo (`GO.form.DataSourceForm`); `save` event `{data, isNew, created}`, `created` = what Foo/set returned for a new entity (API key token) |
| DateField, DateTimeField, DateRangeField, DurationField | form/field/Date (native input + picker) | GO.neo (`GO.form.field.*`; DateRangeField: custom range/from/until in a dialog instead of picker submenus) |
| HtmlField (rich text) | – | GO.neo (`HtmlField`, main-thread addon; `HtmlFieldMentionPlugin`: "@name" suggestions at the caret, owned by the addon, provider in the worker) |
| MarkdownField | – | GO.neo (`MarkdownField`: textarea + main-thread addon `MarkdownEditor`, toolbar, preview, image paste / drop / upload; `src/Markdown.mjs` renders with `marked` + `Format.sanitizeHtml()`; no EasyMDE/CodeMirror) |
| ChipsField, AutocompleteChips, AutocompleteField | form/field/Chip (basic) | ChipsField: GO.neo (`GO.form.field.ChipsField`, async textInputToValue/chipRenderer); AutocompleteChips: GO.neo (`GO.form.field.AutocompleteChips`, entity ids, ▾ menu; tasks categories); AutocompleteField: missing; AutocompleteChips `properties` = fetched properties |
| ArrayField, ContainerField, MapField, ListField | – | ArrayField, ContainerField: GO.neo (`src/form/nestedFields.mjs`); MapField, ListField: missing |
| CheckboxGroup | – | missing (small) |
| DatePicker / MonthPicker / WeekPicker | component/DateSelector | neo (month/week: missing) |

## GO core (GOUI `groupoffice-core`)

| GOUI | Status |
|---|---|
| JMAP client, Entities, Modules | GO.neo (`jmap/Client`, `JmapStore`, `ModuleRegistry`; module hooks `onMainView`, `onCreateUserDialog`, `fileHandlers`, see `docs/neo-small-modules.md`; `Badges.mjs`: counts on the module tab and main menu item (GO.mainLayout.setNotification()), registry key `badge: {entities, count}` recounted on push, or `badges.set(name, count)`; a dot on the main menu button while a closed module has one; calendar invitations, tasks due, e-mail unseen; `NotificationCenter` message `muteSound`: the user property that mutes its sound, default `mute_reminder_sound`) |
| Upload (`client.upload()`, ExtJS `go.Uploader`) | GO.neo (`jmap/Uploader.mjs`: XHR with progress, queue of `maxConcurrentUpload`, `maxSizeUpload` check, abort; `component/UploadPanel.mjs` shows the uploads of a window bottom right; used by `UploadButton` `autoUpload`, `BlobField`, `AttachmentsField`, `ImageField`, `MarkdownField`, `FilesPanel`, imports; demo `#dev/core/Upload`) |
| auth/Login | GO.neo (`apps/go/view/LoginView.mjs`: forgot credentials, 2FA via `loginPanels`) |
| MainThreeColumnPanel, TableTitle | GO.neo |
| DetailPanel | GO.neo (`detail/Card` + panels); `Card` `capability` hides a card without module access (history, comments, files) |
| Comments, Files (legacy files), History | GO.neo (`CommentsPanel`, `FilesPanel`, `HistoryPanel` + `HistoryDetailDialog`). `FilesPanel` takes files dropped from the desktop; with the files module's neo UI a click opens the file with the user's file handler (ModuleRegistry hook `openFile`) and "Browse files" opens the entity's folder in `#files/folder/<id>` |
| FilterPanel (saved EntityFilters) | GO.neo (`FilterPanel`, `FilterDialog`; value editors per filter `type` in `view/filterTypes.mjs`: string/number/date, `select` {options}, `user`, `group`, `entity` {entity, jmapFilter}, `link`; the entity's custom fields are added as filters. `searchFilter(text, filters, entity)` gives a toolbar search GO's `name:value` syntax, ExtJS go.util.Filters.parseQueryString) |
| Global search | GO.neo (`GlobalSearch`) |
| FormWindow (entity dialog: load, save, validation, links, custom fields) | GO.neo (`view/FormWindow.mjs`; `view/LegacyFormWindow.mjs` for a record of a legacy controller: caller passes `values`, subclass implements `save(modified, values)`) |
| PrincipalCombo, GroupCombo | GO.neo (`form/field/PrincipalCombo`, `GroupCombo`, `PrincipalList`) |
| links/ (LinkBrowser, CreateLinkButton/Field, LinkDetail, SelectSearch) | GO.neo (`src/link/`: browse/add links on saved entities; `CreateLinkButton`/`CreateLinkField` collect links for a new entity, FormWindow `hasLinks` creates them after the first save, `addLinkOnSave()`; `AddLinkButton` menu lists "new item" entries modules register as ModuleRegistry `linkWindows` (ExtJS `linkWindow`), each a `linkWindow.mjs` that opens the dialog without the module's main view; `LinkCards` in the detail views holds the generic `LinkDetail` plus the cards modules register as `linkDetailCards` (ExtJS/GOUI `linkDetailCards`, e.g. `LinkListCard` with Link filters), whose entities `LinkDetail` leaves out) |
| customfields/ (FormFieldset, DetailFieldset, Types, admin) | GO.neo (`src/customfields/`) |
| permissions/SharePanel (ACL) | GO.neo (`permissions/SharePanel.mjs`; `setAclId(aclId, value)` for a legacy ACL without a JMAP entity, e.g. a files folder; `readOnly` without manage permission; the people button of a row opens `groups/GroupMemberDialog.mjs` with all members, ExtJS `go.groups.GroupMemberWindow`) |
| prompt() (one line of text) | GO.neo (`view/TextPrompt.mjs`: `TextPrompt.ask({title, label, value, select: 'all'\|'name', validator})`, `null` when cancelled) |
| Drag and drop (native) | GO.neo (`component/dragDrop.mjs` `enableDragDrop(component, {drag, drop, group, files, onDrop})` + addon `WS/DragDrop`: rows and tree nodes onto drop targets of the same group, desktop files; the worker gets a `goDrop` DOM event) |
| RecurrenceField, RecurrencePicker | GO.neo (`GO.form.field.RecurrenceField`: presets menu + "Customize" dialog) |
| Image (blob images, zoom) | GO.neo (`view/ImageWindow.mjs`: `enableImageZoom()` + addon `WS/ImageZoom`, `ImageWindow.show()`; images load by URL with the session cookie, no `getBlobURL()` needed) |
| HtmlFieldMentionPlugin | GO.neo (`form/field/HtmlFieldMentionPlugin.mjs`, a neo plugin on `HtmlField`; default provider: users, inserts `@username`; `CommentsPanel` uses it, the server alerts mentioned users who can read the item; demo `#dev/form/HtmlField`) |
| RecipientPicker, RecipientsField (goui-docs) | GO.neo (`view/RecipientPicker.mjs`: users by group, contacts, add selected / all; `form/field/RecipientsField.mjs`: `{name, email}` chips, Principal suggestions, typed addresses, invalid ones red; demo `#dev/core/Recipients`) |
| E-mail client, `go.showComposer` (ExtJS only: `www/modules/email`, `go/core/views/extjs3/Mail.js`) | GO.neo (legacy module `www/modules/email/views/neo` with sieve, smime, emailfavorites; see `docs/neo-email-module.md`. Core `src/Mail.mjs` `showComposer(cfg)`: the e-mail composer or a `mailto:` link (`use_desktop_composer`); the composer uses `RecipientsField` for to/cc/bcc and `HtmlField` with `pasteImages`) |
| EntitySelectDialog | GO.neo (`view/EntitySelectDialog.mjs`: `EntitySelectDialog.ask({entity, jmapFilter, value})`, checked ids or `null`; start page portlet settings) |
| Start page (legacy summary module) | GO.neo (`modules/summary/views/neo`: two columns of portlets registered by modules with the `portlets` key; announcements, note, news (RSS), appointments, tasks, birthdays; move/add/remove, layout in state `summary-active-portlets`; manage announcements; no drag and drop, no announcement permissions panel) |
| EntityTypeTable | missing |
| chart | missing in GO (neo ships `component/wrapper/AmChart` + `main/addon/AmCharts`, not wired) |

## ExtJS-only core (not in GOUI yet)

Done in neo: import (`src/import/`; `ImportFileDialog` asks for the file, a subclass adds fields
between text and buttons with `createExtraItems()`, `getImportValues()` and `canUpload()` /
`syncUpload()`, like the tasks `ImportTaskDialog` with its list combo), system and module settings, user/group
administration, e-mail and PDF templates, blob upload with progress (`Uploader`, `UploadPanel`, `UploadButton`, `BlobField`),
grid export (`src/export/exportEntities.mjs`: `exportMenuItem()` / `exportEntities()`,
`MainThreeColumnPanel.exportMenuItem()`; Users, notes, tasks, address book) and batch edit
(`GO.form.BatchEditDialog` + `GO.grid.BatchEditButton` in a MultiSelectToolbar: the entity's
custom fields, like ExtJS; notes, tasks, address book). Downloads use `src/download.mjs`.
Bookmarks has no grid and no `Bookmark/export`, so neither applies there.

## neo.mjs upgrades

`neo.mjs` is pinned in `views/neo/package.json` (13.4.0). After a bump run `npm install`,
`npm run build-themes` and check what we patch or override against the new neo source:

- `src/form/field/textAutoComplete.mjs`: replaces `Text.afterSetAutoComplete` (string values).
- `src/view/Dialog.mjs`: overrides `close`, `closeOrHide`, `revertFocus`, `onKeyDownEscape`, `afterSetHidden`.
- `resources/scss/go/dialog/Base.scss`: keeps a `.neo-floating` dialog `position: fixed` against neo's
  `position: relative` on `.neo-masked` and (13.4+) `.neo-store-loading`.
- Configs redeclared with a trailing `_` in a subclass: neo refuses them ("Invalid config ... already
  defined as reactive by a parent class") once neo declares the same config higher up. 13.4 moved
  `required_` to `form.field.Base`, so `GO.form.field.Field` and `HtmlField` only hook `afterSetRequired`.
- `src/grid/Grid.mjs` group headers (`groupBy`): neo's grid has no group rows. The grid turns on
  `contentSizedRows`, gives the first row of a group the height of row + header
  (`view.setRowHeights()`, keyed by record id) and wraps instance methods of neo's Body
  (`createRowPool`, `isEditorEvent`) and Row (`createVdom`, which appends the header band as the
  row's last child). Check these against Body.mjs / Row.mjs after a bump.

## Left to build (2026-11-19)

1. ~~**Notes Markdown + image zoom**~~ — done: `MarkdownField`, `src/Markdown.mjs`, `ImageWindow`.
2. ~~**Grid export + batch edit**~~ — done: `src/export/exportEntities.mjs`, `GO.form.BatchEditDialog`.
   ~~**Create link while creating**~~ — done: `CreateLinkButton` in FormWindow (notes, tasks, contacts, calendar events).
3. ~~**Upload with progress**~~ — done: `jmap/Uploader.mjs` + `UploadPanel` (progress, abort, size limit).
4. ~~**HtmlField mentions** and **RecipientPicker**~~ — done: `HtmlFieldMentionPlugin` (comments), `RecipientsField` + `RecipientPicker` (used by the e-mail composer).
5. **Drag and drop** — rows and tree nodes onto targets and desktop files: done (`enableDragDrop()`, used by the files module and `FilesPanel`); sortable lists still missing.
6. Small fields: AutocompleteField, MapField, ListField, CheckboxGroup, ColorMenu, Month/WeekPicker.
7. Chart, EntityTypeTable. ~~Alerts/notifications, reminders, session activity watcher, start page~~ — done: `src/alerts/`, module `alerts` renderers (calendar invitations, tasks), `modules/summary/views/neo` (the files portlet waits for that module; e-mail has `portlet-email`).
8. ~~**E-mail client**~~ — done: `www/modules/email/views/neo` + sieve, smime, emailfavorites, core `src/Mail.mjs`. Left: files ↔ e-mail (E-mail files, Save to personal folder), unknown recipients dialog, message drag and drop; see `docs/neo-email-module.md` → Status.

## Gotchas from the parity audit (2026-11-19)

- A local store without a model whose `id` values are strings ('create', 'update', …) gets
  generated ids (-1, -2, …) and a CheckList on it crashes with `isRecord` of undefined. Give
  such stores a model with `{name: 'id', type: 'String'}` (see `HistoryMain.mjs`).
- A `change` listener on a checkbox that hides or shows a sibling also runs while the form
  loads and can drop the checkbox's tick. Listen to `userChange` and sync once in the load
  hook (calendar `PreferencesPanel.mjs`).
- `EntityListPanel` takes a `jmapFilter` for its query (davclient: own accounts only).
- `client.user.confirmOnMove` is loaded (`USER_PROPERTIES`); moves of contacts and files ask
  only when it is set.
