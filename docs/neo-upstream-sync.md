# Syncing neo-ui with GroupOffice master

The neo branch (`neo-ui`, pushed to the `neo` remote) follows GroupOffice `master` (`origin`). Core code stays the
same as upstream so updates stay simple: merge `origin/master` into neo regularly, for example after every
GroupOffice release. First done on 2026-11-24 (merge of 26.0.62).

**No database updates in core (owner decision 2026-11-24).** neo never adds an entry to
`www/go/core/install/updates.php` or a table or column to `www/go/core/install/install.sql`:
`git diff origin/master -- www/go/core/install` stays empty. GO counts the update queries by position, so a
neo-only core update breaks the next upstream merge and any database shared with upstream GroupOffice. A neo
feature that needs tables lives in a module with its own `install/` (example: `sf/workspaces` in sf-mono,
`docs/neo-workspace.md`), with per-user data hung on the User entity by the module (a `UserSettings`
property), not a `core_user` column.

**Upstream tables stay untouched, schema and data (owner decision 2026-11-27).** No columns, no entries in core or
upstream module `install/updates.php`, no neo data in `go_state` (the classic ExtJS state cache, which upstream
TRUNCATEs) or `core_setting`. neo may add its own `neo_*` tables; dropping them leaves a clean GroupOffice database
(back to classic). They have their own migrations, outside GroupOffice's update counting:

- Updates in `www/go/core/webclient/neo/install/updates.php` (`$updates['YYYYMMDDHHMM'][] = "SQL"` or a closure,
  only `neo_*` tables, never edit a committed entry, each safe to rerun: `IF NOT EXISTS`). The number of queries run is in `neo_schema` (one row,
  `id = 1`), not in `core_module.version`.
- `go\core\webclient\neo\Schema::migrate()` runs the missing ones under a lock and clears the cache (`go()->clearCache()`, not
  `rebuildCache()`, which also resets the sync state in `core_change` of every entity). It runs on
  `Installer::EVENT_UPGRADE`, on every render of the neo page (`Neo::render()`, errors only logged), because a
  deploy without a version change runs no upgrade, and with `php cli.php core/Neo/migrate`. A fresh install has
  no neo tables until one of those runs.
- `php cli.php core/Neo/uninstall` drops every `neo_*` table including `neo_schema`.
- Saving a neo user property through User/set also updates `core_user.modifiedAt` and records a User change, as
  every User property does (`tasksSettings` too); that is upstream metadata, not neo data.
- A neo user property is hung on User only while its table exists, so a request before the migration still works
  (without the property). Pattern: `docs/neo-core-components.md` "neo user settings".
- Tests: `tests/go/core/webclient/neo/SchemaTest.php`.

## Procedure

1. Work in a task worktree on a branch from `neo-ui`.
2. `git fetch origin`, then preview the conflicts with `git merge-tree --write-tree --name-only HEAD origin/master`.
3. `git merge --no-ff origin/master`. Merge, never rebase: the history of neo-ui is already pushed.
4. Submodules `www/views/goui/goui` and `www/views/goui/groupoffice-core`: take exactly origin/master's pointers
   (`git ls-tree origin/master www/views/goui/goui www/views/goui/groupoffice-core`). Don't stage the checkouts of the main checkout, which may be on
   other commits. After the merge check `git ls-files -s www/views/goui/goui www/views/goui/groupoffice-core`.
5. Resolve the conflicts (hot spots below), commit the merge with a message that lists them.
   If the merge moved a submodule pointer, refresh neo's copies of GOUI (next section) in a separate commit.
6. Build and test (see Checks), then hand the branch to the coordinator. Never push to `origin`; only the
   coordinator pushes to `neo`.

## Refreshing neo's copies of GOUI

neo builds and runs without `www/views/goui`. It keeps two copies from the GOUI submodules, each with the
commit it was copied from:

| Copy in `www/views/neo/resources` | Source | Commit noted in |
|---|---|---|
| `scss/go/goui-theme/_theme.scss` (GO tokens `--fg-main`, `--bg-low`, ..., light and dark) | `groupoffice-core/style/_theme.scss` | its header comment |
| `fonts/MaterialSymbolsOutlined.woff2` (icon font) | `goui/resources/iconfont/MaterialSymbolsOutlined.woff2` | `fonts/README.md` |

After a merge that changed `www/views/goui/goui` or `www/views/goui/groupoffice-core` (with both submodules
checked out at the new pointers):

1. Compare: `tail -n +5 www/views/neo/resources/scss/go/goui-theme/_theme.scss | diff -
   www/views/goui/groupoffice-core/style/_theme.scss` (the copy has a 4-line header) and `cmp
   www/views/neo/resources/fonts/MaterialSymbolsOutlined.woff2 www/views/goui/goui/resources/iconfont/MaterialSymbolsOutlined.woff2`.
   What upstream changed: `git -C www/views/goui/groupoffice-core diff <noted commit> HEAD -- style/_theme.scss`.
2. If they differ, copy the file again (keep the header) and write the new commit (`git ls-tree HEAD
   www/views/goui/groupoffice-core www/views/goui/goui`) into the header or `fonts/README.md`. A new or renamed
   token may need a change in neo's SCSS that uses it.
3. `npm run build-themes` and `npm run audit-styles` in `www/views/neo`, then a browser check of icons and dark mode.

Don't point neo's SCSS back into `www/views/goui`: the submodules go when the classic client goes
(`docs/neo-switch.md` section 8).

It also keeps copies of classic Paper theme files (`views/Extjs3/themes/Paper`: Lato fonts, logo, module
icon fallback, filetype icons, notification image and sounds; list and commit in
`resources/images/README.md` and `resources/fonts/README.md`). After a merge that changed one of those
originals, copy it again the same way. Don't point neo, `go\core\webclient\Page` or server code back into
`views/Extjs3` or `views/goui`: `tests/go/core/webclient/PageTest.php` guards the PHP side.

## Conflict hot spots

- `CHANGELOG.md`: always conflicts. Keep neo's unreleased lines at the top, then upstream's unreleased lines, then
  upstream's version sections unchanged. Check that everything from upstream's top line down is identical:
  `diff <(git show origin/master:CHANGELOG.md) <(tail -n +<first upstream line> CHANGELOG.md)`. Commit only this
  resolution; new changelog lines are never committed (see CLAUDE.md).
- `CLAUDE.md`: neo moved sections verbatim to `docs/translations.md`, `docs/writing-tests.md`,
  `docs/goui-frontend.md` and `docs/encoded-business-modules.md`. Upstream changes in a moved section go to the
  matching docs file; changes in a section that is still in CLAUDE.md stay there. Verify that nothing of either
  side was lost:
  `python3 ~/Projects/go-skills/skills/claude-md-trim/scripts/check-lossless.py verify . --ref origin/master`
  and the same with `--ref HEAD^1` (after the merge commit). A line that upstream rewrote shows as lost against
  `HEAD^1`; that is expected. Keep CLAUDE.md under 12 KB.
- `www/go/core/controller/Search.php`, `www/go/core/model/Search.php`, `www/go/core/orm/Entity.php`: neo fixed the
  link and text filters under OR/NOT (EXISTS sub queries, `Search::queryNeedsGroupBy()`). Keep both sides; run
  `tests/go/core/orm/FiltersTest.php` and `tests/go/core/controller/SearchTest.php`.
- `www/go/core/language/*.php` (mostly `en.php`, `nl.php`): both sides append keys at the end. Keep the union and
  check for new duplicate keys (compare the count with both parents; some duplicates like `M`/`F` are old).
- Tests that both sides added under the same path (add/add): don't merge two unrelated test classes into one.
  Keep upstream's file and rename neo's (2026-11-24: neo's mention test became `CommentMentionTest.php`).
- `www/composer.lock`: upstream changes it often. Run `composer install` after the merge.
- `www/go/core/App.php`: neo adds `defineListeners()`, one line calling `go\core\webclient\neo\Schema::defineListeners()`
  (the upgrade hook and the neo user properties; App is the core module, so `Listeners::init()` calls it). If upstream
  adds its own `defineListeners()` to App, keep the neo line in it.

## Checks

The merge usually brings database updates and a new `www/version.php`. Don't upgrade the shared dev database
(`groupoffice` on db26) from a task: the :8026 and :8027 containers still run the old code. Test on a copy:

- Clone the database in db26 (`CREATE DATABASE groupoffice_<name>`, `mariadb-dump groupoffice | mariadb
  groupoffice_<name>`, grant it to user `groupoffice`), APFS-clone the data folder
  (`cp -Rc ~/Projects/docker/groupoffice26-neo/data <dir>/data`) and render a config with that `db_name`.
- Run a container from the `groupoffice26-groupoffice26` image on network `groupoffice26_go26` with the worktree's
  `www`, the module repos (business, nuw) from `~/Projects/groupoffice26/www/go/modules`, sf from
  `~/Projects/groupoffice26-neo-sf` and amd from `~/Projects/groupoffice26-neo-amd` (see "sf and amd modules for
  neo" below), the config, the
  data folder, and for PHPUnit `tests/` at `/usr/local/share/src/tests`, `www/` at `/usr/local/share/src/www` and
  `rendered/tests-config.go26.php` (from `~/Projects/go-docker`) over `tests/config.php`. Claim the cloned
  database, the container and `db26:groupoffice_phpunit` on the board: in the `install` and `upgrade` modes (the
  default run) `tests/bootstrap.php` drops and creates `groupoffice_phpunit`, whatever `db_name` the test config
  has, so a run breaks another task's run. Copy `passwordHashCost = 4` from `tests/config.php` into the test
  config, or the three password hash cost tests fail.
- In the container: `composer install` in `/var/www/html`, then `php cli.php core/System/upgrade` as `www-data`.
  Its last step clears the cache through the URL of the cloned database (localhost:8026), which the container
  can't reach, so it prints "Failed to clear cache". Rebuild it in the container instead with a small PHP script
  (as `www-data`, from `/var/www/html`): require `vendor/autoload.php`, then
  `\go\core\App::get()->rebuildCache()`. Restart the container afterwards to clear APCu.
- GOUI bundles of modules from other repositories (amd, business, sf, nuw; mounted from `~/Projects/groupoffice26`
  or, for amd and sf, from their neo worktrees)
  contain the GroupOffice version in their imports (`index.js?v=26.0.61`). After a version bump the classic client
  then loads GOUI twice and logs `Cannot redefine property: capitalize` (2026-11-24: `nuw/projectsdsgvo`). That
  is a stale build of that repository, not a merge error; it goes away when that repository is built again.
- Builds on the host: `git submodule update --init www/views/goui/goui www/views/goui/groupoffice-core`; `npm
  install` in `www` (esbuild, sass and the GOUI dependencies) and the Sass loop of `scripts/install-npm.sh` for
  the classic stylesheets; `npm run build` in `www/views/goui` and in every `go/modules/community/*/views/goui`;
  `npm install` and `npm run build-themes` in `www/views/neo`. `scripts/install-npm.sh nodev` fails in a worktree (`npm ci` with a lock file
  that includes business modules), and the dts step of the dev mode fails on a stray `~/Projects/node_modules`;
  run the build steps by hand instead. Revert `www/package-lock.json` if `npm install` changed it.
- PHPUnit: the `core` suite and the tests of the modules that conflicted, run as `www-data` with
  `../www/vendor/bin/phpunit` from `/usr/local/share/src/tests`.
- Browser smoke test as neotest on `localhost:<port>` (never :8027): start page, Notes, Files, Email, Calendar, and
  the classic client via `?webclient=classic`.
- Codex review of the resolution: compare the merge with both parents (`git diff HEAD^1 HEAD -- <files>` and
  `git diff HEAD^2 HEAD -- <files>`), so a discarded upstream change shows too, and include uncommitted docs.
- Clean up afterwards: remove the container, the cloned databases and the data copy.

## sf and amd modules for neo (2026-11-25, amd 2026-11-27)

sf-mono and amd-mono each have a branch **`neo`** for module work that needs the neo core. `26.0.x` ships with
plain GroupOffice 26.x, so neo-only commits (a module's `views/neo`, code that calls neo-only APIs) go to `neo`
only, never to `26.0.x`.

| Repo | Branch `neo` from | Worktree | Mounted in the neo container at | Today on `neo` |
|---|---|---|---|---|
| sf-mono | `26.0.x`, 2026-11-25 | `~/Projects/groupoffice26-neo-sf` | `go/modules/sf` | `sf/workspaces` (uses `openWindow(windowId, hash, {key, items})` / `isWindowClosed()` and the central no-cache rule in `www/.htaccess`) |
| amd-mono | `origin/26.0.x` (`f456b1287`), 2026-11-27 | `~/Projects/groupoffice26-neo-amd` | `go/modules/amd` | nothing neo-only yet; the neo ports start with `amd/crew` |

- The neo container (`groupoffice26-neo`, `~/Projects/go-docker/docker-compose.go26neo.yml`, not in git there)
  mounts both worktrees read-only. `~/Projects/groupoffice26/www/go/modules/{sf,amd}` (container `groupoffice26`
  and other sessions) stay on `26.0.x`. After changing a mount, `docker compose -f docker-compose.go26neo.yml up -d`
  in `~/Projects/go-docker` recreates the container.
- Files git doesn't carry have to be copied into a new worktree: amd `dms/vendor/` (Composer packages of
  `dms/composer.json`, copied from the 26.0.x checkout; `composer install` in `dms/` does the same).
- Keep `neo` current by merging `26.0.x` into it in the worktree (`git fetch origin && git merge origin/26.0.x`),
  never the other way. A fix that is not neo-only (PHP backend, ExtJS) is made on `26.0.x` and reaches `neo` with
  the next merge.
- Pushing `neo` to git.smartflows.io needs the owner's go each time a branch is pushed for the first time (sf:
  pushed as `origin/neo`; amd: not pushed yet).
- The 13 workspaces commits up to `58a4ea577` are on sf `26.0.x` already (owner: leave them, the module is off by
  default).
