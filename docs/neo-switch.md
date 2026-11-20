# Switching the webclient to neo (plan)

Status: **draft, waiting for the owner's approval** (2026-11-20). Nothing in this plan
changes the entry point until it is approved. Sections 2–8 are implemented in order, one
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
| Standalone pages | installer, version/licence screens, the RememberMe theft screen, the calendar RSVP page use the Paper `pageHeader.php`; the common `views/Layout.php` links the GOUI core stylesheet | `www/install/header.php`, `www/index.php:167`, `www/go/modules/community/calendar/Module.php:419`, `www/views/Layout.php:47` |
| Module registration in neo | `views/neo/Index.mjs` of installed, enabled modules (`Neo::moduleFiles()`, no per-user filter; modules check `capability` / rights in the registry), plus `views/neo/style.css` and `views/neo/login.php`. neo never loads ExtJS or GOUI module scripts. The shell also always loads the prototype Dev module | `Neo.php:35`, `src/ModuleRegistry.mjs`, `apps/go/app.mjs:84` |
| Modules without a neo UI (this checkout) | `modules/reminders` (ExtJS panel to create reminders for users), the CMS modules `site`, `defaultsite`, `manualsite`. The other folders without `views/neo` have no client UI (activesync, carddav, caldav, dav, z-push, autoconfig, googleauthenticator, postfixadmin, community/email backend, test); legacy `modules/calendar`, `tasks`, `bookmarks` are backend only | module folders |
| Modules outside this repo | business and pro modules (fetched by `build.sh`) and customer modules (`go/modules/amd`, `sf`, `nuw`): not verified here; customer modules are ExtJS. They are why the classic client must stay reachable | `build/build.sh:158-175` |
| Deep links the server sends | `#<entity>/<id>` by default from `Entity::url()` / `ActiveRecord::url()` (a module can change it with `EVENT_URL`; files `Folder` sends `#folder/<id>`), `#recover/<hash>-<urlencoded redirect>` (recovery mail) | `www/go/core/jmap/Entity.php:943-951`, `www/go/base/db/ActiveRecord.php:5434-5442`, `www/modules/files/model/Folder.php:274`, `www/go/core/model/User.php:1022-1032` |
| Query entry links | `?oauthAuthorize=1` (OAuth login with a pending authorization) and `?oauthConsent=1` (consent dialog), handled by the classic `MainLayout.js`; `?r=&f=<base64 json>` external URLs from `GO::createExternalUrl()` (mailto composer, model links) dispatched by `Extjs3::drawScripts()` | `www/api/oauth.php:59-74`, `www/views/Extjs3/javascript/MainLayout.js:303,345`, `www/go/GO.php:871-886`, `www/go/core/webclient/Extjs3.php:364-380` |
| Deep links in neo | `#<module>/<module path>` and `#systemsettings/<card>` only (`MainView.onHashChange()`). `#contact/5` opens nothing, `#recover/…` shows the normal login, the OAuth and `?r=` queries are ignored | `apps/go/view/MainView.mjs:356`, `apps/go/view/Viewport.mjs:31-81` |
| Route differences classic ↔ neo | classic `#tasks/<id>` vs neo `#tasks/task/<id>`; classic e-mail `#email/<account>/<raw mailbox>` vs neo's encoded mailbox (a nested raw mailbox splits on `/`); System settings card ids differ (classic `history`, neo `community-history`) | `tasks/views/goui/script/Index.ts:20`, `TasksMain.mjs:624`, `www/modules/email/EmailClient.js:1025`, `modules/email/views/neo/util.mjs:55`, `SystemSettingsDialog.mjs:197` |
| Entity → route mapping | modules declare `routes: {Entity: id => path}`; GlobalSearch (`MainView.mjs:201`) and links / alerts / reminders (`src/link/linkTypes.mjs:60`) resolve them in two separate, case-sensitive places; items without a route say "Open it in the classic UI" but can't be clicked | `src/link/links.mjs:155`, `src/view/GlobalSearch.mjs:159`, `src/alerts/Alerts.mjs:207` |
| Popouts | `?neoPopup=<id>&neoBuild=<build>`: the popup joins the opener's shared App worker and adopts the component. Without `SharedWorker` neo falls back to dedicated workers, so a popup cannot adopt; it fails after the 30 s adopt timeout | `Neo.php:76`, `src/Popup.mjs` |
| Build | `scripts/install-npm.sh` installs the `www` npm workspace (views/goui, its submodules, module `views/goui`) and builds GOUI. `views/neo` is not in the workspace and nothing builds it: a release package has no `views/neo/node_modules` and no `dist/development` theme, so the neo page cannot start | `scripts/install-npm.sh`, `www/package.json` |
| Release pruning | `build.sh` runs `npm prune --omit=dev` in the package root only. `@fortawesome/fontawesome-free` is a devDependency of views/neo but `Neo.php` links its CSS | `build/build.sh:332`, `www/views/neo/package.json` |
| Caching | `views/neo/.htaccess` makes `.mjs/.js/.css/.json` revalidate (neo imports modules without version query strings); the Debian Apache config has `AllowOverride None`, so it doesn't apply there | `www/views/neo/.htaccess`, `build/debian/etc/apache2/conf-available/groupoffice.conf:52` |
| neo runtime | `environment: 'development'`: the browser loads neo.mjs sources unbundled from `views/neo/node_modules/neo.mjs` (installed: 64 MB package, 7.4 MB `src`) | `Neo.php:236` |
| Page load cost | `Neo::buildId()` walks every file under `views/neo/apps`, `views/neo/src` and each module's `views/neo` on every neo page load except popups (shared worker name) | `Neo.php:80-121` |
| views/goui users | the classic client (`Extjs3::loadGoui()` loads module `views/goui/dist/Index.js`; `getCSSFile()` aggregates module CSS incl. GOUI), standalone pages (`views/Layout.php`), and the neo theme build (`groupoffice-core/style/_theme.scss` tokens, `goui/style` partials, the Material Symbols iconfont) | `Extjs3.php:68,426`, `views/neo/resources/scss/go/Global.scss:3,28` |

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
| `?oauthAuthorize=1`, `?oauthConsent=1` | the Viewport continues the pending authorization after login and shows the consent dialog (ports of `MainLayout.js:303-308,345-349`); approve, deny and login-with-pending tests. Until ported, the server renders classic for these two queries |
| `?r=&f=…` external URLs | the server renders classic for them; mapping individual commands to neo (mailto composer first) is a later card. The launcher never forwards arbitrary query parameters |

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
still renders the GOUI modules, standalone pages use its core stylesheet, and neo's theme
build reads GOUI's SCSS tokens and iconfont. What can go, and when, is in section 8.

## 2. Build and release

- `www/views/neo/package.json` + `package-lock.json`: `@fortawesome/fontawesome-free` moves
  to `dependencies`; add `"build": "npm run build-themes"`.
- `scripts/install-npm.sh`: "Building neo" after the GOUI shared libs: in `views/neo`
  `npm install` (dev) / `npm ci` (nodev, still with dev dependencies: the theme build needs
  `sass`, `postcss`), then `npm run build`. Needs the GOUI submodules, which the script
  already requires. Document the Node version.
- `build/build.sh` `build_package()`: after `install-npm.sh`, `npm prune --omit=dev` in
  `views/neo` too, and remove the generated `resources/scss/theme-go` (build input only).
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
- Not in this task: neo's production build (`neo.mjs/buildScripts/build/esmodules.mjs`,
  minified ESM in `dist/esm`). It changes how module code is resolved (relative imports into
  `views/neo`) and needs its own card.

## 3. Choosing the client (entry point; needs D1/D2 approved)

- `go\core\webclient\Webclient`: `current(): string` (query → cookie → config → `'neo'`,
  D2), `setPreference(string)` writing the cookie. `Neo::enabled()` becomes
  `Webclient::current() === 'neo'`.
- `AuthController::actionInit()` uses it; the server forces classic for `?oauthAuthorize`,
  `?oauthConsent` and `?r=&f=` until neo handles them (D5). `Init.php` / `LoginHtml.php`
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
- Dev module only with the debugger on.

## 7. Tests

- PHPUnit `tests/go/core/webclient/WebclientTest.php`: resolution order; invalid and
  non-string values at each level ignored; `extjs3` only in config; `webclientSwitch =
  false` ignores the cookie and the endpoint refuses; the endpoint refuses without CSRF
  token and for guests; OAuth / `?r=` queries render classic.
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

| Part | Now | When the classic client is removed (later chain) |
|---|---|---|
| Module `views/goui` (apikeys, bookmarks, calendar, comments, davclient, history, jitsimeet, maildomains, notes, oidc, tasks) | stays: classic renders them | remove with their `package.json` and the workspace entries |
| `views/goui` shell, esbuild setup, `dist/` | stays: classic loads the GOUI runtime, standalone pages its core stylesheet | remove after the standalone pages (installer, RSVP, theft screen, version/licence) have their own CSS; `Extjs3::loadGoui()` goes with Extjs3 |
| Submodules `goui`, `groupoffice-core` | stay: classic + neo theme tokens | copy what neo uses (`groupoffice-core/style/_theme.scss` tokens, the `goui/style` partials neo's SCSS `@use`s, `MaterialSymbolsOutlined.woff2`) into `views/neo/resources`, then remove the submodules |
| `www/package.json` workspaces | stays | removed or reduced to `pdfjs-dist`; neo is the only npm build |
| Docs that use GOUI as the reference (`docs/neo-*.md`, Dev module statuses) | stay until parity is closed | keep as history |

Precondition for removing classic: feature and route parity, not file presence: every
module of the supported editions (business and pro included, checked in the assembled
package) has a neo main view or settings card for each classic panel, every classic route
in D5 has a neo equivalent, and the classic-apps method returns nothing for an admin.

## Open questions for the owner

1. D1: should upgraded installations also switch to neo, or keep classic until an admin
   sets `webclient` (neo only for new installs)? Recommendation: neo for all, the launchers
   (D3) cover modules without a neo UI.
2. D2: is a per-browser cookie enough, or should the choice be a user setting (new
   `core_user` column, follows the user to every browser)? And is it fine that
   `?webclient=classic` works even when `webclientSwitch` is false?
3. D5: OAuth consent and `?r=` external URLs go to classic first (neo ports later), or must
   neo handle them before the switch?
4. D7: is the development (unbundled) neo runtime acceptable for the first release, with
   the production build as a separate card?
