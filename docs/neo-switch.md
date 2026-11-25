# Switching the webclient to neo (plan)

Status: **approved by the owner** (2026-11-20). Sections 2–8 are implemented in order, one
commit per section, on the task branch. Reviewed read-only by Codex (gpt-6.2-astra); its
findings are worked in.

Goal: the neo webclient (`www/views/neo`) is what `index.php` shows by default. The classic
client (ExtJS 3 + the GOUI modules it embeds) stays reachable while modules without a neo
UI exist, and nothing a user, an e-mail or an OAuth client links to breaks.

## 1. Current state

| Topic | Today | Source |
|---|---|---|
| Entry point | `index.php` → `GO\Core\Controller\AuthController::actionInit()` → `Neo::get()->render()` when `$config['webclient'] === 'neo'`, else the theme's `Layout.php` (ExtJS + GOUI bundles) | `www/controller/AuthController.php:48`, `www/go/core/webclient/Neo.php:24` |
| Other pages that render the classic client | `views/Extjs3/Init.php` and `LoginHtml.php` include `Layout.php` directly | `www/views/Extjs3/Init.php:2`, `LoginHtml.php:2` |
| Standalone pages | installer, upgrade, maintenance / licence screens, the RememberMe theft screen, error pages, the calendar RSVP page and module pages render with `go\core\webclient\Page` and the standalone stylesheet `views/neo/dist/page.css` (since 2026-11-24, section 8); the classic Paper `pageHeader.php` / `pageFooter.php` and `externalHeader.php` are wrappers around it for code outside this repository | `www/go/core/webclient/Page.php`, `www/views/neo/resources/scss/page/page.scss` |
| Module registration in neo | `views/neo/Index.mjs` of installed, enabled modules (`Neo::moduleFiles()`, no per-user filter; modules check `capability` / rights in the registry), plus `views/neo/style.css` and `views/neo/login.php`. neo never loads ExtJS or GOUI module scripts. The shell also always loads the prototype Dev module | `Neo.php:35`, `src/ModuleRegistry.mjs`, `apps/go/app.mjs:84` |
| Modules without a neo UI (this checkout) | `modules/reminders` (ExtJS panel to create reminders for users), the CMS modules `site`, `defaultsite`, `manualsite`. The other folders without `views/neo` have no client UI (activesync, carddav, caldav, dav, z-push, autoconfig, googleauthenticator, postfixadmin, community/email backend, test); legacy `modules/calendar`, `tasks`, `bookmarks` are backend only | module folders |
| Modules outside this repo | business and pro modules (fetched by `build.sh`) and customer modules (`go/modules/amd`, `sf`, `nuw`): not verified here; customer modules are ExtJS. They are why the classic client must stay reachable | `build/build.sh:158-175` |
| Deep links the server sends | `#<entity>/<id>` by default from `Entity::url()` / `ActiveRecord::url()` (a module can change it with `EVENT_URL`; files `Folder` sends `#folder/<id>`), `#recover/<hash>-<urlencoded redirect>` (recovery mail) | `www/go/core/jmap/Entity.php:943-951`, `www/go/base/db/ActiveRecord.php:5434-5442`, `www/modules/files/model/Folder.php:274`, `www/go/core/model/User.php:1022-1032` |
| Query entry links | `?oauthAuthorize=1` (OAuth login with a pending authorization) and `?oauthConsent=1` (consent dialog), handled by the classic `MainLayout.js`; `?r=&f=<base64 json>` external URLs from `GO::createExternalUrl()` (mailto composer, model links) dispatched by `Extjs3::drawScripts()` | `www/api/oauth.php:59-74`, `www/views/Extjs3/javascript/MainLayout.js:303,345`, `www/go/GO.php:871-886`, `www/go/core/webclient/Extjs3.php:364-380` |
| Deep links in neo | `#<module>/<module path>` and `#systemsettings/<card>` only (`MainView.onHashChange()`). `#contact/5` opens nothing, `#recover/…` shows the normal login, the OAuth and `?r=` queries are ignored (since 2026-11-25 neo continues OAuth and the mailto composer, see "OAuth and external URLs in neo") | `apps/go/view/MainView.mjs:356`, `apps/go/view/Viewport.mjs:31-81` |
| Route differences classic ↔ neo | classic `#tasks/<id>` vs neo `#tasks/task/<id>`; classic e-mail `#email/<account>/<raw mailbox>` vs neo's encoded mailbox (a nested raw mailbox splits on `/`); System settings card ids differ (classic `history`, neo `community-history`) | `tasks/views/goui/script/Index.ts:20`, `TasksMain.mjs:624`, `www/modules/email/EmailClient.js:1025`, `modules/email/views/neo/util.mjs:55`, `SystemSettingsDialog.mjs:197` |
| Entity → route mapping | modules declare `routes: {Entity: id => path}`; GlobalSearch (`MainView.mjs:201`) and links / alerts / reminders (`src/link/linkTypes.mjs:60`) resolve them in two separate, case-sensitive places; items without a route say "Open it in the classic UI" but can't be clicked | `src/link/links.mjs:155`, `src/view/GlobalSearch.mjs:159`, `src/alerts/Alerts.mjs:207` |
| Popouts | `?neoPopup=<id>&neoBuild=<build>`: the popup joins the opener's shared App worker and adopts the component. Without `SharedWorker` neo falls back to dedicated workers, so a popup cannot adopt; it fails after the 30 s adopt timeout | `Neo.php:76`, `src/Popup.mjs` |
| Build | `scripts/install-npm.sh` installs the `www` npm workspace (views/goui, its submodules, module `views/goui`) and builds GOUI. `views/neo` is not in the workspace and nothing builds it: a release package has no `views/neo/node_modules` and no `dist/development` theme, so the neo page cannot start (fixed since: see "Release build") | `scripts/install-npm.sh`, `www/package.json` |
| Release pruning | `build.sh` runs `npm prune --omit=dev` in the package root only. `@fortawesome/fontawesome-free` is a devDependency of views/neo but `Neo.php` links its CSS (since: `build.sh` runs `buildScripts/release.mjs --in-place` instead, see "Release build") | `build/build.sh:332`, `www/views/neo/package.json` |
| Caching | `views/neo/.htaccess` makes `.mjs/.js/.css/.json` revalidate (neo imports modules without version query strings); the Debian Apache config has `AllowOverride None`, so it doesn't apply there | `www/views/neo/.htaccess`, `build/debian/etc/apache2/conf-available/groupoffice.conf:52` |
| neo runtime | `environment: 'development'`: the browser loads neo.mjs sources unbundled from `views/neo/node_modules/neo.mjs` (installed: 64 MB package, 7.4 MB `src`) | `Neo.php:236` |
| Page load cost | `Neo::buildId()` walks every file under `views/neo/apps`, `views/neo/src` and each module's `views/neo` on every neo page load except popups (shared worker name) | `Neo.php:80-121` |
| views/goui users | the classic client only (`Extjs3::loadGoui()` loads module `views/goui/dist/Index.js`; `getCSSFile()` aggregates module CSS incl. GOUI). Since 2026-11-24 neither the neo theme build (own copies of the tokens and the iconfont) nor the standalone pages (section 8) | `Extjs3.php:68,426` |

## Decisions to approve

**D1. Default client.** neo becomes the code default. `$config['webclient']` keeps
working: `'classic'` makes the classic client the default of an installation (opt-out for
installs whose daily work is in ExtJS-only customer or business modules); `'neo'` or unset
gives neo. `'extjs3'` is accepted as an alias of `'classic'` in config only.

**D2. Switching per page and per browser.** The client of a page is chosen in this order:

1. `?webclient=classic|neo` on the URL: this page only. Launchers from neo into the
   classic client use it, so opening one classic module does not switch the browser.
2. Cookie `GO_WEBCLIENT=classic|neo`: set only by an explicit "Switch to the classic UI" /
   "Switch to the new UI" item in the user menu of each client.
3. `$config['webclient']`.
4. `'neo'`.

Security contract:

- `$_GET` and `$_COOKIE` values are read only when they are strings equal to `classic` or
  `neo`; anything else is ignored.
- The cookie is written only by an authenticated POST with a valid CSRF / security token
  (new JMAP method or `go\core` controller, not the legacy `$_REQUEST` controller, whose
  token check can be skipped). Host-only, installation path, `HttpOnly`, `SameSite=Lax`,
  `Secure` on HTTPS. After saving, the client reloads to `index.php` without the
  `webclient` query (it would win otherwise).
- `$config['webclientSwitch'] = false` hides the menu items, makes the endpoint refuse and
  ignores the cookie. It does **not** block `?webclient=classic`: any user may still open a
  page in the classic client (the launchers need it). The classic client enforces its own
  permissions, so this exposes nothing new; the owner should confirm this meaning.

**D3. Classic-only apps inside neo.** After login (neo authenticates in place, so the page
render doesn't know the user) the shell asks the server which classic apps the user may
open: a read-only JMAP method (`@apiReadOnly`, `Module access:` permission doc) returning
`[{package, name, title, route}]`. A module is listed when it is installed, enabled,
available, the user has its READ right (or the right its panel requires), it has no neo
`mainView`, and it declares a classic main panel. "Declares a classic main panel" is an
explicit list (module `Module.php` / ExtJS registration data), not script discovery:
classic bundles may only add settings or hooks, per-user `scripts.inc.php` files exist, and
a neo `Index.mjs` may only add settings. The list is refreshed on login, logout and
"login as". In neo:

- the apps menu lists them below the neo modules with an `open_in_new` icon; a click opens
  `<goBaseUrl>index.php?webclient=classic#<route>` (absolute from `Neo.config.goBaseUrl`:
  the page's `<base href>` is `views/neo/apps/go/`; route parts encoded, titles escaped) in
  a new tab with `noopener`. No named-tab reuse: the classic client renames its window at
  boot (`Extjs3.php:325`), so a second open would not find it;
- GlobalSearch, link, alert and reminder items whose entity has no neo route open the
  classic client the same way, but only for entity types the classic client can open
  (classic's generic entity handler gives up on unregistered entities); others stay
  disabled;
- a `#<module>` hash of a classic-only module redirects the window to the classic client.

**D4. One registration path.** A module shows in neo only through its `views/neo`
(`Index.mjs`, `style.css`, `login.php`). neo does not read `scripts.txt`, `Module.js`,
`views/extjs3` or `views/goui`; this is already so and becomes a documented rule (README
"Module contract"). The Dev module (`src/dev`) loads only when `$config['debug']` is on, not in the
production menu.

**D5. Deep links and entry queries.** Everything the server or the classic client produces
keeps working:

| Link | neo |
|---|---|
| `#<module>[/…]` (neo module) | as today |
| `#<module>` (classic-only module) | classic client, same hash (D3) |
| `#<entity>/<id>`, `#folder/<id>` | one shared resolver (GlobalSearch, links, alerts, reminders, hash) over the registry `routes`, entity names matched case-insensitively, e.g. `#contact/5` → `#addressbook/contact/5`; no neo route but a classic one → classic client; neither → module start page with a "not found" toast |
| classic module routes that differ (`#tasks/<id>`, raw mailbox names in `#email/…`, System settings card ids such as `history`) | explicit aliases in the module's `route()` / registry; route acceptance tests per alias |
| `#systemsettings/<card>` | as today, plus the card id aliases above |
| `#recover/<hash>-<redirect>` | handled by the Viewport before session restore picks the main view (also when already signed in): LoginView "set a new password" card calling `api/auth.php` `action: "recover"` (`newPassword`, success `passwordChanged`), port of `go/core/views/extjs3/login/RecoveryDialog.js` |
| `?oauthAuthorize=1`, `?oauthConsent=1` | the Viewport continues the pending authorization after login and shows the consent dialog (ports of `MainLayout.js:303-308,345-349`); approve, deny and login-with-pending tests. Ported 2026-11-25 (see "OAuth and external URLs" below); both follow the normal client choice |
| `?r=&f=…` external URLs | `email.showComposer` (the redirect of `email/message/mailto`) opens neo's composer; every other command still renders classic. The launcher never forwards arbitrary query parameters |

Recovery redirect policy, the same in both clients (classic `Router.js:182-185` assigns the
decoded value to `document.location` today and stays reachable): decode once, accept only
a URL whose normalised origin and path are inside the installation (`goBaseUrl`), else go
to the GroupOffice root. The classic router gets the same check.

**D6. Popouts.** `?neoPopup` stays. Popup URLs also carry `webclient=neo`, so a browser
whose cookie or config says classic still opens the popup in neo. `src/Popup.mjs`
`supported()` asks the window's actual worker type (shared or dedicated); pop-out tools
and "Open in new window" items hide when unsupported instead of failing after 30 s.

**D7. Build and release.** neo is built wherever GOUI is built; it is not added to the
`www` workspace because `Neo.php` serves `views/neo/node_modules/neo.mjs` and
`@fortawesome` by path (hoisting would move them).

**D8. views/goui.** Nothing of it is removed in this task: the classic fallback (D2/D3)
still renders the GOUI modules, standalone pages use its core stylesheet. neo's theme build
no longer reads GOUI (own copies of the tokens and the iconfont since 2026-11-24). What can go, and when, is in section 8.

## 2. Build and release

- `www/views/neo/package.json` + `package-lock.json`: `@fortawesome/fontawesome-free` moves
  to `dependencies`; add `"build": "npm run build-themes"`.
- `scripts/install-npm.sh`: "Building neo" after the GOUI shared libs: in `views/neo`
  `npm install` (dev) / `npm ci` (nodev, still with dev dependencies: the theme build needs
  `sass`, `postcss`), then `npm run build`. Doesn't need the GOUI submodules (neo has its own
  copies of the tokens and the iconfont since 2026-11-24). Document the Node version.
- `build/build.sh` `build_package()`: after `install-npm.sh`, `views/neo/buildScripts/release.mjs
  --in-place` (since 2026-11-25 instead of `npm prune --omit=dev` in `views/neo`, see "Release
  build" below), and remove the generated `resources/css` (build input only; up to neo.mjs
  13.4 `resources/scss/theme-go`).
- Debian Apache config: the revalidation header of `views/neo/.htaccess`
  (`Cache-Control: no-cache` for `.mjs/.js/.css/.json` under `views/neo` and module
  `views/neo`), because `AllowOverride None` skips the `.htaccess`. `.mjs` must be served
  as `text/javascript` (docker image and Debian).
- `Neo::buildId()` and `Neo::moduleFiles()`: cached in `go()->getCache()` unless the
  debugger is on; the cache key includes the GO version and the mtime of
  `resources/theme-map.json`, and the cache is flushed on module install / enable and
  upgrade like the ExtJS scripts. A same-version UI deploy needs a cache flush: documented,
  and `install-npm.sh` does it when run in place.
- Release gate: smoke-test the extracted tarball and the Debian install, not the checkout:
  worker and module `.mjs` MIME types, `marked`, Font Awesome CSS and webfonts,
  `dist/development`, `resources/theme-map.json`, Material Symbols, the Paper Lato fonts.
- Build without the classic client: `build/build.sh --test --webclient=neo` (section 8,
  "Building without the classic client").
- Release build: see below (2026-11-25).

### Release build (2026-11-25)

The release runs neo minified, from the same URLs as a checkout. `build/build.sh` runs
`views/neo/buildScripts/release.mjs --in-place <package>` on the package after `install-npm.sh`.
The script refuses to run in a git checkout (also through a symlink), because it overwrites
the sources. It needs Node 20.12+ (`Dirent.parentPath`); the locked neo.mjs and cssnano need more anyway. It:

1. minifies every `.mjs`/`.js` of `views/neo/apps`, `views/neo/src`, `node_modules/neo.mjs/src`
   and of each module's `views/neo` (`modules/*`, `go/modules/*/*`, `promodules/*`) with
   Terser. It uses the options of neo's own `dist/esm` build (`module`, `mangle.toplevel`), so
   export names stay the same, plus `keep_classnames`: neo's `Main.mjs` registers main thread
   addons by `constructor.name` (`Neo.Main.addon.Stylesheet`). 1137 files, 10.8 MB → 3.5 MB;
2. minifies the theme CSS in `dist/development` with cssnano, deletes the source maps and
   keeps only the folders GO loads (`theme-go`, `src`). Both theme maps (`resources/` and
   `dist/development/resources/`) are cut down to match;
3. keeps only the runtime `dependencies` of `package.json` in `node_modules` (neo.mjs,
   marked, Font Awesome), and of those only what the page loads: neo.mjs `src`, Font Awesome
   `css` and `webfonts`. It does this instead of `npm prune --omit=dev`, because npm
   reinstalls a package whose files changed, and that brings back the full, unminified
   neo.mjs. The script fails when a runtime package gets dependencies of its own.

`views/neo` goes from 142 MB to 11 MB (node_modules 121 → 4.9 MB, dist 12 → 2.9 MB).

Why not neo's own production builds:

- `dist/esm` (`buildScripts/build/esmodules.mjs`) flattens the workspace and the engine into
  one `dist/esm` tree and takes only sources inside `views/neo` ("ESM source is outside the
  workspace"). GO's `src` and neo's `src` would both land in `dist/esm/src`.
- The webpack builds (`dist/production`) bundle the app.
- GO modules live outside `views/neo`, including modules installed later from other
  repositories. They import `views/neo/src` and `views/neo/node_modules/neo.mjs/src` by
  relative path. Such a module next to a `dist/esm` copy of the engine would start a second
  engine with its own class registry. Import maps don't help, because the App worker runs the
  module code and workers have no import maps.

So `Neo.php` keeps `environment: 'development'` and its paths. neo derives the worker, theme
CSS (`dist/<env>`) and app paths from the environment, and the `dist/*` values expect the
flattened tree. In `development` neo also parses html templates at runtime (GO uses none),
mirrors worker errors to the console and reports late config sets. That costs little.

A module installed after the release (unminified) imports the same, now minified, engine
files and works unchanged. Checked on a copy of the worktree with the release build applied
(container with the business/amd/sf modules unminified): login, shell, overview, address
book, tasks, calendar, e-mail and files render as on the dev build, with no console errors or
failed requests.

### Tarball and Debian smoke test (2026-11-25)

The release gate was run on a package built like `build_package` + `build_tar` + `build_deb`
(`--webclient=all`) from neo-ui `ae76cb3dd`, with the business repository unencoded (no
SourceGuardian locally) and without the pro modules:

- Tarball: extracted and served by the GO 26 docker image (php:apache, Debian trixie,
  `AllowOverride All`) with MariaDB 11.8, installed through `install/install.php`.
- Debian: the `.deb` built with `debuild` in `debian:12`, installed with `apt` next to
  `mariadb-server`, `apache2` and `libapache2-mod-php` (PHP 8.2), dbconfig-common preseeded,
  then installed through the browser installer. Also upgraded in place to a second build.

Checked on both: every module `Index.mjs`, the neo.mjs workers, `apps/go/app.mjs` and
`marked` are served as `text/javascript`; Font Awesome CSS and webfonts, `dist/development`
theme CSS, both `theme-map.json`, Material Symbols and the Lato fonts load (200); `.mjs`,
`.js`, `.css` and `.json` get `Cache-Control: no-cache`, and an `If-None-Match` request gets
a 304. A headless browser logged in and opened the start page, address book, tasks, calendar,
e-mail, files and notes: no failed requests, no HTTP errors, no console errors or warnings.
The SharedWorker's own requests (modules, `marked`, theme map) aren't visible to Playwright,
so they were checked with curl.

Found and fixed:

- `www/package-lock.json` lacked the syncfusion GOUI workspace (`go/modules/community/syncfusion/views/goui`,
  added on neo-ui without updating the lock), so `npm ci` in `install-npm.sh` failed and
  `build.sh` stopped after the neo build, before the classic SASS/GOUI build and the neo release minification. The lock was regenerated with
  `npm install --package-lock-only` against stub `package.json` files for the business and
  pro workspaces, so their entries stay; the diff only adds syncfusion.
- Debian doesn't enable `mod_headers`, so the `<IfModule mod_headers.c>` block of
  `groupoffice.conf` was skipped and neo files had no `Cache-Control` at all (browsers
  could keep running cached modules after an upgrade). `postinst` now runs
  `apache2_invoke enmod headers` while `a2query -m headers` says it isn't enabled (on a new
  install and on the first upgrade; the helper would restart Apache on every upgrade
  otherwise, and it skips a module the admin disabled), and `groupoffice.conf` declares
  `# Depends: headers`, so `a2enconf` warns when it's off. In a docker container
  `policy-rc.d` blocks the restart that `apache2_invoke` asks for; on a host it restarts
  Apache.

## 3. Choosing the client (entry point; needs D1/D2 approved)

- `go\core\webclient\Webclient`: `current(): string` (query → cookie → config → `'neo'`,
  D2), `setPreference(string)` writing the cookie. `Neo::enabled()` becomes
  `Webclient::current() === 'neo'`.
- `AuthController::actionInit()` uses it; the server forces classic for `?r=&f=` commands
  neo doesn't map (D5; OAuth and the mailto composer are mapped since 2026-11-25). `Init.php` / `LoginHtml.php`
  stay classic (legacy include paths), documented.
- Classic: "Switch to the new UI" in the user menu (`go/core/views/extjs3`, small ExtJS
  change); neo: "Switch to the classic UI" in the avatar menu. Both hidden when
  `webclientSwitch` is false.

## 4. Classic-only apps in neo (D3)

- Server: the classic main panel declaration per module, the read-only JMAP method with
  per-user rights, `ControllerPermissionTest` passes.
- neo: apps menu entries, the shared entity resolver with the classic fallback, `#<module>`
  redirect, refresh on login / logout / login as. Strings through `t()`.

## 5. Deep links (D5)

- Shared entity route resolver (`src/link/linkTypes.mjs` and `MainView`), aliases for the
  differing classic routes, `#recover/…` card, OAuth continuations, recovery redirect check
  in both clients.

## 6. Popouts (D6) and the Dev module (D4)

- `webclient=neo` on popup URLs, `Popup.supported()`, hide pop-out tools when unsupported.
- Dev module only with the debugger on, and only for admins (`available` of its registration: some demos change data).

## 7. Tests

- PHPUnit `tests/go/core/webclient/WebclientTest.php`: resolution order; invalid and
  non-string values at each level ignored; `extjs3` only in config; `webclientSwitch =
  false` ignores the cookie and the endpoint refuses; the endpoint refuses without CSRF
  token and for guests; OAuth / `?r=` queries render classic (since 2026-11-25: OAuth and the
  mailto composer follow the chosen client, other `?r=&f=` commands render classic).
- PHPUnit for the classic-apps method: a module with a neo main view is not listed, a
  module the user has no right to is not listed (proves the guard fires).
- Recovery redirect: external, protocol-relative, `javascript:` and double-encoded
  redirects go to the root.
- Browser walkthrough on the worktree container (neotest, neoadmin): default page is neo;
  `?webclient=classic` shows classic once, reload without it shows neo; both switch items;
  a classic-only app launcher under a sub-path install; `#contact/<id>`, `#note/<id>`,
  `#tasks/<id>`, `#email/<account>/<nested mailbox>`, `#folder/<id>`; `#recover/…` with a
  real recovery mail, signed in and signed out; OAuth authorize with consent; popout with
  a classic cookie; the release-gate smoke test of section 2.

## 8. views/goui: what can go

### What a build can leave out today (2026-11-24)

A checkout without `www/views/Extjs3`, `www/views/goui` and every module's `views/extjs3` and
`views/goui` boots, installs, upgrades, logs in and runs the neo client and the standalone pages
(checked on a copy of the tree with those folders removed, business modules included, section
"Checks" below). `build/build.sh --test --webclient=neo` builds such a package (next section).

| Removable folder | What replaced it |
|---|---|
| `views/Extjs3` (ExtJS, Paper theme, `Layout.php`, `externalHeader.php`) | `Webclient::classicAvailable()` (the one check: `views/Extjs3/themes/Paper/Layout.php` and `views/goui` exist). Without classic `Webclient::current()` is always neo, also for `?webclient=classic`, the cookie, `$config['webclient'] = 'classic'` and the classic-only queries; `switchAllowed()` is false (no switch menu items, `core/Webclient/setPreference` refuses), `Neo::classicApps()` is empty (no launchers). Legacy FileView templates (`Default.php` = the JSON output of every `index.php?r=` controller, `Exception`, `Disabled`, `Plain`, `Reminder`) moved to `go/base/view/templates/` |
| Paper assets neo used | copies in `views/neo/resources`: Lato woff2 (`fonts/`), `logo-white.svg`, `default-app-icon.svg` (module icon fallback of `App::downloadModuleIcon()`), `reminder.png`, `filetype/*.svg` (`index.php?r=core/thumb`), notification sounds (`sounds/`); sources in `resources/images/README.md`, `resources/fonts/README.md` |
| `views/goui` core stylesheet of the standalone pages | `go\core\webclient\Page` (header, footer, `render()`; no database or user needed) linking `views/neo/dist/page.css`, compiled from `resources/scss/page/page.scss` (the neo theme tokens, light and `body.dark`, colour scheme of the user or the OS) by `npm run build-themes` (`buildScripts/buildPageCss.mjs`). Pages: installer and upgrade (`install/header.php`), maintenance and invalid licence (`index.php`), theft screen, `Router::printException()`, legacy error / plain pages, calendar RSVP (`pageInvite()`), multi_instance "not found", OAuth 2 client success. `Extjs3::renderPage()` is deprecated and calls `Page::render()` |
| build | `scripts/install-npm.sh` builds neo (themes and `dist/page.css`) first and stops after it when `views/Extjs3` or `views/goui` is missing: the `www` npm workspace, the SASS themes and GOUI belong to the classic client |
| module `views/extjs3`, `views/goui` | nothing on the server reads them except the classic client and `Extjs3::classicMainPanel()` (only called when classic is available) |

Guards that stay for files of the classic client (all check that the file exists): legacy
module icons (`go/base/Module.php`, `App::downloadModuleIcon()`), the theme's `htmleditor.css`
for HTML mail (`go/base/mail/Message.php`, a generated file; without it the mail has no editor
style), emoticon images (`StringHelper`, without them the text emoticon stays), the classic theme
list (`CoreController::actionThemes()`), the Dev module's language scanner.
`tests/go/core/webclient/PageTest.php` (`testNoNewReferencesToClassicFiles`) fails when PHP
outside `views/` starts to name a classic path without joining that list.

Not yet without classic (known limits): `?r=&f=` external URL commands other than the mailto
composer (`links.openModelLink`) render classic (OAuth and the mailto composer continue in neo,
see "OAuth and external URLs in neo"); `index.php?r=external/index` (the classic `external.php`
launcher) redirects to the webclient. Code outside this repository that requires `views/Extjs3/...` files directly
(e.g. `themes/Paper/pageHeader.php`) breaks in such a build: use `Page`.

Checks (2026-11-24, branch `task/20261124-170805-neo-ui-core-runs-without-extjs-and-goui`):
fresh install on an empty database, license page, upgrade run as admin, neo login and main
view as the test user (light and dark), `?webclient=classic` → neo, `classicApps` empty,
`setPreference` refused, a blob upload and download, module icon fallback, `core/thumb`
icons, a legacy JSON controller and a legacy error page, the RSVP page (light and dark), theft,
maintenance and invalid-licence screens. With the folders back: `?webclient=classic` loads
ExtJS, neo stays the default, the classic apps are listed, the standalone pages use the new
stylesheet. Not checked: the RSVP reply (sends iMIP mail; no SMTP on the test instance), the
multi_instance and OAuth 2 client pages (same `Page::render()`).

### Building without the classic client (2026-11-24)

`build/build.sh --test --webclient=neo [--allow-without-neo=<module,...>]` runs
`scripts/strip-classic.sh` on the assembled package (after the pro and business modules are
encoded into it, before the npm build) and names it `groupoffice-<version>-neo`
(`deploy/build/<major>/<distro>-neo/`). The script can also run on its own on any assembled
`www` folder; `--check-only` runs the gate alone. On its own it allows nothing by default
(build.sh passes `NEO_ALLOW_WITHOUT_NEO`), and it refuses a tree with symlinked module or view
folders (a development checkout with mounted module repositories: it would delete through the
link), so strip a copy made with `cp -rL`.

- **Parity gate** first: a module (`go/modules/<package>/<name>` or `modules/<name>`) with a
  classic UI (`views/extjs3`, `views/Extjs3`, `views/goui` or a non-empty `scripts.txt` in its
  folder with at least one non-blank line, the legacy modules) but without `views/neo` fails the build with the list. A module
  may still ship when it is named in `--allow-without-neo` (`business/finance`, `projects2`) or
  in `NEO_ALLOW_WITHOUT_NEO` (build.sh default, overridable in `config.sh`): its classic files
  stay but nobody can open them. Default: `reminders` (section 1). In this repository every
  other module has neo; the pro modules (`modules/<name>`), business and the external packages
  (amd, sf, nuw) don't yet, so a release package with them fails until they are ported or
  allowed.
- **Removes**: `views/Extjs3`, `views/goui`, `views/Layout.php`, `go/core/views/extjs3` (the
  core's ExtJS code); of every module with
  `views/neo` its `views/extjs3`, `views/Extjs3`, `views/goui` and, for legacy modules, the
  `scripts.txt` and `*.js` in the module folder (email, files, sieve, smime, summary, sync,
  customcss); the root `package.json`, `package-lock.json`, `node_modules` (GOUI workspace;
  its `pdfjs-dist` is only read by the classic `modules/files/FilePanel.js`). Kept: module
  `themes/` (legacy icons, guarded), `scripts.inc.php` (only read by the classic loader),
  `go/core/webclient/Extjs3.php` (the class stays in use: neo and `Page` call its URL helpers
  such as `getRelativeUrl()`; only its asset loading needs the classic files and is guarded).
- `install-npm.sh` then builds neo only, and build.sh skips the `npm prune` of the root.
- Only with `--test`: published, the Debian package and the Docker image (which downloads
  `groupoffice-<version>.tar.gz`) would replace the classic release. Publishing a neo-only
  release needs a decision on package names first.

Runtime references to the removed paths in such a package (grep of the built tarball,
2026-11-24): only the guarded ones listed above, `Extjs3.php` (classic asset loading), comments, the Dev
module's status data in `src/dev/menu.mjs` and its `LanguageScanner` (guarded).

Checks (2026-11-24, branch `task/20261124-204636-neo-ui-build-without-the-classic-client`),
on tarballs built from the worktree with the steps of `build_package()` / `build_tar()`
(without encoding and pulls, so without pro and business modules) and extracted into a fresh
container: neo package 67 MB (classic 137 MB); fresh install, admin login, neo main view and
the apps (files, e-mail, address book, calendar, notes, start page) without failed requests or
console errors, `.mjs` served as `text/javascript`, `?webclient=classic` → neo, blob upload and
download, the installer and a legacy error page with `dist/page.css`. The normal build of the
same tree still contains the classic client, and `?webclient=classic` loads ExtJS from it. The
gate on a synthetic package catches `business/*`, `amd/*` and legacy pro modules and lets
explicitly allowed ones through. Not run: phpunit on the stripped package (build.sh runs it).
Found on the way (not caused by this): `www/package-lock.json` is out of sync with the
syncfusion GOUI workspace, so `npm ci` (the classic build) fails until it is regenerated; the
installer calls `business\license\model\License` whenever ionCube is loaded, so a package
without business modules ends the install with a fatal error after the database is created.

### When the classic client is removed (later chain)

| Part | Now | When the classic client is removed (later chain) |
|---|---|---|
| Module `views/goui` (apikeys, bookmarks, calendar, comments, davclient, history, jitsimeet, maildomains, notes, oidc, tasks) | stays: classic renders them | remove with their `package.json` and the workspace entries |
| `views/goui` shell, esbuild setup, `dist/` | stays: classic loads the GOUI runtime. The standalone pages no longer use it (2026-11-24) | `Extjs3::loadGoui()` goes with Extjs3 |
| Submodules `goui`, `groupoffice-core` | stay for the classic client. neo no longer reads them (2026-11-24): it builds and runs without `views/goui`, with copies of `groupoffice-core/style/_theme.scss` (`views/neo/resources/scss/go/goui-theme/`) and `MaterialSymbolsOutlined.woff2` (`views/neo/resources/fonts/`); neo's SCSS `@use`d no `goui/style` partials. Refreshing the copies: `docs/neo-upstream-sync.md` | remove the submodules |
| `www/package.json` workspaces | stays | removed or reduced to `pdfjs-dist`; neo is the only npm build |
| Docs that use GOUI as the reference (`docs/neo-*.md`, Dev module statuses) | stay until parity is closed | keep as history |

Precondition for removing classic: feature and route parity, not file presence: every
module of the supported editions (business and pro included, checked in the assembled
package) has a neo main view or settings card for each classic panel, every classic route
in D5 has a neo equivalent, and the classic-apps method returns nothing for an admin.

## Implementation (2026-11-20, branch `task/20261119-011401-neo-ui-switch-the-webclient-to-neo`)

| Section | Where | Notes |
|---|---|---|
| 2 Build and release | `scripts/install-npm.sh` ("Building neo webclient"), `build/build.sh` `build_package()`, Debian `groupoffice.conf` (`.mjs` type, `Cache-Control: no-cache` under `/views/neo/`), `views/neo/package.json` (Font Awesome a dependency, `build` script), `Neo::cached()` for `buildId()` / `moduleFiles()` / the classic routes | `install-npm.sh nodev` checked end to end; `npm prune --omit=dev` keeps neo.mjs, marked, Font Awesome. Tarball / Debian smoke test: see "Tarball and Debian smoke test (2026-11-25)" |
| 3 Choosing the client | `go\core\webclient\Webclient`, `go\core\controller\Webclient::setPreference()` (JMAP `core/Webclient/setPreference`, CSRF via JMAP), `Neo::enabled()`; menu items in neo (`MainView.switchToClassic()`) and classic (`MainLayout.js`); `GO.settings.config.webclientSwitch`, `Neo.config.goWebclientSwitch` | cookie host-only with the installation's path, `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS |
| 4 Classic-only apps | `Extjs3::classicMainPanel()` (ExtJS scripts + GOUI bundle without comments: `go.Modules.register(…{mainPanel})`, `addPanel(<class>)` → the class's `id`, GOUI `addMainPanel(pkg, module, id)`, legacy `addModule('<route>', <class>)`; `requiredPermissionLevel`), `Neo::classicApps()` (cached per module id, permission per user at that level with `Module::isAvailableFor()`, entity names per module), JMAP `core/Webclient/classicApps` (`@apiReadOnly`), `src/classicApps.mjs` (menu list without neo main views; entity routes from all apps; cleared on logout, stale answers dropped), `MainView.classicMenuItems()` / `routeUnknownHash()`, `linkTypes.resolveRoute()` | opens through the `WS/History` addon (`src/history.mjs` `openTab()`: new tab with `noopener`); rewritten hashes (`#classic/…`, entity aliases, unknown hashes → "Not found") replace their history entry (`replaceRoute()`), so Back doesn't run them again |
| 5 Deep links | `LoginView` recovery card (`showRecover()`, `onSaveRecover()`, `safeRedirect()`; a rejected redirect leaves the user on the success card), `Viewport` (before session restore, and on a later hash change in an open tab), classic `go.Router.safeRedirect()`; aliases: `TasksMain.route()` (`#tasks/<id>`), e-mail `parseRoutePath()` (raw mailbox), `SystemSettingsDialog.showCard()` (`history` → `community-history`) | |
| 6 Popouts, Dev | `Popup.popupsSupported()`, `webclient=neo` on popup URLs, pop-out tool and tab menu item hidden without SharedWorker; Dev module only with `$config['debug']` (`Neo.config.goDebug`, not `debug_usernames`) | |
| 7 Tests | `tests/go/core/webclient/WebclientTest.php` (resolution order, invalid values, switch off, endpoint guards), `NeoTest.php` (main panel detection, per-user permission guard proven to fail without the check) | browser walkthrough on a worktree container as neotest: default neo, `?webclient=classic` once, switch both ways, apps menu launchers, `#contact/1`, `#tasks/1`, `#note/1`, a classic entity, `#vessels`, `#email/1/INBOX`, recovery (signed in and out, mismatch, invalid hash, external redirect dropped) |

Known limits: a classic e-mail link whose mailbox ends in a part of digits (`#email/4/Archive/2025`)
opens message 2025 of `Archive` (neo's own links encode the mailbox, so they are unambiguous); a
deploy that changes only a module's `views/neo` files at the same GO version needs a cache flush
(as the ExtJS scripts do); classic still decodes a recovery link's redirect in its router, so a
malformed percent escape there stops the classic recovery dialog (unchanged behaviour), neo ignores it.

Later cards: `?r=&f=` external URL commands other than the mailto composer (only
`links.openModelLink` of `CoreController` is left), and section 8's removal of classic and GOUI
once the classic-apps list is empty for an admin.

## OAuth and external URLs in neo (2026-11-25)

| Part | Where |
|---|---|
| What a page continues with | `Webclient::neoEntry($_GET)` → `Neo.config.goEntry` (per window, like `goPopup`): `oauth: 'authorize' \| 'consent'`, `compose: {to, cc, bcc, subject, body}` |
| Classic only | `Webclient::classicOnly()`: an `f` whose command `neoEntry()` doesn't map. `Webclient::externalCommand()` decodes `f` for both clients (`Extjs3::drawScripts()` uses it; the old `{GOCRYPT}` branch called a class that wasn't imported and nothing creates such URLs). For `email.showComposer` it keeps only the mail fields (`composerValues()`): before, a crafted link could pass any composer option (`loadUrl`…) and markup in the body to the classic `GO.email.showComposer()` |
| `?oauthAuthorize=1` | `Viewport.showMain()`, before the main view is built: `replaceLocation()` (`src/history.mjs`, `WS/History` addon) to `api/oauth.php/authorize`, no history entry |
| `?oauthConsent=1` | `Viewport.continueEntry()` after the main view is shown: `src/view/OAuthConsentDialog.mjs` (port of GOUI `auth/OAuthConsent.ts`): GET `oauth.php/consent`, Allow / Deny post `requestId`, `decision`, `data`, `CSRFToken` with `postForm(…, '_self')`; no close tool, Escape doesn't close; an expired request (404) shows a toast and drops `oauthConsent`, a failed load (offline, 5xx) keeps it for a reload. When the session ends while it is open (`showLogin()`), the dialog closes and opens again after the next login. Modules add scope panels with the registration key `oauthConsentPanels: {<scope>: async details => ({component, getData, validate?})}` (GOUI `oauthConsent.registerPanel()`); a failing panel leaves only Deny |
| mailto composer | `continueEntry()`: drops `r` and `f` (`removeQuery()`; other parameters like `webclient` stay; a reload doesn't open another composer), then the e-mail module's `showComposer` registration directly, not `src/Mail.mjs`: its desktop-composer fallback would hand the link back to the mail program, which may be GroupOffice. `composerValues()` takes out only the line breaks `actionMailto()`'s `nl2br()` added and escapes the text: a link can't put markup into the composer |

Tests: `WebclientTest` (resolution with OAuth and `f`, `externalCommand()` rejects names that
aren't letters, `neoEntry()` escaping). Browser walkthrough on a worktree container as neotest with a
client that registered itself (a temporary module scope, removed again): authorize while signed out →
`?oauthAuthorize=1` → login → `?oauthConsent=1` → dialog → Allow gives the callback a code; Deny gives
`access_denied` with the state; `?oauthConsent=1` without a request shows the toast; a mailto link opens
the composer with recipient, subject and the escaped body.

## Owner's answers (2026-11-20)

1. D1: neo is the default for upgraded installations too; the launchers (D3) cover modules
   without a neo UI.
2. D2: a per-browser cookie `GO_WEBCLIENT`, no `core_user` column. `?webclient=classic`
   keeps working when `webclientSwitch` is false; the switch only hides the menu items,
   makes the endpoint refuse and ignores the cookie.
3. D5: OAuth authorize / consent and `?r=&f=` external URLs render the classic client for
   now; neo ports are later cards.
4. D7: the first release uses the development (unbundled) neo runtime; the production
   build is a separate card.
