# Neo.mjs webclient for Group Office: shell + Notes (spike)

Date: 2026-10-15 · Branch: `neo-ui` (worktree `~/Projects/groupoffice26-neo`)

## Goal

Try out [neo.mjs](https://github.com/neomjs/neo) (v13.x, MIT) as a full replacement
webclient for Group Office 26, next to `views/Extjs3` and `views/goui`. The backend
(PHP, JMAP API) stays unchanged. Only the core shell and one module (`community/notes`)
are implemented. Success: a user logs in at `http://localhost:8027/`, picks **Notes**
from the module menu and can browse, create, edit and delete notes. Changes made in
classic GO (`:8026`, same database) show up live, and the other way round.

## Non-goals

Other modules, translations (UI is English only), custom fields, links, comments,
attachments, note encryption (encrypted notes show a placeholder), notebook
management/sharing, account settings, production build/minification, mobile layout.

## Runtime environment

- New compose service `groupoffice26-neo` in `~/Projects/go-docker`
  (`docker-compose.go26neo.yml`): same image and rendered config as `groupoffice26`,
  database `db26` shared, own data folder (copy of `docker/groupoffice26/data`) so the
  two containers don't share cache. Port **8027**. Mounts
  `~/Projects/groupoffice26-neo/www` to `/var/www/html`.
- Composer `vendor` installed in the worktree. The `views/goui` submodule is not
  needed for the neo UI and stays uninitialised.
- APCu is disabled in the neo container (`apc.enabled=0`). `PushDispatcher` only
  re-checks the database when an APCu state counter changes
  (`go/core/model/PushDispatcher.php:91`), and APCu is per container, so writes made
  on `:8026` would never wake SSE on `:8027`. Without APCu it checks the DB on every
  tick. This only matters for the two-container comparison.
- Classic GO keeps running on `:8026` for comparison.

## Architecture

```
www/
  index.php                 unchanged checks (install/upgrade/license/remember-me)
  go/core/webclient/Neo.php renders the neo shell HTML when config webclient=neo
  views/neo/                core shell (neo workspace: package.json, neo.mjs dependency)
    index.html template     loads neo Main.mjs, passes neo-config + module list
    src/
      GoJmapClient.mjs      JMAP client (app worker)
      JmapStore.mjs         Neo.data.Store subclass backed by JMAP
      ModuleRegistry.mjs    modules register here; shell builds its menu from it
      view/Viewport.mjs     login card / main card
      view/LoginView.mjs
      view/MainView.mjs     top bar (module menu, user, logout) + module card area
go/modules/community/notes/views/neo/
  Index.mjs                 registers the module with ModuleRegistry
  view/NotesMain.mjs        3 columns: notebooks | note grid | note detail
  view/NoteDialog.mjs       create/edit
  model/Note.mjs, model/NoteBook.mjs
```

### Entry point

`config.php` of the neo container sets `'webclient' => 'neo'`. `index.php` runs as
today and dispatches to `AuthController::actionInit()` (default route), which sends
security headers, initialises and finally includes the theme's `Layout.php`
(`controller/AuthController.php:47`). The switch goes exactly there: with
`webclient=neo` it renders `go\core\webclient\Neo` instead of `Layout.php`, so all
preceding behaviour (install/upgrade/license checks, remember-me) is kept. With no
flag, behaviour is unchanged, so the code can live on the same branch as classic GO.

The PHP renderer outputs a list of neo module entry points: every installed and
enabled module that has `views/neo/Index.mjs` (same discovery as `loadGoui()` does
for `views/goui/dist/Index.js`). The shell imports them in the app worker with dynamic
`import()`. All URLs are absolute (`/views/neo/...`, `/go/modules/.../views/neo/...`,
`/api/...`), because import maps don't apply inside workers. Module code imports neo
from `/views/neo/node_modules/neo.mjs/src/...`.

### Module contract

A module's `Index.mjs` calls
`ModuleRegistry.register({package, name, title, iconCls, capability, mainView})`.
`capability` is the JMAP session capability (`go:community:notes`). After login the
shell shows only modules whose capability is in the session, the same way GOUI's
notes `Index.ts` does. `mainView` is a neo class created lazily on first selection.
Routing: `#notes` opens the module, `#note/<id>` opens a note.

### Data layer

- **Auth uses GO's browser model: the HttpOnly cookie plus a CSRF token.** The access
  token is never stored client-side (`api/auth.php:62`). Same-origin `fetch` from the
  worker sends the cookie automatically.
  - Boot: `GET api/jmap.php` returns the session (including `CSRFToken`,
    `go/core/jmap/State.php:253`) when the cookie or remember-me is valid. A 401 shows
    the login.
  - Login: JSON `POST api/auth.php {username, password, rememberLogin}`. **201** =
    logged in (session + `CSRFToken`, cookie set). **200** with `loginToken` and
    `authenticators` = 2FA required. The spike shows "2FA accounts are not supported in
    this preview" instead of treating it as success.
  - Every POST sends `X-CSRF-Token` (`State.php:84`). Logout uses `DELETE api/auth.php`.
- `GoJmapClient` (app worker): the session, JMAP calls batching several method calls
  into one request, and result references for `query`+`get`.
- `JmapStore`: remote filter/sort/paging through `Entity/query` + `Entity/get`;
  `save()`/`remove()` through `Entity/set`.
- Push: `GET api/sse.php?types=Note,NoteBook` (cookie auth), read with fetch
  streaming in the worker. Events are named `state` (payload: entity name → state
  map) and `ping`; this is GO's own format, not a JMAP `StateChange`. When the
  state of a visible entity changes, the affected store **reloads its current page**
  (query + get). It does not patch records in place, so creations, filter membership,
  sorting and paging stay correct without extra logic. The detail reloads if its note
  changed or closes if it was destroyed. When the stream drops: reconnect with
  backoff, then reload.

### Notes UI

- **Notebooks (left):** list of notebooks with checkboxes; checked ones filter the grid
  (`noteBookId` filter, array). Nothing checked = all notes (server behaviour,
  `model/Note.php:87`, same as GOUI).
- **Note grid (centre):** columns name and modified date. Search field (`text`
  filter: name + content), sorting, paging.
- **Detail (right):** name, notebook, modified by/at, HTML content. The content is
  sanitised server-side on write (`model/Note.php:102`). The preview still renders it
  in an isolated element without scripts. Embedded images load via
  `api/download.php` (cookie auth).
- **NoteDialog:** name, notebook combo, HTML editor. New / edit / delete (with confirm).
- **Permissions:** edit and delete only when `permissionLevel` allows it (as in
  `NoteDetail.ts`). New is offered only for notebooks the user can write to.
  Encrypted notes (`password` set) show a read-only placeholder.

## Error handling

JMAP method errors (`notCreated`, `notUpdated`, error responses) show a toast or
dialog with the server message. Network errors show a toast. A 401 drops the token
and shows login.

## Testing

- Manual comparison against `:8026` on `db26`: a note created/edited/deleted in one
  UI appears in the other, live via push.
- A browser walkthrough (Claude in Chrome): login → menu → Notes → create → edit →
  search → delete, recorded as a GIF.
- Unit tests only for `GoJmapClient` request building/result handling, if neo's test
  setup makes it cheap. No PHPUnit changes (backend untouched apart from the renderer).

## Risks / unknowns to verify first

1. Neo bootstrap from a PHP-rendered page with absolute paths and dynamic module
   import inside the app worker.
2. Fetch-based SSE inside the worker against `api/sse.php`, and that changes made on
   `:8026` reach `:8027` with APCu disabled.
3. A usable HTML editor field in neo. An editor needs a DOM, so in neo it lives on
   the main thread and needs a bridge to the worker. Fallback: textarea with HTML
   preview.
4. All API calls stay same-origin. Cross-origin would need GO's allow-list
   (`go/core/http/Response.php:333`).
