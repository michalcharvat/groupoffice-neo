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
| Menu, AbstractMenu | menu/List, button menu | GO.neo (`GO.menu.List`; a floating root closes on a mousedown outside it anywhere in the window: neo listens on `app.mainView` only, which dialogs lie outside, so GO adds a `vnodeId: 'document.body'` listener; without it a click that moves no focus left the menu open) |
| ColorMenu | – | GO.neo (`GO.menu.ColorMenu`: GOUI palette + Auto, `colorSelect` {color} (neo lists already fire `select`), the menu's button takes the colour) |
| Window | dialog/Base | GO.neo (`GO.view.Dialog`: mask fixes, popout) |
| Panel, CardContainer, CardMenu | container/Panel, layout card, tab/Container | neo |
| Splitter | component/Splitter | GO.neo (`GO.component.Splitter`, state) |
| Toolbar, OverlayToolbarButton | toolbar/Base | neo (overlay: missing) |
| Paginator | toolbar/Paging | neo (Notes uses infinite scroll) |
| List, ListPicker | list/Base | GO.neo (`TextList`, `CheckList`; empty state with `emptyText` / `emptyIcon`, off by default because a TextList is also the combo drop-down) |
| Table, TableColumns, RowSelect | grid/Container (buffered) | GO.neo (`GO.grid.Grid`, `selectRow`; row height in px from the measured density: dp(40) one-line = 35px Paper / 29px Compact, `rowLines: 2` (avatar or two lines: users, address book, duplicates, RecipientPicker) dp(56) = 48px / 40px; follows `Preferences.applyTheme()` live); keys: `enterKey` / `deleteKey` (Delete, Ctrl/Cmd+Backspace) events with `{records}` outside inputs; `switchState(stateId)` swaps the column state, e.g. addressbook organizations view; `customFieldsEntity: 'Note'` adds a column per custom field (`customfields/gridColumns.mjs`: renderer per type from `types.mjs` `cellHtml()`, names of user/group/contact fields loaded per page, GOUI state key = databaseName, server sort on `customFields.<databaseName>`, "Hidden in grid" = hidden; the model needs a `customFields` field, neo drops undeclared keys); empty state (GOUI `emptyStateHtml`): `emptyText` (default "No items found") and `emptyIcon` (default `article`) below the header once the store has loaded with no records, `emptyText: null` for none; cells stay on one line (GOUI table): a text-only cell is a block with an ellipsis, a cell with elements stays neo's flex box and is clipped, so a renderer needs no own one-line span (`Grid.scss`) |
| SelectAllCheckboxField, MultiSelectToolbar | – | GO.neo (`GO.grid.Grid` `multiSelect`, `RowSelectionModel` with `selectAll()`, `MultiSelectToolbar`; Notes deletes several notes) |
| Tree, TreeStore, TreeColumn | tree/List, tree/Accordion (basic) | GO.neo (`GO.tree.Tree`: lazy `nodeProvider`, checkboxes, drag and drop with `dragNodes` / `dropOn` / `dropBetween` (fires `drop` {dragNode, node, position}, expands a node after 1 s, `moveNode()`; not `draggable`, that is neo List's own DragZone); `node.badge` (escaped text, hidden at 0, red fill; `setBadge()`, subclasses map their own field in `badgeOf()`, email uses `unseen`); `nodeMenu: true` or `node => Boolean` shows a ⋮ per row, the icon and a right click fire `menu` {node, target}, the host builds the items and calls `showMenu(items, target)` (email `AccountTree`; addressbook and site trees still build their menus themselves); `openPath(ids)` expands down a path (waits for a running `reload()`, loads lazy levels and further pages) and selects the last node; paging: a provider gets `(node, {position})` and may return `{nodes, hasMore}`, the level then ends in a "Show more..." row (`loadMore(parentId)`); `reload()` loads only the first page again; Dev demo Tree; tests `tests/tree.test.mjs`; no extra columns) |
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
| CodeField (sf/codemirror `sfcodemirroreditor`) | – | GO.neo (`form/field/CodeField.mjs` + core main-thread addon `main/addon/CodeMirror.mjs`: CodeMirror 5 (`codemirror@5` of `views/neo/package.json`, kept by `buildScripts/release.mjs`), modes on demand by name / extension / MIME; `mode` ('json' validates with the parse message), `editorHeight` (neo owns `height`), `readOnly`, `required`; text equal to the editor's text of the loaded value keeps the loaded value (no dirty form); dark theme `material-darker` while `body.dark`; a monospace textarea when the library does not load; demo `#dev/form/CodeField`) |
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
| Kanban board (GOUI has none; ExtJS business/kanban) | GO.neo (`GO.board.Board`, see "GO.board.Board" below; first user: tasks board view) |
| Resource scheduler / timeline (vis-timeline in amd/crew) | GO.neo (`GO.scheduler.Scheduler`, see "GO.scheduler.Scheduler" below; first user: crew planning) |
| PDF / image preview (ExtJS amd/libs `PdfViewPanel`; GOUI has none) | GO.neo (`GO.pdf.PdfViewer`, see "GO.pdf.PdfViewer" below; demo `#dev/core/PdfViewer`; users: crew certificate verification, later dms and invoices) |
| auth/Login | GO.neo (`apps/go/view/LoginView.mjs`: forgot credentials, 2FA via `loginPanels`) |
| Main area (GOUI/ExtJS card per module) | GO.neo `apps/go/view/MainView.mjs`: one card per module. Modules extend it through `mainViewExtension` (extra cards, top-bar items, routes, claimed module views; `docs/neo-small-modules.md`, "Main view extensions"). The module sf/workspaces (sf-mono, off by default) adds workspace tabs next to the module tabs, each a dock (`GO.workspaces.Workspace` over neo's dock; panels side by side, drag from the top bar, maximize, saved per user and screen profile; `docs/neo-workspace.md`) |
| MainThreeColumnPanel, TableTitle | GO.neo |
| DetailPanel | GO.neo (`GO.detail.Panel`: toolbar, standard cards, `load(id)`, see "Entity detail" below; `detail/Card` + panels, `GO.detail.LinesCard` for label / value lines); `Card` `capability` hides a card without module access (history, comments, files) |
| Comments, Files (legacy files), History | GO.neo (`CommentsPanel`, `FilesPanel`, `HistoryPanel` + `HistoryDetailDialog`). `FilesPanel` takes files dropped from the desktop; with the files module's neo UI a click opens the file with the user's file handler (ModuleRegistry hook `openFile`) and "Browse files" opens the entity's folder in `#files/folder/<id>` |
| FilterPanel (saved EntityFilters) | GO.neo (`FilterPanel`, `FilterDialog`; value editors per filter `type` in `view/filterTypes.mjs`: string/number/date, `select` {options}, `user`, `group`, `entity` {entity, jmapFilter}, `link`; the entity's custom fields are added as filters. `searchFilter(text, filters, entity)` gives a toolbar search GO's `name:value` syntax, ExtJS go.util.Filters.parseQueryString; "Input field" = EntityFilter type variable, `VariableFilterDialog` + a chips field per filter in the panel, values ORed, ExtJS go.filter.VariableFilterPanel; no permissions tab, like the neo FilterDialog) |
| Global search | GO.neo (`GlobalSearch`) |
| App launcher (main menu; ExtJS 6.8 `MainLayout.js` startMenu, Paper `#startMenu`) | GO.neo (`view/AppLauncher.mjs` + `AppLauncher.scss`): full-screen overlay (blur + dark backdrop, solid without blur on phones, 3-4 columns), logo of System settings → Appearance (`Neo::brandingCss()` `.go-app-launcher-logo`), search over module name + title (focused on open, not on touch devices; Enter opens the first match), tiles with the `core/moduleIcon` blob (`moduleIconUrl()`, `mtime` = session `cacheClearedAt`), counts of `Badges.mjs` (`setBadge()`), classic-only apps (D3) marked, open in a new tab; arrow keys / Home / End over the grid, ArrowUp from the first row back to the search, Escape or a click outside closes and returns focus to the button. Events `open` {name, app}, and with Shift `openBeside` {name, app, preventDefault()} for the planned dock workspace (no listener yet: opens as usual). My account → Look & feel "Main menu": launcher (default) or the old list, per user in this browser's localStorage (`getMainMenuMode()` / `setMainMenuMode()`, State key `neo-main-menu-<userId>`, stored when My account is saved, not on cancel, and not with User/set). 6.8's sub-menu modules (`inSubmenu`) are tiles with the rest, as in 6.8; neo has no sub-menus. The default logo of launcher and header, `views/neo/resources/images/logo-white.svg`, is the classic Paper artwork (outlined paths, no text) and reads "Group Office"; writing "GroupOffice" needs new artwork from Intermesh, or a logo uploaded in System settings → Appearance. The header's tooltip is the `title` setting (default "GroupOffice"). Dev demo `#dev/core/AppLauncher` |
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

## MainThreeColumnPanel widths (2026-11-25)

`GO.view.MainThreeColumnPanel` follows the module's own width (`container-type: inline-size`,
`@container` rules in `MainThreeColumnPanel.scss`), with GOUI's breakpoints: above 1200px west,
center and east; 577–1200px center and east with the west as a drawer over them (GOUI
`.main-3-col .west` below `$breakpointMedium`), open while it is the `go-active` panel; up to 576px
one card (`go-mobile-cards`). `showWestButton()` shows in medium and narrow; `hideWestButton()` only
activates the center there and hides the sidebar (`setWestHidden(true)`) only above 1200px, so
closing the drawer doesn't leave the wide layout without its sidebar. Selecting a record
(`activatePanel('east')`) closes the drawer too.

## CSS grid in a flex-filled panel (2026-11-25)

A grid that gets its height from the layout (`flex: 1` in a vbox) shares that height among its
implicit `auto` rows when the items' minimum is small (an explicit `min-height`). The rows then end
shorter than their content and the next row overlaps the previous one (the summary start page in one
column). Give such a grid `grid-auto-rows: max-content; align-content: start`.

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
- `sf/workspaces/views/neo/Workspace.mjs` (`GO.workspaces.Workspace`, sf-mono) wraps `Neo.dashboard.dock.Workspace`; check its
  overrides against the new dock: `applyDockZoneOperation` (adds a dragged-in module to the catalog
  before the drop's operation), `resolvePane`, `getPreservedItemIds`, `getDockProjectionOptions` (the
  drag affordances' cross-zone seams), `beforeRefreshDockWorkspace`, the reconciler quirk handled in
  `syncCards()` (an added pane is activated silently, the old card stays visible until the next
  update) and the tab button → pane lookup in `onPaneClick()` (tab buttons don't keep `dockItemId`).
  Then, with sf/workspaces installed, drag a module from the top bar, maximize, close and switch
  workspaces in the browser.
- `src/data/setData.mjs`: neo skips an assignment equal to the last assigned `data`, also when
  the store changed since (`add()`, `remove()`); the helper then replaces the records itself.
- `Neo.php` build id carries the installed neo.mjs version (`NeoTest::testBuildIdCarriesTheNeoVersion`).
- Toggle buttons start with `pressed: false`: 14's default is `null` (a plain button, no
  `aria-pressed`).

- `src/form/field/textAutoComplete.mjs`: replaces `Text.afterSetAutoComplete` (string values).
- `src/form/noNativeSubmit.mjs`: every `button.Base` root `<button>` gets `type="button"` (via
  `syncNativeDisabledState`; 14 sets it only on the plain button, not on tab headers, table headers
  or the split button, which then submit a FormWindow: native validation of hidden required fields,
  Enter "clicks" the first tab) and `form.Container` renders `novalidate`. A raw `{tag: 'button'}`
  in a vdom needs `type: 'button'` itself. Tests `tests/noNativeSubmit.test.mjs`.
- Enter submits a form (ExtJS `go.form.Dialog` hidden submit button, GOUI `<form>`): neo forms
  don't submit natively (`onsubmit="return false;"`, app in a worker), so a form binds
  `keys: {Enter: submitOnEnter('submit' | 'up.onLogin')}` (`src/form/submitOnEnter.mjs`); FormWindow
  does it for every entity dialog. A plain `keys: {Enter: 'up.x'}` does nothing: 14's
  `KeyNavigation` looks the string up on the component itself and has no `up.` search (only
  `handler` does). Enter submits only from an `<input>` without modifiers and outside an IME
  composition (keyCode 229), not when a component between the input and the form binds Enter in
  `keys` (pickers open their list) or returns true from `ownsEnterKey(data)`: ChipsField,
  AutocompleteField, calendar SuggestField, HtmlField (link bar), ColorField (colour input only),
  DurationField (takes its value on `change`, which arrives after the keydown). A field that uses
  Enter through a DOM keydown listener, or commits its value only on `change`, must add
  `ownsEnterKey()`. A `submit()` override must refuse a second call before its first `await`
  (Enter repeats; see calendar `EventDialog.submit()`). Tests `tests/submitOnEnter.test.mjs`.
- `src/view/Dialog.mjs`: overrides `close`, `closeOrHide`, `getFocusReturnTarget` (14 returns the
  focus through it on close and on destroy; 13.4 only via `revertFocus`), `onKeyDownEscape`,
  `afterSetHidden`, `getFirstField` (14 focuses the first field on open; skip inactive cards).
  Escape goes through `onEscape()` (`keys` config and the body-Escape patch): 14 cancels a
  header drag on Escape, and that Escape must not also close (keydown and `drag:cancel` arrive
  in either order). `DialogResizable` no longer copies the size into `style`: 14 resizes `style`
  itself (`styleConfig: 'style'`). Popout `wrapperStyle` uses `'0px'`: 14's `initVnode()` turns a
  falsy `left`/`top` into `'initial'`.
- Drag out of the page (`src/view/DialogDragZone.mjs`, `dragZoneConfig` of `GO.view.Dialog`, modelled on
  neo's `desktop/WindowDragZone.mjs`): a dialog with a visible popout tool (`canPopOut()`) may be dragged
  past the page edge (`allowOverdrag`). Once under half of it is inside and the drag keeps moving out,
  `popOut(rect)` opens its window at that point and the main `DragDrop.startWindowDrag()` moves the
  window with the pointer until release. Dragged back in the same drag until over 60% of it covers the
  page, `returnDuringDrag()` closes the window (`Dialog.cancelPopOut()`: not adopted yet) and turns the
  window drag back into the proxy drag (`setConfigs({isWindowDragging: false})`).
  The popup adopts the dialog only after release (`pendingAdopt`, `endPopOutDrag()`): adopting during
  the drag moves the drag zone to the popup's `windowId` (`afterSetWindowId`), and the proxy's
  `removeNode` then goes to the wrong window, leaving a transparent proxy in the opener. `window.open()`
  needs the user activation of the pointerdown: a drag held for longer (Chrome: ~5 s) gets the popup
  blocked, and the dialog stops at the edge again (`keepInPage()`).
- Return to the page (`Dialog.returnToPage()`, the "popin" header tool that `headerTools('popout')` adds
  hidden and a popped out dialog shows): reverse of `adoptWindow()`, which saves what it changes in
  `pageState`. The dialog lands where its window is, in its window's size, kept inside the page. Every
  `popOut()` makes a new `popup` object with its own id (`<dialog id>-<n>`: window name, `?neoPopup=`,
  pending entry) and its callbacks check `me.popup === popup`: the closing window
  (`PopupView.destroy()` → `onClose`) must not close a dialog that went back, and a cancelled attempt
  still opening must not close or take over the next. The landing rect inverts `openPopup()`: neo's
  `windowOpen()` (`useTotalHeight`) makes the dialog size the window's outer size. When the page window
  goes away, the dialog stays in its window and the tool hides. Dragging back counts the coverage of
  the area that fits into the page (a dialog wider than the page can return). `style` and `wrapperStyle`
  merge shallowly: a key goes away only when set to `null`. Dragging the popup window itself back cannot
  return it (the browser owns its title bar).
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

## GO.board.Board (2026-11-27)

`src/board/Board.mjs`, a thin layer over neo 14 `Neo.board.Container` (`node_modules/neo.mjs/src/board/`; examples
`examples/board/wipLimits`, `swimlanes`). Generic: it knows no entity, the user (tasks) passes functions.

neo's board projects ONE store into columns by `statusField`, one card per record (cards keyed by record key). GO
needs a record in several columns (task categories), so the board keeps its own projection store
(`GO.board.CardModel`): one row per (source record, column key), id `<sourceId>::<columnKey>`, fields `sourceId`,
`status` (column key), `order`, plus the display fields of `cardData()`. It is rebuilt from the source store on
`load`, `loadMore` and `recordChange`, not while the board is hidden: the caller sets `boardColumns` and calls
`rebuild()` when it shows the board.

| Config | What |
|---|---|
| `sourceStore` | the data, e.g. a `GO.data.JmapStore`; not loaded by the board |
| `boardColumns` | `[{key, title, color, dropDisabled}]` in order; `color` CSS colour; `dropDisabled` refuses drops (tasks "Overdue") |
| `columnsOf(record)` | column keys of a record (`[]` = not shown, several = a card per column) |
| `compare(a, b)` | order inside a column (source records); no manual order |
| `cardData(record)` | display fields: `title`, `tags` `[{name, color}]`, `assignee` (name, avatar), `due` (text), `overdue`, `icons` `[{icon, cls, title}]` (Material Symbols), `progress` (0-100, null = no bar), `color` (card accent) |
| `canDrag(record)` | false: the card goes back on drop (no write permission) |
| `dropPatch(record, fromKey, toKey)` | the JMAP patch for a drop, null refuses it |
| `entity` | JMAP entity the patch is sent to (`client.set`) |

Events: `cardSelect {records}` (click; neo's `selectionChange`), `cardOpen {record}` (double click, Enter, F2),
`cardMenu {record, card, target}` ("..." button; the caller shows `GO.menu.List.showAt({target})`), `dropError {error}`.
`moveRecord(record, fromKey, toKey)` runs the same path as a drop (the "Move to column" menu, keyboard / touch).

Cards of a record `canDrag()` refuses are not armed (`GO.board.SortZone`), so they can't be picked up. The moves of
one drag are sent per record as one patch after the drag: `dropPatch()` of a second card of the same record sees the
first card's change (two category cards of one task dragged together). A moved card keeps its `compare()` order.
neo's container `moveTo(fromIndex, toIndex)` reorders items: don't override it.

Drag only between columns: a drop inside its own column, onto a `dropDisabled` column, of a record `canDrag()`
refuses, or with a null patch writes nothing and re-projects (the card goes back). A drop moves the card at once,
then `client.set()`s the patch; a refusal re-projects from the source and fires `dropError`. Success needs nothing:
the JMAP push reloads the source store.

Gotchas: a `flex` change of an hbox child after construction is not applied (the layout sets it once): set
`style.flex` (tasks board widens the center that way). A neo Model drops undeclared fields, so a list store that
feeds columns needs the field (`TaskList.groups`).

Not used: neo's `CardEditor` (cards are records of another entity; `GO.board.Card` turns the title edit into
`cardOpen`), column reordering (`columnsResortable: false`), swimlanes (`laneField`: later).

## GO.scheduler.Scheduler (2026-11-27)

`src/scheduler/Scheduler.mjs`, a thin layer over neo 14 `Neo.scheduler.Container` (`node_modules/neo.mjs/src/scheduler/`,
`src/timeline/`; examples `examples/scheduler/*`). Generic like `GO.board.Board`: it knows no entity, the caller passes
the resources and field mappings. First user: amd/crew Crew Planning (`docs/neo-crew-port.md` section 3).

| Config | What |
|---|---|
| `resources` | `[{id, parentId, name, bookable, cls, collapsed}]`, a tree by `parentId` (null = top level), in display order with every parent before its children (a child listed first ends up a top-level row); ids are compared as strings, unique across levels (prefix them: `vessel-5`, `rank-5-3`) and never `root` (the TreeStore's own root key). Projected into a `Neo.data.TreeStore`: `isLeaf` is derived from the children, `collapsed` defaults to false |
| `store` | default `{module: TreeStore, model: GO.scheduler.ResourceModel}` (`name`, `bookable`, `cls`); for more resource fields pass your own `TreeModel` subclass the same way (neo drops undeclared fields) |
| `resourceColumns` | neo's resource columns; `type: 'tree'` on the first one gives the expand/collapse arrows (`GO.grid.TreeColumn`, see below); default one tree column "Name" on `name` |
| `events` | a `GO.data.JmapStore` (rebuilt on `load`, `loadMore`, `recordChange`; the scheduler does not load it) or an array of plain objects |
| `eventFields` | `{startDate, endDate, resourceId, title, cls}`: each a field name of the source record or a function `record => value`; defaults are the same names. A record without `id` or resource, or ending before it starts, is left out. Dates are instants (ISO with offset or Z, Date, ms) and are shown in the user's time zone (`DateUtil.toUserTime()`) |
| `readOnly` | true: no drag, no resize handles, no EventEditor, no keyboard moves (neo's ArrowLeft / ArrowRight on a focused bar ignore `editable` and `barDraggable`, the wrapper blocks them) and `moveEvent()` returns null. Switching it off again turns drag, resize and the editor on; false at construction leaves neo's `barDraggable`, `resizableBars` and `editable` as passed |
| `eventRenderer(record, descriptor)` | `{html, cls}` merged into neo's bar node: `html` replaces the label (escape it yourself), `cls` (string or array) is added. A string (also `''`) sets the label text. Don't pass neo's own `barRenderer`: the wrapper sets it to run `eventRenderer` (neo's returned object would replace the whole bar node) |
| `timeAxis` | neo's `Neo.timeline.TimeAxis` config (`start`, `end`, `tickUnit`, `pxPerMinute` …) in wall time of the user's zone. `start` and `end` are the range; start it on the 1st of a month for month ticks (they are anchored to `start`) |
| `timeZone` | IANA zone of the bars, bands, axis range and `slotClick` dates instead of the user's (diary: one vessel's day in its own zone); an unknown name falls back to the user's with a console warning. Changing it re-shows the bars. See "Time zones other than the user's" |
| `backgrounds` | `[{resourceId, startDate, endDate, cls, inherit}]`: bands behind the bars of a row, rendered by `GO.scheduler.TimelineColumn` next to neo's non-working bands. Dates are instants like the events; a band ending before it starts is left out. `inherit: true` paints the row and every descendant (crew: a port call on the vessel row and its rank rows; the company row gets none). `cls` (string or array) is added to `go-scheduler-background` (default colour: primary at 14 %). Bands are at least 2 px wide (a 30-minute crew change line stays visible) and take no pointer events, so a click on a band is a slot click |
| `zoom` | a preset applied at construction and on change: neo's `hour`, `day`, `week` plus `month` (day ticks, month header), `quarter` (week ticks, month header) and `year` (month ticks, a header per 3 months counted from the axis start month, so calendar quarters only when the range starts in January, April, July or October). `zoomTo(presetOrConfig)` takes the same names or a neo axis config; presets are in `Scheduler.zoomPresets`. Header labels use neo's formatters in the user's GO language (`Translate.language()`, also passed to neo's header, which otherwise keeps `Neo.config.locale`); `timelineColumnConfig: {locale}` overrides it |
| `growRange` | true: when the view comes within one view width of the axis start or end (on scroll, when the view is measured or resized, and after a zoom), the axis grows by whole months (two view widths, at least one month), the date at the left edge stays in place and `rangeChange` fires. `scrollToDate(date)` first grows the range to contain `date` (plus one month). Default false: the axis keeps `timeAxis.start` / `end` |

The normalised events live in a `Neo.timeline.store.Events` (`eventStore`): `{id, resourceId, startDate, endDate, title,
cls}`, because neo's lookup reads those literal field names. `getSourceRecord(eventId)` returns the record it came from.

Events:

- `eventClick {record, eventRecord}`: a click on a bar; `record` is the source record, also when read-only.
- `slotClick {resource, date}`: a click on the empty track (or a background band) of a row whose `bookable` is not
  false; `resource` is the row's record, `date` the clicked moment as wall time of the user's zone (`fromUserTime()`
  for the instant), not snapped. `getSlotTarget(data)` does the bar / row / x → date part (`TimeAxis.xToDate()` of
  `clientX` minus the track's left edge).
- `rangeChange {start, end}`: the axis grew (`growRange`); wall-time Dates. Load the events of the new window here.

Interaction permissions are the caller's: pass `readOnly: true` when the user may not change the events.

Grid cell values are escaped. neo writes a cell renderer's string into the cell as HTML, and its default renderer
(a column without `renderer`) returns the raw value; `Neo.grid.column.Tree` does the same with its label. So in
`GO.grid.Grid` and `GO.scheduler.Scheduler` the plain column (`type: 'column'`, the default) maps to `GO.grid.Column`
(`src/grid/Column.mjs`) and `type: 'tree'` to `GO.grid.TreeColumn` (`src/grid/TreeColumn.mjs`); both escape the value.
For trusted HTML the caller built and escaped itself (an avatar, a badge), set `htmlValue: true` on the column. A column
with its own `renderer` returns markup and escapes the values itself (`escapeHtml()`); for an entity-encoded legacy
value (files, e-mail stores) that is `escapeHtml(decodeEntities(value))`, not the raw value. A grid of your own on
`Neo.grid.Container` gets neo's unescaped classes; use `module: Column` / `module: TreeColumn` there. GO's own
`GO.tree.Tree` escapes its labels already.

neo's `String` field type (`RecordFactory`, also `GO.scheduler.ResourceModel.name`) deletes anything between `<` and
`>` from the value: lossy (`x<y>z` shows `xz`, `<b>x</b>` shows `x`) and no sanitizer, so never count on it instead of
escaping. `GO.menu.List` types its item `text` as `Html` (`GO.menu.Model`, `src/menu/List.mjs`) so an item like
"Jane <jane@example.org>" keeps the address; it is still rendered as text.

Don't escape what goes into vdom `text` (a vdom node's `text`, a component's `text` config, a `GO.menu.List` item's
`text`): neo sets it as text and escapes it itself, so `escapeHtml()` there shows `R&amp;D` for "R&D". Escape only
strings that become HTML: a renderer's return value, vdom `html`, a template string. Module titles
(`ModuleRegistry`) are HTML (the app launcher renders them so; bookmarks escape their names): as vdom text use
`htmlToText(title)`.

Not built yet: drag and resize writing a JMAP patch (with the first user that edits on the scheduler). Dev demo:
`#dev/core/Scheduler` (bands, zoom buttons, slot click, growing range).

## Time zones other than the user's (2026-11-28)

The UI works with wall-time Dates of the user's GO zone (`DateUtil.mjs`, top comment). For a record that lives in
another zone (a vessel, a port call) the helpers take an optional IANA zone; null or an unknown name (console
warning) is the user's zone:

- `DateUtil`: `toUserTime(instant, timeZone)`, `fromUserTime(wall, timeZone)`, `toIsoLocal(wall, timeZone)` (the
  zone's offset at that instant, DST-correct via `tzOffset()`), `toIsoAt(instant, timeZone)`, `resolveTimeZone(name)`
  checks a name. A wall-time Date cannot tell the two occurrences of a repeated DST hour apart (it maps to the first;
  a skipped hour moves forward), so code that has the instant formats it with `toIsoAt()`: DateTimeField does, and an
  untouched value in the repeated hour stays as it is.
- `GO.form.field.DateTimeField` `timeZone`: the inputs show and edit the wall time there, the value is ISO 8601 with
  that zone's offset (`2026-06-15T16:00:00+08:00`). An untouched value round-trips unchanged (no `userChange`).
  Setting another zone on a filled field keeps the instant and re-shows it (classic diary `setTimezone()`); a value
  without an offset (`withTimeZone: false`) keeps its wall time. `getValueAsDate()` and min/max compare in the
  field's zone.
- `Format.formatDateTime(value, timeZone)`, `formatUserDateTime(value, timeZone)`: the classic
  `go.modules.amd.diary.helpers.formatDateTime(value, vesselTimeZone)`, for grid columns and detail cards.
- `GO.scheduler.Scheduler` `timeZone` (see its table). Not covered: neo's now line of the `TimeAxis` reads the
  browser clock (also without `timeZone`).

## neo user settings (2026-11-27)

Per-user settings of the neo client go in an own `neo_<module>_user_settings` table, never in an upstream table
(`tasks_user_settings`, `core_user`, `go_state`): see `docs/neo-upstream-sync.md`. First one: `neoTasksSettings`.

1. Table in `www/go/core/webclient/neo/install/updates.php`: `userId INT(11) NOT NULL` primary key with a foreign
   key to `core_user (id) ON DELETE CASCADE`, settings columns nullable or with a default.
2. Property class in `www/go/core/webclient/neo/model/` (example `TasksUserSettings`: public `$userId`, the
   settings, `defineMapping()` with `addTable()`).
3. One line in `Schema::USER_PROPERTIES`: `'neo<Module>Settings' => [Class::class, 'neo_..._user_settings']`.
   `Schema::onUserMapping()` adds it with `Schema::addProperty()`: `Relation::one($cls, true)` (auto create) keyed
   `id => userId`, only when the table exists.

This list is for core neo only. A module declares its own properties, see the next section.

A user without a row reads the defaults; the row is inserted when User/set changes the property
(`{"neoTasksSettings": {"boardGroupBy": "progress"}}`). Planned next: `neo_notes_user_settings`,
`neo_addressbook_user_settings`, `neo_calendar_preferences`.

## neo tables of modules (2026-11-27)

A module that needs neo-only data (sf/tours: which client a tour is for) keeps it in its own `neo_*` tables, never
in its upstream tables, so the module still runs on GroupOffice 26.x without neo.

1. **Updates** in the module's `views/neo/install/updates.php`, same format as core neo's
   (`$updates['YYYYMMDDHHMM'][] = "SQL"` or a closure). Table names `neo_<package>_<module>_*`. Never edit a
   committed entry; make each safe to rerun (`IF NOT EXISTS`). A foreign key to the module's own table is fine
   (`ON DELETE CASCADE`); never ALTER an upstream table.
2. **When they run:** `Schema::migrate()` (upgrade, every neo page render, `php cli.php core/Neo/migrate`) runs core
   neo first, then every installed, enabled, available and allowed (`allowed_modules`) module that has the file, each counted in its own
   `neo_schema` row (`module = 'package/name'`). A module installed later gets its updates on the next run.
3. **Property on the module's entity:** a `Property` class over the table (like `TasksUserSettings`, the module's own
   namespace) and a mapping listener registered in the module's `defineListeners()`, guarded so it stays inert on
   26.x where neo core is missing:

   ```php
   public function defineListeners() {
       parent::defineListeners();
       if (class_exists(\go\core\webclient\neo\Schema::class)) {
           Tour::on(Property::EVENT_MAPPING, static::class, 'onNeoTourMapping');
       }
   }

   public static function onNeoTourMapping(Mapping $mapping): void {
       \go\core\webclient\neo\Schema::addProperty($mapping, 'neoClient', TourClient::class,
           'neo_sf_tours_tour_client', ['id' => 'tourId']);
   }
   ```

   `addProperty()` adds `Relation::one($cls, true)` (auto create) only while the table exists, so the entity works
   before the migration. Listeners are cached: after adding one, clear the cache (`go()->clearCache()` or
   System settings → Tools).
4. **Uninstall:** `php cli.php core/Neo/uninstall` drops every `neo_*` table, modules included, and `neo_schema`.
   Uninstalling only the module through GroupOffice leaves its `neo_*` tables and `neo_schema` row behind (its
   `uninstall.sql` runs with foreign key checks off). Not handled yet: a reinstall then keeps the old rows.
5. **Tests:** `tests/go/core/webclient/neo/SchemaTest.php` (`Schema::migrateFiles()` with a temporary updates file).

## Form extensions: fields of another module in a FormWindow (2026-11-27)

ExtJS modules extended another module's dialog with `Ext.override(go.form.Dialog)` (amd/formbuilder renders
`entity.formBuilder.formStructure` into the crew voyage dialog). In neo a module registers `onFormWindow` in
`ModuleRegistry.register()`; `src/view/FormWindow.mjs` calls it for every new window and keeps what it returns
on `form.extensions` (`src/form/formExtensions.mjs`, test `tests/formExtensions.test.mjs`):

```js
onFormWindow: win => win.entityName !== 'Voyage' ? null : {
    load: async data => {},             // add fields/cards for data (win.addCard(), win.generalTab.add())
    save: async ({data, isNew}) => {}   // change what is sent, e.g. delete data.formBuilder?.formStructure
}
```

- `load(data)` is awaited in `DataSourceForm.applyData()` before the values are set: on `create()` (data = the
  initial values), `load()` and after every save (data = the saved entity). Fields it adds get their values and
  are part of the unmodified state (`originalValues`), so they count for `isModified()`/`getModified()`. It runs
  again after a save: rebuild only when the structure changed. A failing `load()` is logged, the form still loads.
- `save(event)` is awaited before `beforesave`; `event.data` is mutable. A new entity sends all values (fields +
  values without a field), an existing one only `getModified()` (nested by field name: `formBuilder.answer` →
  `{formBuilder: {answer}}`). On create the field values replace a nested initial value shallowly
  (`{...entityData, ...fieldValues}`): parts of `formBuilder` without a field are dropped. If the property must go
  whole, `save()` fills it in. A throwing `save()` stops the save and shows its message (`saveerror`).
- A dialog with a fixed `properties` list (e.g. `NoteDialog`) does not fetch the extension's property: append it
  in `onFormWindow` (`win.form.properties = [...win.form.properties, 'formBuilder']` when the list is set), the
  first fetch runs later.
- Add cards with an imported class (`module: Container`), not a lazy `() => import()`: a card that is still
  loading has no fields for `reset()` and the baseline, and they would show defaults as user changes.
- `save()` runs only in `DataSourceForm.submit()`. A window that saves itself (calendar `EventDialog.saveItem()`)
  calls `load()` but never `save()`.
- Return `null` for windows the module does not extend; per-window state lives in the closure. A throwing
  `onFormWindow` is logged and skipped. Only modules the user has access to are asked (`getConfigs()`).

## FormWindow cards and row arrays (2026-11-28)

- Tabs of cards: `win.setCardDisabled(card, true)` turns the tab of a card off (e.g. child grids until the
  entity is saved: `win.setCardDisabled(card, !win.form.currentId)`), `win.setCardHidden(card, true)` hides
  it. `card` is what `addCard()` returned or its reference. When the card was active, the first visible, enabled card takes over.
- `DataSourceForm.isSameValue()` compares an array value row by row and a row only on the keys the field
  gives (`getSubmitValue()`), ids as strings: a stored row with keys without a field (`memberId`,
  `latitude`) or a row combo that turned `1` into `"1"` after resolving its record is not a change. Maps
  (`acl`) are still compared both ways. A module needs no `setOriginalValue()` workaround for row arrays.
- `AutocompleteChips` `recordDetails` is optional (before 2026-11-28 a field without it never opened its menu).

## FormWindow Apply button (2026-11-28)

- `applyButton: true` in a `FormWindow` subclass config puts Apply (reference `applyButton`) before Save,
  like the Apply of classic `go.form.Dialog`. Default off.
- Apply calls `win.apply()`: `submit()` with `closeOnSave` off for that save. `save` fires as usual; a new
  entity becomes `form.currentId`, so the next Apply or Save updates it (enable cards that need an id on `save`).
- While a save runs Save and Apply are both disabled; a second `apply()`/`submit()` returns `false`. A module
  that disables Save itself (read-only entity) calls `setSaveDisabled(true)`, so Apply goes grey too.
- A subclass that overrides `submit()` with its own steps before `super.submit()` (NoteDialog encryption) or
  closes itself (calendar EventDialog) must honour `closeOnSave` and its own second-call guard before it turns
  `applyButton` on.

## Entity actions in GO.grid.Grid (2026-11-27)

Edit / delete / row menu of a JMAP entity list belong to the core grid, opt-in with
`entityActions` (owner: generic logic in the neo grid, each module's grid keeps only its own
logic; no base class per module, no mixin). A grid without `entityActions` is unchanged.

```js
{
    module       : Grid,
    store        : {module: JmapStore, entity: 'Group', properties: ['id', 'name', 'permissionLevel'], ...},
    entityActions: {
        dialog      : () => import('./GroupDialog.mjs'),   // or the class; opened with {entityId} / {values}
        displayField: 'name',                               // name in "delete '{item}'?"
        mayEdit     : record => true,                       // on top of permissionLevel
        mayDelete   : record => Number(record.id) > 3,
        rowMenuItems: (record, {edit, delete: del}) => [edit, myItem, {separator: true}, del]
    },
    columns: [..., Grid.rowMenuColumn()]                    // the ⋮ (class go-row-menu), pinned to the row's end
}
```

- `rowMenuColumn()` is `locked: 'end'` (2026-11-27): in a row wider than the grid the ⋮ stays in
  view. A locked region is a header toolbar of its own (neo `headerWrapper.getToolbars()`): the
  header right click and the width-save hook cover every toolbar, the column chooser ⋮ shows once
  (last button of the last toolbar, `HeaderButton.scss`), and the last visible **center** column
  cannot be hidden (neo's `Wrapper.updateHeaders()` skips an empty center and leaves its stale
  header); a restored state that hides them all shows the first center column again.

- Wired by the grid: double click and Enter edit, Delete / ctrl+Backspace delete the selection,
  right click and the ⋮ show the row menu (and select the row). Saving in the dialog or deleting
  reloads the store (`reloadEntities()`, `keepCount`).
- Permission: edit needs `permissionLevel` ≥ `LEVEL_WRITE`, delete ≥ `LEVEL_DELETE` (`src/Acl.mjs`)
  **when the row carries `permissionLevel`**; without it (admin-only entities such as User,
  SmtpAccount) only the hooks decide and the server checks. Request `permissionLevel` in the store
  properties for ACL entities.
- A Delete from the row menu of a selected row deletes the whole selection (classic grid);
  rows the user may not delete are left out before the question.
  Known limit (as before the move): a left click on the ⋮ also fires the row click, which narrows a
  multi-selection to that row; a right click keeps the selection.
- From code: `grid.openDialog({entityId})` / `openDialog({values})` (new), `grid.deleteRecords(records)`,
  `grid.deleteSelectedMenuItem()` for the ⋮ menu of the owner's toolbar (the toolbar is not part of
  the grid), `exportMenuItem()` (`src/export/exportEntities.mjs`) for export, `BatchEditButton` /
  `MultiSelectToolbar` unchanged.
- Lists that are not a GO.grid.Grid (`GO.list.ActionTable`: `EntityListPanel`, `SmtpAccountGrid`,
  `AuthAllowGroupGrid`, `EmailTemplateGrid`) share the question and the destroy through
  `destroyEntities(owner, entity, records, {displayField})` (`src/data/destroyEntities.mjs`),
  which the grid uses too. It returns true when the records were destroyed; errors are notified.
- Tests: `tests/entityActions.test.mjs` (gating, delete flow with a mocked client and ConfirmDialog).
- Using it: `UsersPanel` (row menu adds Login as / Archive through `rowMenuItems`), `GroupsPanel`
  (system groups via `mayDelete`).

Not migrated yet (own copies of the row menu / delete question, follow-up cards):

- `CronPanel` (legacy `core/cron/store` delete_keys, not Entity/set: keeps its own `remove()`).
- community/maildomains `DomainGridCard` (edit goes to its owner through an `edit` event, title
  from `recordTitle()`): `entityActions` without `dialog` plus `rowMenuItems` firing `edit`.
- community/multi_instance `InstancesMain`: delete now through `destroyEntities()`; no row menu.
- files `FilesMain`, zpushadmin `DevicesMain` (legacy controllers, not Entity/set), calendar
  `ResourcesDialog`/`SubscribeDialog`/`CheckRows`, addressbook `AddressBookTree`, email
  `AccountTree`, site `SiteTree`, `CheckList`, `EntityFieldsDialog`: menus of lists/trees, not
  entity grids; leave them.
- amd/crew `CrewEntityGrid` (amd branch neo): drop it for `entityActions` on its grids; only the
  member Add and `loadNames()` stay in crew.
- sf modules: grep `showRowMenu|deleteRecords|go-row-menu|'Confirm delete'` in their `views/neo`.

## List wiring on GO.grid.Grid (2026-11-27)

Opt-in, from amd/crew `entityList.mjs` `wireList()` and the notes / tasks / addressbook mains:

- `navigateOnRowClick: true`: the grid fires `navigate` {record} on a plain row click (no ctrl / ⌘ /
  shift, not on the row ⋮). neo's selection model handles the click first, so with `multiSelect` the
  row is the only selected one; a click on the row already shown fires it again (a phone after
  "close"). Used by notes, tasks, addressbook (show in the detail) and crew (route).
- Scroll loading needs no option: the grid calls `store.loadMore()` on its body's `scrollEdge`
  while the store has `scrollLoad` (JmapStore; tasks switches it off for the board). Lists still
  wiring it themselves (history, multi_instance, maildomains, DuplicateDialog, files, email) do no
  harm (`loadMore()` returns while a load runs); drop the line when touching them.
- `notifyLoadError: true`: a `loadError` of the grid's store becomes `notifyError(grid, error)`
  (not after the grid is destroyed). Other stores of the view (trees, lists) keep their own listener.

## Column sizing on GO.grid.Grid (2026-11-28)

The cells (and header buttons) carry the background, so the columns must fill the grid's width,
or rows, hover and selection stop after the last column. `Grid.visibleColumns()` sizes the copies
it hands to neo:

| Classic config | neo |
|---|---|
| none, and no column has `flex` | the last visible center column with a header text gets `flex: 1`, `minWidth` = its width |
| ExtJS `autoExpandColumn: 'name'` | grid config `autoExpandColumn: 'name'`: that column `flex: 1`, `minWidth` = its width |
| ExtJS `viewConfig.forceFit: true` | grid config `forceFit: true`: every text column flexes by its width (`flex: width`, also a configured flex column) |
| a grid created hidden (flex gets no width there, files Trash) | `autoExpandColumn: false`: no column fills |
| a column with `flex` | kept; no column is added to fill |

Columns without header text (row ⋮, check boxes, icons), locked columns and columns the user resized
(state) keep their width; dragging a filling column below its minWidth drops the minWidth. A
narrower grid scrolls once the minWidths do not fit. go:neo-port: carry `autoExpandColumn` /
`forceFit` over as these grid configs; don't hand-pick a flex column for it.

The header column chooser (⋮, right click) is one menu per grid: the same ⋮ again closes it
(`toggleColumnMenu()`, also when the press already closed it through focus leave),
Escape and a click outside close it (`showHeaderMenuList()`; `GO.menu.List` `onClose`). A floating
menu is closed with `hidden = true`, never `destroy()`, which leaves its DOM behind. The header ⋮
over a text-less last column (the row ⋮) is centred on the row ⋮ (`HeaderButton.scss`).

## List toolbar: GO.grid.ListToolbar (2026-11-27)

The toolbar of an entity list is core too (`src/grid/ListToolbar.mjs`), next to a GO.grid.Grid
with `entityActions`: start items, search, end items (Add), ⋮, and the MultiSelectToolbar over
it (batch edit, delete). A component, not a grid config: the toolbar sits above the grid in the
host's vbox and is bound with `setGrid(grid)` in the host's `onConstructed()`.

```js
items: [{
    module       : ListToolbar,
    reference    : 'listToolbar',
    flex         : 'none',
    toolbarCls   : ['go-users-tbar'],             // default go-bg-mid go-border-bottom
    searchFilters: QUERY_FILTERS,                  // default; tbsearch filters, null: no search
    exportFormats: ['xlsx', 'csv', 'json'],        // ⋮ Export of what the grid shows; null: none
    startItems   : [...], endItems: [addButton],
    moreItems    : ({export: exp, delete: del}) => [importItem, exp, del], // default [export, sep, delete]
    multiSelectItems: [...], batchEdit: true
}, {module: Grid, reference: 'grid', multiSelect: true, entityActions: {...}, ...}]
```

- Search: `searchFilter(text, searchFilters, entity)` (GO "name: value" syntax, custom fields of the
  entity) → `store.setFilter()`; only the latest search counts. The filter keys are `text` and
  `search`, so other keys the host sets (`showDisabled`, …) stay.
- Delete (⋮ "Delete" = `grid.deleteSelectedMenuItem()`, the bulk button = `grid.deleteRecords()`)
  goes through the grid's entity actions; the bulk button is disabled while no selected row may be
  deleted. A list whose delete does more (clears its detail, legacy controller) keeps its own toolbar.
- `GO.grid.BatchEditButton` `entity` is reactive now: it hides itself again and checks the custom
  fields when the entity is set later (ListToolbar sets it from `grid.store.entity` in setGrid()).
- References inside: `moreButton`, `multiSelectToolbar`, `deleteSelectedButton`, `batchEditButton`
  (the host's `getReference()` finds them; neo searches down).
- Tests: `tests/listToolbar.test.mjs`.
- Using it: `UsersPanel` (Show disabled, Add, ⋮ with defaults / import / export / delete /
  permissions), `GroupsPanel` (Add, Group defaults; gained ⋮ Delete and the multi select toolbar).

Own copies of the same toolbar (not a straight replacement, follow-up cards): community/notes
`NotesMain`, tasks `TasksMain`, addressbook `AddressBookMain` (own delete that clears the detail,
table title, west button), maildomains `DomainGridCard`, multi_instance `InstancesMain`,
bookmarks `BookmarksMain`, history `HistoryMain`, zpushadmin `DevicesMain`, files `FilesMain`,
email `EmailMain`, `EmailTemplateGrid` (ActionTable), dev demos `MultiSelect`/`GridExport`.
amd/crew has no toolbar copy any more: its lists use GO.grid.ListToolbar (amd neo b346f57d9).
`entityList.mjs` still holds the row click `navigate`, scroll loading and the load error notify,
which are core Grid options now (section above): a crew follow-up drops them; `showAddFor()` and
`loadNames` stay in crew.

## Entity detail: GO.detail.Panel (2026-11-28)

`src/detail/Panel.mjs`, the right pane of an entity (GOUI `DetailPanel`, ExtJS `go.detail.Panel`).
A module detail extends it and keeps only its own body:

```js
class NoteDetail extends Panel {
    static config = {className: 'GO.notes.view.NoteDetail', entityName: 'Note',
        cards: ['customFields', 'comments', 'files', 'links', 'history']}
    createBody()         {return [{ntype: 'component', reference: 'body'}]}
    renderRecord(note)   {/* fill the body; null: empty it */}
}
```

- Toolbar: `createToolbarItems()` (default `['->']`, items left of Edit), then Edit, add / browse
  link buttons (`hasLinks: false` drops them) and ⋮ from `createMoreMenu()`: Print (the scroller,
  title `getTitle(record)`), Download PDF only when the subclass overrides `getDownloadUrl(record)`,
  Delete (id `delete`). Edit and Delete follow `canEdit(record)` / `canDelete(record)`
  (permissionLevel ≥ write / delete; override to refuse more, e.g. legacy encrypted notes).
- ⋮ rebuilt on open: a subclass that overrides `loadMoreMenu(record, items)` (`items` is a fresh
  `createMoreMenu()`; return the items, also as a Promise, null keeps the menu closed) gets the menu
  built again each time it opens: a disabled "Loading..." item shows meanwhile, Delete then follows
  `canDelete()` again, and the answer is dropped when the record changed, the menu was closed or
  opened again meanwhile; another record closes the open menu; a failing hook shows the error.
  Known gap: an outside click in the few ms while the final list builds is lost (the menu opens). It rides on `GO.button.Button`'s
  `beforeShowMenu(button)` (runs before the menu opens; may set a new `menu`; false keeps it closed).
  Without the override the menu stays the one built once (portcall's query and output actions use it).
- Body: `createBody()` items go into the `scroller` above the standard cards; `createBottomItems()`
  below it (tasks "Continue task"). `cards` lists the standard cards in their order:
  `customFields` (DetailFieldsets), `comments`, `files`, `links` (LinkCards), `history`; each is a
  reference of that name. The same record keeps the cards' content while it reloads.
- Record: the host passes it with `setRecord(record)` (grid row; the grid reloads on push and passes
  it again) or the panel gets it with `load(id)` (`entityName`, `properties`): a later call wins, a
  missing record shows "Not found" (`notFound`), a change of a `watch` entity (default
  `[entityName]`) loads it again. `setRecord()` cancels a pending load and that reload.
- Events: `edit {record}`, `delete {record}` (the host confirms and deletes, as notes and tasks do
  for their grid too). A detail without such a host overrides `onDelete()` to call
  `deleteRecord()` (destroyEntities, empties the detail, fires `deleted {record}`).
- `GO.detail.LinesCard` (`src/detail/LinesCard.mjs`): a collapsible card of label / value lines
  (`setLines([[label, value|{html}]])`, null hides it) or trusted HTML (`setHtml()`), filled by its
  detail; moved from amd/crew.
- Tests: `tests/detailPanel.test.mjs`.
- On it: community notes `NoteDetail` (NotesMain deep links use `load(id)`), tasks `TaskDetail`.
  Not yet, each a follow-up: addressbook `ContactDetail` (star and own ⋮, address book name
  loaded before rendering, action date field), calendar `EventDetail` (an event occurrence, not a
  record by id: RSVP toolbar, organizer/calendar/alert fields in the toolbar, no ⋮ Delete),
  maildomains `DomainDetail` (own load with principal names, DNS and mailbox / alias grid cards,
  no links), files `FileDetail` (legacy File/Folder through the files controller, not JMAP),
  amd/crew `MemberVoyageDetail` (crew card: `LinesCard` → `GO.detail.LinesCard`, `load()`,
  `getDownloadUrl()`, `deleteRecord()`).

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

A library several modules use belongs in neo core as a `views/neo` npm dependency (pinned, kept by
`buildScripts/release.mjs`), loaded by a core addon that fails soft when it does not load: core runs without
the optional modules (`GO.main.addon.CodeMirror` loads `codemirror@5` from `views/neo/node_modules`; sf/codemirror's
copy stays for the classic client). A field whose holder is box content rendered by `renderControl()`
(`GO.form.field.Field`) must `await me.promiseUpdate()` before the addon looks up the holder: on
`mounted` the box content can still be on its way to the DOM.

## GO.pdf.PdfViewer (2026-11-28)

`src/pdf/PdfViewer.mjs` with the main thread addon `src/main/addon/PdfJs.mjs` (`WS/PdfJs`) and the DOM-free
`src/pdf/pdfPages.mjs` (page selection, title, zoom steps; `tests/pdfPages.test.mjs`). Moved from amd/libs, whose
classic `PdfViewPanel` and vendored `views/extjs3/lib/pdfjs` stay for the classic client.

```js
import PdfViewer from '<relative>/views/neo/src/pdf/PdfViewer.mjs';

{module: PdfViewer, reference: 'preview', flex: 1, toolbarItems: [{module: Button, text: t('Analyze'), handler: 'up.onAnalyze'}]}

preview.setSource(client.apiUrl + 'download.php?blob=' + blobId, 'application/pdf'); // or 'pdf', 'image/png', 'jpg' …; null clears
preview.pages = [3, 4, 5];                                    // null: the preview again
preview.on('load', ({numPages, title}) => …);                 // also 'loadError {error}'
```

- pdf.js is `pdfjs-dist` in `views/neo/package.json` "dependencies" (pinned; `PDFJS_VERSION` in the addon busts the
  cache, keep it in step). Not the other copies: the root `www/node_modules/pdfjs-dist` (classic `FilePanel.js`)
  is removed from a neo-only release, `community/pdfeditor/views/pdf.js` belongs to an optional module.
  `buildScripts/release.mjs` keeps its `build`, `cmaps`, `iccs`, `standard_fonts` and `wasm`.
- A PDF shows its first `previewPages` (10) pages or the pages of `pages` (at most `maxListedPages`, 200). Every
  page gets a placeholder of the first page's size; the addon draws a page when it comes within 1500px of the view
  (IntersectionObserver) and drops its canvas when it leaves. One canvas has at most 16.7 million pixels and 8192
  per side (`MAX_CANVAS_PIXELS`, `MAX_CANVAS_SIDE`): on a high density screen at a high zoom it renders below device
  resolution instead of failing blank.
- Zoom buttons 25 % … 400 % (`ZOOM_STEPS`), the relative scroll position is kept; `pageScale` (1.5) is the pdf.js
  scale at 100 %. An image (`image/*` or an extension) is an `<img>` at zoom × view width.
- The source is a same-origin URL (relative ones are resolved against GO's root, not neo's `<base href>`); pdf.js and
  `<img>` send the session cookie.
- A PDF loads once the viewer is in the DOM; a viewer in a hidden card redraws when it is shown again (neo removes
  inactive cards from the DOM). Only the latest source counts: the addon answers an older load `{superseded: true}`,
  and a failed load clears the old pages, shows a message and fires `loadError`.
