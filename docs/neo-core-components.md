# Core UI components: GO vs neo.mjs (updated 2026-11-19)

What the neo webclient (`www/views/neo`) has to provide to replace the GOUI/ExtJS
webclient. The live per-component status is the Dev module (`src/dev/menu.mjs`, `status`). Reference is GOUI (`views/goui/goui/script` = base library,
`views/goui/groupoffice-core/script` = GO core), plus ExtJS-only core parts
(`go/core/views/extjs3`).

Status: **neo** = neo.mjs 13.4 ships it (14 since 2026-11-24), usable as is (maybe GO styling);
**GO.neo** = we have a GO class in `views/neo/src`; **missing** = to build.

## Base library (GOUI `goui`)

| GOUI | neo.mjs | Status |
|---|---|---|
| Button, SearchButton | button/Base, Split, Menu | GO.neo (`GO.button.Button`, `SearchButton`) |
| Menu, AbstractMenu | menu/List, button menu | GO.neo (`GO.menu.List`) |
| ColorMenu | – | GO.neo (`GO.menu.ColorMenu`: GOUI palette + Auto, `colorSelect` {color} (neo lists already fire `select`), the menu's button takes the colour) |
| Window | dialog/Base | GO.neo (`GO.view.Dialog`: mask fixes, popout) |
| Panel, CardContainer, CardMenu | container/Panel, layout card, tab/Container | neo |
| Splitter | component/Splitter | GO.neo (`GO.component.Splitter`, state) |
| Toolbar, OverlayToolbarButton | toolbar/Base | neo (overlay: missing) |
| Paginator | toolbar/Paging | neo (Notes uses infinite scroll) |
| List, ListPicker | list/Base | GO.neo (`TextList`, `CheckList`; empty state with `emptyText` / `emptyIcon`, off by default because a TextList is also the combo drop-down) |
| Table, TableColumns, RowSelect | grid/Container (buffered) | GO.neo (`GO.grid.Grid`, `selectRow`; row height in px from the measured density: dp(40) one-line = 35px Paper / 29px Compact, `rowLines: 2` (avatar or two lines: users, address book, duplicates, RecipientPicker) dp(56) = 48px / 40px; follows `Preferences.applyTheme()` live); keys: `enterKey` / `deleteKey` (Delete, Ctrl/Cmd+Backspace) events with `{records}` outside inputs; `switchState(stateId)` swaps the column state, e.g. addressbook organizations view; `customFieldsEntity: 'Note'` adds a column per custom field (`customfields/gridColumns.mjs`: renderer per type from `types.mjs` `cellHtml()`, names of user/group/contact fields loaded per page, GOUI state key = databaseName, server sort on `customFields.<databaseName>`, "Hidden in grid" = hidden; the model needs a `customFields` field, neo drops undeclared keys); empty state (GOUI `emptyStateHtml`): `emptyText` (default "No items found") and `emptyIcon` (default `article`) below the header once the store has loaded with no records, `emptyText: null` for none |
| SelectAllCheckboxField, MultiSelectToolbar | – | GO.neo (`GO.grid.Grid` `multiSelect`, `RowSelectionModel` with `selectAll()`, `MultiSelectToolbar`; Notes deletes several notes) |
| Tree, TreeStore, TreeColumn | tree/List, tree/Accordion (basic) | GO.neo (`GO.tree.Tree`: lazy `nodeProvider`, checkboxes, drag and drop with `dragNodes` / `dropOn` / `dropBetween` (fires `drop` {dragNode, node, position}, expands a node after 1 s, `moveNode()`; not `draggable`, that is neo List's own DragZone); no extra columns) |
| DescriptionList | – | GO.neo (`GO.component.DescriptionList`) |
| Avatar | – | partial (`Format.avatarHtml`, HTML only) |
| ToolTip | tooltip/Base | neo |
| Sortable, DraggableComponent | draggable/DragZone, DropZone | GO.neo (`enableDragDrop()` with `position: 'between'` (or `'both'`), `horizontal`, `dropIndex()`; `accept: {dragSelector: dropSelector}` for rows of different kinds and `dropInGroups()` for grouped lists (custom field sets and their fields); module sorting, custom fields admin, notes onto note books, Dev demo DragAndDrop. neo's `draggable/*/SortZone` (list, tree, container) is pointer based and sorts one component's own items, so it doesn't fit tables with kinds of rows) |
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
| ChipsField, AutocompleteChips, AutocompleteField | form/field/Chip (basic) | ChipsField: GO.neo (`GO.form.field.ChipsField`, async textInputToValue/chipRenderer); AutocompleteChips: GO.neo (`GO.form.field.AutocompleteChips`, entity ids, ▾ menu; tasks categories); AutocompleteField: GO.neo (`GO.form.field.AutocompleteField`, JMAP entity or `fetch(text)`, `valueProperty`, `valueToText`); AutocompleteChips `properties` = fetched properties |
| ArrayField, ContainerField, MapField, ListField | – | ArrayField, ContainerField: GO.neo (`src/form/nestedFields.mjs`); MapField: GO.neo (`GO.form.field.MapField`, object keyed by id, `keyFieldName` / `valueFieldName`); ListField: GO.neo (`GO.form.field.ListField`, `renderValue` HTML, records of a `store`) |
| CheckboxGroup | – | GO.neo (`GO.form.field.CheckboxGroup`: legend + toggle-button checkboxes, one field per option) |
| DatePicker / MonthPicker / WeekPicker | component/DateSelector | neo; MonthPicker, WeekPicker: GO.neo (`GO.component.MonthPicker` / `WeekPicker`, ISO weeks, `select` {date}) |

## GO core (GOUI `groupoffice-core`)

| GOUI | Status |
|---|---|
| JMAP client, Entities, Modules | GO.neo (`jmap/Client`, `JmapStore`, `ModuleRegistry`; module hooks `onMainView`, `onCreateUserDialog`, `fileHandlers`, see `docs/neo-small-modules.md`; `Badges.mjs`: counts on the module tab and main menu item (GO.mainLayout.setNotification()), registry key `badge: {entities, count}` recounted on push, or `badges.set(name, count)`; a dot on the main menu button while a closed module has one; calendar invitations, tasks due, e-mail unseen; `NotificationCenter` message `muteSound`: the user property that mutes its sound, default `mute_reminder_sound`) |
| Upload (`client.upload()`, ExtJS `go.Uploader`) | GO.neo (`jmap/Uploader.mjs`: XHR with progress, queue of `maxConcurrentUpload`, `maxSizeUpload` check, abort; `component/UploadPanel.mjs` shows the uploads of a window bottom right; used by `UploadButton` `autoUpload`, `BlobField`, `AttachmentsField`, `ImageField`, `MarkdownField`, `FilesPanel`, imports; demo `#dev/core/Upload`) |
| auth/Login | GO.neo (`apps/go/view/LoginView.mjs`: forgot credentials, 2FA via `loginPanels`) |
| MainThreeColumnPanel, TableTitle | GO.neo |
| DetailPanel | GO.neo (`detail/Card` + panels); `Card` `capability` hides a card without module access (history, comments, files) |
| Comments, Files (legacy files), History | GO.neo (`CommentsPanel`, `FilesPanel`, `HistoryPanel` + `HistoryDetailDialog`). `FilesPanel` takes files dropped from the desktop; with the files module's neo UI a click opens the file with the user's file handler (ModuleRegistry hook `openFile`) and "Browse files" opens the entity's folder in `#files/folder/<id>` |
| FilterPanel (saved EntityFilters) | GO.neo (`FilterPanel`, `FilterDialog`; value editors per filter `type` in `view/filterTypes.mjs`: string/number/date, `select` {options}, `user`, `group`, `entity` {entity, jmapFilter}, `link`; the entity's custom fields are added as filters. `searchFilter(text, filters, entity)` gives a toolbar search GO's `name:value` syntax, ExtJS go.util.Filters.parseQueryString; "Input field" = EntityFilter type variable, `VariableFilterDialog` + a chips field per filter in the panel, values ORed, ExtJS go.filter.VariableFilterPanel; no permissions tab, like the neo FilterDialog) |
| Global search | GO.neo (`GlobalSearch`) |
| App launcher (main menu; ExtJS 6.8 `MainLayout.js` startMenu, Paper `#startMenu`) | GO.neo (`view/AppLauncher.mjs` + `AppLauncher.scss`): full-screen overlay (blur + dark backdrop, solid without blur on phones, 3-4 columns), logo of System settings → Appearance (`Neo::brandingCss()` `.go-app-launcher-logo`), search over module name + title (focused on open, not on touch devices; Enter opens the first match), tiles with the `core/moduleIcon` blob (`moduleIconUrl()`, `mtime` = session `cacheClearedAt`), counts of `Badges.mjs` (`setBadge()`), classic-only apps (D3) marked, open in a new tab; arrow keys / Home / End over the grid, ArrowUp from the first row back to the search, Escape or a click outside closes and returns focus to the button. Events `open` {name, app}, and with Shift `openBeside` {name, app, preventDefault()} for the planned dock workspace (no listener yet: opens as usual). My account → Look & feel "Main menu": launcher (default) or the old list, per user in this browser's localStorage (`getMainMenuMode()` / `setMainMenuMode()`, State key `neo-main-menu-<userId>`, saved on pick, not with User/set). 6.8's sub-menu modules (`inSubmenu`) are tiles with the rest, as in 6.8; neo has no sub-menus. Dev demo `#dev/core/AppLauncher` |
| FormWindow (entity dialog: load, save, validation, links, custom fields) | GO.neo (`view/FormWindow.mjs`; `view/LegacyFormWindow.mjs` for a record of a legacy controller: caller passes `values`, subclass implements `save(modified, values)`) |
| PrincipalCombo, GroupCombo | GO.neo (`form/field/PrincipalCombo`, `GroupCombo`, `PrincipalList`) |
| links/ (LinkBrowser, CreateLinkButton/Field, LinkDetail, SelectSearch) | GO.neo (`src/link/`: browse/add links on saved entities; `CreateLinkButton`/`CreateLinkField` collect links for a new entity, FormWindow `hasLinks` creates them after the first save, `addLinkOnSave()`; `AddLinkButton` menu lists "new item" entries modules register as ModuleRegistry `linkWindows` (ExtJS `linkWindow`), each a `linkWindow.mjs` that opens the dialog without the module's main view; `LinkCards` in the detail views holds the generic `LinkDetail` plus the cards modules register as `linkDetailCards` (ExtJS/GOUI `linkDetailCards`, e.g. `LinkListCard` with Link filters), whose entities `LinkDetail` leaves out) |
| customfields/ (FormFieldset, DetailFieldset, Types, admin) | GO.neo (`src/customfields/`) |
| permissions/SharePanel (ACL) | GO.neo (`permissions/SharePanel.mjs`; `setAclId(aclId, value)` for a legacy ACL without a JMAP entity, e.g. a files folder; `readOnly` without manage permission; the people button of a row opens `groups/GroupMemberDialog.mjs` with all members, ExtJS `go.groups.GroupMemberWindow`) |
| prompt() (one line of text) | GO.neo (`view/TextPrompt.mjs`: `TextPrompt.ask({title, label, value, select: 'all'\|'name', validator})`, `null` when cancelled) |
| Drag and drop (native) | GO.neo (`component/dragDrop.mjs` `enableDragDrop(component, {drag, drop, group, files, position, horizontal, onHover, onDrop})` + addon `WS/DragDrop`: rows and tree nodes onto, before or after drop targets of the same group, desktop files; the worker gets a `goDrop` DOM event with `position`, `goDragHover` after a second on a target; a target with class `go-no-drop` refuses drops and isn't highlighted: `TextList`/`CheckList` `noDrop: record => …`, tree nodes `cls: ['go-no-drop']`, e.g. note books, task lists and address books the user can't write to) |
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

## Styles of components (2026-11-24)

neo loads a class's SCSS only with that class, so a style placed in the sheet of a panel or
dialog that happens to contain a component is missing wherever that component appears without
it (the history user cell, the domain dialog's user combo, `go-scroll` in dialogs). Rules and the
check: `www/views/neo/README.md`, "Where a style goes". Run `npm run audit-styles` in
`www/views/neo` after `build-themes` when adding or moving styles. Base components carry the
defaults: `GO.view.Dialog` pads a form placed directly in its body, the west panel of
`MainThreeColumnPanel` pads its fieldsets, the GOUI helpers (`go-card`, `go-pad`, `go-scroll`, …)
are global in `resources/scss/go/shared/_layout.scss`. Neo's own fields get the GOUI look in their
theme overlay, for example `resources/scss/go/form/field/CheckBox.scss` draws the GOUI checkbox
(outlined dp(24) box with a tick, label padded like a field row) instead of the FontAwesome icons.
A component that restyles its checkboxes (CheckboxGroup shows them as buttons) overrides that in its
own sheet. The select-all boxes of Notes and Calendar are `GO.component.CheckBox`, a separate component.

## neo.mjs upgrades

`neo.mjs` is pinned in `views/neo/package.json` (14.0.0 since 2026-11-24; read the release
notes' "Upgrading from" section and diff `src/` of both versions). After a
bump run `npm install`, `npm run build-themes` and check what we patch or override against the
new neo source. Compare with the old version side by side: a second container on another port
with a worktree of the previous commit (same database, a clone of the data folder) and
screenshots of the same pages (`magick compare -metric AE -fuzz 3%`); a 13.4 → 14 diff of a page
was below 0.1 % of its pixels after the fixes.

- Themes (14): neo ships plain CSS, `generateGoTheme.mjs` compiles GO's SCSS into
  `resources/css` before neo's build (README "GO look"). neo 14 reads new variable families
  that GO sets in `go/button/Base.scss` and `go/toolbar/Base.scss`: `--button-primary-*` for
  `ui: 'primary'`, `--button-*-pressed` (14 recolours a pressed button; 13.4 changed only its
  border) and `--toolbar-button-*` (a toolbar sizes its buttons).
- `src/data/setData.mjs`: neo skips an assignment equal to the last assigned `data`, also when
  the store changed since (`add()`, `remove()`); the helper then replaces the records itself.
- `Neo.php` build id carries the installed neo.mjs version (`NeoTest::testBuildIdCarriesTheNeoVersion`).
- Toggle buttons start with `pressed: false`: 14's default is `null` (a plain button, no
  `aria-pressed`).

- `src/form/field/textAutoComplete.mjs`: replaces `Text.afterSetAutoComplete` (string values).
- `src/view/Dialog.mjs`: overrides `close`, `closeOrHide`, `getFocusReturnTarget` (14 returns the
  focus through it on close and on destroy; 13.4 only via `revertFocus`), `onKeyDownEscape`,
  `afterSetHidden`, `getFirstField` (14 focuses the first field on open; skip inactive cards).
  Escape goes through `onEscape()` (`keys` config and the body-Escape patch): 14 cancels a
  header drag on Escape, and that Escape must not also close (keydown and `drag:cancel` arrive
  in either order). `DialogResizable` no longer copies the size into `style`: 14 resizes `style`
  itself (`styleConfig: 'style'`). Popout `wrapperStyle` uses `'0px'`: 14's `initVnode()` turns a
  falsy `left`/`top` into `'initial'`.
- `src/form/field/HtmlField.mjs` `focus()` forwards neo 14's `restoreFrom` to the editor addons
  (`HtmlEditor`, `MarkdownEditor`), which focus only if the focus got lost meanwhile.
- `resources/scss/go/dialog/Base.scss`: keeps a `.neo-floating` dialog `position: fixed` against neo's
  `position: relative` on `.neo-masked` and (13.4+) `.neo-store-loading`.
- Configs redeclared with a trailing `_` in a subclass: neo refuses them ("Invalid config ... already
  defined as reactive by a parent class") once neo declares the same config higher up. 13.4 moved
  `required_` to `form.field.Base`, so `GO.form.field.Field` and `HtmlField` only hook `afterSetRequired`.
- `src/grid/Grid.mjs` group headers (`groupBy`): neo's grid has no group rows. The grid turns on
  `contentSizedRows`, gives the first row of a group the height of row + header
  (`view.setRowHeights()`, keyed by record id) and wraps instance methods of neo's Body
  (`createRowPool`, `isEditorEvent`) and Row (`createVdom`, which appends the header band as the
  row's last child). Check these against Body.mjs / Row.mjs after a bump. 14's silent
  `createVdom(true)` marks the body dirty (`hasSilentVdomChanges`); the wrapper restores the flag
  when it updates the row itself.
- `src/grid/Grid.mjs` empty state: neo's grid container builds its vdom children from its items
  (ARIA wrapper, scrollbars), so the empty state is no child node but `::before` (icon) and
  `::after` (text) of the root, from its `data-empty-icon` / `data-empty-text` attributes
  (class `go-grid-empty`, `grid/Grid.scss`). It is shown when `store.isLoaded && store.count === 0`
  after `load` / `filter` (neo re-fires add/remove as `load`), so not before the first load, not
  between the store's `beforeLoad` and its `load` / `loadError` (`emptyLoading`: a store that
  fires `beforeLoad` must end with one of those), and not after a `loadError` until the next load
  (the old empty records are no answer). Not `store.isLoading`: neo's `beforeSetData()` sets it
  and an equal empty array never clears it. `JmapStore`, email `MessageStore` and files
  `FolderStore` fire `beforeLoad`. The CSS puts
  it 30px down (the header height of `Grid.CHROME_HEIGHT`). A grid sized by `fitToRows()` shows
  none: its owner shows its own text (HistoryPanel, maildomains DomainGridCard). A plain neo Store
  whose `data` is set to `[]` again (equal to the last assignment) fires no `load`:
  set the data with `setDataAndFireLoad(store, records)` (`src/data/setData.mjs`; `JmapStore`,
  email `MessageStore`, files `FolderStore`) or fire it yourself, as zpushadmin
  `DevicesMain.load()` does. Records equal to the old ones fire no `load` either and leave
  `store.isLoading` true (neo's `beforeSetData()` sets it, the skipped `afterSetData()` would
  clear it); the helper resets it. `TextList`
  re-renders on a store swap to an empty store (neo only does that for a store with records).

## Left to build (2026-11-19)

1. ~~**Notes Markdown + image zoom**~~ — done: `MarkdownField`, `src/Markdown.mjs`, `ImageWindow`.
2. ~~**Grid export + batch edit**~~ — done: `src/export/exportEntities.mjs`, `GO.form.BatchEditDialog`.
   ~~**Create link while creating**~~ — done: `CreateLinkButton` in FormWindow (notes, tasks, contacts, calendar events).
3. ~~**Upload with progress**~~ — done: `jmap/Uploader.mjs` + `UploadPanel` (progress, abort, size limit).
4. ~~**HtmlField mentions** and **RecipientPicker**~~ — done: `HtmlFieldMentionPlugin` (comments), `RecipientsField` + `RecipientPicker` (used by the e-mail composer).
5. ~~**Drag and drop**~~ — done: `enableDragDrop()` (files, e-mail, address book, tasks, notes onto note books), sortable lists (`position: 'between'`, `dropIndex()`, module sorting), `GO.tree.Tree` node drag and drop.
6. ~~Small fields~~ — done: AutocompleteField, MapField, ListField, CheckboxGroup, ColorMenu, Month/WeekPicker (Dev demos).
7. Chart, EntityTypeTable. ~~Alerts/notifications, reminders, session activity watcher, start page~~ — done: `src/alerts/`, module `alerts` renderers (calendar invitations, tasks), `modules/summary/views/neo` (the files portlet waits for that module; e-mail has `portlet-email`).
8. ~~**E-mail client**~~ — done: `www/modules/email/views/neo` + sieve, smime, emailfavorites, core `src/Mail.mjs`. Files ↔ e-mail (Email files, Email download link, Save to personal folder) done too; see `docs/neo-email-module.md` → Status.
9. Gaps found by the Dev demos of the GOUI docs pages (2026-11-24, `src/dev/demo/`):
   - Window: no `alert()` / `error()` dialog like GOUI `Window.alert()` / `Window.error()`
     (there are `ConfirmDialog.ask()`, `TextPrompt.ask()`, `notifyError()`); no collapsible
     window (GOUI `collapsible`).
   - Form fields: no boolean switch (neo `Switch` resets to `null`, like neo's CheckBox before
     `BoolCheckBox`); no radio group field (GOUI `radio()` types button / box / list: neo `Radio`
     fields with one name, check-mark look, `null` after `reset()`); no GOUI checkbox type
     "button" outside `CheckboxGroup`; text fields have no leading `icon`, `prefix` / `suffix`,
     field `buttons`, or a password field with a generator (GOUI `passwordfield`).
   - Table: no footer / summary row (GOUI `setFooter()`, `footerRenderer`), no checkbox select
     column (GOUI `checkboxselectcolumn`). Sticky columns: neo's `locked: 'start' | 'end'`.
   - Buttons: no `accent` / `danger` colours (GO.button.Button has ui ghost / primary /
     secondary), no checkbox items in menus.
   - Patching: no runtime patch of an already set up class (GOUI `Component.patch()`);
     `Neo.overwrites` must exist before the class is imported.
   - HtmlField warns "HtmlEditor: node not found" when it is on the first page loaded by a
     deep link (e.g. `#dev/form/HtmlField` in a new tab); navigating there does not.

## Gotchas from the parity audit (2026-11-19)

- A `Neo.tooltip.Base` with a `delegate` matches only vdom nodes of its component: targets in
  a component's raw `html` never fire `targetOver` (`DomEvent.verifyMouseEnterLeave()` looks
  in the vdom). Render them as vdom (`demo/Tooltip.mjs`).
- `GO.component.Splitter` in a vbox needs `direction: 'horizontal'` (neo's default is
  'vertical', a 5px column that resizes widths).
- A vbox with `align: 'stretch'` gives items without `flex` a flex of 1: in a scrolling page
  fixed-height items shrink or get stretched. Give them `flex: 'none'` (`itemDefaults`); an
  item that sets its own `style` may lose the `flex` the layout writes into it, so a page that
  must not shrink its items puts `flex: '0 0 auto'` into their style (`demo/Page.mjs`).

- A local store without a model whose `id` values are strings ('create', 'update', …) gets
  generated ids (-1, -2, …) and a CheckList on it crashes with `isRecord` of undefined. Give
  such stores a model with `{name: 'id', type: 'String'}` (see `HistoryMain.mjs`).
- A `change` listener on a checkbox that hides or shows a sibling also runs while the form
  loads and can drop the checkbox's tick. Listen to `userChange` and sync once in the load
  hook (calendar `PreferencesPanel.mjs`).
- `EntityListPanel` takes a `jmapFilter` for its query (davclient: own accounts only),
  `mayEdit(record)` / `mayDelete(record)` to hide a row's buttons, `createToolbarItems()` and `createHeaderItems()` for
  items in and above its toolbar; a subclass may override `load()` / `edit()` / `remove()` for a legacy
  store (`CronPanel.mjs`).
- Legacy `update` / `create` actions of an `AbstractModelController` save on every POST: load
  their form with `client.legacy(route, params, {method: 'GET'})`, a POST with only the id
  would save the record (core/cron/update would empty the job's `params`).
- Two classes in one file: don't nest a className under the other's
  (`GO.x.Dialog.Field` makes `GO.x.Dialog` a namespace object, and `Neo.setupClass()` of the
  dialog then returns `{}`: "Class created with object configuration missing className").
- `client.user.confirmOnMove` is loaded (`USER_PROPERTIES`); moves of contacts and files ask
  only when it is set.
- Rich hover info: a `Neo.tooltip.Base` with `componentId` and a string `delegate` such as
  `'[data-uid]'`, its `html` set in `targetOver` (calendar `CalendarView.createTooltip()`).
  Don't keep it in a property called `tooltip`: that is a reactive Component config and
  assigning to it recurses until the stack overflows. A function `delegate` must return
  `undefined` for no match; `null` crashes `DomEvent.verifyDelegationPath()`.
- A neo `ComboBox` is 150px wide by default; give it `width: null` to stretch in a vbox.
- `PrincipalCombo`'s value is the list record (`id`, `name`), without `email`: fetch the
  Principal when you need the address (calendar `EventDetail.onOrganizerChange()`).

## Gotchas from drag and drop and the small fields (2026-11-19)

- neo's `List` has a `draggable_` config that turns on its own pointer DragZone: a subclass
  config of the same name (GOUI Tree `draggable`) breaks native drag and drop. `GO.tree.Tree`
  calls it `dragNodes`.
- neo lists (menus too) fire `select` for their selection: a list subclass needs another name
  for its own event (`GO.menu.ColorMenu` fires `colorSelect`).
- `{...record}` of a neo Record is empty: the fields are getters. Copy them by name.
- Headless Playwright drives native drag and drop with `dragTo()`, but with `mouse.move()` the
  last move often sends no `dragover`: move once more before `mouse.up()`.
- A floating menu takes the focus when it mounts (`focusOnMount: true`): suggestions shown while
  typing need `focusOnMount: false` and their own close on the field's focus leave
  (`AutocompleteField.onFocusLeave()`).
- neo's `getItemRecordId()` takes the part after the first `__` of a row id: ids that contain
  `__` resolve wrongly. Strip the exact `<list id>__` prefix (`GO.tree.Tree.nodeIdOf()`).

## Default webclient (2026-11-20)

neo is the default webclient; the classic client stays reachable (`?webclient=classic`, the
user menu switch, `$config['webclient'] = 'classic'`) and modules only it has open there from
neo's apps menu, links, search, alerts and `#<entity>/<id>` hashes. Plan, decisions and what was
built: `docs/neo-switch.md`; neo side in `www/views/neo/README.md` (Run, `src/classicApps.mjs`,
module contract).

## Third-party DOM libraries in a module (Syncfusion, 2026-11-20)

A library that needs the real DOM (Syncfusion ej2) runs in a main-thread addon of the module,
next to its views: `go/modules/community/syncfusion/views/neo/addon/Syncfusion.mjs`. neo resolves
`WS/<name>` addons in `views/neo/src/main/addon/`, so a module addon is imported with a relative
name: `Neo.Main.importAddon({name: 'WS/../../../../../go/modules/<pkg>/<module>/views/neo/addon/<Name>', windowId})`
(development build only, like all of neo here). The worker component gives the addon a DOM id,
listens for custom DOM events the addon sends (`DomEvents.sendMessageToApp`, e.g. `syncfusionSave`
on the dialog) and does the JMAP calls itself; Blobs and Files come back from addon remotes by
structured clone. Details and gotchas: `go/modules/community/syncfusion/views/neo/README.md`.
