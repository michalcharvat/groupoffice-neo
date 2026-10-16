# neo.mjs webclient (spike)

Alternative Group Office webclient built with [neo.mjs](https://github.com/neomjs/neo)
13.x. Core components GO vs neo: `docs/neo-core-components.md`.
Small modules, 2FA login, module hooks: `docs/neo-small-modules.md`.

## Run

- `config.php`: `$config['webclient'] = "neo";` → `AuthController::actionInit()`
  renders `go\core\webclient\Neo` instead of the ExtJS `Layout.php`.
- `npm install && npm run build-themes` in this folder: generates the `theme-go` neo theme
  and builds it with neo's workspace theme build into `dist/development` +
  `resources/theme-map.json` (see [GO look](#go-look-theme-go)). Needs the GOUI submodules
  (`views/goui/goui`, `views/goui/groupoffice-core`): the theme uses GO's SCSS tokens.
- Local instance: `~/Projects/go-docker/docker-compose.go26neo.yml` → http://localhost:8027
  (same database as classic GO on :8026). Test login in `test/credentials.local` (not committed).

## Layout

| Path | What |
|---|---|
| `apps/go/` | shell app: `app.mjs`, Viewport (loading / login / main), LoginView (GO login: "Login required" window, language menu, forgot credentials card), MainView (module tabs with popout and close ×, right click: close / close others / close all; a closed tab returns when the module is opened again; hash routing) |
| `src/jmap/Client.mjs` | JMAP client in the App worker: cookie + `X-CSRF-Token`, batching, fetch-based SSE |
| `src/data/JmapStore.mjs` | `Neo.data.Store` over `Entity/query`+`get`; reloads the page on push |
| `src/data/backgroundJob.mjs` | `Entity/export`/`import` run in the background and end in a core Alert: `lastAlertId()`, `waitForFinishedAlert()`, `alertBlobId()` (address book export/import) |
| `src/ModuleRegistry.mjs` | modules register `{name, title, iconCls, capability, mainView}`, optional `userSettings` / `systemSettings: {title, iconCls, panel}` (cards in My account / System settings, one or an array; `loadSettingsPanels(key)`) and `onLogin()` (awaited after login before the main view is built, may register more modules); a registration without `mainView` only adds settings cards |
| `src/systemsettings/` | System settings (admins; user menu or `#systemsettings/<card>`): `SystemSettingsDialog` (cards on the left; card interface `load`, `isModified`, `validate`, `save`, `needsReload` → all windows reload on close), `SettingsPanel` (card over `Module.settings`, fields `settings.<key>`, config.php keys disabled; `fields.mjs` helpers), General, Appearance (logo, colours previewed; `Neo.php` renders the saved ones), Notifications (SMTP + test message), Authentication (+ `AuthAllowGroupGrid`), Modules (`ModuleTiles`, install / enable / uninstall, `ModuleRightsDialog`) |
| `src/smtp/` | `SmtpAccountGrid` (a module's SMTP accounts: `{smtpModule: {package, name}}`, call `load()`), `SmtpAccountDialog` (test message, permissions), `SmtpAccountCombo` |
| `src/list/ActionTable.mjs`, `src/form/field/ColorField.mjs`, `LinesField.mjs` | small table over plain records with check columns and row icon actions (events `action`, `check`, `rowDoubleClick`); hex colour field with swatch (value without `#`); array of strings, one per line |
| `src/usersettings/` | My account (header avatar menu): `UserSettingsDialog` (FormWindow over the logged-in `User`, cards on the left: Account, Look & feel, Notifications, Visible to, custom field tabs, module cards; one `User/set`, asks for the current password like ExtJS, a new language reloads with `?SET_LANGUAGE=`, formats reload the windows), `AccountPanel`, `LookAndFeelPanel`, `NotificationPanel`, `VisibleToPanel`. A module card binds with dotted names (`notesSettings.defaultNoteBookId`) and may implement `onLoad(user)` |
| `src/Preferences.mjs` + `src/main/addon/Preferences.mjs` | theme (`html.compact`) and colour scheme (`body.light/dark/system`) without a reload, "Reset windows and grids" (removes `state-*`); `Neo.php` renders the saved ones into the page |
| `src/form/fieldset.mjs`, `src/form/field/BoolCheckBox.mjs`, `LocalCombo.mjs`, `src/view/PasswordPrompt.mjs` | GOUI fieldset with a legend (config helper), boolean checkbox, combo over fixed `[{id, name}]` matching ids loosely, password question |
| `src/view/Dialog.mjs` | base for GO dialogs (close/mask fixes, see below) |
| `src/view/MainThreeColumnPanel.mjs` | GO module layout west \| center \| east with resizable, remembered splitters (groupoffice-core's GOUI class) |
| `src/button/`, `src/component/`, `src/grid/` | GO components derived from neo: `Button` (flat, Material icons), `SearchButton`, `Splitter`, `TableTitle`, `CheckBox` (select all), `UploadButton`, `Grid`, `selectRow()` |
| `src/list/CheckList.mjs`, `src/menu/List.mjs` | GOUI checkbox table with row menu (notebooks, filters); GO menu with Material `icon` per item, `List.showAt()` for row menus |
| `src/view/FilterPanel.mjs`, `FilterDialog.mjs` | west "Filters": saved `EntityFilter`s (type fixed), checked ones ANDed into the grid filter |
| `src/view/GlobalSearch.mjs` | header search over core `Search`; modules map entities to routes (`routes` in the registry) |
| `src/detail/` | detail cards below an entity: `CommentsPanel`, `FilesPanel` (legacy files controllers), `HistoryPanel` (LogEntry grid like GOUI LogEntryGrid, loads on scroll, reloads on a push for the shown entity type) |
| `src/grid/Grid.mjs`, `HeaderButton.mjs` | `GO.grid.Grid`: column chooser on ⋮ in the last column header, right click on a header: sort asc/desc + columns (GO 6.8) (`hidden`, `hideable: false`, `stateKey`), hidden columns and widths saved in `state-<stateId>` in the GOUI format; neo only gets the visible columns |
| `src/State.mjs` | GOUI-compatible component state in localStorage (`state-<id>`) |
| `src/Translate.mjs` | `t()`, `translator(pkg, module)`, `fmt()` over GO's language files (see [Translations](#translations)) |
| `src/form/field/JmapComboBox.mjs`, `PrincipalCombo.mjs`, `GroupCombo.mjs` | remote combo over `Entity/query` (filter as you type, `loadMore` on scroll); value = id, display text fetched for a preset id |
| `src/form/field/HtmlField.mjs` + `src/main/addon/HtmlEditor.mjs` | rich text field; the editor and its commands live in the main-thread addon (`WS/HtmlEditor`, loaded with `Neo.Main.importAddon` on mount) |
| `src/link/` | links: `LinkDetail` card, `LinkBrowser`, `AddLinkButton`, `LinkBrowseButton`, `SelectSearchDialog` (core `Search`), `linkTypes` (entity icons, `resolveRoute`) |
| `src/permissions/SharePanel.mjs` | ACL editor as one form field (`name: 'acl'`, value `{groupId: level}`), GOUI layout: all groups/users with a level each, ACL members first |
| `src/form/field/Field.mjs` + `DateField`, `DateTimeField`, `DateRangeField`, `DurationField`, `ChipsField`, `RecurrenceField` | GOUI fields: `GO.form.field.Field` is the outlined box with the label in its border (`go/shared/_field.scss`), hint/error below, `required`, `validator`; subclasses render their inputs in `createControl()` |
| `src/form/field/ContainerField.mjs`, `ArrayField.mjs`, `src/form/nestedFields.mjs` | fields made of fields: ContainerField = object of its children, ArrayField = one row field per array item (`buildField`, `addValue()`, `ArrayField.removeButton()`); `nestedFields.mjs` patches neo's form.Container so a form never sees fields inside a field |
| `src/tree/Tree.mjs`, `src/component/DescriptionList.mjs` | GOUI Tree (lazy `nodeProvider`, caret, icon, checkbox per node, expanded nodes kept on reload) and DescriptionList (`records: [[term, value…]]`) |
| `src/grid/RowSelectionModel.mjs`, `MultiSelectToolbar.mjs` | `GO.grid.Grid` `multiSelect: true`: ctrl/⌘ toggles, shift selects a range, a plain click selects only that row; MultiSelectToolbar overlays the toolbar from 2 selected rows (`setGrid(grid)`, host container `go-mstb-host`) |
| `src/DateUtil.mjs` | local "Y-m-d" parsing/formatting (`new Date('Y-m-d')` is UTC), ISO with offset, week start |
| `src/form/DataSourceForm.mjs`, `src/view/FormWindow.mjs` | entity form (load/`set`, only modified properties on update, server validation errors on fields) and GOUI FormWindow (tabs via `addCard`, `addCustomFields`, `addSharePanel`, discard prompt). A class field must not share a name with a neo reactive config (`data`, `isLoading`) |
| `src/customfields/` | custom fields: definitions (`customFields.mjs`), GO types → neo fields (`types.mjs`), `FormFieldset` + `addCustomFieldsTo()` (FormWindow), `DetailFieldsets` cards; fields are named `customFields.<databaseName>` |
| `src/dev/` | prototype only: "Dev" module (`#dev/<id>`), menu like the GOUI docs (`goui-docs/script/MainMenu.ts`) in `menu.mjs` with a status per component (demo / available / to convert); converting a component = add `src/dev/demo/<Name>.mjs`, set `demo` and `status: 'done'` |
| `resources/scss/go/` | GO values and GOUI look of neo classes in the `theme-go` neo theme, per neo class (e.g. `form/field/trigger/Base.scss`: round Material triggers, `Picker.scss`: picker like `menu.goui-dropdown`, `dialog/Base.scss`: GOUI window chrome); `shared/` partials (in `Global.scss`): classes several GO components render (`go-avatar`, `go-check`, `go-empty`, links) |
| `resources/scss/src/apps/go/` | styles of the `GO.*` components and the shell (`Viewport`, `LoginView`, `MainView` topbar, `GlobalSearch`, …) |
| `src/form/field/AutocompleteChips.mjs` | chips of entity ids with a ▾ menu of the entity (`entity`, `setJmapFilter()`) |
| `go/modules/<pkg>/<name>/views/neo/Index.mjs` | module entry, found by `Neo::moduleFiles()`; optional `style.css` |
| `src/login/AuthenticatorPanel.mjs`, `src/systemsettings/EntityListPanel.mjs` | 2FA login step of a module (`loginPanels`), entity list card for System settings / My account (see `docs/neo-small-modules.md`) |

Module code imports neo and the shell with relative paths
(`../../../../../../views/neo/...`): import maps don't apply inside workers.

## GO look (theme-go)

The reference is GO 26's GOUI module UI (e.g. Notes), not the ExtJS Paper theme.

- **Theme**: `Neo.php` sets `themes: ['neo-theme-go']`. neo loads only the first theme's
  class on `<body>` and scopes every value sheet to it, so there is no runtime inheritance:
  `buildScripts/generateGoTheme.mjs` copies `theme-neo-light` to `resources/scss/theme-go`
  (gitignored) re-scoped to `.neo-theme-go`, and appends `resources/scss/go/<same path>.scss`
  to each file. Overlays get `go.dp()`/`go.sp()` (GOUI units) and may `@use` GO SCSS.
- **GO tokens**: `go/Global.scss` `@use`s `views/goui/groupoffice-core/style/_theme.scss`,
  so `--fg-main`, `--bg-mid`, `--density`, … are GO's own (incl. `body.dark`). neo tokens
  (`--purple-*`, `--sem-*`, `--button-*`, `--grid-*`, …) point at them. `<html>` font-size
  is `--density` (8.64px) like GOUI: 1dp = .1rem, so GOUI sizes carry over 1:1.
- **Components**: GO structure comes from derived classes (`GO.button.Button`,
  `GO.view.MainThreeColumnPanel`, `GO.grid.Grid`, …) with their own SCSS in
  `resources/scss/src/apps/go/` (`GO.x.Y` → `apps/go/x/Y.scss`, a leading `view` is dropped).
  Set structural classes with `baseCls`: a subclass's `cls` replaces `cls`.
- **Icons**: Material Symbols ligatures (`{module: Button, icon: 'add'}`), font from
  `views/goui/goui/resources/iconfont`. Font Awesome stays for `iconCls`.
- **Splitter state**: same keys as GOUI (`state-<module>-west-splitter`, width in dp), so
  on one origin GOUI and neo share the panel widths.
- **Phone** (below 577px, GOUI `$breakpointSmall`, CSS only): `MainThreeColumnPanel` shows one
  panel (`go-active`, set by `activatePanel('west'|'center'|'east')`; GOUI `mobile-cards`), the
  sidebar buttons become "menu" / "close", `showCenterButton()` goes back from the east panel;
  the topbar shows only the open module's tab (switch with the apps menu); dialogs fill the screen.
- **Rebuild** after any SCSS change (`npm run build-themes`, ~4 s); the browser reads
  `dist/`, not the SCSS.

Still different from GOUI notes: no "Input field" variable
filters, filter conditions are text values only (no sub groups / pickers), comments are plain
text (no rich text editor, labels, attachments), files have no drag & drop, overwrite question
or context menu, no import/export menu. Dark mode follows
`body.dark` (GO tokens), set in My account → Look & feel.

## Translations

- `lang.php` serves `Neo::getLanguageFile()`: all language sections of the current
  language as JSON `{package: {module: {key: text}}}`, cached in
  `cache/clientscripts/neo_lang_<iso>.json` (cleared with the ExtJS client scripts).
  `Neo.config.goLanguageUrl` carries its mtime.
- `app.mjs` awaits `load()` before it imports any view or module, so `t()` works in
  static configs. Code the JMAP client imports (`Format.mjs`) must call `t()` at run time.
- The language is fixed per App worker: `Neo.php` appends it to the shared worker name.
  The login screen uses the browser language; after login, a user with another language
  reloads all windows (unless the `GO_LANGUAGE` cookie from `?SET_LANGUAGE=` is set).
- Keys are GO's English texts. A module uses `translator('community', 'notes')`, which
  falls back to core/core. Placeholders like GO: `fmt(t("Are you sure you want to delete '{item}'?"), {item})`.
  Arrays (`full_months`, `short_days`) via `lookup()`. Missing keys are collected in
  `missing` and shown in English.

## Gotchas

- **Reserved event names**: neo's core Base fires `ready` (no arguments) when an
  instance gets `isReady`. Don't fire a custom `ready`: FormWindow fires `formReady`.
- **Non-sortable columns**: neo 13's header button sorts on click even with
  `sortable: false`; `GO.grid.HeaderButton.onClick()` skips it (otherwise the server
  gets an unknown sort property, e.g. LogEntry `creatorName` → SQL error).
- **Sort arrow**: ↓ ascending, ↑ descending, as GOUI (`_table.scss`: south/north).
- **Windows leaving during start**: the main thread sends `disconnect` only for apps it
  knows (after the worker's `registerAppName`), and the worker ignores a disconnect for an
  app name the port has not registered. `Neo.php` sends `goWindowLeft` to the App worker on
  `pagehide`: `app.mjs` retires that exact port, remembers the window, `onStart()` skips it
  and every disconnect removes apps of such windows (otherwise their DOM deltas reach other windows: "insertNode:
  Parent not found").
- **Two `text` filters**: GO joins search words as `w0` per `text` condition, two in one
  query fail (SQL 1066). `JmapStore.getJmapFilter()` merges ANDed `text` conditions; a `text` inside an OR/NOT group
  next to another one still fails (needs server-side alias handling).
- **No plain CSS files**: neo loads its CSS per class when the class is first used, after
  any `<link>` in the page, so a plain stylesheet loses at equal specificity (e.g.
  `.neo-container` background). All shell styles are `theme-go` SCSS; rules that override
  neo components are nested in `.neo-theme-go` (body class) to outrank neo's own. Only
  a module's optional `style.css` is still linked by `Neo.php`.
- **Testing with Chrome MCP**: clicks sent right after a navigation, before a screenshot,
  never reach the page. Not an app bug.
- **No `route` on buttons**: neo renders `route` as `<a href="#x">`, and `<base href>` turns
  it into `views/neo/apps/go/#x` (403). Use `handler: () => Neo.Main.setRoute(...)`.
- **Selecting by id**: `selectionModel.select()` takes a record; a string is read as
  a vdom id. Use `select(list.store.get(id))`.
- **Page base**: neo assumes the page sits at `apps/<name>/index.html`. The PHP page
  sets `<base href="views/neo/apps/go/">`, `basePath: '../../'`,
  `workerBasePath: '../../node_modules/neo.mjs/src/worker/'`. URLs used in the worker
  (fetch, import) resolve against the worker script, so the API URL is passed
  absolute (`Neo.config.goBaseUrl`).
- **Worker output is invisible** to tools reading the page console. `app.mjs` mirrors
  `console.error/warn`, `error` and `unhandledrejection` to the main thread via `Neo.Main.log`.
- **Caching**: ES modules load without version query strings; `.htaccess` sends
  `Cache-Control: no-cache` (ETag revalidation). Navigating to the same URL with only a
  different hash does not reload the page.
- **Dialogs**: without an `animateTargetId` a dialog stays at `.neo-floating`'s
  -10000px; set `left`/`top` in `wrapperStyle`. neo's `closeOrHide()` destroys the
  dialog and then awaits `this.timeout()`, which never resolves on a destroyed
  instance → modal mask stays. Escape only hides. `GO.view.Dialog` fixes both.
- **HTML rendering**: grid renderer strings and List `displayField` go to innerHTML.
  Escape text (`Format.escapeHtml`, `src/list/TextList.mjs` for lists and ComboBox
  `listConfig`).
  HTML written by other users (comments) goes through `Format.sanitizeHtml()` (allowlist,
  no attributes but safe `a[href]`/`img[src]`): the server's XSS check is a heuristic.
- **Components**: create child-dependent wiring in `onConstructed()`, not
  `construct()` (references don't exist yet). `selectRow()` does not fire
  `selectionChange`. String handlers: `'up.onX'` walks the parents.
- **Boolean attributes in vdom**: neo knows only lowercase void attributes (`readonly`,
  `disabled`, …); `readOnly: false` renders `readonly="false"`, which is read-only. Leave
  them out when false (`GO.form.field.Field#inputFlags()`).
- **Reserved names (more)**: `bind` is a neo config (state binding), `value_` is already
  reactive in `Neo.form.field.Base` (use `value: null` in a subclass config).
- **Fields inside fields**: neo's form.Container collects every field below it and
  `setValues()` wrapped the leaves inside an object/array value (`{street: {value}}`).
  `src/form/nestedFields.mjs` (imported by DataSourceForm and the composite fields) stops
  at a field and passes a field's value whole. Inner fields still fire `fieldChange` on
  the outer forms (with their own names).
- **Native date/time inputs** fire `change` per completed segment (typing a year gives
  0002, 0020, …): DateTimeField reports each, the last one is the value.
- **Submenus** of a neo menu are plain `Neo.menu.List`: `GO.menu.List#getSubMenuData()`
  adds `go-menu`. A `separator: true` item is a separator only (its text is not shown).
- **Theme builds and the shared worker**: the worker reads `theme-map.json` once; `Neo.php`
  includes its mtime in the build id, so `npm run build-themes` starts a new worker.
- **Selecting a grid row from code** right after a load is lost: the vnode gets the
  class, the DOM row does not. Use `src/grid/selectRow.mjs` (checks the DOM and retries).
- **Never `hidden: true` a `PagingToolbar`**: its store load listener then throws (its
  buttons are gone) and breaks the grid's load handling (rows render, clicks do nothing).
  Hide it with a CSS class.
- **Infinite scroll**: `JmapStore` `scrollLoad: true` + the grid body's `scrollEdge` event →
  `loadMore()`. `isLoading`/`isLoaded` must be set *before* `data =`/`add()`: the grid fires
  `scrollEdge` while it renders the new rows.
- **Legacy controllers** (`client.legacy()`, e.g. files): need `security_token`
  (`Neo.config.goSecurityToken`, from the PHP session) and may return JS functions inside
  their JSON (`startjs:…:endjs`); `Client.parseLegacyJson()` turns those into null.
- **Files across containers**: :8026 and :8027 share the DB, not the file storage. A file
  uploaded in neo is missing for the classic UI ("Folder … doesn't exist on the filesystem").
- **`<button>` colour**: buttons take the UA's black, not the parent's colour; ghost buttons
  set `color: var(--fg-text)` (else black icons in dark mode).
- **Reserved names**: a Component already has `text` (replaces its content) and `render()`;
  don't redefine them as configs/methods.
- **Rich text lives on the main thread**: `HtmlField` is the worker side of the
  `HtmlEditor` addon; its value syncs debounced, so `FormWindow.submit()` calls `flush()`
  on every field that has it. Comments are still plain text.
- **SSE across two containers**: APCu state counters are per container, so writes on
  :8026 never wake SSE on :8027. `$config['sseUseApcu'] = false` makes
  `PushDispatcher` check the DB every 2 s. Do not set `apc.enabled=0`: GO's cache
  then fails (`go/core/cache/Apcu.php` TypeError).
- **Shared workers** (`useSharedWorkers: true`): one App worker serves all GO windows
  of the browser profile (shared session, one SSE connection).
  - `src/Popup.mjs` moves a component into a new window: `?neoPopup=<id>` starts
    `PopupView`, which adopts it. Used by `GO.view.Dialog` (header action "popout") and
    `MainView` (topbar button, whole module; closing the window docks it back).
  - A SharedWorker lives while any GO tab is open and new tabs join it. `Neo.php` adds a
    build id (GO version + newest mtime of the neo sources) to the worker name, so changed
    code starts a new worker; old tabs keep the old one.
  - neo keeps a closed window's components: `app.mjs` destroys its app and main view on
    `disconnect`; dialogs close themselves. `isDestroyed` is `undefined` on live instances.
  - neo pushes the initial URL hash only for the first window; later windows read
    `Neo.windowConfigs[windowId].hash`. `HashHistory` is shared: filter by `windowId`.
  - Worker console output goes to every window (`app.mjs`); neo already suppresses
    `PortDisconnectedError` rejections of closed windows.
  - `window.open` needs a user click; synthetic clicks get the popup blocked.
- **Empty fields skip their validator**: neo only runs `validator` for a field with a value
  (or `required`). A check between two fields (password + confirmation) must sit on the field
  that has the value too, and a save that must never go out unchecked checks again in code
  (`UserSettingsDialog.submit()`).
- **Ids as number or string**: JMAP returns `defaultNoteBookId: 65`, a `JmapComboBox` that
  resolved its record returns `"65"`. `DataSourceForm.isSameValue()` compares scalars as
  strings, otherwise the form is "modified" right after loading.
- **Left tab bar**: neo turns `tabBarPosition: 'left'` tabs sideways and sizes their buttons
  (also the pressed one) for it; `usersettings/UserSettingsDialog.scss` sets them upright.
- **Scrolling vbox cards**: a container in a card with `overflow-y: auto` needs `flex: 'none'`,
  or the vbox squeezes it to the card height and its content is cut off (narrow screens).
- **Shared SCSS of several classes**: neo loads a class's SCSS only with that class. Styles two
  unrelated classes need (the left card list of My account and System settings) go to
  `resources/scss/go/shared/` (Global). Their selectors must outrank neo's component rules, which
  load later: `.go-settings-cards.neo-tab-container`, not just `.go-settings-cards`.
- **NumberField limits**: neo's `maxValue` defaults to 100, and on blur it clamps with
  `Math.min(maxValue, value)` / `Math.max(minValue, value)`, so `null` turns values into 0. Give
  open limits as `±Number.MAX_SAFE_INTEGER`.
- **`change` fires on load**: a form `reset()` fires every field's `change`. Side effects that
  must follow the user only (Appearance colour preview) listen to `userChange`.
- **System settings has no single entity**: `SystemSettingsDialog` saves each card itself
  (the cards' calls of the same tick share a request); a `SettingsPanel` that did not load refuses to save, otherwise
  `DataSourceForm.submit()` would create a new Module.
- **Overlays over buttons**: neo gives a button's glyph and text `z-index: 2`; anything laid
  over a toolbar (e.g. the SearchButton overlay) needs a higher z-index.
- **Testing on another port**: cookies are per host, not port. A container on :8028/:8029 uses
  the login of :8027, which may be the real admin, not the test user: never save passwords or
  other account data there without checking who is logged in.
- **`update()` is neo's**: Component.update() sends the vdom; a method of your own named
  `update` recurses forever when render code calls `me.update()` (calendar: `refresh()`).
- **`createItems()` is neo's too**: Container.createItems() turns the `items` configs into
  components in `onConstructed()`. A subclass method of that name that only returns configs
  leaves `items` as plain objects: nothing renders, `getReference()` gives null and mounting
  throws "reading 'removeDom'". System settings cards use `createFields()`; override
  `createItems()` only to call neo's afterwards (MainThreeColumnPanel).
- **Legacy routes need the CSRF token**: `client.legacy()` sends `X-CSRF-Token` like JMAP,
  otherwise GO answers "Access denied" (as an HTML exception page without `X-Requested-With`).
- **Rebuilt vdom loses the scroll position**: neo stores a synced `scrollTop` on the vdom node
  object; replacing a scrolling child node with a new object resets it on the next update.
  Copy `scrollTop`/`scrollLeft` from the old node (calendar `WeekView.render()`).
- **`mouseleave`/`mouseenter` listen with capture**: a component gets them for every child
  element; check `data.target.id === me.id` for the component itself.
- **`text` after `html`**: setting a component's `text` keeps an earlier `html`, which wins;
  stick to one of them per component.
- **NumberField limits**: neo's `maxValue` defaults to 100, and on blur it clamps with
  `Math.min(maxValue, value)` / `Math.max(minValue, value)`, so `null` turns every value into 0.
  For no limit use `Number.MAX_SAFE_INTEGER` (custom number fields, disk quota, mail quotas).
- **`error` on a text field** is ignored while the field is clean and not mounted (e.g. in a
  hidden card): show server-side messages in an own component (maildomains DNS records).
- **Bottom toasts** (`notify()`, position `br`): neo sets no `top`, `.neo-floating`'s -10000px
  stretched them over the page; `go/component/Toast.scss` sets `top: auto`.
