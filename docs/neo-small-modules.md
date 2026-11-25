# neo: small modules and authentication

Neo UIs of the small community modules (card "neo-ui: menší moduly a autentizace").
Each lives in `www/go/modules/community/<module>/views/neo`. Templates: GOUI (`views/goui`)
where a module has one, else ExtJS3.

| Module | neo UI | Template | Notes |
|---|---|---|---|
| apikeys | System settings card "API Keys": keys (name, user, created), add, view token, delete | GOUI | the token is shown selected in a dialog (no clipboard API from the worker) |
| history | main module "History" (west: date range, user, actions, entity types; LogEntry grid, "Changes" dialog) + System settings card | GOUI | entity types come from `Module/get` `entities` (GOUI: client-side `entities.getAll()`) |
| davclient | My account card "DAV Accounts" (only with the calendar capability) + account dialog (server, collections, permissions) | GOUI | collections are removed by saving the map without them |
| oidc | System settings card (OpenID Connect clients) + "Sign in with …" buttons on the login screen | GOUI | buttons: `views/neo/login.php`, see below |
| otp | login step, My account card "Two Factor Authentication", enable dialog (QR, secret, verify), setup enforced after login, System settings card | ExtJS | GO puts the card into Account and the settings into Authentication; neo shows own cards |
| googleauthenticator | — | — | no UI (replaced by otp) |
| imapauthenticator, ldapauthenticator | System settings cards with server profiles | ExtJS | GO shows them as fieldsets in Authentication; domains and groups are chips (`systemsettings/authServerFields.mjs`) |
| oauth2client | System settings card "OAuth2 Client Settings" + connection dialog | ExtJS | `EmailOverrides.js` (e-mail account dialog) belongs to the legacy email module: open |
| jitsimeet | System settings card + `onlineMeeting` service for the calendar's event dialog | GOUI | `ModuleRegistry.getConfigs('onlineMeeting')` → `[{name, create(), joinText()}]` |
| wopi | System settings card "Office Online" + service dialog (read/write permissions) | ExtJS | opening files with a WOPI service depends on the files UI |
| dokuwiki | main module (wiki in an iframe, Refresh) + System settings card | ExtJS | the module title follows the setting after login |
| multi_instance | main module (instances grid: filters, search, edit, login as administrator, (de)activate, e-mail, delete, site config) + instance dialog with allowed modules | ExtJS | "Login as administrator" (toolbar): the access token is POSTed to the instance in the "groupoffice_instance" window through `src/postForm.mjs` (addon `WS/PostForm`) |
| pwned | System settings card (group to check) | ExtJS | |
| serverclient | "Mailboxes" card in Create user (checkbox per domain, e-mail and recovery e-mail follow the username, mailboxes created after the save) | ExtJS | domains from the read-only JMAP method `Serverclient/domains` (`Neo.php` doesn't render the `App::EVENT_SCRIPTS` script); `onCreateUserDialog` hook, see below |
| email, emailfavorites | — | — | open: depend on the legacy email module (outside community) |

Not browser-tested: everything admin-only (System settings cards, history, multi_instance,
dokuwiki) and modules not installed in the dev database. The test user is no administrator;
an admin test account and installing the modules were left to the user. Tested as the test
user: OTP enable (wrong / right code), login with the OTP step (wrong / right code), disable.

## Shared pieces

- **2FA login** (`apps/go/view/LoginView.mjs`, `src/jmap/Client.mjs`): `client.login()` returns
  `{loginToken, authenticators}` when more authenticators are pending; `client.authenticate(loginToken,
  {<id>: data})` sends a step. Each pending authenticator shows the card its module registers:
  `ModuleRegistry.register({loginPanels: {otpauthenticator: () => import(...)}})`, a subclass of
  `src/login/AuthenticatorPanel.mjs` (`createFields()`, `errorText(field, code)`). Modules load
  before login, so the panels are there; an authenticator without a panel shows an error.
- **`onMainView`** (ModuleRegistry): called with each window's main view after login (OTP
  enforcement opens its dialog there). `ModuleRegistry.callHook(name, ...args)`,
  `ModuleRegistry.getConfigs(key)` for other contributions.
- **Login buttons**: `Neo.php` includes every module's `views/neo/login.php` (returns
  `[['text' => ..., 'url' => 'api/page.php/...']]`) into `Neo.config.goLoginButtons`; the login
  view shows them below the form (ExtJS `LoginDialog.addSignInButton()` from `App::EVENT_HEAD`).
- **`src/systemsettings/EntityListPanel.mjs`**: a System settings (or My account) card that lists
  one entity in a `GO.list.ActionTable` with add / edit / delete and a FormWindow; changes save
  at once. Override `prepareRecords()` (names of ids) and `onAction()` for extra actions.
- A getter in a registration (`get userSettings() {...}`) is read when the cards load, after
  login: davclient shows its card only with the calendar capability.

## Remaining ExtJS-only screens (card "neo-ui: small ExtJS-only modules", 2026-11-19)

| Module | neo UI | Notes |
|---|---|---|
| dev (`community/dev`) | login step of the "dummy" authenticator | registered as `community-dev`: `dev` is the neo playground (`#dev`) |
| pdfeditor | file handler "PDF editor": opens pdf.js in a new window | `client.csrfToken` for the viewer's request; needs the module's access right (admins only by default) |
| customcss (legacy) | main module: CSS and JavaScript text areas, Save | "Select file" (insert a file URL) not ported; neo itself doesn't load the custom CSS/JS |
| comments | System settings card "Comments": labels (name, colour); label picker and label icons in `CommentsPanel` | the admin gear of the comments card opens the System settings card |
| sync (legacy) | My account card "Synchronization": deletes, e-mail account, note books and address books with a default; confirmation of a new ActiveSync device after login (`onMainView`) | calendar and task lists are left out: GO 26 has no legacy calendar/tasks modules |
| zpushadmin (legacy) | main module "ActiveSync": devices (status, user, type, version, IP, first/last sync, comment), search, delete, details from Z-Push, edit (may connect, comment), resync | the store and display actions send HTML entities: `Format.decodeEntities()` |
| serverclient | see above | |
| googleauthenticator, carddav, autoconfig, test, activesync, z-push | — | no user-facing UI (activesync/z-push settings are the sync and zpushadmin screens) |
| syncfusion | — | not in this repository (separate groupoffice26 repo, has a GOUI UI) |

New shared pieces: `GO.view.LegacyFormWindow` (FormWindow over a legacy controller, moved from
the files module), `Format.decodeEntities()`, `ActionTable` column `vdom`, CreateUserDialog hook
`onCreateUserDialog: dialog => {}` (references `username`, `email`, `recoveryEmail`, `password`).

Tested in the browser as neoadmin (admin screens) and neotest on a worktree container:
the dummy login step through a local auth proxy, the PDF viewer, customcss save, comment labels,
the sync card (no false "unsaved" question), zpushadmin with a temporary `zpa_devices` row
(edit, resync error, delete), the new-device question (Yes → allowed, No → denied) and the
Mailboxes card with temporary `serverclient_domains` (setMailbox reached the server, which
refused without `serverclient_token`). Test data, module installs and config were removed.

## Gotchas

- `fieldChange` of a neo form passes `{component, value, oldValue}`, not `field`.
- A field without `name` is not submitted (`DataSourceForm.collectValues()`): use it for
  switches that only drive other fields (LDAP "Use authentication", WOPI alternative URI).
- `User/set` of a related record (`otp`) fails with `validationErrors.otp` ("Error occurred in a
  related record"), not with the inner property.
- The OTP secret only comes back in the `User/set` response that requested it
  (`otp.requestSecret`): a later `User/get` returns no secret.
- Read-only text fields still show neo's clear trigger: set `clearable: false`.
- A FormWindow resets **every** field, named or not, when it is ready (`form.create()`) and
  after a save (`applyData()`): set a starting state after `await dialog.readyPromise` (with
  `reset(value)`, so it isn't dirty) and read what you need in the form's `beforesave`, not in `save`.
- `console.log()` of the shared worker doesn't reach Playwright's page console; `console.error()` does.
- `ConfirmDialog` shows `message` as text: don't HTML-escape it.
- Module order (top-bar tabs, menus, everything from `ModuleRegistry.getAvailable()`): the entry points
  (`Neo.config.goModules`, Neo.php lists them in GO's module `sort_order`) load in parallel and each
  registers when it finishes loading, so `apps/go/app.mjs` reorders the registry afterwards with
  `ModuleRegistry.sortByEntryPoints()`. A module matches its entry point by `package/name` (path
  `go/modules/<package>/<name>/` or `modules/<name>/` = `legacy`); one registered under another name
  (`community-dev`) or later (bookmarks in `onLogin`) comes after them.
- Module tabs (owner decision 2026-11-25: "the top bar is the last opened modules that are not in any
  workspace; a module cannot be open twice"): `MainView` creates every module's tab hidden and shows only
  the modules open in the window (`MainView.tabs`, `addTab()` / `removeTab()` around `setTabVisible()`),
  in GO's module order, so the order stays the same after a reload. Opening a module by any route (launcher,
  search, deep link, link, alert, quick add) adds its tab; the close icon, "Close", "Close others" and
  "Close all" remove it and destroy the view (re-opening costs one module load, the code is cached; a hidden
  view would keep its stores and listeners). Every tab can be closed, the Start page too. After the
  extensions start, `restoreTabs()` brings back the window's set (sessionStorage `go-module-tabs`, with the
  user id, so another user logging in to the same window gets nothing), else the user's last set of any
  window (on the server, see below; local copy `src/State.mjs` id `go-module-tabs-last-<userId>`); restored tabs have no view until shown, and
  modules an extension holds get no tab. Logout clears the window sets of the session. Pure logic in
  `src/moduleTabs.mjs`, tests in `tests/moduleTabs.test.mjs` (mocha from `www/views/neo`, e.g. the main
  checkout's `../../node_modules/.bin/mocha tests/`). A count of a module without a tab shows as a dot on
  the main menu button and on its launcher tile (`updateMainMenuDot()`). Neo renders a hidden component not
  at all: a Playwright check finds only the shown tabs' `data-ref`.
  Codex review fixes (2026-11-25): a tab closed while the restore read storage stays closed
  (`tabsClosedEarly`); a hash that comes meanwhile wins over the window's first hash also without
  extensions (`hashSeen`); a window stores tabs only for the user it was built for (`tabsUserId`, account
  switch); nothing is stored while logout clears the sets (`tabsLoggingOut`), and a failed logout stores
  them again. Left as is: two windows writing the user's last set at the same moment (last write wins),
  and an inactivity logout keeping the window's set for the same user.
  On the server (owner 2026-11-25: "remembered everywhere, like in GO 6.8/26"): the user's last set is the
  client state `open-modules` (table `go_state`) that the classic client keeps too (`MainLayout.js`
  `saveState()`, Ext `HttpProvider` on desktop), in the Ext.state encoding (`escape('a:' + escape('s:' +
  name) joined by '^')`), so a new browser, the next login and a switch between classic and neo open the
  same modules. Read from the session (`state['open-modules']`, also loaded for classic by
  `go/core/views/extjs3/User.js`), written with `core/Webclient/saveOpenModules` {modules}
  (`go\core\webclient\OpenModules`: current user only, names `[A-Za-z0-9_-]` (bookmarks as modules are `bookmarks-<id>`), at most 200; test
  `tests/go/core/webclient/OpenModulesTest.php`), changes of a second in one request (`queueServerTabs()`),
  sent at once on logout, skipped when the session already holds the same set (a reload). The localStorage
  copy `{tabs, pending}` stays: while `pending` (the request failed, offline) it wins over the server at the
  next boot of that browser, which sends it again (`pickLastTabs()`). A module that a workspace holds gets
  no tab also when the server set names it. Playwright's `setOffline()` doesn't stop neo's shared
  worker's requests; a failed save was tested by killing the container meanwhile.
  Codex review fixes (2026-11-25): saves go one at a time (`serverTabsSending`), so an older set never
  overwrites a newer one; nothing is sent once the session belongs to another account (the session changes
  before `client.user`); after a failed save the session's copy isn't trusted (`serverTabsUnsure`); the
  local copy is marked as sent through another window when the saving one closed; stored modules that neo
  has no view of (classic only) are kept (`withClassicOnly()`); logout waits for a save at most 3 s; the
  server's name check uses `$/D` (no trailing newline). Second pass: names may hold `-` (bookmarks), a
  stored item that is no module name is dropped alone; while a request is on its way a change is always
  sent (`serverTabsFlying`); only the success of the last queued save marks the local copy as sent
  (`serverTabsLatest`); the restore reads the local copy before the session's. Left as is: classic and neo
  open at the same time each keep the stored set they loaded (classic-only modules kept by neo come from
  its session), so the last client to save wins, as between two classic windows.

## Website Manager (legacy `site`, card "neo-ui: site module in neo", 2026-11-24)

The legacy module `www/modules/site` (status deprecated, not auto-installed, depends on files)
had only an ExtJS UI. Its neo UI lives in `www/modules/site/views/neo`.

### ExtJS inventory (`views/Extjs3`)

Live (listed in `scripts.txt` and reachable from `MainPanel`):

| ExtJS | What it does | Legacy routes |
|---|---|---|
| `MainPanel.js` | module "Website Manager": tree west, content editor center, "Cheat sheet" east (collapsible), Refresh in the toolbar | `site/site/cheatSheet` |
| `SiteTreePanel.js` | tree of every readable site: site → "Content" (content items, nested) and "Menu's" (menus → menu items, nested); expanded nodes saved per user; drag and drop | `site/site/tree` (`node`), `site/site/saveTreeState` (`expandedNodes`), `site/site/treeSort` (`parent`, `sortOrder`) |
| `treenodes/SiteNode.js` | site menu: View (opens `modules/site/index.php?site_id=`), Properties | — |
| `treenodes/ContentNode.js` | "Content" root menu: Add content; item menu: Advanced options, View, Add content (child), Delete content (refused while it has children); click loads the editor; drop between content items sorts them, drop on a menu or menu item asks and creates a menu item from the content | `site/content/delete`, `site/menuItem/createFromContent` (`target`, `content`) |
| `treenodes/MenuNode.js` | "Menu's" root menu: Add menu; menu menu: Properties, New item, Delete (refused while it has items) | `site/menu/delete` |
| `treenodes/MenuItemNode.js` | menu item menu: Properties, New item (child), Delete (refused while it has children); drop between items sorts them | `site/menuItem/delete` |
| `ContentPanel.js` | editor: Title (sets the slug), Slug (parent slug read-only + own part), Markdown text area; Save, Advanced options, View, Browse files (site folder); drop a content node → `[title](slug://slug)`, drop a file from the file browser → `[name](file://path)` | `site/content/update` (GET load, POST save), `site/content/create` (GET defaults, POST save), `site/content/redirect` |
| `ContentDialog.js` | "Advanced options": Info tab (created, modified, user; template, default child template), Meta tab (meta title, keywords, description) | `site/content/update`, `site/content/templateStore` (`siteId`) |
| `SiteDialog.js` | site properties (name, module read-only, domain, base path, language, SSL, mod rewrite, mod rewrite base path) + Permissions tab | `site/site/load`, `site/site/submit`, `core/aclGroup/*` |
| `MenuDialog.js` | menu: label, slug | `site/menu/load|create|update` (`site_id`) |
| `MenuitemDialog.js` + `Stores.js` | menu item: label, URL, display children, parent item, content, target (_blank, _self, _parent, _top) | `site/menuItem/load|create|update` (`menu_id`), `site/menuItem/parentStore`, `site/menu/contentStore` |

Dead code, not ported: `ContextMenu.js` (older menus, replaced by `treenodes/`), the
`HtmlEditor*` plugins (commented out in `ContentPanel.js`), `SelectFile.js`,
`SelectMultiFile.js`, `MultifileDialog.js`, `MultifileView.js` (only for the custom field
types, whose registration in `Customfield.js` is commented out), `ModuleSettingsDialog.js`
(never opened). Routes: none besides the module tab (`#site`).

### Permissions

Only users with access to the module reach the controllers (legacy `AbstractController`).
Sites have their own ACL (`site_sites.acl_id`, `Site::aclField()`); content items, menus and
menu items have none, so `findByPk()` and `save()` of those checked nothing: every module user
could read, change, sort and delete the content and menus of sites they can't even see. The
controllers now check the site's ACL through `Site::requirePermission()`: read for the tree,
loads, stores and redirects, write for create, update, sort and "create menu item from
content", delete for deletes. Test: `tests/go/modules/legacy/site/SitePermissionTest.php`.

Fixed after the review of the port (same test):

- `site/menu/contentStore`, `site/menuItem/parentStore` and the public `site/front/search` passed
  the request to `DbStore`, which deletes the records of `delete_keys` before it lists, without
  any check (`Site::listParams()` drops them). The front search lists only the current site.
- `setAttributes()` of a legacy model also sets `id` and `isNew`, so a create could overwrite a
  record of another site. Saves now take only the fields the dialogs edit; the site of content
  and menus and the menu of menu items change only on create (content moves by tree sort).
- Tree sort keeps menu items in their menu and refuses to move an item below itself.
- `site/multifile/*` changes need manage permission on the module: no custom field type of
  GroupOffice 26 creates multi file fields, so their owner can't be checked.

### neo port (`views/neo`)

`SiteMain` (MainThreeColumnPanel: `SiteTree` west, `ContentPanel` center, cheat sheet east),
dialogs `SiteDialog` (with the site's ACL in a SharePanel), `ContentDialog` ("Advanced options"),
`MenuDialog`, `MenuItemDialog`. All talk to the legacy controllers (`client.legacy()`); loads that
save on POST (`site/content/update`, `site/site/load`) are sent as GET.

- The Markdown editor needs its DOM when it mounts: the content form is never hidden, an empty
  panel only shows a hint above it. Don't give a child the reference `content` either: SiteMain
  already uses it for the panel, and the panel's own `getReference()` then finds itself.
- The editor fields are read-only when the user can't write the site (Save is disabled too).
  neo 14 itself does not toggle an input's `readonly` after the first render (the main thread sets
  the property `readonly`, the DOM's is `readOnly`); `src/form/field/textReadOnly.mjs`, imported
  by `apps/go/app.mjs`, fixes that for every text field.
- `site/site/load` (renderForm) requires write permission: a refused load means the user can only
  read the site, and the tree, the row menus and the editor then offer only "View".
- `files/folder/checkModelFolder` takes the entity name `Site`, not the class name.
- Custom fields: the legacy models use `CustomFieldsTrait` (entity types `Site` and `Content`). The
  dialogs set `entityName`, take `customFields` from the legacy load and save them as
  `customFieldsJSON`.
- Until `site/site/load` answered for a site, the UI treats it as read-only; switching to another
  item or adding one asks before unsaved changes are discarded.
- Not ported: dragging files from the files module into the editor (replaced by "Insert file",
  which picks files of the site's folder), and the unused ExtJS code listed above.
- First use of a legacy entity type races (core, not neo; checked 2026-11-24). `Site` is not
  registered when the module is installed (`Content` is): `EntityType::findByClassName()` inserts
  its `core_entity` row on first use. Two requests that both miss it in the entity type cache
  (parallel `site/site/submit`s right after the install, or a second container on the same
  database with its own APCu cache) both insert, and the second fails with "Duplicate entry 'Site'
  for key 'clientName'" (the failed insert also skips an auto-increment id). `getDefaultAclId()`
  has the same check-then-create race: each request creates an ACL and the last one wins, so the
  other stays behind without an owner. Both are upstream code; a fix would re-read the row after a
  duplicate key error, and set the default ACL with a conditional update (`... WHERE defaultAclId IS
  NULL`) whose affected-row count decides: 0 rows means another request won, so roll back the own
  ACL and read the winner's id. It only hits the first request(s), a retry succeeds.
- Test sites need an installed view module: db26 has no `defaultsite`, a site with
  `module = defaultsite` fails every content route with "Module defaultsite not found!".

Walkthrough 2026-11-24 as neoadmin (everything: edit and save, add and delete content, refused
delete with children, advanced options, site properties and permissions, add/edit/delete menus
and menu items, content dropped on a menu, sorting, tree node dropped into the editor, Insert
file, Browse files, View, cheat sheet) and as neotest with read access to the site (only View,
Save disabled, drags ignored); no console errors. Done on `localhost` with a fresh browser
context, not `127.0.0.1`: on 127.0.0.1 the license host check serves the classic client.

## Main view extensions (`mainViewExtension`, 2026-11-25)

A module can extend every window's main view (`apps/go/view/MainView.mjs`) without subclassing it: extra
cards in the main card layout, items in the top bar, routes of its own, and module views it takes over
from their standalone tab. sf/workspaces uses it for its workspace tabs (`docs/neo-workspace.md`, "Model
v2"). Without such a module the main view is the plain one card per module and loads no extension code.

Boot: with extensions the main area shows a "Loading..." card (`showLoadingCard()`) from the construction
until another card shows: every place that sets the card layout's `activeIndex` calls
`replaceLoadingCard()`, and `syncActiveCard()` falls back to it while nothing else is active. The first
route can arrive after the boot (`setRoute()` of the start module, `replaceRoute()` of an entity deep
link, a newer hash), so it is not removed when `ready` resolves; only `LOADING_GRACE` (5 s) after `ready`
and `startRouting` (what `start()` routed; not part of `ready`, `onHashChange()` awaits `ready`) a card
still shown goes (`loadingExpired`; a route still running, counted by `onHashChange()` in
`routesRunning`, removes it when it ends), so a route that shows nothing does not leave it for good. `removeLoadingCard()` keeps
the shown card (removing a card shifts the indexes). A new `activeIndex` assignment must call
`replaceLoadingCard()` too.

Registration (`src/ModuleRegistry.mjs`):

```js
ModuleRegistry.register({
    package: 'sf', name: 'workspaces', capability: 'go:sf:workspaces',
    mainViewExtension: () => import('./Extension.mjs')   // default export: a class
});
```

`Viewport.showMain()` loads the classes of the modules the user has access to
(`ModuleRegistry.loadMainViewExtensions()`, a failing import is logged and left out) and passes them to
`MainView`, which creates `new Extension({mainView})` per window. A constructor that throws is logged and
left out.

Hooks, all optional, called on every extension (`MainView.callExtensions()`):

| Hook | When, what it returns |
|---|---|
| `start(current)` | Boot, before the window's address is routed. `current` is the window's first hash or null. May resolve to a route (`'ws/2'`) that is shown when the window has no hash. `MainView.ready` waits for all of them; `onHashChange` waits for `ready`. |
| `onHashChange({name, rest, hashString})` | A hash whose first segment is no module. Resolve to true when handled. |
| `showModule(module, route)` | A module is opened (launcher, search, deep link, link, alert, quick add). Resolve to the module's view when the extension showed it, null to let the main view open it standalone. |
| `onActiveCardChange(card)` | The shown card changed: an extension card, or null for a module. |
| `fallbackRoute()` | The last standalone module closed: a route to go to, or null. |
| `beforeLogout()` | Awaited before the logout request (flush pending saves). |
| `launcherItems()` | The main menu opens: items `{text, iconCls, icon, pressed, handler, onDrop, onDragHover}` for a row above the tiles of the launcher (`AppLauncher.setRow()`; `text` is HTML, escape user data) or, in list mode, at the top of the menu. `onDrop(module)`: a tile dropped on the item (the launcher stays open, its row is rebuilt after); `onDragHover(module)`: the pointer rested on it while dragging a tile; when it resolves to true (what it shows is ready, the same drag still runs) the launcher turns see-through until the drag ends. Tiles are dragged by `WS/DockDrag` (`data-go-module`), so only while the page has a drop target. |
| `openBeside(name)` | Shift+click / Shift+Enter on a launcher tile. Return true when the extension opens the module itself (it then runs async); otherwise the module opens as usual. |
| `searchResults(text)` | The header search: results `{entity, name, description, route}` listed before the server's (`GlobalSearch.extraResults`). |
| `hotKeys()` | Boot: `{combo: handler}` window-wide shortcuts (`WS/HotKeys` below). |
| `cardTitle(card)` | The window's shown card is the extension's: its title for a list of the windows ("Move to window N: …"). |
| `destroy()` | The main view is destroyed. |

An owner of a claimed module view (below) also gets `onBadge(name, text)` (the module's count badge;
its top-bar tab is hidden) and `onModuleViewReleased(name, view)` (another owner claimed the view).

API of the main view for extensions:

- `insertTopbarItems(items, {start})`: adds items to the top bar; `start: true` right after the main
  menu button, otherwise before the spacer that precedes the notifications.
- `addCard(config)`, `showCard(card)`, `removeCard(card)`: cards of the main card layout. `showCard()`
  unpresses the module tabs; `activeCard` is the shown card, `activeModule` is null meanwhile.
- `claimModuleView(name, owner)`: takes a module's view for the owner (one view per module and window).
  A standalone view is removed from its card without being destroyed, a module not open yet is created;
  the module's top-bar tab is hidden. Returns null for a module shown in a popout window. A view held by
  another owner is taken from it (`onModuleViewReleased`).
- `releaseModuleView(name)`: the view becomes a standalone tab again. `unclaimModuleView(name)`: the owner
  destroyed the view.
- `routeModule` / `activeHash`: the module and hash the window last routed; an extension that shows a
  module sets `routeModule` to null for its own route.
- `windowMenuItems(handler, disabled)`: menu items "Move to window N: <what it shows>" for the other
  windows of the shared worker (`getMainViews()`, exported by `MainView.mjs`, in the order they opened;
  `describe()` is what a window shows). The core uses them for "Move to window" on a standalone module
  tab (`sendModuleToWindow()`): the module closes here and the other window routes to it.

Window pieces for extensions:

- `openWindow(windowId, hash)` (`src/history.mjs`, addon `WS/History`): this page at another hash in a new
  browser window of this one's size. Resolves to false when the popup blocker stopped it. The browser
  copies sessionStorage into a window opened this way; the addon clears the copy, so the new window
  starts without this window's state (`src/windowStorage.mjs`).
- `WS/HotKeys` (`src/main/addon/HotKeys.mjs`): window-wide shortcuts in the capture phase, so they also
  work in a field or on the page body. Combos are modifiers plus `KeyboardEvent.code`
  (`'Ctrl+Alt+Digit1'`, `'Ctrl+Alt+Shift+KeyZ'`): Alt changes `key` on macOS and many layouts. AltGr
  (Windows: Ctrl+Alt) never matches, it types characters (Czech AltGr+1 is `~`). A match is prevented and
  sent as the DOM event `goHotKey {combo}` to the main view.

Gotchas:

- With extensions, only the last hash that reached `onHashChange()` while they started is shown; the
  window's first hash (`start()`) is skipped when another one came meanwhile.
- A later window of the shared App worker can start without its first hash. A start route the extension
  returns is routed directly too, because `setRoute()` to the address the window already has fires no
  hashchange.
- A window closing meanwhile rejects pending neo calls with `Neo.isDestroyed`: catch it without an error
  message.
- The top-bar drag source (`WS/DockDrag`) is generic: tabs are draggable only while the page has a drop
  target (`[data-go-dock-drop]`) or a drop tab (`[data-go-dock-tab]`, a hover of 600 ms sends
  `goDockDragHover`, a drop `goDockDrop`).
