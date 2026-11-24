# Syncing neo-ui with GroupOffice master

The neo branch (`neo-ui`, pushed to the `neo` remote) follows GroupOffice `master` (`origin`). Core code stays the
same as upstream so updates stay simple: merge `origin/master` into neo regularly, for example after every
GroupOffice release. First done on 2026-11-24 (merge of 26.0.62).

## Procedure

1. Work in a task worktree on a branch from `neo-ui`.
2. `git fetch origin`, then preview the conflicts with `git merge-tree --write-tree --name-only HEAD origin/master`.
3. `git merge --no-ff origin/master`. Merge, never rebase: the history of neo-ui is already pushed.
4. Submodules `www/views/goui/goui` and `www/views/goui/groupoffice-core`: take exactly origin/master's pointers
   (`git ls-tree origin/master www/views/goui/goui www/views/goui/groupoffice-core`). Don't stage the checkouts of the main checkout, which may be on
   other commits. After the merge check `git ls-files -s www/views/goui/goui www/views/goui/groupoffice-core`.
5. Resolve the conflicts (hot spots below), commit the merge with a message that lists them.
6. Build and test (see Checks), then hand the branch to the coordinator. Never push to `origin`; only the
   coordinator pushes to `neo`.

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

## Checks

The merge usually brings database updates and a new `www/version.php`. Don't upgrade the shared dev database
(`groupoffice` on db26) from a task: the :8026 and :8027 containers still run the old code. Test on a copy:

- Clone the database in db26 (`CREATE DATABASE groupoffice_<name>`, `mariadb-dump groupoffice | mariadb
  groupoffice_<name>`, grant it to user `groupoffice`), APFS-clone the data folder
  (`cp -Rc ~/Projects/docker/groupoffice26-neo/data <dir>/data`) and render a config with that `db_name`.
- Run a container from the `groupoffice26-groupoffice26` image on network `groupoffice26_go26` with the worktree's
  `www`, the module repos (amd, business, sf, nuw) from `~/Projects/groupoffice26/www/go/modules`, the config, the
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
- GOUI bundles of modules from other repositories (amd, business, sf, nuw, mounted from `~/Projects/groupoffice26`)
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
